import { TRANSPORT_TYPES, haversineKm, lineMetrics } from './transport.js?v=10';
import { SIMULATION, demandMultiplier } from './simulation.js?v=10';
import { destinationWeight, pointDemandScore } from './demand.js?v=10';
import { eventDemandMultiplier } from './city-events.js?v=10';
import { ensureDiagnostics, recordDemand, recordDelivery, recordFailure } from './analytics.js?v=11';
import { buildRegularTravelPatterns, createMobilityState, departuresForTick, ensureMobilityState, recordAccessibilityOpportunity, recordCompletedJourney } from './mobility.js?v=11';

const MAX_WAIT_MINUTES = 120;
// Matches the existing save validator bound. Cohorts represent many people and
// are merged when their journey state matches; this is not a resident cap.
const MAX_COHORTS = 5000;
export const MAX_TRANSFERS = 2;
export const MAX_ACCEPTED_JOURNEY_MINUTES = 100;

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

export function intervalDemandScore(point, minuteOfDayEnd, durationMinutes, dayTypes = []) {
  const duration = Math.max(1, Math.floor(Number(durationMinutes) || 1));
  let total = 0;
  for (let offset = 0; offset < duration; offset += 1) {
    const minute = ((Math.floor(minuteOfDayEnd) - duration + offset) % 1440 + 1440) % 1440;
    total += pointDemandScore(point, minute, 'origin', dayTypes[offset] || 'weekday') * demandMultiplier(minute);
  }
  return total / duration;
}

export function buildTransportGraph(lines, points = [], minuteOfDay = 720, city = null, context = null, { includeInactive = false } = {}) {
  const graph = new Map();
  const byId = new Map(points.map(point => [point.id, point]));
  for (const line of lines) {
    const metrics = lineMetrics(line, city || { points }, minuteOfDay, context);
    const routeFrequency = context?.intervalMinutes ? metrics.averageEffectiveFrequency : metrics.effectiveFrequency;
    if (!line.id || (!routeFrequency && !includeInactive)) continue;
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
        const segmentLoad = Math.max(0, ...Array.from({ length: high - low }, (_, index) => Number(line.stats?.segmentLoad?.[low + index]) || 0));
        const crowding = Math.max(segmentLoad, Number(line.stats?.load) || 0);
        const capacityPerHour = metrics.averageCapacityPerHour;
        graph.get(from).push({ lineId: line.id, from, to: line.stops[toIndex], fromIndex, toIndex, direction,
          stopSequence: line.stops.slice(low, high + 1),
          segments, distanceKm, travelMinutes: Math.max(0.5, metrics.travelMinutes * distanceKm / lengthSum),
          serviceActive: routeFrequency > 0, frequency: routeFrequency, capacityPerHour,
          crowding, availableSeatsPerTick: capacityPerHour * SIMULATION.minutesPerTick / 60,
          waitMinutes: routeFrequency ? 60 / routeFrequency / 2 : Infinity,
          weight: routeFrequency ? metrics.travelMinutes * distanceKm / lengthSum + 60 / routeFrequency / 2 + 3 + crowding * 10 : Infinity });
      }
    }
  }
  return graph;
}

// Each edge is a ride on a specific line, including all intermediate segments.
// Dijkstra therefore chooses travel + expected wait + transfer cost, not hops.
class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const a = this.items; a.push(item); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p].cost <= item.cost) break; a[i] = a[p]; i = p; }
    a[i] = item;
  }
  pop() {
    const a = this.items; if (!a.length) return null; const first = a[0]; const last = a.pop();
    if (a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= a.length) break;
      if (c + 1 < a.length && a[c + 1].cost < a[c].cost) c += 1;
      if (a[c].cost >= last.cost) break; a[i] = a[c]; i = c; } a[i] = last; }
    return first;
  }
  get size() { return this.items.length; }
}

// Bounded, deterministic Dijkstra over (stop, line, transfer-count) states.
export function findRoute(graph, start, target, { maxTransfers = MAX_TRANSFERS } = {}) {
  if (start === target) return [];
  const keyOf = (stop, lineId, transfers) => `${stop}\u0000${lineId || ''}\u0000${transfers}`;
  const heap = new MinHeap(); const startKey = keyOf(start, null, 0);
  const distances = new Map([[startKey, 0]]); const previous = new Map();
  heap.push({ stop: start, lineId: null, transfers: 0, cost: 0, key: startKey });
  let targetKey = null;
  while (heap.size) {
    const current = heap.pop(); if (current.cost !== distances.get(current.key)) continue;
    if (current.stop === target) { targetKey = current.key; break; }
    const edges = [...(graph.get(current.stop) || [])].sort((a, b) => a.lineId.localeCompare(b.lineId) || a.to.localeCompare(b.to));
    for (const edge of edges) {
      if (!edge.serviceActive || !Number.isFinite(edge.weight)) continue;
      const transfer = current.lineId && current.lineId !== edge.lineId ? 1 : 0;
      const transfers = current.transfers + transfer; if (transfers > maxTransfers) continue;
      const nextCost = current.cost + edge.weight + (transfer ? 4 : 0);
      const nextKey = keyOf(edge.to, edge.lineId, transfers);
      if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue;
      distances.set(nextKey, nextCost); previous.set(nextKey, { from: current.key, edge });
      heap.push({ stop: edge.to, lineId: edge.lineId, transfers, cost: nextCost, key: nextKey });
    }
  }
  if (!targetKey) return null;
  const route = [];
  let cursor = targetKey;
  while (cursor !== startKey) { const prev = previous.get(cursor); if (!prev) return null; route.unshift(prev.edge); cursor = prev.from; }
  return route;
}

function describeRoute(route) {
  const legs = route || [];
  const travelMinutes = legs.reduce((sum, leg) => sum + leg.travelMinutes, 0);
  const expectedWaitMinutes = legs.reduce((sum, leg, index) => sum + (index === 0 || legs[index - 1].lineId !== leg.lineId ? leg.waitMinutes : 0), 0);
  const transfers = Math.max(0, legs.reduce((sum, leg, index) => sum + (index > 0 && legs[index - 1].lineId !== leg.lineId ? 1 : 0), 0));
  return { travelMinutes, expectedWaitMinutes, transfers, totalMinutes: travelMinutes + expectedWaitMinutes + transfers * 7,
    capacityPerHour: legs.length ? Math.min(...legs.map(leg => leg.capacityPerHour || 0)) : 0,
    source: 'lokalny graf linii', algorithm: 'Dijkstra ograniczony do 2 przesiadek' };
}

export function planTransitJourney(lines, points, origin, destination, minuteOfDay, context = null) {
  if (origin === destination) return { ok: true, route: [], diagnostics: describeRoute([]), reason: 'available' };
  const graph = buildTransportGraph(lines, points, minuteOfDay, { points }, context);
  const route = findRoute(graph, origin, destination);
  if (!route) {
    const connected = isConnected(buildNetwork(lines), origin, destination);
    return { ok: false, route: null, reason: connected ? 'noService' : 'noConnection', diagnostics: { source: 'lokalny graf linii', algorithm: 'Dijkstra ograniczony do 2 przesiadek' } };
  }
  const diagnostics = describeRoute(route);
  const crowded = route.some(leg => leg.availableSeatsPerTick < 1);
  if (diagnostics.totalMinutes > MAX_ACCEPTED_JOURNEY_MINUTES) return { ok: false, route, reason: 'excessiveTime', diagnostics };
  return { ok: !crowded, route, reason: crowded ? 'lowCapacity' : 'available', diagnostics };
}

export function diagnoseTransitRelation(lines, points, origin, destination, minuteOfDay, context = null) {
  if (!points.some(point => point.id === origin) || !points.some(point => point.id === destination)) return { ok: false, reason: 'unknownPlace' };
  const plan = planTransitJourney(lines, points, origin, destination, minuteOfDay, context);
  if (!plan.ok && plan.reason === 'noConnection') {
    const topology = buildNetwork(lines);
    if (isConnected(topology, origin, destination)) plan.reason = 'noService';
  }
  return { ok: plan.ok, reason: plan.reason, plan };
}

function newCohort(origin, destination, count, details = {}) {
  return { origin, destination, currentStop: origin, count, phase: 'waiting', waitMinutes: 0,
    totalWaitMinutes: 0, journeyMinutes: 0, rideMinutes: 0, crowdingMinutes: 0, transferCount: 0, ...details,
    route: details.route || null, legIndex: 0, completedLegs: details.completedLegs || [] };
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

export function passengerTick(state, visiblePoints, minuteOfDay = 720, random = Math.random, calendarContext = null) {
  const delta = SIMULATION.minutesPerTick;
  hydrateCohorts(state);
  state.passengers ||= createPassengerState(visiblePoints);
  ensureDiagnostics(state);
  state.mobility ||= createMobilityState();
  const mobility = ensureMobilityState(state, visiblePoints);
  state.transportMinutes = (state.transportMinutes || 0) + delta;
  const byLine = new Map();
  const metricsByLine = new Map();
  const segmentCapacity = new Map();
  const usedCapacity = new Map();
  const serviceDayType = calendarContext?.serviceDayType || 'weekday';
  const context = { events: state.cityEvents || [], elapsedMinutes: state.elapsedMinutes || state.transportMinutes,
    intervalMinutes: delta, intervalStartMinuteOfDay: minuteOfDay - delta, serviceDayType,
    intervalServiceDayTypes: calendarContext?.intervalServiceDayTypes || Array(delta).fill(serviceDayType) };
  const graph = buildTransportGraph(state.lines, visiblePoints, minuteOfDay, state.city, context);
  const routeCache = new Map();
  const routeFor = (from, to) => {
    const key = `${from}>${to}`;
    if (!routeCache.has(key)) routeCache.set(key, findRoute(graph, from, to));
    return routeCache.get(key);
  };
  const dayTypes = context.intervalServiceDayTypes;
  const demandAt = (origin, destination, role) => {
    if (role === 'origin') return intervalDemandScore(origin, minuteOfDay, delta, dayTypes);
    let total = 0;
    for (let offset = 0; offset < delta; offset += 1) {
      const minute = ((context.intervalStartMinuteOfDay + offset) % 1440 + 1440) % 1440;
      const dayType = dayTypes[offset] || serviceDayType;
      total += pointDemandScore(origin, minute, role, dayType) * demandMultiplier(minute)
        * (role === 'destination' && destination ? destinationWeight(origin, destination, minute, dayType) : 1);
    }
    return total / Math.max(1, delta);
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
    cohort.journeyMinutes = (cohort.journeyMinutes || 0) + delta;
    if (cohort.phase === 'riding') {
      cohort.rideMinutes = (cohort.rideMinutes || 0) + delta;
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
          recordCompletedJourney(mobility, cohort);
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
      const reason = !cohort.route ? 'noConnection' : cohort.waitMinutes >= 60 ? 'longWait' : 'noCapacity';
      recordFailure(state, reason, cohort.currentStop, cohort.count);
      abandoned += cohort.count; continue;
    }
    alive.push(cohort);
  }

  // Latent demand remains a forecast only. Real cohorts are created solely at
  // points that have an operating service.
  const departures = departuresForTick(mobility.patterns, minuteOfDay, delta, dayTypes);
  for (const departure of departures) {
    const { pattern } = departure;
    const origin = visiblePoints.find(point => point.id === pattern.origin);
    const destination = visiblePoints.find(point => point.id === pattern.destination);
    if (!origin || !destination) continue;
    const count = pattern.passengers;
    const plan = planTransitJourney(state.lines, visiblePoints, pattern.origin, pattern.destination, departure.minute, context);
    recordDemand(state, pattern.origin, pattern.destination, count);
    recordAccessibilityOpportunity(mobility, plan.ok ? 'available' : plan.reason, count);
    if (!plan.ok) {
      recordFailure(state, plan.reason === 'noService' ? 'noService' : plan.reason === 'excessiveTime' ? 'excessiveTime' : plan.reason === 'lowCapacity' ? 'lowCapacity' : 'noConnection', pattern.origin, count);
      continue;
    }
    generated += count;
    const cohort = newCohort(pattern.origin, pattern.destination, count, { purpose: pattern.purpose, patternId: pattern.id, route: plan.route });
    alive.push(cohort);
  }
  const served = new Set(state.lines.flatMap(line => line.stops));
  const active = visiblePoints.filter(point => served.has(point.id));
  if (active.length >= 2) for (const origin of active) {
    if (random() > (origin.type === 'stop' ? 0.22 : 0.78)) continue;
    const candidates = active.filter(point => point.id !== origin.id);
    const weights = candidates.map(destination => {
      let weight = 0;
      for (let offset = 0; offset < delta; offset += 1) {
        const minute = ((context.intervalStartMinuteOfDay + offset) % 1440 + 1440) % 1440;
        weight += destinationWeight(origin, destination, minute, dayTypes[offset] || serviceDayType);
      }
      return weight / Math.max(1, delta);
    });
    let selection = random() * weights.reduce((sum, weight) => sum + weight, 0);
    const destination = candidates.find((_point, index) => (selection -= weights[index]) < 0) || candidates.at(-1) || null;
    if (!destination) continue;
    const localEventDemand = eventDemandMultiplier(state.cityEvents, origin.id, state.elapsedMinutes || state.transportMinutes);
    const amount = Math.max(0, Math.round(demandAt(origin, null, 'origin') * (0.42 + random() * 0.5)
      * (state.demandModifier ?? 1) * (state.stressDemandMultiplier ?? 1) * localEventDemand));
    if (!amount) continue;
    generated += amount;
    recordDemand(state, origin.id, destination.id, amount);
    const plan = planTransitJourney(state.lines, visiblePoints, origin.id, destination.id, minuteOfDay, context);
    recordAccessibilityOpportunity(mobility, plan.ok ? 'available' : plan.reason, amount);
    if (!plan.ok) {
      recordFailure(state, plan.reason === 'noService' ? 'noService' : plan.reason === 'excessiveTime' ? 'excessiveTime' : plan.reason === 'lowCapacity' ? 'lowCapacity' : 'noConnection', origin.id, amount);
      abandoned += amount;
      continue;
    }
    alive.push(newCohort(origin.id, destination.id, amount, { purpose: 'occasional', route: plan.route }));
  }

  const next = [];
  for (const cohort of alive) {
    if (cohort.phase === 'riding') { next.push(cohort); continue; }
    cohort.route ||= routeFor(cohort.currentStop, cohort.destination);
    cohort.legIndex = 0;
    let leg = cohort.route?.[0];
    if (leg && !byLine.has(leg.lineId)) { cohort.route = routeFor(cohort.currentStop, cohort.destination); leg = cohort.route?.[0]; }
    if (!leg) { next.push(cohort); continue; }
    const expectedMinutes = cohort.route.reduce((sum, routeLeg) => sum + routeLeg.weight, 0);
    if (expectedMinutes > MAX_ACCEPTED_JOURNEY_MINUTES) {
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
      const previousLine = cohort.completedLegs?.at(-1)?.lineId;
      const transferCount = (cohort.transferCount || 0) + (previousLine && previousLine !== leg.lineId ? 1 : 0);
      next.push({ ...cohort, count: seats, transferCount, phase: 'riding', remainingMinutes: leg.travelMinutes,
        completedLegs: [...(cohort.completedLegs || [])] });
    }
    if (!seats && (cohort.waitMinutes || 0) >= Math.min(leg.waitMinutes, 30)) cohort.crowdingMinutes = (cohort.crowdingMinutes || 0) + delta;
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
  // Coalesce identical cohorts so recurring patterns retain a compact city model.
  const merged = new Map();
  for (const cohort of state.cohorts) {
    const key = [cohort.origin, cohort.destination, cohort.currentStop, cohort.phase, cohort.purpose || '', cohort.patternId || '',
      cohort.route?.map(leg => leg.lineId).join(','), cohort.legIndex, Math.round(cohort.waitMinutes || 0), Math.round(cohort.totalWaitMinutes || 0),
      Math.round(cohort.journeyMinutes || 0), Math.round(cohort.crowdingMinutes || 0), cohort.transferCount || 0].join('|');
    const existing = merged.get(key);
    if (!existing) merged.set(key, cohort);
    else existing.count += cohort.count;
  }
  state.cohorts = [...merged.values()];
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
