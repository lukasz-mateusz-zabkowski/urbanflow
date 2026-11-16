import { pointDemandScore } from './demand.js?v=10';

export const FAILURE_LABELS = {
  noConnection: 'Brak połączenia',
  excessiveTime: 'Zbyt długi czas podróży',
  noCapacity: 'Brak przepustowości',
  longQueue: 'Zbyt długa kolejka'
};

export const createDiagnostics = () => ({
  relations: {}, generatedByPoint: {}, deliveredByPoint: {},
  failures: { noConnection: 0, excessiveTime: 0, noCapacity: 0, longQueue: 0 },
  failureByPoint: {}, lastUpdated: 0
});

export function ensureDiagnostics(state) {
  state.diagnostics ||= createDiagnostics();
  state.diagnostics.relations ||= {};
  state.diagnostics.generatedByPoint ||= {};
  state.diagnostics.deliveredByPoint ||= {};
  state.diagnostics.failures = { ...createDiagnostics().failures, ...(state.diagnostics.failures || {}) };
  state.diagnostics.failureByPoint ||= {};
  return state.diagnostics;
}

function trimObject(object, limit) {
  const entries = Object.entries(object);
  if (entries.length <= limit) return;
  entries.sort((a, b) => b[1] - a[1]).slice(limit).forEach(([key]) => delete object[key]);
}

export function recordDemand(state, origin, destination, count) {
  const diagnostics = ensureDiagnostics(state);
  const key = `${origin}>${destination}`;
  diagnostics.relations[key] = (diagnostics.relations[key] || 0) + count;
  diagnostics.generatedByPoint[origin] = (diagnostics.generatedByPoint[origin] || 0) + count;
  trimObject(diagnostics.relations, 120);
  trimObject(diagnostics.generatedByPoint, 300);
}

export function recordDelivery(state, destination, count) {
  const diagnostics = ensureDiagnostics(state);
  diagnostics.deliveredByPoint[destination] = (diagnostics.deliveredByPoint[destination] || 0) + count;
  trimObject(diagnostics.deliveredByPoint, 300);
}

export function recordFailure(state, reason, pointId, count) {
  const diagnostics = ensureDiagnostics(state);
  if (!Object.hasOwn(diagnostics.failures, reason)) return;
  diagnostics.failures[reason] += count;
  const point = diagnostics.failureByPoint[pointId] ||= {};
  point[reason] = (point[reason] || 0) + count;
  trimObject(diagnostics.failureByPoint, 120);
}

export function diagnosticSnapshot(state, points, minuteOfDay) {
  const diagnostics = ensureDiagnostics(state);
  const names = new Map(points.map(point => [point.id, point.name]));
  const relations = Object.entries(diagnostics.relations).map(([key, count]) => {
    const [origin, destination] = key.split('>');
    return { origin, destination, label: `${names.get(origin) || origin} → ${names.get(destination) || destination}`, count };
  }).sort((a, b) => b.count - a.count).slice(0, 5);
  const failures = Object.entries(diagnostics.failures).map(([id, count]) => ({ id, label: FAILURE_LABELS[id], count }))
    .sort((a, b) => b.count - a.count);
  const demand = Object.fromEntries(points.map(point => [point.id,
    Math.max(diagnostics.generatedByPoint[point.id] || 0, pointDemandScore(point, minuteOfDay, 'origin') * 10)]));
  const queues = Object.fromEntries(points.map(point => [point.id, state.passengers?.[point.id]?.waiting || 0]));
  return { relations, failures, demand, queues };
}

