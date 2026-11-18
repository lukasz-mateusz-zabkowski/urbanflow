import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { attachStops, CITIES } from '../public/js/cities.js';
import { registerRoutingGraph, routeLineDetails } from '../public/js/routing.js?v=12';
import { UrbanFlowGame } from '../public/js/game.js';

const manifest = JSON.parse(await readFile(new URL('../public/data/routing/krakow.json', import.meta.url), 'utf8'));
const compressedGraphBytes = await readFile(new URL('../public/data/routing/krakow-road-graph.bin.gz', import.meta.url));
const graphBytes = gunzipSync(compressedGraphBytes);
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
  assert.deepEqual(result.segments.map(segment => segment.coordinates[0]), routeIds.slice(0, -1).map(id => {
    const stop = city.points.find(point => point.id === id); return [stop.lat, stop.lng];
  }));
  assert.ok(result.segments.some(segment => segment.detourWarning), 'long water-side or one-way detours must remain visible as warnings');
  assert.ok(result.distanceKm > 0 && result.travelMinutes > 0);
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
