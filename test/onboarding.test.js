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
  assert.equal(getOnboardingStep(game).id, 'review-cost');
  assert.equal(getOnboardingStep(game).completed, false);

  assert.equal(game.previewLine('bus', game.state.selectedNodes, null).ok, true);
  assert.equal(game.markTutorialAction('costPreview').ok, true);
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
  delete legacy.preferences.tutorialActionsVersion;
  delete legacy.preferences.tutorialActions;
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

test('a new campaign requires explicit cost review and panel visits instead of inferring them from a line', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  const route = game.starterRoutes[0];
  assert.equal(game.selectStarterRoute(route.id).ok, true);
  assert.equal(game.createSelectedLine().ok, true);
  const progress = () => Object.fromEntries(onboardingProgress(game).map(step => [step.id, step.completed]));
  assert.equal(progress()['review-cost'], false);
  assert.equal(progress().fleet, false);
  assert.equal(progress()['diagnose-network'], false);
  assert.equal(progress().opportunities, false);
  assert.equal(progress().investment, false);

  assert.equal(game.markTutorialAction('costPreview').ok, true);
  assert.equal(progress()['review-cost'], true);
  assert.equal(progress().fleet, false);
  assert.equal(game.setTutorialStatus('skipped').ok, true);
  assert.equal(game.setTutorialStatus('active').ok, true);
  assert.equal(progress()['review-cost'], true);
});

test('diagnostic and opportunity steps record actual views and require a later network change', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  assert.equal(game.setAnalyticsMode('queues').ok, true);
  assert.equal(onboardingProgress(game).find(step => step.id === 'diagnose-network').completed, false);
  game.state.networkHistory.push({ at: 6, networkVersion: 0, transported: 1, generated: 1, abandoned: 0, denied: 0,
    averageWaitMinutes: 2, coverage: 1, tripAvailability: 1, utilization: 0.1, revenue: 5, cost: 2, balance: 3 });
  assert.equal(game.markTutorialDiagnosisViewed(), true);
  assert.equal(onboardingProgress(game).find(step => step.id === 'diagnose-network').completed, true);
  assert.equal(onboardingProgress(game).find(step => step.id === 'improve-network').completed, false);
  game.state.networkVersion += 1;
  game.changed();
  assert.equal(onboardingProgress(game).find(step => step.id === 'improve-network').completed, true);
  game.setAnalyticsMode('cityEvolution');
  game.setAnalyticsMode('investments');
  const progress = Object.fromEntries(onboardingProgress(game).map(step => [step.id, step.completed]));
  assert.equal(progress.opportunities, true);
  assert.equal(progress.investment, true);
});

test('a developed schema-11 save without onboarding trackers is recognized from saved simulation facts', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  const route = game.starterRoutes[0];
  assert.equal(game.selectStarterRoute(route.id).ok, true);
  assert.equal(game.createSelectedLine().ok, true);
  game.state.elapsedMinutes = 120;
  game.state.carried = 14;
  game.state.lines[0].ageMinutes = 120;
  game.state.lines[0].stats.carried = 14;
  game.state.networkHistory = [{ at: 120, networkVersion: 1, transported: 14, generated: 14, abandoned: 0, denied: 0,
    averageWaitMinutes: 2, coverage: 1, tripAvailability: 1, utilization: 0.2, revenue: 100, cost: 50, balance: 50 }];
  game.state.preferences.tutorialActionsVersion = 0;
  delete game.state.preferences.tutorialActions;
  const steps = Object.fromEntries(onboardingProgress(game).map(step => [step.id, step.completed]));
  assert.equal(steps['review-cost'], true);
  assert.equal(steps.fleet, true);
  assert.equal(steps['diagnose-network'], true);
});

test('a finished campaign pauses the remaining tutorial without offering a restart that changes campaign state', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0 });
  game.state.status = 'lost';
  game.state.lossReason = 'bankruptcy';
  const before = { budget: game.state.budget, lines: game.state.lines.length, elapsed: game.state.elapsedMinutes, status: game.state.status };
  assert.equal(onboardingStatus(game).status, 'unavailable');
  assert.equal(onboardingProgress(game).every(step => !step.completed), true);
  assert.deepEqual({ budget: game.state.budget, lines: game.state.lines.length, elapsed: game.state.elapsedMinutes, status: game.state.status }, before);
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
