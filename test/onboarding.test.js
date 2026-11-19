import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { contextualHints, getOnboardingStep, onboardingProgress, onboardingStatus } from '../public/js/onboarding.js';

test('onboarding advances only from saved game facts and never from dismissing the card', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  assert.equal(getOnboardingStep(game).id, 'map');
  game.setPreference('tutorialCollapsed', true);
  assert.equal(getOnboardingStep(game).id, 'map');

  game.selectNode(game.startScenario.id);
  assert.equal(getOnboardingStep(game).id, 'first-goal');
  game.selectNode(game.startScenario.localHubId);
  assert.equal(getOnboardingStep(game).id, 'build-line');
  assert.equal(getOnboardingStep(game).completed, false);

  assert.equal(game.previewLine('bus', game.state.selectedNodes, null).ok, true);
  assert.equal(getOnboardingStep(game).id, 'build-line');
  assert.equal(game.createSelectedLine().ok, true);
  assert.equal(getOnboardingStep(game).id, 'start-service');
});

test('tutorial skip and restart persist without changing the campaign or duplicating rewards', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  const budget = game.state.budget;
  assert.equal(game.setTutorialStatus('skipped').ok, true);
  assert.equal(onboardingStatus(game).status, 'skipped');
  assert.equal(game.setTutorialStatus('active').ok, true);
  assert.equal(onboardingStatus(game).status, 'active');
  assert.equal(game.state.budget, budget);
  assert.deepEqual(game.state.campaign.completed, []);
});

test('diagnosis must be opened after real network data and improvement must follow a network change', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  game.state.elapsedMinutes = 60;
  game.state.networkHistory = [{ at: 60, networkVersion: 0, transported: 0, generated: 1, abandoned: 1, denied: 0,
    averageWaitMinutes: 2, coverage: 0, tripAvailability: null, utilization: 0, revenue: 0, cost: 0, balance: 0 }];
  assert.equal(game.setAnalyticsMode('queues').ok, true);
  assert.equal(onboardingProgress(game).find(step => step.id === 'diagnose-network').completed, true);
  game.state.networkVersion += 1;
  game.changed();
  assert.equal(onboardingProgress(game).find(step => step.id === 'improve-network').completed, true);
});

test('onboarding progress survives schema-11 save and reload', async () => {
  const { saveGame, loadGame } = await import('../public/js/storage.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  game.selectNode(game.startScenario.id);
  game.setTutorialStatus('skipped');
  assert.equal(saveGame(storage, game.state, CITIES.krakow.id).ok, true);
  const loaded = loadGame(storage, CITIES.krakow);
  assert.ok(loaded.state);
  const resumed = new UrbanFlowGame(CITIES.krakow, {}, loaded.state);
  assert.equal(onboardingStatus(resumed).status, 'skipped');
  assert.equal(getOnboardingStep(resumed), null);
  resumed.setTutorialStatus('active');
  assert.equal(getOnboardingStep(resumed).id, 'first-goal');
});

test('a schema-11 campaign from before onboarding preferences keeps its campaign, budget and transit state', async () => {
  const { saveGame, loadGame } = await import('../public/js/storage.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  game.selectStarterRoute(game.starterRoutes[0].id);
  assert.equal(game.createSelectedLine().ok, true);
  const legacy = structuredClone(game.state);
  delete legacy.preferences.tutorialStatus;
  delete legacy.preferences.tutorialMapExplored;
  delete legacy.preferences.tutorialDiagnosisVersion;
  assert.equal(saveGame(storage, legacy, CITIES.krakow.id).ok, true);
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  const resumed = new UrbanFlowGame(CITIES.krakow, {}, loaded.state);
  assert.equal(resumed.state.budget, legacy.budget);
  assert.deepEqual(resumed.state.lines, legacy.lines);
  assert.deepEqual(resumed.state.fleet, legacy.fleet);
  assert.deepEqual(resumed.state.campaign, legacy.campaign);
  assert.equal(resumed.state.preferences.tutorialStatus, 'active');
  assert.equal(getOnboardingStep(resumed).id, 'start-service');
});

test('contextual hints name observed problems and the stop involved without inventing forecasts', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  assert.deepEqual(contextualHints(game), []);
  const stop = game.city.points.find(point => point.id === 'dworzec');
  game.state.lines.push({ id: 'line-99', name: 'Linia 99', routingUnavailable: 'Brak osiągalnej drogi.' });
  game.state.passengers[stop.id] = { waiting: 53 };
  const hints = contextualHints(game);
  assert.ok(hints.some(hint => hint.text.includes('Linia 99') && hint.text.includes('Brak osiągalnej drogi.')));
  assert.ok(hints.some(hint => hint.text.includes(stop.name) && hint.text.includes('53')));
});
