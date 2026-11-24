import { performance } from 'node:perf_hooks';
import { lineMetrics } from '../public/js/transport.js';
import { createWeeklyUniformTimetable } from '../public/js/timetable.js';
import { compareOperationalDecision, fleetManagementSnapshot } from '../public/js/operations.js';
import { createSimulationCalendar } from '../public/js/simulation.js';

const points = Array.from({ length: 22 }, (_, index) => ({
  id: `p${index}`, lat: 50 + index * 0.004, lng: 19 + index * 0.006
}));
const lines = Array.from({ length: 20 }, (_, index) => ({
  id: `line-${index}`, name: `Linia ${index + 1}`, type: 'bus', stops: [`p${index % 21}`, `p${(index % 21) + 1}`],
  routeGeometry: [[points[index % 21].lat, points[index % 21].lng], [points[(index % 21) + 1].lat, points[(index % 21) + 1].lng]],
  vehicles: 3, frequency: 4, timetable: createWeeklyUniformTimetable(4, 8), stats: { load: 0.62, waiting: 7, history: [{ at: 1 }] }
}));
const state = {
  status: 'playing', budget: 2_000_000, elapsedMinutes: 480, calendar: createSimulationCalendar(), city: { points },
  cityEvents: [], lines, fleet: { bus: { owned: 80 } }, rngState: 19
};
const iterations = Number(process.env.UF_BENCH_ITERATIONS) || 100;
const samples = { baseOneLineMetricsMs: [], simulatorCompareMs: [], fleetSnapshotMs: [] };

function measure(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(3));
}

for (let i = 0; i < 20; i += 1) {
  lineMetrics(lines[0], state.city, 480);
  compareOperationalDecision(state, lines[0].id, { kind: 'frequency', value: 5 });
  fleetManagementSnapshot(state);
}
const heapBefore = process.memoryUsage().heapUsed;
for (let i = 0; i < iterations; i += 1) {
  samples.baseOneLineMetricsMs.push(measure(() => lineMetrics(lines[0], state.city, 480)));
  samples.simulatorCompareMs.push(measure(() => compareOperationalDecision(state, lines[0].id, { kind: 'frequency', value: 5 })));
  samples.fleetSnapshotMs.push(measure(() => fleetManagementSnapshot(state)));
}
const heapAfter = process.memoryUsage().heapUsed;
console.log(JSON.stringify({
  environment: { node: process.version, lines: lines.length, areas: points.length, iterations, warmup: 20 },
  baseline1_5Proxy: { operation: 'single current lineMetrics calculation', medianMs: percentile(samples.baseOneLineMetricsMs, 0.5), p95Ms: percentile(samples.baseOneLineMetricsMs, 0.95) },
  candidateDecisionCompare: { operation: 'same-line current/proposed lineMetrics plus staged timetable clone', medianMs: percentile(samples.simulatorCompareMs, 0.5), p95Ms: percentile(samples.simulatorCompareMs, 0.95) },
  candidateFleetSnapshot: { operation: 'aggregate 20 lines across configured fleet types', medianMs: percentile(samples.fleetSnapshotMs, 0.5), p95Ms: percentile(samples.fleetSnapshotMs, 0.95) },
  heapDeltaBytes: heapAfter - heapBefore,
  note: 'The baseline proxy measures one existing-model line calculation; it is not a historical 1.5.0 benchmark run. Measurements are local Node results and do not guarantee browser or Surface Book performance.'
}, null, 2));
