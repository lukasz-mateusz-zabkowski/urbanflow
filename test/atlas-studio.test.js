import test from 'node:test';
import assert from 'node:assert/strict';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { planningStudioSnapshot } from '../public/js/atlas-studio.js';

test('planning studio summarizes a real route draft without changing campaign state', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0.1 });
  assert.equal(game.selectStarterRoute('loop-center').ok, true);
  const before = structuredClone(game.state);

  const snapshot = planningStudioSnapshot(game, null);

  assert.equal(snapshot.kind, 'draft');
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.stopCount, game.state.selectedNodes.length);
  assert.ok(snapshot.distanceKm > 0);
  assert.ok(snapshot.constructionCost >= 0);
  assert.ok(snapshot.requiredVehicles >= 0);
  assert.deepEqual(game.state, before, 'opening or refreshing Studio must be read-only');
});

test('planning studio follows a selected line and exposes only observed or modeled values explicitly', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0.1 });
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  const line = game.state.lines[0];
  const before = structuredClone(game.state);

  const snapshot = planningStudioSnapshot(game, line.id);

  assert.equal(snapshot.kind, 'line');
  assert.equal(snapshot.lineId, line.id);
  assert.equal(snapshot.stopCount, line.stops.length);
  assert.equal(snapshot.costSource, Number.isFinite(line.stats.costPerHour) ? 'observed' : 'modeled');
  assert.deepEqual(game.state, before, 'line context must not update history, budget, clock, or campaign');
});

test('planning studio reports an explicit empty state before a route or line is selected', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0.1 });
  const before = structuredClone(game.state);

  const snapshot = planningStudioSnapshot(game, null);

  assert.equal(snapshot.kind, 'empty');
  assert.equal(snapshot.stopCount, 0);
  assert.deepEqual(game.state, before);
});

test('planning studio reuses the current render preview instead of recalculating route geometry', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0.1 });
  assert.equal(game.selectStarterRoute('loop-center').ok, true);
  let previewCalls = 0;
  const originalPreview = game.previewLine.bind(game);
  game.previewLine = (...args) => { previewCalls += 1; return originalPreview(...args); };
  const currentPreview = originalPreview();

  const snapshot = planningStudioSnapshot(game, null, currentPreview);

  assert.equal(snapshot.status, 'ready');
  assert.equal(previewCalls, 0, 'the Atlas panel must reuse the preview already calculated by UI.render()');
});
