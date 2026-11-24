import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { saveGame, loadGame, clearSave, validateState, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';
import { advanceInvestmentProjects } from '../public/js/investments.js';
import { evolveCityWeek } from '../public/js/city-evolution.js';
import { SIMULATION } from '../public/js/simulation.js';
import { validateFinanceState } from '../public/js/finance.js';

const city = CITIES.krakow;
const snapshot = value => JSON.parse(JSON.stringify(value));
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};
const activeGame = () => {
  const game = new UrbanFlowGame(city);
  game.chooseStarterRoute('loop-center');
  game.addLine('bus', ['ruczaj', 'dworzec', 'bronowice']);
  for (let tick = 0; tick < 25; tick += 1) game.tick(() => 0.5);
  return game;
};
const writeState = (storage, state, extra = {}) => storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, cityId: city.id, state, ...extra }));

test('save/load roundtrip preserves initial state, preferences, edited draft and finite line finances', () => {
  const storage = memoryStorage();
  const game = activeGame();
  game.beginEditLine(game.state.lines[0].id);
  game.selectNode('ruczaj');
  game.setPreference('tutorialCollapsed', true);
  game.setPaused(true);
  game.setSpeed(4);
  assert.equal(validateState(game.state, city), true);
  assert.deepEqual(saveGame(storage, game.state), { ok: true });
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.state, snapshot(game.state));
  assert.equal(Object.hasOwn(loaded.state, 'city'), false, 'static city configuration is not duplicated in saves');
  const restored = new UrbanFlowGame(city, {}, loaded.state);
  assert.equal(restored.state.city, city);
  assert.equal(Object.keys(restored.state).includes('city'), false);
});

test('resuming riding and waiting cohorts produces exactly the same next 100 simulation steps', () => {
  const storage = memoryStorage();
  const original = activeGame();
  assert.ok(original.state.cohorts.some(group => group.phase === 'riding'));
  assert.ok(original.state.cohorts.some(group => group.phase === 'waiting'));
  saveGame(storage, original.state);
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  const restored = new UrbanFlowGame(city, {}, loaded.state);
  for (let tick = 0; tick < 100; tick += 1) {
    original.tick(() => 0.5);
    restored.tick(() => 0.5);
    assert.deepEqual(snapshot(restored.state), snapshot(original.state), `resume diverged at tick ${tick}`);
  }
});

test('save after deleting an in-flight service remains loadable and reroutes safely', () => {
  const game = activeGame();
  const removedId = game.state.cohorts.find(group => group.phase === 'riding').route[0].lineId;
  game.deleteLine(removedId);
  const storage = memoryStorage();
  saveGame(storage, game.state);
  const restored = loadGame(storage, city);
  assert.equal(restored.error, null, 'stale route legs may refer to a just-deleted service');
  assert.doesNotThrow(() => new UrbanFlowGame(city, {}, restored.state).tick(() => 0.99));
});

test('finished campaign saves remain loadable without restarting the simulation', () => {
  for (const status of ['won', 'lost']) {
    const game = activeGame();
    game.finish(status, status === 'lost' ? 'Bankructwo' : '');
    const storage = memoryStorage();
    saveGame(storage, game.state);
    const restored = new UrbanFlowGame(city, {}, loadGame(storage, city).state);
    const before = snapshot(restored.state);
    restored.tick(() => 0.5);
    assert.deepEqual(snapshot(restored.state), before);
  }
});

test('investment completed exactly at a week boundary stays charged and applied once after save/resume', () => {
  const game = activeGame();
  game.state.elapsedMinutes = 7 * 24 * 60 - SIMULATION.startMinute;
  const project = game.planInvestment('bronowice', 'housing').project;
  assert.equal(game.approveInvestment(project.id).ok, true);
  const paidBudget = game.state.budget;
  const paidTotal = game.state.investments.totalSpent;
  game.state.elapsedMinutes = project.completesAt - SIMULATION.minutesPerTick;
  game.tick(() => 0.5);
  assert.equal(game.state.elapsedMinutes, project.completesAt);
  assert.equal(project.status, 'completed');
  assert.equal(game.state.investments.history.filter(item => item.id === project.id && item.status === 'completed').length, 1);
  const completedBudget = game.state.budget;
  const completedShares = snapshot(game.state.cityEvolution.districts.bronowice.landUse.shares);
  assert.equal(game.state.investments.totalSpent, paidTotal);
  assert.equal(game.state.investments.weekly.at(-1).week, 4);

  const storage = memoryStorage();
  assert.equal(saveGame(storage, game.state).ok, true);
  const restored = new UrbanFlowGame(city, {}, loadGame(storage, city).state);
  assert.equal(restored.state.budget, completedBudget);
  assert.equal(restored.state.investments.totalSpent, paidTotal);
  assert.deepEqual(restored.state.cityEvolution.districts.bronowice.landUse.shares, completedShares);
  assert.equal(advanceInvestmentProjects(restored.state).length, 0);
  assert.equal(restored.state.budget, completedBudget);
  assert.equal(restored.state.investments.totalSpent, paidTotal);
  assert.equal(restored.state.investments.history.filter(item => item.id === project.id && item.status === 'completed').length, 1);
  assert.notEqual(completedBudget, paidBudget);
});

test('empty storage is a clean start and clearing a save does not touch unrelated values', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadGame(storage, city), { state: null, error: null });
  storage.setItem('unrelated', 'preserve');
  saveGame(storage, new UrbanFlowGame(city).state);
  assert.equal(clearSave(storage).ok, true);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'preserve');
});

test('malformed JSON, unknown versions, wrong city and oversized saves are preserved for recovery', () => {
  const game = new UrbanFlowGame(city);
  const variants = ['{broken', JSON.stringify({ version: 999, cityId: city.id, state: game.state }),
    JSON.stringify({ version: SAVE_VERSION, cityId: 'warszawa', state: game.state }), ' '.repeat(2000001), 'null'];
  for (const raw of variants) {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const loaded = loadGame(storage, city);
    assert.equal(loaded.state, null);
    assert.match(loaded.error, /zapisu/);
    assert.equal(storage.getItem(SAVE_KEY), raw);
    assert.equal(storage.getItem(`${SAVE_KEY}.recovery`), raw);
  }
});

test('storage denial and quota failure are reported without exceptions or lost in-memory state', () => {
  const game = activeGame();
  const before = snapshot(game.state);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(saveGame(denied, game.state).ok, false);
  assert.match(loadGame(denied, city).error, /zapisu/);
  assert.equal(clearSave(denied).ok, false);
  assert.deepEqual(snapshot(game.state), before);
});

test('nested malformed schema-2 passenger, line and campaign data are rejected before adoption', () => {
  const baseline = snapshot(activeGame().state);
  const mutations = {
    'null cohort': state => { state.cohorts = [null]; },
    'invalid cohort count': state => { state.cohorts[0].count = '12'; },
    'fractional people': state => { state.cohorts[0].count = 1.5; },
    'unknown current stop': state => { state.cohorts[0].currentStop = 'missing'; },
    'invalid cohort phase': state => { state.cohorts[0].phase = 'flying'; },
    'missing completed legs': state => { delete state.cohorts[0].completedLegs; },
    'bad completed leg': state => { state.cohorts[0].completedLegs = [null]; },
    'invalid rider route': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.route = null; },
    'bad route segment array': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.route[0].segments = {}; },
    'bad route sequence': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.route[0].stopSequence = 'wieliczka'; },
    'bad route index': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.legIndex = 999; },
    'invalid duration': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.remainingMinutes = 'slow'; },
    'bad route distance': state => { const group = state.cohorts.find(item => item.phase === 'riding'); group.route[0].distanceKm = -1; },
    'bad passenger queue': state => { state.passengers.wieliczka = null; },
    'bad destinations': state => { state.passengers.wieliczka.destinations = []; },
    'bad passenger quantity': state => { state.passengers.wieliczka.destinations.centrum = 'many'; },
    'unknown destination': state => { state.passengers.wieliczka.destinations.missing = 12; },
    'unknown queue': state => { state.passengers.missing = { waiting: 0, destinations: {} }; },
    'bad line history': state => { state.lines[0].stats.history = [null]; },
    'string line history': state => { state.lines[0].stats.history = 'history'; },
    'bad line balance': state => { state.lines[0].stats.balancePerHour = 'profit'; },
    'excessive line load': state => { state.lines[0].stats.load = 2; },
    'bad remainder': state => { state.lines[0].serviceRemainder = { 'line-1:1:0': 'NaN' }; },
    'prototype transport type': state => { state.lines[0].type = 'toString'; },
    'bad preferences': state => { state.preferences.goalsCollapsed = {}; },
    'unknown objective': state => { state.campaign.completed.push('unknown'); },
    'duplicate reward objective': state => { state.campaign.completed.push(state.campaign.completed[0]); },
    'bad accounting date': state => { state.campaign.profitDay = {}; },
    'bad pending revenue': state => { state._pendingLineRevenue = { 'line-1': -2 }; },
    'dangerous nested key': state => { state.cohorts[0].constructor = {}; }
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const state = snapshot(baseline);
    mutate(state);
    const storage = memoryStorage();
    writeState(storage, state);
    assert.equal(loadGame(storage, city).state, null, name);
    assert.ok(storage.getItem(`${SAVE_KEY}.recovery`), name);
  }
});

test('validator rejects nonfinite, cyclic and deeply nested data without traversing forever', () => {
  const state = new UrbanFlowGame(city).state;
  state.budget = Infinity;
  assert.equal(validateState(state, city), false);
  state.budget = 100;
  state.extra = state;
  assert.equal(validateState(state, city), false);
  state.extra = {};
  let cursor = state.extra;
  for (let index = 0; index < 30; index += 1) { cursor.child = {}; cursor = cursor.child; }
  assert.equal(validateState(state, city), false);
});

test('schema 6 mobility templates and journey counters are validated as untrusted save data', () => {
  const game = activeGame();
  assert.ok(game.state.mobility.patterns.length > 0);
  const invalidMinute = snapshot(game.state);
  invalidMinute.mobility.patterns[0].departureMinute = 1440;
  assert.equal(validateState(invalidMinute, city), false);
  const invalidCounter = snapshot(game.state);
  invalidCounter.mobility.completed.passengers = -1;
  assert.equal(validateState(invalidCounter, city), false);
  const invalidJourney = snapshot(game.state);
  invalidJourney.cohorts = [{ origin: 'wieliczka', destination: 'centrum', currentStop: 'wieliczka', count: 1,
    phase: 'waiting', waitMinutes: 0, totalWaitMinutes: 0, rideMinutes: -1, route: null, legIndex: 0, completedLegs: [] }];
  assert.equal(validateState(invalidJourney, city), false);
});

test('schema 5 migrates to bounded network history without losing campaign, fleet, lines or mobility', () => {
  const game = activeGame(); const oldState = snapshot(game.state); delete oldState.networkHistory;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 5, cityId: city.id, state: oldState }));
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.lines.length, oldState.lines.length);
  assert.deepEqual(loaded.state.mobility, oldState.mobility);
  assert.deepEqual(loaded.state.unlocked, oldState.unlocked);
  assert.deepEqual(loaded.state.networkHistory, []);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  const invalid = snapshot(loaded.state); invalid.networkHistory = Array(97).fill({ at: 0, networkVersion: 0, transported: 0, averageWaitMinutes: 0,
    availability: 0, utilization: 0, revenue: 0, cost: 0, balance: 0 });
  assert.equal(validateState(invalid, city), false);
});

test('schema 6 migrates observed coverage while preserving state and starting longer history empty', () => {
  const game = activeGame();
  game.state.networkHistory = [{ at: 6, networkVersion: 0, transported: 2, averageWaitMinutes: 3,
    availability: 0.75, utilization: 0.4, revenue: 14, cost: 5, balance: 9 }];
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, cityId: city.id, state: snapshot(game.state) }));
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.networkHistory[0].coverage, 0.75);
  assert.equal(loaded.state.networkHistory[0].tripAvailability, null);
  assert.deepEqual(loaded.state.networkDailyHistory, []);
  assert.deepEqual(loaded.state.networkWeeklyHistory, []);
  assert.equal(loaded.state.lines.length, game.state.lines.length);
  assert.deepEqual(loaded.state.campaign, game.state.campaign);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
});

test('schema 7 migrates deterministic city profiles without losing campaign, budget, lines, fleet or mobility', () => {
  const game = activeGame();
  const oldState = snapshot(game.state);
  delete oldState.cityEvolution;
  oldState.budget = 123456;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 7, cityId: city.id, state: oldState }));
  const first = loadGame(storage, city);
  assert.equal(first.error, null);
  assert.equal(first.state.budget, 123456);
  assert.equal(first.state.lines.length, oldState.lines.length);
  assert.deepEqual(first.state.fleet, oldState.fleet);
  assert.deepEqual(first.state.mobility, oldState.mobility);
  assert.deepEqual(first.state.campaign, oldState.campaign);
  assert.equal(first.state.cityEvolution.source, 'simulation-parameters');
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  const district = first.state.cityEvolution.districts.ruczaj;
  assert.ok(district && district.residents === district.base.residents);
  const saved = snapshot(first.state);
  saved.cityEvolution.districts.ruczaj.residents = -1;
  assert.equal(validateState(saved, city), false);
});

test('schema 8 adds deterministic land-use profiles while preserving occupied values, lines, history and cohorts', () => {
  const game = activeGame();
  const oldState = snapshot(game.state);
  const beforeZone = oldState.cityEvolution.districts.ruczaj;
  const beforeLines = snapshot(oldState.lines); const beforeCohorts = snapshot(oldState.cohorts);
  const beforeMobility = snapshot(oldState.mobility); const beforeCampaign = snapshot(oldState.campaign);
  for (const zone of Object.values(oldState.cityEvolution.districts)) delete zone.landUse;
  oldState.cityEvolution.weeklyReports = [{ week: 2, residentsDelta: 3, jobsDelta: 1, demandChangePercent: 0.1,
    fastestGrowing: [], declining: [], transportIssues: [], networkBalance: 12, networkWeek: 1 }];
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 8, cityId: city.id, state: oldState }));
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  const afterZone = loaded.state.cityEvolution.districts.ruczaj;
  assert.equal(afterZone.residents, beforeZone.residents);
  assert.equal(afterZone.jobs, beforeZone.jobs);
  assert.deepEqual(afterZone.capacity, beforeZone.capacity);
  assert.equal(Object.values(afterZone.landUse.shares).reduce((sum, share) => sum + share, 0), 100);
  assert.equal(afterZone.landUse.lastDevelopmentWeek, loaded.state.cityEvolution.lastEvolvedWeek);
  assert.deepEqual(loaded.state.lines, beforeLines);
  assert.deepEqual(loaded.state.cohorts, beforeCohorts);
  assert.deepEqual(loaded.state.mobility, beforeMobility);
  assert.deepEqual(loaded.state.campaign, beforeCampaign);
  assert.deepEqual(loaded.state.cityEvolution.weeklyReports[0].landUseChanges, []);
  assert.equal(loaded.state.cityEvolution.weeklyReports[0].networkWeek, 1);
});

test('schema 10 validates Atlas Land Use and Investments modes and rejects malformed project ledgers', () => {
  const state = snapshot(activeGame().state);
  state.analyticsMode = 'landUse';
  assert.equal(validateState(state, city), true);
  state.analyticsMode = 'investments';
  assert.equal(validateState(state, city), true);
  state.investments.projects.push({ id: 'investment-1', type: 'housing', districtId: 'ruczaj', status: 'planned',
    cost: Infinity, durationWeeks: 3, createdAt: 0, approvedAt: null, completesAt: null, completedAt: null,
    effectApplied: false, refund: 0, charged: false, expected: {}, result: null });
  assert.equal(validateState(state, city), false);
  const reset = snapshot(activeGame().state);
  reset.analyticsMode = 'landUse';
  reset.cityEvolution.districts.ruczaj.landUse.shares.residential += 1;
  assert.equal(validateState(reset, city), false);
});

test('schema 11 adds truthful Living City history slots without changing the existing campaign', () => {
  const game = activeGame();
  game.state.elapsedMinutes = 7 * 1440;
  evolveCityWeek(game.state, city);
  const oldState = snapshot(game.state);
  const originalCampaign = snapshot(oldState.campaign);
  delete oldState.finance;
  for (const report of oldState.cityEvolution.weeklyReports) delete report.districtSnapshots;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 11, cityId: city.id, state: oldState }));
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 13);
  assert.deepEqual(loaded.state.campaign, originalCampaign);
  assert.deepEqual(loaded.state.lines, oldState.lines);
  assert.equal(loaded.state.budget, oldState.budget);
  assert.equal(loaded.state.cityEvolution.weeklyReports.length, 1);
  assert.deepEqual(loaded.state.cityEvolution.weeklyReports[0].districtSnapshots, [], 'unrecorded historic district values are not fabricated');
  assert.equal(validateState(loaded.state, city), true);
});

test('schema 12 migrates finance ledger without inventing capital history and preserves campaign state', () => {
  const original = activeGame();
  original.state.elapsedMinutes = 14 * 1440;
  const oldState = snapshot(original.state);
  delete oldState.finance;
  oldState.investments.weekly = [{ week: 9, active: 0, completed: 0, cancelled: 0, costs: 0, refunds: 0, maintenance: 500 }];
  delete oldState.investments.lastRecordedWeek;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 12, cityId: city.id, state: oldState }));

  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  assert.equal(validateFinanceState(loaded.state.finance), true);
  assert.equal(loaded.state.finance.historyComplete, false);
  assert.equal(loaded.state.finance.ledgerStartAt, oldState.elapsedMinutes);
  assert.deepEqual(loaded.state.finance.transactions, []);
  assert.equal(loaded.state.budget, oldState.budget);
  assert.deepEqual(loaded.state.lines, oldState.lines);
  assert.deepEqual(loaded.state.fleet, oldState.fleet);
  assert.deepEqual(loaded.state.cohorts, oldState.cohorts);
  assert.deepEqual(loaded.state.campaign, oldState.campaign);
  const { lastRecordedWeek: _lastRecordedWeek, ...migratedInvestments } = loaded.state.investments;
  assert.deepEqual(migratedInvestments, oldState.investments);
  assert.equal(loaded.state.investments.lastRecordedWeek, 9, 'bounded investment history seeds the compact idempotency watermark');
  assert.deepEqual(loaded.state.cityEvolution, oldState.cityEvolution);
  assert.deepEqual(loaded.state.calendar, oldState.calendar);
});

test('schema 13 rejects malformed finance ledgers and keeps the original save for recovery', () => {
  const state = snapshot(activeGame().state);
  state.finance.totals.investment = Infinity;
  const raw = JSON.stringify({ version: SAVE_VERSION, cityId: city.id, state });
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, raw);

  const loaded = loadGame(storage, city);
  assert.equal(loaded.state, null);
  assert.ok(loaded.error);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(storage.getItem(`${SAVE_KEY}.recovery`), raw);
});

test('schema 13 restores the compact investment week watermark from bounded history', () => {
  const state = snapshot(activeGame().state);
  state.investments.weekly = [{ week: 17, active: 0, completed: 0, cancelled: 0, costs: 0, refunds: 0, maintenance: 500 }];
  delete state.investments.lastRecordedWeek;
  const storage = memoryStorage();
  writeState(storage, state);

  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.investments.lastRecordedWeek, 17);
  assert.equal(validateState(loaded.state, city), true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).state.investments.lastRecordedWeek, 17);
});

test('schema 13 rejects an investment watermark older than its recorded weekly ledger', () => {
  const state = snapshot(activeGame().state);
  state.investments.weekly = [{ week: 17, active: 0, completed: 0, cancelled: 0, costs: 0, refunds: 0, maintenance: 0 }];
  state.investments.lastRecordedWeek = 0;
  const raw = JSON.stringify({ version: SAVE_VERSION, cityId: city.id, state });
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, raw);

  const loaded = loadGame(storage, city);
  assert.equal(loaded.state, null);
  assert.ok(loaded.error);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(storage.getItem(`${SAVE_KEY}.recovery`), raw);
});

test('schema 13 resumes Living City snapshots deterministically across the 52-week horizon', () => {
  const original = activeGame();
  for (let week = 2; week <= 6; week += 1) {
    original.state.elapsedMinutes = (week - 1) * 7 * 1440;
    evolveCityWeek(original.state, city);
  }
  const storage = memoryStorage();
  assert.equal(saveGame(storage, original.state).ok, true);
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  const resumed = new UrbanFlowGame(city, {}, loaded.state);
  for (let week = 7; week <= 53; week += 1) {
    original.state.elapsedMinutes = (week - 1) * 7 * 1440;
    resumed.state.elapsedMinutes = original.state.elapsedMinutes;
    evolveCityWeek(original.state, city);
    evolveCityWeek(resumed.state, city);
    assert.deepEqual(resumed.state.cityEvolution, original.state.cityEvolution, `city state diverged in week ${week}`);
  }
  assert.equal(resumed.state.cityEvolution.weeklyReports.length, 12);
  assert.equal(resumed.state.cityEvolution.weeklyReports.at(-1).districtSnapshots.length, Object.keys(resumed.state.cityEvolution.districts).length);
});

test('schema 10 migrates tram construction state to schema 13 without changing campaign or transit state', () => {
  const game = activeGame();
  const oldState = snapshot(game.state);
  delete oldState.finance;
  delete oldState.tramInfrastructure; delete oldState.tramBuildMode; delete oldState.tramControlPoints;
  const storage = memoryStorage();
  writeState(storage, oldState, { version: 10 });
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  assert.deepEqual(loaded.state.tramInfrastructure, { version: 1, segments: [] });
  assert.equal(loaded.state.tramBuildMode, 'street');
  assert.deepEqual(loaded.state.tramControlPoints, []);
  assert.equal(loaded.state.budget, oldState.budget);
  assert.deepEqual(loaded.state.lines, oldState.lines);
  assert.deepEqual(loaded.state.fleet, oldState.fleet);
  assert.deepEqual(loaded.state.campaign, oldState.campaign);
  assert.deepEqual(loaded.state.cohorts, oldState.cohorts);
});

test('schema 9 migrates an in-progress campaign to schema 13 without touching campaign or transit state', () => {
  const oldState = snapshot(activeGame().state);
  delete oldState.finance;
  oldState.budget = 234567;
  oldState.campaign.completed = ['gateway'];
  delete oldState.investments; delete oldState.hubCapacityByPoint;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 9, cityId: city.id, state: oldState }));
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 13);
  assert.equal(loaded.state.budget, oldState.budget);
  assert.deepEqual(loaded.state.lines, oldState.lines);
  assert.deepEqual(loaded.state.cohorts, oldState.cohorts);
  assert.deepEqual(loaded.state.campaign, oldState.campaign);
  assert.deepEqual(loaded.state.investments.projects, []);
  assert.deepEqual(loaded.state.hubCapacityByPoint, {});
});

test('save and resume during construction preserve project progress and deterministic completion', () => {
  const original = activeGame();
  const planned = original.planInvestment('bronowice', 'housing');
  assert.equal(planned.ok, true);
  assert.equal(original.approveInvestment(planned.project.id).ok, true);
  for (let index = 0; index < 10; index += 1) original.tick(() => 0.5);
  const storage = memoryStorage();
  assert.equal(saveGame(storage, original.state).ok, true);
  const loaded = loadGame(storage, city);
  assert.equal(loaded.error, null);
  const resumed = new UrbanFlowGame(city, {}, loaded.state);
  assert.deepEqual(resumed.state.investments, original.state.investments);
  for (let index = 0; index < 100; index += 1) {
    original.tick(() => 0.5); resumed.tick(() => 0.5);
    assert.deepEqual(snapshot(resumed.state), snapshot(original.state), `project save diverged at tick ${index}`);
  }
});
