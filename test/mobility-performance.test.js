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
    { lines: 50, passengers: 5000 },
    { lines: 100, passengers: 5000, cohorts: 1000 }
  ];
  for (const scenario of scenarios) {
    const lines = Array.from({ length: scenario.lines }, (_unused, index) => {
      const start = index % (places.length - 2);
      return { id: `line-${index + 1}`, type: 'bus', stops: places.slice(start, start + 3).map(point => point.id),
        distanceKm: 6, vehicles: 8, frequency: 4, timetable: null, stats: createLineStats() };
    });
    const groups = Math.min(scenario.cohorts || 500, scenario.passengers);
    const createState = () => {
      const cohorts = Array.from({ length: groups }, (_unused, index) => ({ origin: places[index % 6].id,
        destination: places[6 + (index % 6)].id, currentStop: places[index % 6].id, count: Math.ceil(scenario.passengers / groups),
        phase: 'waiting', waitMinutes: 0, totalWaitMinutes: 0, journeyMinutes: 0, route: null, legIndex: 0, completedLegs: [] }));
      return { lines: structuredClone(lines), cohorts, city: { points: places }, elapsedMinutes: 300, transportMinutes: 300, stopCapacity: 1000,
        passengers: createPassengerState(places), mobility: createMobilityState(), diagnostics: undefined };
    };
    const run = (state, analysis) => {
      let maxCohorts = state.cohorts.length;
      for (let tick = 0; tick < 20; tick += 1) {
        const result = passengerTick(state, places, 300 + (tick + 1) * 6, () => 0.99,
          { serviceDayType: 'weekday', intervalServiceDayTypes: Array(6).fill('weekday') });
        state.elapsedMinutes += 6;
        if (analysis) { recordNetworkHistory(state, { transported: result.transported }); networkProblems(state, places); }
        maxCohorts = Math.max(maxCohorts, state.cohorts.length);
      }
      return maxCohorts;
    };
    run(createState(), false); run(createState(), true); // warmup both code paths
    const summaries = {};
    for (const analytics of [false, true]) {
      const samples = [];
      const heapDeltas = [];
      let maxCohorts = 0;
      let peakHeapUsedBytes = 0;
      let peakRssBytes = 0;
      const repeatCount = scenario.lines >= 100 ? 5 : 9;
      for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        const state = createState();
        const heapBefore = process.memoryUsage().heapUsed;
        const started = performance.now(); maxCohorts = Math.max(maxCohorts, run(state, analytics)); samples.push(performance.now() - started);
        const memory = process.memoryUsage();
        heapDeltas.push(memory.heapUsed - heapBefore);
        peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
        peakRssBytes = Math.max(peakRssBytes, memory.rss);
      }
      const summary = { ...scenario, cohorts: groups, analytics,
        medianTwentyTickMs: Math.round(percentile(samples, 0.5) * 10) / 10,
        p95TwentyTickMs: Math.round(percentile(samples, 0.95) * 10) / 10,
        medianTickMs: Math.round(percentile(samples.map(value => value / 20), 0.5) * 100) / 100,
        p95TickMs: Math.round(percentile(samples.map(value => value / 20), 0.95) * 100) / 100,
        medianHeapDeltaBytes: Math.round(percentile(heapDeltas, 0.5)), peakHeapUsedBytes, peakRssBytes, maxObservedCohorts: maxCohorts };
      t.diagnostic(JSON.stringify(summary));
      assert.ok(Number.isFinite(summary.medianTickMs) && Number.isFinite(summary.p95TickMs));
      summaries[String(analytics)] = summary;
    }
    const analyticsCostMs = summaries.true.medianTwentyTickMs - summaries.false.medianTwentyTickMs;
    t.diagnostic(JSON.stringify({ ...scenario, analyticsMedianCostPer20TicksMs: Math.round(analyticsCostMs * 10) / 10,
      analyticsMedianCostPerTickMs: Math.round(analyticsCostMs / 20 * 100) / 100 }));
    const verificationState = createState(); run(verificationState, true);
    assert.ok(verificationState.cohorts.length <= groups, 'identical passenger journeys remain aggregated');
  }
});
