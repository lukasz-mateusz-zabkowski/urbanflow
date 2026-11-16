import { TRANSPORT_TYPES, haversineKm, lineMetrics } from './transport.js?v=9';
import { SIMULATION, demandMultiplier } from './simulation.js?v=8';
import { chooseDestination, pointDemandScore } from './demand.js?v=8';
import { eventDemandMultiplier } from './city-events.js?v=8';
import { ensureDiagnostics, recordDemand, recordDelivery, recordFailure } from './analytics.js?v=8';

const MAX_WAIT_MINUTES = 120;
const MAX_COHORTS = 1600;

export function createPassengerState(points) {
  return Object.fromEntries(points.map(point => [point.id, { waiting: 0, destinations: {} }]));
}

// Lightweight connectivity view kept for campaign checks and extensions.
export function buildNetwork(lines) {
  const graph = new Map();
  const connect = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a).add(b);
  };
  lines.forEach(line => line.stops.slice(1).forEach((stop, index) => {
    connect(line.stops[index], stop);
    connect(stop, line.stops[index]);
  }));
  return graph;
}

export function isConnected(graph, start, target) {
  if (start === target) return true;
  const queue = [start];
  const seen = new Set(queue);
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of graph.get(queue[index]) || []) {
      const stop = typeof next === 'string' ? next : next.to;
      if (stop === target) return true;
      if (!seen.has(stop)) { seen.add(stop); queue.push(stop); }
    }
  }
  return false;
}

export function createLineStats() {
  return { carried: 0, boardings: 0, revenue: 0, expenses: 0, revenuePerHour: 0, costPerHour: 0,
    balancePerHour: 0, load: 0, avgWaitMinutes: 0, waitMinutesTotal: 0, waiting: 0, history: [],
    passengerKm: 0, subsidy: 0, segmentLoad: {} };
}

export function buildTransportGraph(lines, points = [], minuteOfDay = 720, city = null, context = null) {
  const graph = new Map();
  const byId = new Map(points.map(point => [point.id, point]));
  for (const line of lines) {
    const metrics = lineMetrics(line, city || { points }, minuteOfDay, context);
    const routeFrequency = context?.intervalMinutes ? metrics.averageEffectiveFrequency : metrics.effectiveFrequency;
    if (!line.id || !routeFrequency) continue;
    const lengths = line.stops.slice(1).map((stop, index) => {
      const a = byId.get(line.stops[index]);
      const b = byId.get(stop);
      return a && b ? haversineKm(a, b) : metrics.distanceKm / (line.stops.length - 1);
    });
    const lengthSum = lengths.reduce((sum, length) => sum + length, 0) || 1;
    for (let fromIndex = 0; fromIndex < line.stops.length; fromIndex += 1) {
      const from = line.stops[fromIndex];
      if (!graph.has(from)) graph.set(from, []);
      for (let toIndex = 0; toIndex < line.stops.length; toIndex += 1) {
        if (fromIndex === toIndex) continue;
        const low = Math.min(fromIndex, toIndex);
        const high = Math.max(fromIndex, toIndex);
        const distanceKm = lengths.slice(low, high).reduce((sum, length) => sum + length, 0);
        const direction = toIndex > fromIndex ? 1 : -1;
        const segments = Array.from({ length: high - low }, (_, index) => `${line.id}:${direction}:${low + index}`);
        graph.get(from).push({ lineId: line.id, from, to: line.stops[toIndex], fromIndex, toIndex, direction,
          stopSequence: line.stops.slice(low, high + 1),
          segments, distanceKm, travelMinutes: Math.max(0.5, metrics.travelMinutes * distanceKm / lengthSum),
          waitMinutes: 60 / routeFrequency / 2, weight: metrics.travelMinutes * distanceKm / lengthSum + 60 / routeFrequency / 2 + 3 });
      }
    }
  }
  return graph;
}

// Each edge is a ride on a specific line, including all intermediate segments.
// Dijkstra therefore chooses travel + expected wait + transfer cost, not hops.
export function findRoute(graph, start, target) {
  if (start === target) return [];
  const distance = new Map([[start, 0]]);
  const previous = new Map();
  const visited = new Set();
  while (true) {
    let current = null;
    let best = Infinity;
    for (const [stop, value] of distance) if (!visited.has(stop) && value < best) { current = stop; best = value; }
    if (current === null) return null;
    if (current === target) break;
    visited.add(current);
    for (const edge of graph.get(current) || []) {
      const next = best + edge.weight;
      if (next < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, next);
        previous.set(edge.to, edge);
      }
    }
  }
  const route = [];
  let stop = target;
  while (stop !== start) {
    const edge = previous.get(stop);
    if (!edge) return null;
    route.unshift(edge);
    stop = edge.from;
  }
  return route;
}

function newCohort(origin, destination, count) {
  return { origin, destination, currentStop: origin, count, phase: 'waiting', waitMinutes: 0,
    totalWaitMinutes: 0, route: null, legIndex: 0, completedLegs: [] };
}

function hydrateCohorts(state) {
  if (Array.isArray(state.cohorts)) return;
  state.cohorts = [];
  for (const [origin, queue] of Object.entries(state.passengers || {})) {
    for (const [destination, count] of Object.entries(queue.destinations || {})) {
      if (count > 0) state.cohorts.push(newCohort(origin, destination, Math.floor(count)));
    }
  }
}

function creditJourney(state, cohort) {
  const legs = cohort.completedLegs || [];
  const distance = legs.reduce((sum, leg) => sum + leg.distanceKm, 0) || legs.length || 1;
  state._pendingLineRevenue ||= {};
  state._pendingLinePassengerKm ||= {};
  for (const leg of legs) {
    const share = (leg.distanceKm || (distance === legs.length ? 1 : 0)) / distance;
    state._pendingLineRevenue[leg.lineId] = (state._pendingLineRevenue[leg.lineId] || 0)
      + cohort.count * SIMULATION.farePerPassenger * share;
    state._pendingLinePassengerKm[leg.lineId] = (state._pendingLinePassengerKm[leg.lineId] || 0)
      + cohort.count * (leg.distanceKm || 0);
  }
  recordDelivery(state, cohort.destination, cohort.count);
}

export function passengerTick(state, visiblePoints, minuteOfDay = 720, random = Math.random) {
  const delta = SIMULATION.minutesPerTick;
  hydrateCohorts(state);
  state.passengers ||= createPassengerState(visiblePoints);
  ensureDiagnostics(state);
  state.transportMinutes = (state.transportMinutes || 0) + delta;
  const byLine = new Map();
  const metricsByLine = new Map();
  const segmentCapacity = new Map();
  const usedCapacity = new Map();
  const context = { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes || state.transportMinutes,
    intervalMinutes: delta, intervalStartMinuteOfDay: minuteOfDay - delta };
  const graph = buildTransportGraph(state.lines, visiblePoints, minuteOfDay, state.city, context);
  const routeCache = new Map();
  const routeFor = (from, to) => {
    const key = `${from}>${to}`;
    if (!routeCache.has(key)) routeCache.set(key, findRoute(graph, from, to));
    return routeCache.get(key);
  };
  for (const line of state.lines) {
    line.stats = { ...createLineStats(), ...line.stats };
    line.ageMinutes = (line.ageMinutes || 0) + delta;
    line.stats.waiting = 0;
    byLine.set(line.id, line);
    const metrics = lineMetrics(line, state.city || { points: visiblePoints }, minuteOfDay, context);
    metricsByLine.set(line.id, metrics);
    // Capacity is an averaged departure flow for THIS line, direction and
    // segment. Empty trains on another route cannot drain this route's queue.
    const capacity = metrics.averageCapacityPerHour * delta / 60;
    line.serviceRemainder ||= {};
    for (let index = 0; index < line.stops.length - 1; index += 1) {
      for (const direction of [1, -1]) {
        const key = `${line.id}:${direction}:${index}`;
        const amount = capacity + (line.serviceRemainder[key] || 0);
        segmentCapacity.set(key, Math.floor(amount));
        line.serviceRemainder[key] = amount - Math.floor(amount);
        usedCapacity.set(key, 0);
      }
    }
  }
  let generated = 0;
  let transported = 0;
  let abandoned = 0;
  const alive = [];
  for (const cohort of state.cohorts) {
    if (!Number.isFinite(cohort.count) || cohort.count <= 0) continue;
    if (cohort.phase === 'riding') {
      const leg = cohort.route?.[cohort.legIndex];
      const line = byLine.get(leg?.lineId);
      const sequenceChanged = line && leg.stopSequence && leg.stopSequence.join('|') !== line.stops
        .slice(Math.min(leg.fromIndex, leg.toIndex), Math.max(leg.fromIndex, leg.toIndex) + 1).join('|');
      if (!line || line.stops[leg.fromIndex] !== leg.from || line.stops[leg.toIndex] !== leg.to || sequenceChanged) {
        // A removed/edited service returns its group to its last known stop.
        cohort.phase = 'waiting'; cohort.route = null; cohort.legIndex = 0;
      } else {
        cohort.remainingMinutes -= delta;
        if (cohort.remainingMinutes > 0) { alive.push(cohort); continue; }
        cohort.currentStop = leg.to;
        cohort.completedLegs ||= [];
        cohort.completedLegs.push({ lineId: line.id, distanceKm: leg.distanceKm });
        line.stats.carried += cohort.count;
        if (cohort.currentStop === cohort.destination) {
          transported += cohort.count;
          creditJourney(state, cohort);
          continue;
        }
        cohort.phase = 'waiting'; cohort.route = null; cohort.legIndex = 0;
        cohort.waitMinutes = 0;
      }
    }
    cohort.waitMinutes = (cohort.waitMinutes || 0) + delta;
    cohort.totalWaitMinutes = (cohort.totalWaitMinutes || 0) + delta;
    if (cohort.totalWaitMinutes >= MAX_WAIT_MINUTES) {
      const reason = !cohort.route ? 'noConnection' : cohort.waitMinutes >= 60 ? 'longQueue' : 'noCapacity';
      recordFailure(state, reason, cohort.currentStop, cohort.count);
      abandoned += cohort.count; continue;
    }
    alive.push(cohort);
  }

  // Latent demand remains a forecast only. Real cohorts are created solely at
  // points that have an operating service.
  const served = new Set(state.lines.flatMap(line => line.stops));
  const active = visiblePoints.filter(point => served.has(point.id));
  if (active.length >= 2) for (const origin of active) {
    if (random() > (origin.type === 'stop' ? 0.22 : 0.78)) continue;
    const candidates = active.filter(point => point.id !== origin.id);
    const destination = chooseDestination(origin, candidates, minuteOfDay, random);
    if (!destination) continue;
    const localEventDemand = eventDemandMultiplier(state.cityEvents, origin.id, state.elapsedMinutes || state.transportMinutes);
    const demand = demandMultiplier(minuteOfDay) * (state.demandModifier ?? 1) * (state.stressDemandMultiplier ?? 1) * localEventDemand;
    const amount = Math.max(0, Math.round(pointDemandScore(origin, minuteOfDay, 'origin') * (0.42 + random() * 0.5) * demand));
    if (!amount) continue;
    generated += amount;
    recordDemand(state, origin.id, destination.id, amount);
    alive.push(newCohort(origin.id, destination.id, amount));
  }

  const next = [];
  for (const cohort of alive) {
    if (cohort.phase === 'riding') { next.push(cohort); continue; }
    cohort.route = routeFor(cohort.currentStop, cohort.destination);
    cohort.legIndex = 0;
    const leg = cohort.route?.[0];
    if (!leg) { next.push(cohort); continue; }
    const expectedMinutes = cohort.route.reduce((sum, routeLeg) => sum + routeLeg.weight, 0);
    if (expectedMinutes > 100) {
      recordFailure(state, 'excessiveTime', cohort.currentStop, cohort.count);
      abandoned += cohort.count;
      continue;
    }
    const line = byLine.get(leg.lineId);
    let seats = Math.min(cohort.count, ...leg.segments.map(key => segmentCapacity.get(key) || 0));
    // A first wait models the timetable; subsequent waits are caused by queues.
    if ((cohort.waitMinutes || 0) < Math.min(leg.waitMinutes, 30)) seats = 0;
    if (seats > 0) {
      for (const key of leg.segments) {
        segmentCapacity.set(key, segmentCapacity.get(key) - seats);
        usedCapacity.set(key, usedCapacity.get(key) + seats);
      }
      line.stats.boardings += seats;
      line.stats.waitMinutesTotal += seats * (cohort.waitMinutes || 0);
      line.stats.avgWaitMinutes = line.stats.waitMinutesTotal / Math.max(1, line.stats.boardings);
      next.push({ ...cohort, count: seats, phase: 'riding', remainingMinutes: leg.travelMinutes,
        completedLegs: [...(cohort.completedLegs || [])] });
    }
    if (cohort.count > seats) {
      cohort.count -= seats;
      line.stats.waiting += cohort.count;
      next.push(cohort);
    }
  }

  const queueLimit = Math.max(160, Math.min(600, (state.stopCapacity || 80) * 4));
  const waitingByStop = new Map();
  state.cohorts = [];
  for (const cohort of next) {
    if (cohort.phase === 'waiting') {
      const waiting = waitingByStop.get(cohort.currentStop) || 0;
      const keep = Math.max(0, Math.min(cohort.count, queueLimit - waiting));
      if (cohort.count > keep) recordFailure(state, 'longQueue', cohort.currentStop, cohort.count - keep);
      abandoned += cohort.count - keep;
      cohort.count = keep;
      waitingByStop.set(cohort.currentStop, waiting + keep);
    }
    if (cohort.count && state.cohorts.length < MAX_COHORTS) state.cohorts.push(cohort);
    else if (cohort.count) abandoned += cohort.count;
  }
  for (const queue of Object.values(state.passengers)) { queue.waiting = 0; queue.destinations = {}; }
  for (const point of visiblePoints) state.passengers[point.id] ||= { waiting: 0, destinations: {} };
  for (const cohort of state.cohorts) if (cohort.phase === 'waiting') {
    const queue = state.passengers[cohort.currentStop] ||= { waiting: 0, destinations: {} };
    queue.waiting += cohort.count;
    queue.destinations[cohort.destination] = (queue.destinations[cohort.destination] || 0) + cohort.count;
  }
  for (const line of state.lines) {
    const metrics = metricsByLine.get(line.id);
    const capacity = metrics.averageCapacityPerHour * delta / 60;
    const peak = Math.max(0, ...Array.from(usedCapacity, ([key, value]) => key.startsWith(`${line.id}:`) ? value : 0));
    const load = capacity ? Math.min(1, peak / capacity) : 0;
    line.stats.load = Math.min(1, (line.stats.load || 0) * 0.75 + load * 0.25);
    line.stats.segmentLoad ||= {};
    for (let index = 0; index < line.stops.length - 1; index += 1) {
      const segmentPeak = Math.max(usedCapacity.get(`${line.id}:1:${index}`) || 0, usedCapacity.get(`${line.id}:-1:${index}`) || 0);
      const current = capacity ? Math.min(1.5, segmentPeak / capacity) : 0;
      line.stats.segmentLoad[index] = Math.min(1.5, (line.stats.segmentLoad[index] || 0) * 0.7 + current * 0.3);
    }
    line.stats.waiting = state.cohorts.reduce((sum, cohort) => sum + (cohort.phase === 'waiting' && cohort.route?.[0]?.lineId === line.id ? cohort.count : 0), 0);
    line.stats.onboard = state.cohorts.reduce((sum, cohort) => sum + (cohort.phase === 'riding' && cohort.route?.[cohort.legIndex]?.lineId === line.id ? cohort.count : 0), 0);
  }
  const overcrowded = visiblePoints.filter(point => state.passengers[point.id].waiting > (state.stopCapacity || 80)).map(point => point.id);
  state.diagnostics.lastUpdated = state.elapsedMinutes || state.transportMinutes;
  return { generated, transported, abandoned, overcrowded };
}

export const totalWaiting = passengerState => Object.values(passengerState || {}).reduce((sum, queue) => sum + (queue.waiting || 0), 0);
