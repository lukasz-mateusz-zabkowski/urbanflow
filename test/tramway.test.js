import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createTramInfrastructure, planTrackSegments, commitTrackPlan, trackSegmentId,
  validateTramInfrastructure, buildManualTramGeometry, routeOnPlayerTramTracks } from '../public/js/tramway.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { registerRoutingGraph } from '../public/js/routing.js?v=14';
import { validateState } from '../public/js/storage.js';

const manifest = JSON.parse(await readFile(new URL('../public/data/routing/krakow.json', import.meta.url), 'utf8'));
const roadBytes = gunzipSync(await readFile(new URL('../public/data/routing/krakow-road-graph.bin.gz', import.meta.url)));
registerRoutingGraph('krakow', manifest, roadBytes);

test('tram track segment ids are stable when direction is reversed and rounded coordinates differ slightly', () => {
  assert.equal(trackSegmentId([50, 19.9], [50.001, 19.901]), trackSegmentId([50.00100001, 19.901], [50.00000001, 19.90000001]));
});

test('new line pays only for track segments not already built by the player', () => {
  const infrastructure = createTramInfrastructure();
  const first = planTrackSegments(infrastructure, [[50, 19.9], [50.001, 19.901], [50.002, 19.902]], { costPerKm: 100000 });
  assert.equal(first.valid, true);
  commitTrackPlan(infrastructure, first);
  const shared = planTrackSegments(infrastructure, [[50.001, 19.901], [50, 19.9], [50.001, 19.901], [50.002, 19.902]], { costPerKm: 100000 });
  assert.equal(shared.valid, true);
  assert.equal(shared.newSegments.length, 0);
  assert.equal(shared.reusedSegments.length, 2);
  assert.equal(shared.cost, 0);
  assert.equal(validateTramInfrastructure(infrastructure), true);
});

test('tram track reuse detects a new control point lying on a partially shared existing segment', () => {
  const infrastructure = createTramInfrastructure();
  const a = [50, 19.9], b = [50, 19.91], d = [50, 19.905];
  const first = planTrackSegments(infrastructure, [a, b], { costPerKm: 100000 });
  assert.equal(first.valid, true);
  assert.equal(commitTrackPlan(infrastructure, first), true);
  const second = planTrackSegments(infrastructure, [a, d, b], { costPerKm: 100000 });
  assert.equal(second.valid, true);
  assert.deepEqual(second.segmentIds, [first.segmentIds[0]]);
  assert.equal(second.newSegments.length, 0);
  assert.equal(second.cost, 0);
});

test('close parallel tram track is not shared unless it lies within the documented geometry tolerance', () => {
  const infrastructure = createTramInfrastructure();
  const original = [[50, 19.9], [50, 19.91]];
  const first = planTrackSegments(infrastructure, original, { costPerKm: 100000 });
  assert.equal(commitTrackPlan(infrastructure, first), true);
  const parallel = planTrackSegments(infrastructure, original.map(([lat, lng]) => [lat + 0.00002, lng]), { costPerKm: 100000 });
  assert.equal(parallel.valid, true);
  assert.equal(parallel.newSegments.length, 1);
  assert.ok(parallel.cost > 0);
});

test('player track graph joins a branch endpoint to the interior of an existing segment', () => {
  const infrastructure = createTramInfrastructure();
  const a = [50, 19.9], b = [50, 19.91], junction = [50, 19.905], terminal = [50.001, 19.905];
  assert.equal(commitTrackPlan(infrastructure, planTrackSegments(infrastructure, [a, b])), true);
  assert.equal(commitTrackPlan(infrastructure, planTrackSegments(infrastructure, [junction, terminal])), true);
  const city = { points: [
    { id: 'a', lat: a[0], lng: a[1] }, { id: 'terminal', lat: terminal[0], lng: terminal[1] }
  ] };
  const route = routeOnPlayerTramTracks(infrastructure, ['a', 'terminal'], city);
  assert.equal(route.valid, true, route.reason);
  assert.ok(route.trackIds.length >= 2);
  assert.ok(route.distanceKm > 0);
});

test('manual tram geometry stays independent from streets and must pass selected stops in order', () => {
  const result = buildManualTramGeometry([[50, 19.9], [50.002, 19.902]], [[50, 19.9], [50.001, 19.901], [50.002, 19.902]]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.coordinates, [[50, 19.9], [50.001, 19.901], [50.002, 19.902]]);
  assert.equal(buildManualTramGeometry([[50, 19.9], [50.002, 19.902]], [[50, 19.9], [50.002, 19.902], [50.001, 19.901]]).valid, false);
  assert.equal(buildManualTramGeometry([[50, 19.9], [50.002, 19.902]], [[50, 19.9], [50.1, 19.9], [50.002, 19.902]]).valid, false);
});

test('manual tram construction is previewed, charged once on approval, and persisted as shared track', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  game.state.selectedNodes = ['wieliczka', 'biezanow'];
  game.state.tramControlPoints = [[49.999, 20.046]];
  const before = game.state.budget;
  const preview = game.previewLine('tram', game.state.selectedNodes, null);
  assert.equal(preview.ok, true, preview.message);
  assert.ok(preview.trackCost > 0);
  assert.equal(game.state.tramInfrastructure.segments.length, 0);
  assert.equal(game.state.budget, before);
  const result = game.addLine('tram', game.state.selectedNodes);
  assert.equal(result.ok, true, result.message);
  assert.equal(game.state.budget, before - preview.cost);
  assert.equal(game.state.tramInfrastructure.segments.length, preview.trackPlan.newSegments.length);
  assert.ok(validateTramInfrastructure(game.state.tramInfrastructure));
  const saved = structuredClone(game.state.tramInfrastructure);
  const second = planTrackSegments(saved, preview.routeGeometry, { mode: 'manual' });
  assert.equal(second.cost, 0);
});

test('street tram construction accepts a real OSM route over 300 points and saves its complete track reference', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('street');
  const stops = game.state.lines[0].stops;
  const preview = game.previewLine('tram', stops, null);
  assert.equal(preview.ok, true, preview.message);
  assert.ok(preview.routeGeometry.length > 300);
  assert.ok(preview.trackPlan.newSegments.length > 250);
  const before = game.state.budget;
  const result = game.addLine('tram', stops);
  assert.equal(result.ok, true, result.message);
  assert.equal(game.state.budget, before - preview.cost);
  assert.deepEqual(game.state.lines[1].tramTrackIds, [...new Set(preview.trackPlan.segmentIds)]);
  assert.equal(validateState(game.state, CITIES.krakow), true);
});

test('editing a tram control point rebuilds geometry even when the stop list is unchanged', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  const stops = ['wieliczka', 'biezanow'];
  game.state.selectedNodes = stops;
  game.state.tramControlPoints = [[49.99, 20.03]];
  const created = game.addLine('tram', stops);
  assert.equal(created.ok, true, created.message);
  const line = created.line;
  const originalGeometry = structuredClone(line.routeGeometry);
  const originalTrackIds = [...line.tramTrackIds];
  const originalBudget = game.state.budget;

  assert.equal(game.beginEditLine(line.id).ok, true);
  game.state.tramControlPoints = [[49.991, 20.031]];
  const preview = game.previewLine('tram', stops, line.id);
  assert.equal(preview.ok, true, preview.message);
  assert.notDeepEqual(preview.routeGeometry, originalGeometry);
  assert.ok(preview.cost > 0);
  assert.equal(game.state.budget, originalBudget);

  const result = game.editLine(line.id, stops);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(line.stops, stops);
  assert.notDeepEqual(line.routeGeometry, originalGeometry);
  assert.notDeepEqual(line.tramTrackIds, originalTrackIds);
  assert.equal(game.state.budget, originalBudget - preview.cost);
  const saved = structuredClone(game.state);
  const resumed = new UrbanFlowGame(CITIES.krakow, {}, saved);
  assert.deepEqual(resumed.state.lines.find(item => item.id === line.id).routeGeometry, line.routeGeometry);
  assert.equal(resumed.previewLine('tram', stops, line.id).cost, 0, 'loading committed geometry cannot collect a rebuild cost again');
});

test('editing an unchanged tram route costs nothing and keeps its service history', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  const stops = ['wieliczka', 'biezanow'];
  game.state.selectedNodes = stops;
  game.state.tramControlPoints = [[49.99, 20.03]];
  const { line } = game.addLine('tram', stops);
  line.stats.carried = 42;
  const budget = game.state.budget;
  game.beginEditLine(line.id);
  const preview = game.previewLine('tram', stops, line.id);
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.cost, 0);
  assert.equal(game.editLine(line.id, stops).ok, true);
  assert.equal(game.state.budget, budget);
  assert.equal(line.stats.carried, 42);
});

test('manual tram control points support move, delete, undo and redo without changing stops', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  game.chooseStarterRoute('loop-center');
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  const stops = ['wieliczka', 'biezanow']; game.state.selectedNodes = stops;
  assert.equal(game.addTramControlPoint(49.99, 20.03).ok, true);
  const original = structuredClone(game.state.tramControlPoints);
  assert.equal(game.moveTramControlPoint(0, 49.991, 20.031).ok, true);
  assert.notDeepEqual(game.state.tramControlPoints, original);
  assert.equal(game.undoTramControlEdit().ok, true);
  assert.deepEqual(game.state.tramControlPoints, original);
  assert.equal(game.redoTramControlEdit().ok, true);
  assert.deepEqual(game.state.selectedNodes, stops);
  assert.equal(game.removeTramControlPoint(0).ok, true);
  assert.deepEqual(game.state.tramControlPoints, []);
  assert.equal(game.undoTramControlEdit().ok, true);
  assert.deepEqual(game.state.tramControlPoints, [[49.991, 20.031]]);
});

test('existing-track tram mode reuses the campaign own track without charging track construction again', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  game.state.unlocked.push('tram');
  game.setTramBuildMode('manual');
  const stops = ['wieliczka', 'biezanow'];
  game.state.selectedNodes = stops;
  game.state.tramControlPoints = [[49.99, 20.03]];
  const built = game.addLine('tram', stops);
  assert.equal(built.ok, true, built.message);
  game.beginEditLine(built.line.id);
  game.setTramBuildMode('existing');
  const preview = game.previewLine('tram', stops, built.line.id);
  assert.equal(preview.ok, true, preview.message);
  assert.match(preview.routeDetails.source, /Własne torowisko UrbanFlow/);
  assert.equal(preview.trackCost, 0);
  assert.ok(preview.routeDetails.trackIds.length > 0);
});
