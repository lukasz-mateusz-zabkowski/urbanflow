import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { CITIES } from '../public/js/cities.js';
import { createCityEvolutionState, evolveCityWeek } from '../public/js/city-evolution.js';

test('weekly city evolution benchmark reports repeatable cost and bounded profile storage', () => {
  const city = CITIES.krakow;
  const areas = city.points.filter(point => point.type !== 'stop').map(point => point.id);
  const lines = Array.from({ length: 20 }, (_value, index) => ({
    id: `line-${index + 1}`, type: 'bus', frequency: 4, vehicles: 2,
    stops: [areas[index % areas.length], areas[(index + 3) % areas.length], areas[(index + 7) % areas.length]],
    stats: { load: 0.45, avgWaitMinutes: 10, segmentLoad: {} }
  }));
  const state = { elapsedMinutes: 0, satisfaction: 80, lines, passengers: {} };
  state.cityEvolution = createCityEvolutionState(city);
  const durations = [];
  const beforeHeap = process.memoryUsage().heapUsed;
  for (let index = 0; index < 80; index += 1) {
    state.elapsedMinutes += 7 * 1440;
    const start = performance.now();
    evolveCityWeek(state, city);
    const elapsed = performance.now() - start;
    if (index >= 20) durations.push(elapsed);
  }
  durations.sort((a, b) => a - b);
  const medianMs = durations[Math.floor(durations.length * 0.5)];
  const p95Ms = durations[Math.floor((durations.length - 1) * 0.95)];
  const result = { areas: areas.length, lines: lines.length, weeklySamples: durations.length, medianMs: Number(medianMs.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)), heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
    profileBytes: Buffer.byteLength(JSON.stringify(state.cityEvolution)), retainedReports: state.cityEvolution.weeklyReports.length };
  console.log(`ℹ city-evolution-benchmark ${JSON.stringify(result)}`);
  assert.ok(Number.isFinite(medianMs) && medianMs >= 0);
  assert.ok(Number.isFinite(p95Ms) && p95Ms >= medianMs);
  assert.equal(state.cityEvolution.weeklyReports.length, 12);
  assert.ok(result.profileBytes < 500000);
});
