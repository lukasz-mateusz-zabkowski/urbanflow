import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { attachStops, CITIES, KRAKOW_STARTS } from '../public/js/cities.js';
import { decodeRoutingGraphBinary, diagnoseOsmRoute, registerRoutingGraph, routeLineDetails } from '../public/js/routing.js?v=14';
import { UrbanFlowGame } from '../public/js/game.js';
import { lineMetrics } from '../public/js/transport.js';
import { buildTransportGraph } from '../public/js/passengers.js';

const manifest = JSON.parse(await readFile(new URL('../public/data/routing/krakow.json', import.meta.url), 'utf8'));
const compressedGraphBytes = await readFile(new URL('../public/data/routing/krakow-road-graph.bin.gz', import.meta.url));
const graphBytes = gunzipSync(compressedGraphBytes);
const roadGraph = decodeRoutingGraphBinary(graphBytes, manifest.bounds);
const stopsData = JSON.parse(await readFile(new URL('../public/data/krakow-stops.json', import.meta.url), 'utf8')).stops;
const routeIds = ['s-stradom', 's-kazimierz', 's-plac-wolnica', 's-dietla', 's-podgorze', 's-plac-bohaterow-getta', 's-rynek-podgorski'];

test('Kraków seven-stop route keeps all six adjacent segments on the directed local OSM graph', () => {
  registerRoutingGraph('krakow', manifest, graphBytes);
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopsData.filter(stop => routeIds.includes(stop.id)));
  const result = routeLineDetails(routeIds, 'bus', city);
  assert.equal(result.segments.length, 6);
  assert.ok(result.segments.every(segment => segment.valid), result.segments.map(segment => segment.reason).join('\n'));
  assert.ok(result.segments.every(segment => segment.roadCoordinates?.length >= 2));
  assert.ok(result.segments.every(segment => JSON.stringify(segment.vehicleCoordinates) === JSON.stringify(segment.roadCoordinates)),
    'vehicle paths must contain only drivable graph geometry, excluding walking access');
  assert.equal(result.distanceKm, result.segments.reduce((sum, segment) => sum + segment.roadDistanceKm, 0)
    + result.stopConnectors.reduce((sum, connector) => sum + connector.roadDistanceKm, 0));
  assert.deepEqual(result.segments.map(segment => segment.coordinates[0]), routeIds.slice(0, -1).map(id => {
    const stop = city.points.find(point => point.id === id); return [stop.lat, stop.lng];
  }));
  assert.ok(result.segments.some(segment => segment.detourWarning), 'long water-side or one-way detours must remain visible as warnings');
  assert.ok(result.distanceKm > 0 && result.travelMinutes > 0);
});

test('bus routes ignore external providers and use only the registered local road graph', () => {
  registerRoutingGraph('krakow', manifest, graphBytes);
  const provider = { name: 'must not be used for a bus', route: () => [[50.05, 19.9], [50.06, 19.9]] };
  const details = routeLineDetails(['s-stradom', 's-kazimierz'], 'bus', { ...CITIES.krakow, points: stopsData }, provider);
  assert.equal(details.valid, true);
  assert.match(details.source, /OSM/);
  assert.doesNotMatch(details.source, /must not be used/);
});

test('three reported downtown detours compare shortest, fastest and bounded balanced routes with snap evidence', t => {
  const pairs = [
    ['s-stradom', 's-kazimierz'],
    ['s-kazimierz', 's-plac-wolnica'],
    ['s-plac-wolnica', 's-dietla']
  ];
  const summaries = pairs.map(([from, to]) => {
    const a = stopsData.find(stop => stop.id === from), b = stopsData.find(stop => stop.id === to);
    const diagnosis = diagnoseOsmRoute(a, b, roadGraph);
    const { shortest, fastest, balanced, shortest12Candidates, shortest48Candidates } = diagnosis.variants;
    assert.ok(diagnosis.candidates.origin.length && diagnosis.candidates.destination.length);
    assert.ok(diagnosis.candidates.origin.every(candidate => candidate.offsetMeters <= 120));
    assert.ok(diagnosis.candidates.destination.every(candidate => candidate.offsetMeters <= 120));
    assert.equal(shortest.valid, true);
    assert.equal(fastest.valid, true);
    assert.equal(balanced.valid, true);
    assert.ok(shortest.distanceKm <= fastest.distanceKm * 1.15 + 0.001);
    assert.ok(balanced.distanceKm <= shortest.distanceKm * 1.15 + 0.001);
    assert.ok(shortest.distanceKm < shortest.directDistanceKm * 2, `${from} → ${to}: balanced snap search must avoid the prior multi-fold road detour`);
    assert.ok(shortest12Candidates.distanceKm > shortest.distanceKm * 2, 'the previous 12-candidate cutoff should reproduce the long detour');
    assert.equal(shortest.candidateLimit, 96);
    assert.ok(shortest.snapMatches.every(match => match.offsetMeters <= 120));
    assert.ok(shortest.accessWarning, 'longer approach connectors must be disclosed');
    assert.ok(shortest.roadCoordinates.length >= 2 && fastest.roadCoordinates.length >= 2);
    return { ids: `${from} → ${to}`, directKm: Number(shortest.directDistanceKm.toFixed(3)),
      shortestKm: Number(shortest.distanceKm.toFixed(3)), shortestMinutes: Number((shortest.travelSeconds / 60).toFixed(2)),
      fastestKm: Number(fastest.distanceKm.toFixed(3)), fastestMinutes: Number((fastest.travelSeconds / 60).toFixed(2)),
      balancedKm: Number(balanced.distanceKm.toFixed(3)), balancedMinutes: Number((balanced.travelSeconds / 60).toFixed(2)),
      nearest12Km: Number(shortest12Candidates.distanceKm.toFixed(3)), intermediate48Km: Number(shortest48Candidates.distanceKm.toFixed(3)),
      originCandidates: diagnosis.candidates.origin.length, destinationCandidates: diagnosis.candidates.destination.length,
      startSnapM: Math.round(balanced.startSnapDistanceKm * 1000), endSnapM: Math.round(balanced.endSnapDistanceKm * 1000),
      balancedReason: balanced.balancedReason, ways: balanced.matchedWays };
  });
  t.diagnostic(JSON.stringify(summaries));
});

test('every randomizable starter has a connected local bus route to its assigned hub', () => {
  registerRoutingGraph('krakow', manifest, graphBytes);
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopsData);
  const available = KRAKOW_STARTS.filter(scenario => scenario.availableForNewGame !== false);
  for (const scenario of available) {
    const detail = routeLineDetails([scenario.id, scenario.localHubId], 'bus', city);
    assert.equal(detail.valid, true, `${scenario.name}: ${detail.reason}`);
  }
});

test('refreshing a saved bus line replaces stale geometry without charging money or changing campaign progress', () => {
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopsData.filter(stop => routeIds.includes(stop.id)));
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka' });
  const oldGeometry = [[50, 19], [50.01, 19.01]];
  game.state.lines.push({ id: 'saved-line', type: 'bus', stops: routeIds, distanceKm: 0.1, routeGeometry: oldGeometry, vehicles: 2, frequency: 3 });
  const budget = game.state.budget, campaign = structuredClone(game.state.campaign);
  const refreshed = game.refreshRoutesFromGraph('bus');
  assert.deepEqual(refreshed.updated, ['saved-line'], JSON.stringify(refreshed));
  assert.deepEqual(refreshed.unavailable, []);
  assert.notDeepEqual(game.state.lines[0].routeGeometry, oldGeometry);
  assert.ok(game.state.lines[0].routeGeometry.length > 100);
  assert.ok(game.state.lines[0].routeGeometry.length <= 500, 'simplified route geometry must remain inside the current save schema bound');
  assert.ok(game.state.lines[0].distanceKm > 0.1);
  assert.equal(game.state.budget, budget);
  assert.deepEqual(game.state.campaign, campaign);
});

test('an unreachable starter area is reported before construction instead of saving an empty straight-line route', () => {
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopsData);
  const game = new UrbanFlowGame(city, { startScenarioId: 'igolomia' });
  const budget = game.state.budget;
  const preview = game.selectStarterRoute('starter-local');
  assert.equal(preview.ok, false);
  assert.match(preview.message, /Nie znaleziono dopuszczalnej drogi/);
  assert.equal(game.createSelectedLine().ok, false);
  assert.equal(game.state.lines.length, 0);
  assert.equal(game.state.budget, budget);
});

test('unroutable legacy bus geometry is preserved, marked unavailable and removed from service without rebuilding cost', () => {
  registerRoutingGraph('krakow', manifest, graphBytes);
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, stopsData);
  const game = new UrbanFlowGame(city, { startScenarioId: 'wieliczka' });
  const oldGeometry = [[50.0912, 20.2611], [50.091, 20.26], [50.086, 20.02]];
  const line = { id: 'legacy-igolomia', type: 'bus', stops: ['igolomia', 'dworzec'], distanceKm: 20,
    routeGeometry: oldGeometry, routingMode: 'road', vehicles: 2, frequency: 3, ageMinutes: 240,
    timetable: undefined, stats: { carried: 7, revenue: 0, expenses: 0 } };
  game.state.lines.push(line);
  const budget = game.state.budget, campaign = structuredClone(game.state.campaign);
  const refresh = game.refreshRoutesFromGraph('bus');
  assert.deepEqual(refresh.unavailable.map(item => item.lineId), [line.id]);
  assert.deepEqual(line.routeGeometry, oldGeometry);
  assert.match(line.routingUnavailable, /dop|graf|połącz/i);
  assert.equal(game.state.budget, budget);
  assert.deepEqual(game.state.campaign, campaign);
  assert.equal(lineMetrics(line, city, 720).effectiveFrequency, 0);
  assert.equal(buildTransportGraph(game.state.lines, city.points, 720, city).size, 0);
});
