import test from 'node:test';
import assert from 'node:assert/strict';
import { UrbanFlowGame } from '../public/js/game.js';
import { CITIES } from '../public/js/cities.js';
import { applyEconomyTick } from '../public/js/economy.js';
import { lineMetrics, TRANSPORT_TYPES } from '../public/js/transport.js';
import { passengerTick } from '../public/js/passengers.js';
import { mobilitySnapshot } from '../public/js/mobility.js';
import { calendarTickContext, gameClock, SIMULATION } from '../public/js/simulation.js';
import { createWeeklyUniformTimetable } from '../public/js/timetable.js';
import { routeLine } from '../public/js/routing.js';
import { recordNetworkHistory } from '../public/js/analytics.js';
import { loadGame, saveGame, SAVE_KEY } from '../public/js/storage.js';

const routePlans = [
  ['wieliczka', 'biezanow'], ['wieliczka', 'biezanow', 'centrum', 'dworzec'],
  ['ruczaj', 'lagiewniki', 'centrum', 'dworzec'], ['zabierzow', 'bronowice', 'dworzec'],
  ['skawina', 'lagiewniki', 'centrum'], ['niepolomice', 'nowa-huta', 'dworzec']
];
const scenarios = [
  { name: 'short bus', lines: 1, frequency: 3, vehicles: 2, budget: 920000 },
  { name: 'long bus', lines: 1, route: 1, frequency: 3, vehicles: 3, budget: 920000 },
  { name: 'high-demand tram', lines: 1, route: 2, type: 'tram', frequency: 7, vehicles: 8, budget: 920000 },
  { name: 'three-line transfers', lines: 3, frequency: 4, vehicles: 3, budget: 920000 },
  { name: 'fleet shortage', lines: 1, frequency: 8, vehicles: 1, budget: 920000 },
  { name: 'excess frequency', lines: 1, frequency: 8, vehicles: 8, budget: 920000 },
  { name: 'restricted operating budget', lines: 1, frequency: 3, vehicles: 2, budget: 5000 },
  { name: 'expanded high-cost network', lines: 20, type: 'metro', frequency: 16, vehicles: 8, budget: 920000 }
];

const seededRandom = initial => {
  let value = initial >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
};

function createScenario(definition) {
  const game = new UrbanFlowGame(CITIES.krakow, { startScenarioId: 'wieliczka' });
  assert.equal(game.chooseStarterRoute('starter-local').ok, true);
  const state = game.state;
  state.unlockedPointLevel = 2;
  state.airportUnlocked = true;
  state.budget = definition.budget;
  const template = state.lines[0];
  const type = definition.type || 'bus';
  state.lines = Array.from({ length: definition.lines }, (_value, index) => {
    const stops = routePlans[(definition.route || 0) + (index % routePlans.length)];
    const distanceKm = definition.route === 1 ? 22 : Math.max(4, 3.2 * (stops.length - 1));
    return { ...structuredClone(template), id: `line-${index + 1}`, name: `${type}-${index + 1}`, type,
      color: TRANSPORT_TYPES[type].color, stops: [...stops], distanceKm, vehicles: definition.vehicles,
      frequency: definition.frequency, timetable: createWeeklyUniformTimetable(definition.frequency, TRANSPORT_TYPES[type].maxFrequency),
      routeGeometry: routeLine(stops, type, CITIES.krakow), stats: { ...structuredClone(template.stats), segmentLoad: {} } };
  });
  state.nextLineId = state.lines.length + 1;
  for (const transport of Object.keys(TRANSPORT_TYPES)) state.fleet[transport] = { owned: transport === type ? definition.lines * definition.vehicles : 0 };
  return game;
}

function simulate(game, ticks, random = seededRandom(1701)) {
  const state = game.state;
  const places = game.visiblePoints();
  for (let tick = 0; tick < ticks; tick += 1) {
    state.elapsedMinutes += SIMULATION.minutesPerTick;
    const clock = gameClock(state.elapsedMinutes, state.calendar);
    const accessBefore = { ...state.mobility.accessibility };
    const result = passengerTick(state, places, clock.minuteOfDay, random,
      calendarTickContext(state.elapsedMinutes, SIMULATION.minutesPerTick, state.calendar));
    state.generated += result.generated;
    state.carried += result.transported;
    state.abandoned += result.abandoned || 0;
    const economy = applyEconomyTick(state, result.transported, SIMULATION.minutesPerTick);
    recordNetworkHistory(state, { transported: result.transported, generated: result.generated, abandoned: result.abandoned,
      revenue: economy.fareRevenue + economy.subsidyRevenue, cost: economy.maintenance, deltaMinutes: SIMULATION.minutesPerTick,
      accessibility: { opportunities: state.mobility.accessibility.opportunities - accessBefore.opportunities,
        reachable: state.mobility.accessibility.reachable - accessBefore.reachable,
        denied: state.mobility.accessibility.denied - accessBefore.denied } });
    assert.ok(Number.isFinite(state.budget) && Number.isFinite(state.revenue) && Number.isFinite(state.expenses));
    assert.equal(state.generated, state.carried + state.abandoned + state.cohorts.reduce((sum, cohort) => sum + cohort.count, 0));
    assert.ok(state.cohorts.every(cohort => cohort.count > 0));
  }
  const mobility = mobilitySnapshot(state, places);
  const lineUse = state.lines.map(line => lineMetrics(line, game.city, gameClock(state.elapsedMinutes, state.calendar).minuteOfDay,
    { elapsedMinutes: state.elapsedMinutes, serviceDayType: gameClock(state.elapsedMinutes, state.calendar).dayType }));
  const assigned = state.lines.reduce((sum, line) => sum + line.vehicles, 0);
  const required = lineUse.reduce((sum, metrics) => sum + metrics.requiredVehicles, 0);
  return { revenue: state.revenue, cost: state.expenses, balance: state.revenue - state.expenses, passengers: state.carried,
    averageWaitMinutes: mobility.averageWaitMinutes, tripAvailability: mobility.accessibility.score,
    assignedVehicles: assigned, requiredVehicles: required, fleetShortage: Math.max(0, required - assigned),
    fleetUtilization: assigned ? required / assigned : 0, unmetDemand: state.abandoned,
    deniedOpportunities: mobility.accessibility.denied, transferShare: mobility.transferShare,
    cohorts: state.cohorts.length, dailyRecords: state.networkDailyHistory.length, weeklyRecords: state.networkWeeklyHistory.length };
}

test('eight deterministic operating scenarios expose measured economic, passenger and service outcomes', t => {
  for (const [index, definition] of scenarios.entries()) {
    const game = createScenario(definition);
    const outcome = simulate(game, 240, seededRandom(8000 + index));
    assert.ok(Object.values(outcome).filter(value => typeof value === 'number').every(Number.isFinite));
    assert.ok(outcome.revenue >= 0 && outcome.cost >= 0 && outcome.passengers >= 0 && outcome.unmetDemand >= 0);
    if (definition.name === 'fleet shortage') assert.ok(outcome.fleetShortage > 0);
    if (definition.name === 'three-line transfers') assert.ok(outcome.transferShare > 0);
    if (definition.name === 'expanded high-cost network') assert.ok(outcome.balance < 0, 'a costly, underused service can lose money');
    assert.ok(outcome.dailyRecords >= 1 && outcome.dailyRecords <= 2);
    t.diagnostic(JSON.stringify({ scenario: definition.name, ...Object.fromEntries(Object.entries(outcome).map(([key, value]) =>
      [key, typeof value === 'number' && key !== 'tripAvailability' ? Math.round(value * 100) / 100 : value])) }));
  }
});

test('passenger fares and distance subsidy follow existing transparent rates without duplicate transfer fares', () => {
  const game = createScenario(scenarios[0]);
  const state = game.state;
  const line = state.lines[0];
  state._pendingLinePassengerKm = { 'line-1': 10 };
  const result = applyEconomyTick(state, 2, 6);
  assert.equal(result.fareRevenue, 2 * SIMULATION.farePerPassenger);
  assert.equal(result.subsidyRevenue, 10 * SIMULATION.subsidyPerPassengerKm);
  assert.equal(SIMULATION.farePerPassenger, 7);
  assert.equal(SIMULATION.subsidyPerPassengerKm, 0.28);
  assert.equal(TRANSPORT_TYPES.bus.maintenance, 36);
  assert.equal(TRANSPORT_TYPES.bus.kmCost, 1.05);
  const metrics = lineMetrics(line, game.city);
  const expectedHourlyCost = (TRANSPORT_TYPES.bus.maintenance + metrics.averageActiveFleet * TRANSPORT_TYPES.bus.maintenance * 0.48
    + metrics.idleCostPerHour + 2 * metrics.distanceKm * metrics.effectiveFrequency * TRANSPORT_TYPES.bus.kmCost)
    * (metrics.corridorBonus ? 0.78 : 1);
  assert.ok(Math.abs(metrics.costPerHour - expectedHourlyCost) < 0.001,
    `measured ${metrics.costPerHour}, derived ${expectedHourlyCost}, distance ${metrics.distanceKm}, frequency ${metrics.effectiveFrequency}`);
});

test('the same network and random seed reproduce its one-week operating outcomes exactly', () => {
  const left = simulate(createScenario(scenarios[0]), 240 * 7, seededRandom(404));
  const right = simulate(createScenario(scenarios[0]), 240 * 7, seededRandom(404));
  assert.deepEqual(left, right);
});

test('12-week accelerated service stays finite, bounded, saveable and deterministic after resume', t => {
  const game = createScenario(scenarios[0]);
  const random = seededRandom(1200);
  const checkpoints = [];
  for (const ticks of [240, 240 * 6, 240 * 21, 240 * 56]) {
    simulate(game, ticks, random);
    const state = game.state;
    assert.ok(Number.isFinite(state.budget) && Number.isFinite(state.revenue) && Number.isFinite(state.expenses));
    assert.ok(state.cohorts.length <= 5000);
    assert.equal(state.networkHistory.length, Math.min(96, state.elapsedMinutes / SIMULATION.minutesPerTick));
    assert.ok(state.networkDailyHistory.length <= 84 && state.networkWeeklyHistory.length <= 12);
    checkpoints.push({ elapsedMinutes: state.elapsedMinutes, balance: state.revenue - state.expenses,
      carried: state.carried, generated: state.generated, abandoned: state.abandoned,
      daily: state.networkDailyHistory.length, weekly: state.networkWeeklyHistory.length, cohorts: state.cohorts.length });
  }
  assert.equal(game.state.elapsedMinutes, 240 * 84 * SIMULATION.minutesPerTick);
  assert.equal(game.state.networkWeeklyHistory.length, 12);
  assert.equal(game.state.networkDailyHistory.length, 84);
  const storage = new Map();
  const adapter = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  assert.equal(saveGame(adapter, game.state).ok, true);
  const restored = loadGame(adapter, CITIES.krakow);
  assert.equal(restored.error, null);
  const resumed = new UrbanFlowGame(CITIES.krakow, {}, restored.state);
  simulate(game, 60, seededRandom(9001));
  simulate(resumed, 60, seededRandom(9001));
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.state)), JSON.parse(JSON.stringify(game.state)));
  t.diagnostic(JSON.stringify({ checkpoints, finalSaveBytes: Buffer.byteLength(adapter.getItem(SAVE_KEY)),
    dailyRecords: game.state.networkDailyHistory.length, weeklyRecords: game.state.networkWeeklyHistory.length }));
});
