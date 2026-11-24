import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperationalDecisionSafely, compareOperationalDecision, fleetManagementSnapshot, operationalDecisionFingerprint } from '../public/js/operations.js';
import { createWeeklyTimetable } from '../public/js/timetable.js';
import { createSimulationCalendar } from '../public/js/simulation.js';

function campaign({ status = 'playing', reserve = 2, vehicles = 2, budget = 100_000 } = {}) {
  const line = {
    id: 'bus-1', name: 'Linia 1', type: 'bus', stops: ['a', 'b'], distanceKm: 5,
    routeGeometry: [[50, 19], [50.05, 19.05]], vehicles, frequency: 3,
    timetable: createWeeklyTimetable('balanced', 8),
    stats: { load: 0.93, waiting: 27, revenuePerHour: 140, costPerHour: 110,
      history: [{ at: 60, minutes: 6, cost: 11 }] }
  };
  return {
    status, budget, elapsedMinutes: 420, calendar: createSimulationCalendar(), city: { points: [] },
    cityEvents: [], lines: [line], fleet: { bus: { owned: vehicles + reserve } },
    carried: 70, generated: 100, revenue: 1000, expenses: 750, networkHistory: [{ at: 420 }], rngState: 445
  };
}

test('decision preview compares model rates and does not mutate active campaign or random state', () => {
  const state = campaign();
  const before = structuredClone(state);
  const preview = compareOperationalDecision(state, 'bus-1', { kind: 'assign' });

  assert.equal(preview.ok, true);
  assert.equal(preview.before.vehicles, 2);
  assert.equal(preview.after.vehicles, 3);
  assert.ok(preview.delta.capacityPerHour >= 0);
  assert.deepEqual(state, before);
  assert.equal(state.rngState, 445);
  assert.match(preview.assumptions.join(' '), /nie sÄ… prognozowane|nie są prognozowane/i);
});

test('frequency and day profile options use the current timetable model and keep passenger outcomes unforecast', () => {
  const state = campaign({ vehicles: 4 });
  const frequency = compareOperationalDecision(state, 'bus-1', { kind: 'frequency', value: 5 });
  const profile = compareOperationalDecision(state, 'bus-1', { kind: 'profile', profileId: 'economic' });

  assert.equal(frequency.ok, true);
  assert.equal(frequency.after.requestedFrequency, 5);
  assert.equal(frequency.after.requiredVehicles, 3);
  assert.equal(profile.ok, true);
  assert.ok(profile.after.capacityPerHour <= profile.before.capacityPerHour);
  assert.equal(profile.observed.waiting, 27);
  assert.equal(state.lines[0].timetable.profiles.weekday.profileId, 'balanced');
});

test('decision preview reports insufficient reserve, purchase funds, line limits, and finished campaigns', () => {
  const noReserve = campaign({ reserve: 0 });
  assert.equal(compareOperationalDecision(noReserve, 'bus-1', { kind: 'assign' }).ok, false);
  assert.equal(compareOperationalDecision(campaign({ budget: 1 }), 'bus-1', { kind: 'buy' }).ok, false);
  assert.equal(compareOperationalDecision(campaign({ vehicles: 16 }), 'bus-1', { kind: 'buy' }).ok, false);
  assert.equal(compareOperationalDecision(campaign({ status: 'lost' }), 'bus-1', { kind: 'frequency', value: 4 }).ok, false);
});

test('decision fingerprint changes when line, budget, fleet, campaign, clock, calendar, or network changes', () => {
  const state = campaign();
  const proposal = { kind: 'assign' };
  const original = operationalDecisionFingerprint(state, 'bus-1', proposal);
  assert.equal(operationalDecisionFingerprint(structuredClone(state), 'bus-1', proposal), original);

  const cases = [
    value => { value.lines = []; },
    value => { value.budget -= 1; },
    value => { value.fleet.bus.owned -= 1; },
    value => { value.status = 'lost'; },
    value => { value.elapsedMinutes += 1; },
    value => { value.calendar.specialDays.push({ date: '2026-01-06', dayType: 'special' }); },
    value => { value.networkVersion += 1; },
    value => { value.city.points = [{ id: 'a', lat: 51, lng: 19 }]; },
    value => { value.city.railCorridors = [{ id: 'corridor-1' }]; },
    value => { value.cityEvents.push({ id: 'event-1' }); }
  ];
  for (const mutate of cases) {
    const changed = structuredClone(state);
    mutate(changed);
    assert.notEqual(operationalDecisionFingerprint(changed, 'bus-1', proposal), original);
  }
});

test('safe decision commit revalidates after asynchronous confirmation and invokes no method for stale state', async () => {
  const cases = [
    { label: 'deleted line', proposal: { kind: 'assign' }, mutate: state => { state.lines = []; } },
    { label: 'budget no longer sufficient', proposal: { kind: 'buy' }, mutate: state => { state.budget = 1; } },
    { label: 'reserve changed', proposal: { kind: 'assign' }, mutate: state => { state.fleet.bus.owned = 2; } },
    { label: 'campaign ended', proposal: { kind: 'assign' }, mutate: state => { state.status = 'lost'; } },
    { label: 'clock advanced', proposal: { kind: 'frequency', value: 5 }, mutate: state => { state.elapsedMinutes += 1; } },
    { label: 'service calendar changed', proposal: { kind: 'profile', profileId: 'economic' }, mutate: state => { state.calendar.specialDays.push({ date: '2026-01-06', dayType: 'special' }); } }
  ];

  for (const scenario of cases) {
    const state = campaign();
    const calls = [];
    const game = { state, assignVehicle: (...args) => { calls.push(args); return { ok: true }; } };
    const expected = operationalDecisionFingerprint(state, 'bus-1', scenario.proposal);
    let finishConfirmation;
    const pending = applyOperationalDecisionSafely(game, 'bus-1', scenario.proposal,
      () => new Promise(resolve => { finishConfirmation = resolve; }), expected);
    scenario.mutate(state);
    finishConfirmation(true);
    const result = await pending;
    assert.equal(result.ok, false, scenario.label);
    assert.equal(result.stale, true, scenario.label);
    assert.deepEqual(calls, [], scenario.label);
  }
});

test('safe decision commit preserves cancellation and delegates valid proposals to existing game methods', async () => {
  const methods = [
    [{ kind: 'assign' }, 'assignVehicle', ['bus-1']],
    [{ kind: 'remove' }, 'unassignVehicle', ['bus-1']],
    [{ kind: 'buy' }, 'buyVehicle', ['bus-1']],
    [{ kind: 'frequency', value: 5 }, 'setFrequency', ['bus-1', 5]],
    [{ kind: 'profile', profileId: 'economic' }, 'setTimetableProfile', ['bus-1', 'economic', 'weekday']]
  ];
  for (const [proposal, method, expectedArgs] of methods) {
    const state = campaign();
    const calls = [];
    const game = { state };
    for (const [, methodName] of methods) game[methodName] = (...args) => { calls.push([methodName, ...args]); return { ok: true }; };
    const fingerprint = operationalDecisionFingerprint(state, 'bus-1', proposal);
    const cancelled = await applyOperationalDecisionSafely(game, 'bus-1', proposal, async () => false, fingerprint);
    assert.equal(cancelled.cancelled, true);
    assert.deepEqual(calls, []);

    const result = await applyOperationalDecisionSafely(game, 'bus-1', proposal, async () => true, fingerprint);
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [[method, ...expectedArgs]]);
  }
});

test('fleet management derives owned, reserve, observed line costs, load needs and idle assignments', () => {
  const snapshot = fleetManagementSnapshot(campaign({ vehicles: 4 }));
  const bus = snapshot.types.find(type => type.id === 'bus');

  assert.equal(snapshot.totals.owned, 6);
  assert.equal(snapshot.totals.assigned, 4);
  assert.equal(snapshot.totals.reserve, 2);
  assert.equal(bus.reserveMaintenancePerHour, 7.2);
  assert.equal(bus.lineOperatingCostPerHour, 110);
  assert.equal(snapshot.totals.linesNeedingCapacity, 1);
  assert.equal(snapshot.totals.potentiallyIdleAssignments, 2);

  const partial = campaign();
  partial.lines.push({ ...structuredClone(partial.lines[0]), id: 'bus-2', stats: { load: null, waiting: null, costPerHour: 900, history: [] } });
  assert.equal(fleetManagementSnapshot(partial).types.find(type => type.id === 'bus').lineOperatingCostPerHour, null,
    'a partial sample must not be presented as total observed line cost');
});
