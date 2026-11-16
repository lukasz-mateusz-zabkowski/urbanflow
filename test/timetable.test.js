import test from 'node:test';
import assert from 'node:assert/strict';
import { lineMetrics } from '../public/js/transport.js';
import { buildTransportGraph, createLineStats, createPassengerState, passengerTick } from '../public/js/passengers.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { loadGame, saveGame, SAVE_KEY, SAVE_VERSION } from '../public/js/storage.js';
import { applyEconomyTick } from '../public/js/economy.js';
import { averageFrequency, createTimetable, periodAt, validateTimetable } from '../public/js/timetable.js';

const points = [
  { id: 'a', type: 'residential', lat: 50, lng: 19, demand: 20 },
  { id: 'b', type: 'commercial', lat: 50, lng: 19.03, demand: 20 }
];
const makeSchedule = ({ dayFrequency = 4, nightFrequency = 0, dayStart = 360, eveningStart = 1380 } = {}) => ({
  version: 1,
  profileId: 'custom',
  periods: [
    { id: 'day', label: 'Day', startMinute: dayStart, endMinute: eveningStart, frequency: dayFrequency },
    { id: 'night', label: 'Night', startMinute: eveningStart, endMinute: dayStart, frequency: nightFrequency }
  ]
});
const makeLine = (extra = {}) => ({ id: 'line-1', type: 'bus', stops: ['a', 'b'], distanceKm: 6, vehicles: 4,
  frequency: 3, ageMinutes: 0, name: 'A1', color: '#f2b84b', stats: createLineStats(), ...extra });

test('line metrics follow configured periods, including a night window that crosses midnight', () => {
  const line = makeLine({ timetable: makeSchedule() });
  assert.equal(lineMetrics(line, { points }, 359).requestedFrequency, 0);
  assert.equal(lineMetrics(line, { points }, 360).requestedFrequency, 4);
  assert.equal(lineMetrics(line, { points }, 1379).requestedFrequency, 4);
  assert.equal(lineMetrics(line, { points }, 1380).requestedFrequency, 0);
  assert.equal(lineMetrics(line, { points }, 0).requestedFrequency, 0);
  assert.equal(lineMetrics(line, { points }, 359 + 1440).requestedFrequency, 0);
});

test('profile periods are model data, cover midnight exactly, and allow configurable time boundaries', () => {
  const balanced = createTimetable('balanced', 4);
  assert.equal(validateTimetable(balanced, 4), true);
  assert.equal(periodAt(balanced, 360).id, 'morning-peak');
  assert.equal(periodAt(balanced, 359).id, 'night');
  const shifted = structuredClone(balanced);
  shifted.periods[0].startMinute = 365;
  shifted.periods.find(period => period.id === 'night').endMinute = 365;
  assert.equal(validateTimetable(shifted, 4), true);
  assert.equal(periodAt(shifted, 364).id, 'night');
  assert.equal(periodAt(shifted, 365).id, 'morning-peak');
  assert.equal(averageFrequency(makeSchedule(), 357, 6), 2);
  const gap = structuredClone(shifted);
  gap.periods[0].startMinute = 366;
  assert.equal(validateTimetable(gap, 4), false);
});

test('a six-minute tick spanning 06:00 averages service and operating cost without a boundary jump', () => {
  const line = makeLine({ timetable: makeSchedule({ dayFrequency: 4 }) });
  const metrics = lineMetrics(line, { points }, 363, { intervalStartMinuteOfDay: 357, intervalMinutes: 6 });
  const off = lineMetrics({ ...line, timetable: makeSchedule({ dayFrequency: 0 }) }, { points }, 359);
  const on = lineMetrics(line, { points }, 360);
  assert.equal(metrics.averageEffectiveFrequency, 2);
  assert.equal(metrics.averageCapacityPerHour, 96);
  assert.ok(Math.abs(metrics.averageCostPerHour - (off.costPerHour + on.costPerHour) / 2) < 1e-9);
});

test('the economy charges the time-weighted operating cost across a period boundary', () => {
  const line = makeLine({ timetable: makeSchedule() });
  const off = lineMetrics({ ...line, timetable: makeSchedule({ dayFrequency: 0 }) }, { points }, 359).costPerHour;
  const on = lineMetrics(line, { points }, 360).costPerHour;
  const state = { lines: [line], city: { points }, elapsedMinutes: 3, transportMinutes: 3,
    budget: 100000, revenue: 0, expenses: 0, fleet: { bus: { owned: 4 } } };
  applyEconomyTick(state, 0, 6);
  assert.ok(Math.abs(line.stats.expenses - (off + on) / 2 * 6 / 60) < 1e-9);
});

test('service off at night removes passenger connections and peak service increases real boarding capacity', () => {
  const line = makeLine({ timetable: makeSchedule() });
  assert.equal(buildTransportGraph([line], points, 60).has('a'), false);
  const state = {
    lines: [line], city: { points }, passengers: createPassengerState(points), cohorts: [{ origin: 'a', destination: 'b', currentStop: 'a', count: 40,
      phase: 'waiting', waitMinutes: 30, totalWaitMinutes: 30, route: null, legIndex: 0, completedLegs: [] }],
    elapsedMinutes: 357, transportMinutes: 0, stopCapacity: 80, budget: 10000, revenue: 0, expenses: 0
  };
  passengerTick(state, points, 363, () => 0.99);
  assert.equal(line.stats.boardings, 9);
  assert.equal(state.cohorts.find(group => group.phase === 'waiting')?.count, 31);
  state.elapsedMinutes = 1379;
  passengerTick(state, points, 1385, () => 0.99);
  assert.equal(line.stats.boardings, 12, 'the closing interval only provides the capacity earned before service ends');
  state.elapsedMinutes = 1385;
  passengerTick(state, points, 1391, () => 0.99);
  assert.equal(line.stats.boardings, 12, 'a full off-service interval provides no additional passenger capacity');
});

test('line schedule presets can be customized and the prior schedule can be restored', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const line = game.chooseStarterRoute('loop-center').line;
  assert.ok(line);
  const initial = structuredClone(line.timetable);
  assert.equal(game.setTimetableFrequency(line.id, 'morning-peak', 5).ok, true);
  assert.equal(line.timetable.profileId, 'custom');
  assert.equal(line.timetable.periods.find(period => period.id === 'morning-peak').frequency, 5);
  assert.equal(game.restoreTimetable(line.id).ok, true);
  assert.deepEqual(line.timetable, initial);
  assert.equal(game.setTimetableProfile(line.id, 'economic').ok, true);
  assert.equal(line.timetable.profileId, 'economic');
  assert.equal(game.restoreTimetable(line.id).ok, true);
  assert.deepEqual(line.timetable, initial);
});

test('schema-2 saves migrate each legacy line to a uniform timetable without losing campaign progress', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const line = game.chooseStarterRoute('loop-center').line;
  assert.ok(line);
  line.frequency = 2.5;
  game.state.campaign.completed = ['gateway', 'center'];
  const legacyState = JSON.parse(JSON.stringify(game.state));
  for (const savedLine of legacyState.lines) delete savedLine.timetable;
  const stored = new Map([[SAVE_KEY, JSON.stringify({ version: 2, cityId: CITIES.krakow.id, state: legacyState })]]);
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) };
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  assert.equal(loaded.state.lines[0].id, line.id);
  assert.equal(loaded.state.lines[0].frequency, 2.5);
  assert.ok(loaded.state.lines[0].timetable.periods.every(period => period.frequency === 2.5));
  assert.deepEqual(loaded.state.campaign.completed, ['gateway', 'center']);
  assert.equal(JSON.parse(stored.get(SAVE_KEY)).version, SAVE_VERSION);
});

test('schema-3 save and load retain each line profile and its previous configuration', () => {
  const game = new UrbanFlowGame(CITIES.krakow);
  const line = game.chooseStarterRoute('loop-center').line;
  assert.ok(line);
  game.setTimetableProfile(line.id, 'intensive');
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) };
  assert.equal(saveGame(storage, game.state).ok, true);
  const loaded = loadGame(storage, CITIES.krakow);
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.state.lines[0].timetable, line.timetable);
  assert.deepEqual(loaded.state.lines[0].previousTimetable, line.previousTimetable);
});
