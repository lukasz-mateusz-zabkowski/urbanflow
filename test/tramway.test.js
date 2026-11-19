import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createTramInfrastructure, planTrackSegments, commitTrackPlan, trackSegmentId,
  validateTramInfrastructure, buildManualTramGeometry } from '../public/js/tramway.js';
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
  assert.equal(game.state.lines[1].tramTrackIds.length, preview.trackPlan.segmentIds.length);
  assert.equal(validateState(game.state, CITIES.krakow), true);
});
