import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { loadGame, saveGame, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';
import {
  CAMPAIGN_CHALLENGES, campaignChallengeObjectives, createChallengeProgress,
  updateCampaignChallenge, validateCampaignChallengeState
} from '../public/js/campaign-challenges.js';

test('three challenge scenarios expose distinct, deterministic start conditions and objectives', () => {
  assert.deepEqual(CAMPAIGN_CHALLENGES.map(item => item.id), ['recovery', 'finance-crisis', 'growing-city']);
  assert.equal(new Set(CAMPAIGN_CHALLENGES.map(item => item.startingBudget)).size, 3);
  for (const definition of CAMPAIGN_CHALLENGES) {
    const game = new UrbanFlowGame(CITIES.krakow, { challengeId: definition.id, random: () => 0.2 });
    const progress = game.state.campaign.challenge;
    assert.equal(progress.id, definition.id);
    assert.equal(game.state.budget, definition.startingBudget);
    assert.equal(game.startScenario.id, definition.startScenarioId);
    assert.equal(game.state.fleet.bus.owned, definition.startingBusFleet);
    assert.equal(progress.startedAt, 0);
    assert.equal(progress.deadlineAt, definition.deadlineWeeks * 10080);
    assert.equal(validateCampaignChallengeState(progress, CITIES.krakow), true);
    assert.equal(campaignChallengeObjectives(game).length, definition.objectives.length);
  }
});

test('a challenge deadline uses simulation time, pauses do not advance it, and missed goals end once', () => {
  const definition = CAMPAIGN_CHALLENGES[0];
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: definition.id, random: () => 0.2 });
  const challenge = game.state.campaign.challenge;
  game.setPaused(true);
  game.tick(() => 0.5);
  assert.equal(game.state.elapsedMinutes, 0);
  assert.equal(challenge.status, 'active');
  game.setPaused(false);
  game.state.elapsedMinutes = challenge.deadlineAt;
  updateCampaignChallenge(game);
  assert.equal(challenge.status, 'lost');
  assert.equal(game.state.status, 'lost');
  const summary = structuredClone(challenge.summary);
  updateCampaignChallenge(game);
  assert.deepEqual(challenge.summary, summary);
});

test('a routing-unavailable saved line cannot satisfy a challenge connection goal', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'recovery', random: () => 0.2 });
  game.state.lines.push({ id: 'line-1', type: 'bus', stops: ['wieliczka', 'biezanow'], routingUnavailable: 'No valid road path' });
  const service = campaignChallengeObjectives(game).find(goal => goal.id === 'recovery-service');
  assert.equal(service.value, 0);
  assert.equal(service.completed, false);
});

test('ordinary bankruptcy also finalizes a challenge report and stops goal tracking', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'recovery', random: () => 0.2 });
  game.finish('lost', 'Bankructwo.');
  assert.equal(game.state.campaign.challenge.status, 'lost');
  assert.deepEqual(game.state.campaign.challenge.summary.missedGoalIds, ['recovery-service', 'recovery-ridership', 'recovery-access']);
  assert.equal(validateCampaignChallengeState(game.state.campaign.challenge, CITIES.krakow), true);
  updateCampaignChallenge(game);
  assert.equal(game.state.campaign.challenge.summary.status, 'lost');
});

test('recovery, finance and city-growth challenges are completable through normal game actions', t => {
  const recovery = new UrbanFlowGame(CITIES.krakow, { challengeId: 'recovery', random: () => 0.1 });
  assert.equal(recovery.selectStarterRoute('starter-local').ok, true);
  assert.equal(recovery.createSelectedLine().ok, true);
  recovery.state.selectedType = 'bus';
  recovery.state.selectedNodes = ['wieliczka', 'biezanow', 'dworzec'];
  assert.equal(recovery.previewLine().ok, true);
  assert.equal(recovery.createSelectedLine().ok, true);
  for (let i = 0; i < 12 * 7 * 24 * 60 / 6 && recovery.state.status === 'playing'; i += 1) recovery.tick(() => 0.2);
  assert.equal(recovery.state.status, 'won');
  assert.deepEqual(recovery.state.campaign.challenge.summary.missedGoalIds, []);
  t.diagnostic(`recovery: won at ${recovery.state.elapsedMinutes} simulation minutes`);

  const finance = new UrbanFlowGame(CITIES.krakow, { challengeId: 'finance-crisis', random: () => 0.1 });
  assert.equal(finance.selectStarterRoute('starter-local').ok, true);
  assert.equal(finance.createSelectedLine().ok, true);
  finance.state.speed = 4;
  for (let i = 0; i < 8 * 7 * 24 * 60 / 24 && finance.state.status === 'playing'; i += 1) finance.tick(() => 0.2);
  assert.equal(finance.state.status, 'won');
  assert.equal(finance.state.campaign.challenge.completed.length, 2);
  t.diagnostic(`finance crisis: won at ${finance.state.elapsedMinutes} simulation minutes`);

  const growth = new UrbanFlowGame(CITIES.krakow, { challengeId: 'growing-city', random: () => 0.1 });
  assert.equal(growth.selectStarterRoute('starter-local').ok, true);
  assert.equal(growth.createSelectedLine().ok, true);
  const investment = growth.planInvestment('nowa-huta', 'economic');
  assert.equal(investment.ok, true);
  assert.equal(growth.approveInvestment(investment.project.id).ok, true);
  growth.state.speed = 4;
  for (let i = 0; i < 52 * 7 * 24 * 60 / 24 && growth.state.status === 'playing'; i += 1) growth.tick(() => 0.2);
  assert.equal(growth.state.status, 'won');
  assert.equal(growth.state.campaign.challenge.summary.completedInvestments, 1);
  assert.ok(growth.state.campaign.challenge.summary.jobsDelta > 0);
  assert.ok(growth.state.campaign.challenge.summary.residentsDelta > 0);
  t.diagnostic(`growing city: won at week ${growth.state.elapsedMinutes / 10080}, residents +${growth.state.campaign.challenge.summary.residentsDelta}, jobs +${growth.state.campaign.challenge.summary.jobsDelta}`);
});

test('completed challenge objectives persist once and produce a bounded strategic summary', () => {
  const definition = CAMPAIGN_CHALLENGES.find(item => item.id === 'finance-crisis');
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: definition.id, random: () => 0.2 });
  const challenge = game.state.campaign.challenge;
  const [profitGoal, reserveGoal] = definition.objectives;
  game.state.networkWeeklyHistory = [{ week: 2, balance: 1, samples: 1680 }, { week: 3, balance: 1, samples: 1680 }];
  game.state.budget = 250000;
  game.state.elapsedMinutes = 10080;
  updateCampaignChallenge(game);
  assert.deepEqual(challenge.completed, [profitGoal.id, reserveGoal.id]);
  assert.equal(challenge.status, 'won');
  assert.equal(challenge.summary.completedGoalIds.length, 2);
  assert.equal(challenge.summary.missedGoalIds.length, 0);
  assert.equal(challenge.summary.carried, 0);
  updateCampaignChallenge(game);
  assert.deepEqual(challenge.completed, [profitGoal.id, reserveGoal.id]);
});

test('financial challenge counts only fully observed consecutive weeks, not a partial current week', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'finance-crisis', random: () => 0.2 });
  game.state.networkWeeklyHistory = [
    { week: 1, balance: 100, samples: 1680 },
    { week: 2, balance: 150, samples: 1 }
  ];
  const goal = campaignChallengeObjectives(game).find(item => item.id === 'crisis-profit');
  assert.equal(goal.value, 1);
  game.state.networkWeeklyHistory[1] = { week: 2, balance: 150, samples: 1680 };
  assert.equal(campaignChallengeObjectives(game).find(item => item.id === 'crisis-profit').value, 2);
});

test('challenge progress round-trips and rejects malformed deadlines without changing legacy campaign state', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'growing-city', random: () => 0.2 });
  const old = new UrbanFlowGame(CITIES.krakow);
  const legacyCampaign = structuredClone(old.state.campaign);
  assert.equal(legacyCampaign.challenge, undefined);
  const challenge = structuredClone(game.state.campaign.challenge);
  assert.equal(validateCampaignChallengeState(challenge, CITIES.krakow), true);
  challenge.deadlineAt = Infinity;
  assert.equal(validateCampaignChallengeState(challenge, CITIES.krakow), false);
  const migrated = createChallengeProgress('growing-city', game.state);
  assert.equal(validateCampaignChallengeState(migrated, CITIES.krakow), true);
});

test('schema 13 saves persist challenge clocks and completed objectives while legacy campaigns gain no invented progress', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; }, removeItem() { this.value = null; } };
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'finance-crisis', random: () => 0.2 });
  game.state.campaign.challenge.completed = ['crisis-profit'];
  game.state.campaign.challenge.completedAt['crisis-profit'] = game.state.elapsedMinutes;
  assert.equal(saveGame(storage, game.state).ok, true);
  assert.equal(JSON.parse(storage.value).version, 13);
  assert.equal(JSON.parse(storage.value).version, SAVE_VERSION);
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.state.campaign.challenge.completed, ['crisis-profit']);
  assert.equal(loaded.state.campaign.challenge.deadlineAt, game.state.campaign.challenge.deadlineAt);
  const legacy = new UrbanFlowGame(CITIES.krakow);
  assert.equal(legacy.state.campaign.challenge, undefined);
});

test('terminal challenge summaries are validated against both campaign status and objective results', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; }, removeItem() { this.value = null; } };
  const game = new UrbanFlowGame(CITIES.krakow, { challengeId: 'recovery', random: () => 0.2 });
  game.finish('lost', 'Bankructwo.');
  assert.equal(saveGame(storage, game.state).ok, true);
  assert.equal(loadGame(storage, CITIES.krakow).error, null);
  const envelope = JSON.parse(storage.value);
  envelope.state.status = 'playing';
  storage.value = JSON.stringify(envelope);
  let invalid = storage.value;
  assert.ok(loadGame(storage, CITIES.krakow).error);
  assert.equal(storage.getItem(SAVE_KEY), invalid);
  assert.equal(storage.getItem(`${SAVE_KEY}.recovery`), invalid);
  envelope.state.status = 'lost';
  envelope.state.campaign.challenge.summary.completedGoalIds = ['made-up-goal'];
  storage.value = JSON.stringify(envelope);
  invalid = storage.value;
  assert.ok(loadGame(storage, CITIES.krakow).error);
  assert.equal(storage.getItem(SAVE_KEY), invalid);
  assert.equal(storage.getItem(`${SAVE_KEY}.recovery`), invalid);
});
