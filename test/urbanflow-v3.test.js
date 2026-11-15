import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { chooseDestination, destinationWeight, pointDemandScore, profileMultiplier } from '../public/js/demand.js';
import { CITY_EVENT_DEFINITIONS, activeCityEvents, createCityEvent, eventDemandMultiplier, eventImpactForLine } from '../public/js/city-events.js';
import { diagnosticSnapshot, ensureDiagnostics, recordDemand, recordFailure } from '../public/js/analytics.js';
import { createLineStats, createPassengerState, passengerTick } from '../public/js/passengers.js';
import { lineMetrics } from '../public/js/transport.js';
import { validateState } from '../public/js/storage.js';

const city = CITIES.krakow;
const point = id => city.points.find(item => item.id === id);

test('functional profiles create directional morning demand instead of uniform random demand', () => {
  const ruczaj = point('ruczaj'); const centrum = point('centrum'); const bronowice = point('bronowice');
  assert.ok(profileMultiplier(ruczaj, 8 * 60, 'origin') > profileMultiplier(ruczaj, 2 * 60, 'origin'));
  assert.ok(destinationWeight(ruczaj, centrum, 8 * 60) > destinationWeight(ruczaj, bronowice, 8 * 60));
  assert.equal(chooseDestination(ruczaj, [bronowice, centrum], 8 * 60, () => 0.99).id, 'centrum');
  assert.ok(pointDemandScore(point('balice'), 16 * 60) > 0);
});

test('local events affect only matching corridors and expire at their end time', () => {
  const roadworks = createCityEvent(CITY_EVENT_DEFINITIONS.find(event => event.kind === 'roadworks'), 100, 'works');
  const throughCenter = { type: 'bus', stops: ['ruczaj', 'centrum'], vehicles: 2, frequency: 3 };
  const elsewhere = { type: 'bus', stops: ['biezanow', 'wieliczka'], vehicles: 2, frequency: 3 };
  assert.ok(eventImpactForLine([roadworks], throughCenter, 120).speedMultiplier < 1);
  assert.equal(eventImpactForLine([roadworks], elsewhere, 120).speedMultiplier, 1);
  assert.equal(activeCityEvents([roadworks], roadworks.endMinute).length, 0);
});

test('event demand and disruption feed real capacity and travel metrics', () => {
  const match = createCityEvent(CITY_EVENT_DEFINITIONS.find(event => event.kind === 'match'), 0, 'match');
  assert.ok(eventDemandMultiplier([match], 'nowa-huta', 60) > eventDemandMultiplier([match], 'ruczaj', 60));
  const failure = createCityEvent(CITY_EVENT_DEFINITIONS.find(event => event.kind === 'tram-failure'), 0, 'failure');
  const tram = { id: 'line-1', type: 'tram', stops: ['centrum', 'nowa-huta'], distanceKm: 8, vehicles: 4, frequency: 6 };
  const normal = lineMetrics(tram, city, 720);
  const disrupted = lineMetrics(tram, city, 720, { events: [failure], elapsedMinutes: 60 });
  assert.ok(normal.capacityPerHour > 0);
  assert.equal(disrupted.capacityPerHour, 0);
});

test('diagnostics rank travel relations and explain failure categories', () => {
  const state = { passengers: createPassengerState(city.points), diagnostics: undefined };
  ensureDiagnostics(state);
  recordDemand(state, 'ruczaj', 'centrum', 80);
  recordDemand(state, 'nowa-huta', 'centrum', 30);
  recordFailure(state, 'noConnection', 'ruczaj', 12);
  recordFailure(state, 'longQueue', 'centrum', 7);
  const snapshot = diagnosticSnapshot(state, city.points, 480);
  assert.equal(snapshot.relations[0].label, 'Ruczaj → Centrum');
  assert.equal(snapshot.relations[0].count, 80);
  assert.equal(snapshot.failures.find(item => item.id === 'noConnection').count, 12);
});

test('passenger simulation records no-connection failures and segment overload', () => {
  const points = [
    { id: 'a', name: 'A', lat: 50, lng: 19, demand: 0, profile: 'local' },
    { id: 'b', name: 'B', lat: 50, lng: 19.03, demand: 0, profile: 'local' },
    { id: 'c', name: 'C', lat: 50, lng: 19.06, demand: 0, profile: 'local' }
  ];
  const line = { id: 'line-1', type: 'bus', stops: ['a', 'b'], distanceKm: 2, vehicles: 1, frequency: 1, ageMinutes: 0, stats: createLineStats() };
  const state = { lines: [line], city: { points }, passengers: createPassengerState(points), cohorts: [
    { origin: 'a', destination: 'b', currentStop: 'a', count: 100, phase: 'waiting', waitMinutes: 0, totalWaitMinutes: 0, route: null, legIndex: 0, completedLegs: [] },
    { origin: 'c', destination: 'a', currentStop: 'c', count: 10, phase: 'waiting', waitMinutes: 0, totalWaitMinutes: 0, route: null, legIndex: 0, completedLegs: [] }
  ], stopCapacity: 120, demandModifier: 1, elapsedMinutes: 0, cityEvents: [] };
  for (let tick = 0; tick < 22; tick += 1) { state.elapsedMinutes += 6; passengerTick(state, points, 720, () => 0.99); }
  assert.ok(state.diagnostics.failures.noConnection >= 10);
  assert.ok(Object.values(line.stats.segmentLoad).some(load => load > 0));
});

test('unused fleet has a visible economic cost', () => {
  const route = { id: 'line-1', type: 'bus', stops: ['centrum', 'dworzec'], distanceKm: 2, frequency: 1 };
  const lean = lineMetrics({ ...route, vehicles: 1 }, city, 720);
  const oversized = lineMetrics({ ...route, vehicles: 8 }, city, 720);
  assert.ok(oversized.idleVehicles > lean.idleVehicles);
  assert.ok(oversized.idleCostPerHour > lean.idleCostPerHour);
  assert.ok(oversized.costPerHour > lean.costPerHour);
});

test('schema-2 save without 0.3 fields remains valid and is upgraded in memory', () => {
  const state = JSON.parse(JSON.stringify(new UrbanFlowGame(city).state));
  for (const key of ['subsidies', 'passengerKm', 'stressDemandMultiplier', 'cityEvents', 'nextEventId', 'analyticsMode', 'diagnostics']) delete state[key];
  delete state.campaign.stress;
  assert.equal(validateState(state, city), true);
  const restored = new UrbanFlowGame(city, {}, state);
  assert.equal(restored.state.analyticsMode, 'off');
  assert.deepEqual(restored.state.cityEvents, []);
  assert.equal(restored.state.campaign.stress.status, 'locked');
});

