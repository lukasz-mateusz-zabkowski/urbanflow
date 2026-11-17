import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { saveGame, loadGame, clearSave, validateState, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';

const city = CITIES.krakow;
const snapshot = value => JSON.parse(JSON.stringify(value));
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};
const activeGame = () => {
  const game = new UrbanFlowGame(city);
  game.chooseStarterRoute('loop-center');
  game.addLine('bus', ['ruczaj', 'centrum', 'bronowice', 'dworzec']);
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
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 9);
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
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 9);
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
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 9);
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
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 9);
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

test('schema 9 validates Atlas Land Use mode and rejects shares that no longer total 100 percent', () => {
  const state = snapshot(activeGame().state);
  state.analyticsMode = 'landUse';
  assert.equal(validateState(state, city), true);
  state.cityEvolution.districts.ruczaj.landUse.shares.residential += 1;
  assert.equal(validateState(state, city), false);
});
