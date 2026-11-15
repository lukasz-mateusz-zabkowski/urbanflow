import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransportGraph, findRoute, passengerTick, createPassengerState, createLineStats } from '../public/js/passengers.js';
import { applyEconomyTick } from '../public/js/economy.js';
import { lineMetrics, lineCost, eligibleCounts, unlockedTypes, airportUnlocked, lineEligible, PROGRESSION, TRANSPORT_TYPES } from '../public/js/transport.js';
import { SIMULATION } from '../public/js/simulation.js';
import { CITIES } from '../public/js/cities.js';

const points = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, lat: 50, lng: 19 + index * 0.08, demand: 0 }));
const makeLine = (id, type, stops, extra = {}) => ({ id, type, stops, distanceKm: 6, vehicles: 2, frequency: 3, ageMinutes: 0, stats: createLineStats(), ...extra });
const makeState = (lines, selectedPoints = points) => ({ lines, budget: 900000, revenue: 0, expenses: 0, city: { points: selectedPoints },
  passengers: createPassengerState(selectedPoints), stopCapacity: 80, demandModifier: 1 });
const seed = (state, from, to, amount) => { state.passengers[from] = { waiting: amount, destinations: { [to]: amount } }; };
const step = state => {
  const result = passengerTick(state, state.city.points, 720, () => 0.99);
  applyEconomyTick(state, result.transported);
  return result;
};

test('weighted graph chooses concrete line legs and supports a transfer', () => {
  const graph = buildTransportGraph([makeLine('first', 'bus', ['a', 'b']), makeLine('second', 'tram', ['b', 'c'])], points);
  const route = findRoute(graph, 'a', 'c');
  assert.deepEqual(route.map(leg => leg.lineId), ['first', 'second']);
  assert.ok(route.every(leg => leg.travelMinutes > 0 && leg.segments.length === 1));
  assert.equal(findRoute(graph, 'a', 'e'), null);
});

test('weighted routing prefers a faster train over a slow direct bus', () => {
  const graph = buildTransportGraph([makeLine('slow', 'bus', ['a', 'c'], { frequency: 1 }),
    makeLine('fast', 'suburban', ['a', 'b', 'c'], { frequency: 5, vehicles: 8 })], points);
  assert.equal(findRoute(graph, 'a', 'c')[0].lineId, 'fast');
});

test('cohorts take travel time, change vehicles, conserve people and count final arrivals once', () => {
  const state = makeState([makeLine('first', 'bus', ['a', 'b']), makeLine('second', 'tram', ['b', 'c'])]);
  seed(state, 'a', 'c', 12);
  let arrived = 0;
  let abandoned = 0;
  for (let tick = 0; tick < 25; tick += 1) {
    const result = step(state);
    arrived += result.transported; abandoned += result.abandoned;
    if (tick < 4) assert.equal(arrived, 0, 'must not teleport through a transfer');
    assert.equal(arrived + abandoned + state.cohorts.reduce((sum, group) => sum + group.count, 0), 12);
  }
  assert.equal(arrived, 12);
  assert.equal(abandoned, 0);
  assert.equal(state.lines[0].stats.carried, 12);
  assert.equal(state.lines[1].stats.carried, 12);
  assert.ok(state.revenue > 12 * SIMULATION.farePerPassenger);
  assert.ok(state.subsidies > 0);
  assert.ok(Math.abs(state.lines.reduce((sum, line) => sum + line.stats.revenue, 0) - state.revenue) < 0.001);
});

test('empty disconnected metro cannot provide capacity to an overloaded bus', () => {
  const run = extra => {
    const state = makeState([makeLine('busy', 'bus', ['a', 'b'], { frequency: 1 }), ...extra]);
    seed(state, 'a', 'b', 150);
    let arrived = 0;
    for (let tick = 0; tick < 12; tick += 1) arrived += step(state).transported;
    return { arrived, boardings: state.lines[0].stats.boardings };
  };
  assert.deepEqual(run([]), run([makeLine('empty', 'metro', ['d', 'e'], { vehicles: 20, frequency: 16 })]));
});

test('opposite directions have independent capacity and shared segments cannot double-book seats', () => {
  const state = makeState([makeLine('shared', 'bus', ['a', 'b', 'c'], { frequency: 1, vehicles: 4 })]);
  seed(state, 'a', 'c', 80);
  seed(state, 'b', 'c', 80);
  seed(state, 'c', 'a', 80);
  for (let tick = 0; tick < 5; tick += 1) step(state);
  const before = state.lines[0].stats.boardings;
  step(state);
  const boarded = state.lines[0].stats.boardings - before;
  assert.ok(boarded <= Math.ceil(TRANSPORT_TYPES.bus.capacity / 10) * 2);
  assert.ok(boarded > 0);
});

test('queues are finite and disconnected groups eventually abandon', () => {
  const state = makeState([]);
  seed(state, 'a', 'e', 5000);
  let abandoned = 0;
  for (let tick = 0; tick < 24; tick += 1) {
    abandoned += step(state).abandoned;
    assert.ok(state.passengers.a.waiting <= 320);
    assert.ok(state.cohorts.length <= 1600);
  }
  assert.equal(abandoned, 5000);
  assert.equal(state.cohorts.length, 0);
});

test('fleet constrains frequency and frequency changes actual cost and capacity', () => {
  const line = makeLine('fleet', 'bus', ['a', 'c'], { vehicles: 1, frequency: 8 });
  const one = lineMetrics(line, { points }, 480);
  const four = lineMetrics({ ...line, vehicles: 4 }, { points }, 480);
  const slow = lineMetrics({ ...line, vehicles: 4, frequency: 1 }, { points }, 480);
  assert.ok(one.effectiveFrequency < 8);
  assert.ok(four.capacityPerHour > one.capacityPerHour);
  assert.ok(four.costPerHour > one.costPerHour);
  assert.ok(slow.costPerHour < four.costPerHour);
  assert.ok(slow.capacityPerHour < four.capacityPerHour);
  assert.ok(lineMetrics(line, { points }, 480).travelMinutes > lineMetrics(line, { points }, 720).travelMinutes);
});

test('buying fleet and increasing service clears a real queue sooner at a higher operating cost', () => {
  const run = (vehicles, frequency) => {
    const state = makeState([makeLine('busy', 'bus', ['a', 'c'], { vehicles, frequency })]);
    seed(state, 'a', 'c', 150);
    let arrived = 0;
    for (let tick = 0; tick < 12; tick += 1) arrived += step(state).transported;
    return { arrived, expenses: state.expenses, averageWait: state.lines[0].stats.avgWaitMinutes };
  };
  const tooFewVehicles = run(1, 8);
  const infrequent = run(4, 1);
  const improved = run(4, 8);
  assert.ok(improved.arrived > tooFewVehicles.arrived);
  assert.ok(improved.arrived > infrequent.arrived);
  assert.ok(improved.expenses > tooFewVehicles.expenses);
  assert.ok(improved.expenses > infrequent.expenses);
  assert.ok(improved.averageWait < tooFewVehicles.averageWait);
  assert.ok(improved.averageWait < infrequent.averageWait);
});

test('existing rail corridors give deterministic build and operating discounts', () => {
  const rail = makeLine('rail', 'suburban', ['dworzec', 'bronowice', 'balice']);
  assert.ok(lineMetrics(rail, CITIES.krakow).corridorBonus);
  assert.ok(lineCost('suburban', 12, rail.stops, CITIES.krakow) < lineCost('suburban', 12));
  assert.equal(lineCost('suburban', 12, rail.stops, CITIES.krakow), lineCost('suburban', 12, rail.stops, CITIES.krakow));
});

test('progression rejects inactive, duplicate, reversed and subset routes', () => {
  const mature = (id, stops, type = 'bus') => makeLine(id, type, stops, { ageMinutes: PROGRESSION.minAgeMinutes, stats: { ...createLineStats(), carried: 100, revenue: 800, expenses: 500 } });
  const lines = [mature('one', ['a', 'b', 'c']), mature('reverse', ['c', 'b', 'a']), mature('subset', ['a', 'b']), mature('skip-subset', ['a', 'c'])];
  assert.equal(eligibleCounts(lines).bus, 1);
  assert.ok(!unlockedTypes(lines).includes('tram'));
  lines.push(mature('distinct', ['d', 'b']));
  assert.equal(eligibleCounts(lines).bus, 2);
  assert.ok(unlockedTypes(lines).includes('tram'));
  assert.ok(!unlockedTypes(lines, 40).includes('tram'));
  assert.ok(!unlockedTypes(lines.map(line => ({ ...line, ageMinutes: 0 }))).includes('tram'));
  assert.equal(airportUnlocked([mature('r1', ['a', 'b'], 'suburban'), mature('r2', ['b', 'c'], 'suburban')]), true);
});

test('unlock credit requires six hours of useful service, not immediate construction', () => {
  const line = makeLine('service', 'bus', ['a', 'b'], { ageMinutes: PROGRESSION.minAgeMinutes - SIMULATION.minutesPerTick,
    stats: { ...createLineStats(), carried: PROGRESSION.minCarried, revenue: 1000, expenses: 500 } });
  assert.equal(PROGRESSION.minAgeMinutes, 6 * 60);
  assert.equal(lineEligible(line), false);
  line.ageMinutes += SIMULATION.minutesPerTick;
  assert.equal(lineEligible(line), true);
  line.stats.carried = PROGRESSION.minCarried - 1;
  assert.equal(lineEligible(line), false);
  line.stats.carried = PROGRESSION.minCarried;
  assert.equal(lineEligible(line, PROGRESSION.minSatisfaction - 1), false);
  line.ageMinutes = 24 * 60;
  line.stats.revenue = 499;
  assert.equal(lineEligible(line), false, 'old idle routes cannot keep earning progression credit');
});

test('per-line hourly finances roll over without changing lifetime totals', () => {
  const state = makeState([makeLine('paid', 'bus', ['a', 'b'])]);
  state._pendingLineRevenue = { paid: 700 };
  applyEconomyTick(state, 100);
  const revenue = state.lines[0].stats.revenue;
  assert.equal(revenue, 700);
  assert.ok(state.lines[0].stats.revenuePerHour > 0);
  for (let tick = 0; tick < 11; tick += 1) applyEconomyTick(state, 0);
  assert.equal(state.lines[0].stats.revenue, 700);
  assert.equal(state.lines[0].stats.revenuePerHour, 0);
  assert.equal(state.lines[0].stats.history.length, 10);
  assert.ok(state.lines[0].stats.balancePerHour < 0);
});

test('deleting a line in transit preserves cohorts and permits safe rerouting', () => {
  const state = makeState([makeLine('gone', 'bus', ['a', 'b'])]);
  seed(state, 'a', 'b', 10);
  for (let tick = 0; tick < 3; tick += 1) step(state);
  assert.ok(state.cohorts.some(group => group.phase === 'riding'));
  state.lines = [makeLine('replacement', 'tram', ['a', 'b'])];
  let arrived = 0;
  for (let tick = 0; tick < 15; tick += 1) arrived += step(state).transported;
  assert.equal(arrived, 10);
  assert.equal(state.cohorts.length, 0);
});

test('in-progress cohorts survive a JSON save without losing or duplicating people', () => {
  let state = makeState([makeLine('save', 'bus', ['a', 'b'])]);
  seed(state, 'a', 'b', 20);
  for (let tick = 0; tick < 3; tick += 1) step(state);
  state = JSON.parse(JSON.stringify(state));
  let arrived = 0;
  for (let tick = 0; tick < 20; tick += 1) arrived += step(state).transported;
  assert.equal(arrived, 20);
  assert.ok(state.revenue > 20 * SIMULATION.farePerPassenger);
});

test('editing an intermediate stop invalidates an in-flight leg even with unchanged endpoints', () => {
  const state = makeState([makeLine('edited', 'bus', ['a', 'b', 'c'])]);
  seed(state, 'a', 'c', 10);
  for (let tick = 0; tick < 4; tick += 1) step(state);
  assert.ok(state.cohorts.some(group => group.phase === 'riding'));
  state.lines[0].stops = ['a', 'd', 'c'];
  step(state);
  for (const group of state.cohorts) if (group.phase === 'riding') assert.deepEqual(group.route[0].stopSequence, ['a', 'd', 'c']);
  assert.equal(state.cohorts.reduce((sum, group) => sum + group.count, 0), 10);
});
