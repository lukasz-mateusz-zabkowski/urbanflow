import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { passengerTick, createLineStats, createPassengerState } from '../public/js/passengers.js';
import { createMobilityState } from '../public/js/mobility.js';
import { CITIES } from '../public/js/cities.js';
import { recordNetworkHistory, networkProblems } from '../public/js/analytics.js';

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

test('repeatable mobility workload stays bounded as line and passenger counts grow', t => {
  const places = CITIES.krakow.points.filter(point => point.type !== 'stop').slice(0, 12);
  const scenarios = [
    { lines: 5, passengers: 100 },
    { lines: 20, passengers: 1000 },
    { lines: 50, passengers: 5000 }
  ];
  for (const scenario of scenarios) {
    const lines = Array.from({ length: scenario.lines }, (_unused, index) => {
      const start = index % (places.length - 2);
      return { id: `line-${index + 1}`, type: 'bus', stops: places.slice(start, start + 3).map(point => point.id),
        distanceKm: 6, vehicles: 8, frequency: 4, timetable: null, stats: createLineStats() };
    });
    const groups = Math.min(500, scenario.passengers);
    const createState = () => {
      const cohorts = Array.from({ length: groups }, (_unused, index) => ({ origin: places[index % 6].id,
        destination: places[6 + (index % 6)].id, currentStop: places[index % 6].id, count: Math.ceil(scenario.passengers / groups),
        phase: 'waiting', waitMinutes: 0, totalWaitMinutes: 0, journeyMinutes: 0, route: null, legIndex: 0, completedLegs: [] }));
      return { lines: structuredClone(lines), cohorts, city: { points: places }, elapsedMinutes: 300, transportMinutes: 300, stopCapacity: 1000,
        passengers: createPassengerState(places), mobility: createMobilityState(), diagnostics: undefined };
    };
    const run = (state, analysis) => {
      for (let tick = 0; tick < 20; tick += 1) {
        const result = passengerTick(state, places, 300 + (tick + 1) * 6, () => 0.99,
          { serviceDayType: 'weekday', intervalServiceDayTypes: Array(6).fill('weekday') });
        state.elapsedMinutes += 6;
        if (analysis) { recordNetworkHistory(state, { transported: result.transported }); networkProblems(state, places); }
      }
    };
    run(createState(), false); run(createState(), true); // warmup both code paths
    for (const analytics of [false, true]) {
      const samples = [];
      for (let repeat = 0; repeat < 9; repeat += 1) {
        const state = createState();
        const started = performance.now(); run(state, analytics); samples.push(performance.now() - started);
      }
      const summary = { ...scenario, cohorts: groups, analytics,
        medianTwentyTickMs: Math.round(percentile(samples, 0.5) * 10) / 10,
        p95TwentyTickMs: Math.round(percentile(samples, 0.95) * 10) / 10 };
      t.diagnostic(JSON.stringify(summary));
      assert.ok(summary.p95TwentyTickMs < 10000, `${scenario.lines} lines/${scenario.passengers} passengers: p95 ${summary.p95TwentyTickMs}ms`);
    }
    const verificationState = createState(); run(verificationState, true);
    assert.ok(verificationState.cohorts.length <= groups, 'identical passenger journeys remain aggregated');
  }
});
