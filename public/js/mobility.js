import { inferProfile, pointDemandScore } from './demand.js?v=10';
import { haversineKm } from './transport.js?v=10';

export const MOBILITY_STATE_VERSION = 1;
export const MOBILITY_QUALITY_PARAMETERS = Object.freeze({
  waitPenaltyPerMinute: 0.55,
  ridePenaltyPerMinute: 0.18,
  transferPenalty: 10,
  crowdingPenaltyPerMinute: 0.5
});

const DAY_GROUPS = Object.freeze({ weekday: ['weekday'], saturday: ['saturday'], weekend: ['saturday', 'sunday'],
  leisure: ['saturday', 'sunday', 'special'], all: ['weekday', 'saturday', 'sunday', 'special'] });
const sortPlaces = values => [...values].sort((a, b) => String(a.id).localeCompare(String(b.id)));

function nearest(from, candidates) {
  return sortPlaces(candidates.filter(item => item.id !== from.id))
    .sort((a, b) => haversineKm(from, a) - haversineKm(from, b) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

export function buildRegularTravelPatterns(points = []) {
  const places = sortPlaces(points.filter(point => point && point.type !== 'stop'));
  const homes = places.filter(point => inferProfile(point) === 'residential');
  const work = places.filter(point => ['office', 'industrial'].includes(inferProfile(point)));
  const schools = places.filter(point => inferProfile(point) === 'education');
  const shopping = places.filter(point => ['center', 'station', 'interchange'].includes(inferProfile(point)));
  const leisure = places.filter(point => ['tourist', 'center'].includes(inferProfile(point)));
  const patterns = [];
  const add = (purpose, origin, destination, direction, dayGroup, departureMinute, share) => {
    if (!origin || !destination || origin.id === destination.id) return;
    const dayTypes = [...DAY_GROUPS[dayGroup]];
    const passengers = Math.round(Math.min(Math.max(0, Number(origin.demand) || 0), Math.max(0, Number(destination.demand) || 0)) * share);
    if (!passengers) return;
    const id = `${purpose}:${direction}:${origin.id}:${destination.id}:${dayTypes.join(',')}:${departureMinute}`;
    patterns.push({ id, origin: origin.id, destination: destination.id, purpose, direction, dayTypes, departureMinute, passengers });
  };
  for (const home of homes) {
    const workplace = nearest(home, work);
    add('work', home, workplace, 'outbound', 'weekday', 7 * 60 + 30, 0.32);
    add('work', workplace, home, 'return', 'weekday', 16 * 60 + 30, 0.32);
    const school = nearest(home, schools);
    add('school', home, school, 'outbound', 'weekday', 8 * 60, 0.28);
    add('school', school, home, 'return', 'weekday', 14 * 60 + 30, 0.28);
    const shop = nearest(home, shopping);
    add('shopping', home, shop, 'outbound', 'weekend', 11 * 60, 0.22);
    add('shopping', shop, home, 'return', 'weekend', 13 * 60 + 30, 0.22);
    const destination = nearest(home, leisure);
    add('recreation', home, destination, 'outbound', 'leisure', 11 * 60 + 30, 0.25);
    add('recreation', destination, home, 'return', 'leisure', 16 * 60, 0.25);
    const occasional = nearest(home, places.filter(point => point.id !== shop?.id && point.id !== destination?.id));
    add('occasional', home, occasional, 'outbound', 'all', 15 * 60, 0.08);
  }
  return patterns.sort((a, b) => a.departureMinute - b.departureMinute || a.id.localeCompare(b.id));
}

// The interval uses the same minute labels as calendarTickContext: [end-duration, end).
export function departuresForTick(patterns, minuteOfDayEnd, durationMinutes, intervalDayTypes = []) {
  const duration = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  const departures = [];
  for (let offset = 0; offset < duration; offset += 1) {
    const minute = ((Math.floor(minuteOfDayEnd) - duration + offset) % 1440 + 1440) % 1440;
    const dayType = intervalDayTypes[offset] || 'weekday';
    for (const pattern of patterns) if (pattern.departureMinute === minute && pattern.dayTypes.includes(dayType)) {
      departures.push({ pattern, minute, dayType });
    }
  }
  return departures;
}

export function createMobilityState(patterns = []) {
  return {
    version: MOBILITY_STATE_VERSION,
    patterns: structuredClone(patterns),
    completed: { passengers: 0, waitMinutesTotal: 0, journeyMinutesTotal: 0, transferPassengers: 0,
      transfersTotal: 0, crowdingMinutesTotal: 0, satisfactionTotal: 0 },
    accessibility: { opportunities: 0, reachable: 0, denied: 0, byReason: {} }
  };
}

export function ensureMobilityState(state, points = []) {
  if (!state.mobility || state.mobility.version !== MOBILITY_STATE_VERSION) state.mobility = createMobilityState();
  const existing = new Set(state.mobility.patterns.map(pattern => pattern.id));
  for (const pattern of buildRegularTravelPatterns(points)) if (!existing.has(pattern.id)) {
    state.mobility.patterns.push(pattern);
    existing.add(pattern.id);
  }
  state.mobility.patterns.sort((a, b) => a.departureMinute - b.departureMinute || a.id.localeCompare(b.id));
  return state.mobility;
}

export function recordAccessibilityOpportunity(mobility, reason, passengers = 1) {
  const count = Math.max(0, Math.floor(Number(passengers) || 0));
  if (!count) return;
  const access = mobility.accessibility;
  access.opportunities += count;
  if (reason === 'available') access.reachable += count;
  else {
    access.denied += count;
    access.byReason[reason] = (access.byReason[reason] || 0) + count;
  }
}

export function journeySatisfaction({ totalWaitMinutes = 0, journeyMinutes = 0, transfers = 0, crowdingMinutes = 0 } = {}) {
  const p = MOBILITY_QUALITY_PARAMETERS;
  const score = 100 - Math.max(0, totalWaitMinutes) * p.waitPenaltyPerMinute
    - Math.max(0, journeyMinutes) * p.ridePenaltyPerMinute
    - Math.max(0, transfers) * p.transferPenalty
    - Math.max(0, crowdingMinutes) * p.crowdingPenaltyPerMinute;
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

export function recordCompletedJourney(mobility, cohort) {
  const count = Math.max(0, Math.floor(Number(cohort.count) || 0));
  if (!count) return;
  const transfers = Math.max(0, Math.floor(Number(cohort.transferCount ?? cohort.transfers) || 0));
  const wait = Math.max(0, Number(cohort.totalWaitMinutes) || 0);
  const journey = Math.max(0, Number(cohort.journeyMinutes) || 0);
  const ride = Math.max(0, Number(cohort.rideMinutes ?? journey) || 0);
  const crowding = Math.max(0, Number(cohort.crowdingMinutes) || 0);
  const completed = mobility.completed;
  completed.passengers += count;
  completed.waitMinutesTotal += wait * count;
  completed.journeyMinutesTotal += journey * count;
  completed.crowdingMinutesTotal += crowding * count;
  completed.transfersTotal += transfers * count;
  if (transfers) completed.transferPassengers += count;
  completed.satisfactionTotal += journeySatisfaction({ totalWaitMinutes: wait, journeyMinutes: ride, transfers, crowdingMinutes: crowding }) * count;
}

export function mobilitySnapshot(state, points = []) {
  const byId = new Map(points.map(point => [point.id, point.name]));
  const completed = state.mobility?.completed || createMobilityState().completed;
  const access = state.mobility?.accessibility || createMobilityState().accessibility;
  const active = state.cohorts || [];
  const relationPassengers = new Map();
  for (const cohort of active) {
    const key = `${cohort.origin}>${cohort.destination}`;
    relationPassengers.set(key, (relationPassengers.get(key) || 0) + cohort.count);
  }
  const names = state.diagnostics?.relations || {};
  const keys = new Set([...Object.keys(names), ...relationPassengers.keys()]);
  const busiestRelations = [...keys].map(key => {
    const [origin, destination] = key.split('>');
    return { origin, destination, label: `${byId.get(origin) || origin} → ${byId.get(destination) || destination}`,
      passengers: relationPassengers.get(key) || 0, generated: names[key] || 0 };
  }).sort((a, b) => b.passengers - a.passengers || b.generated - a.generated).slice(0, 5);
  const failures = Object.entries(state.diagnostics?.failures || {}).map(([reason, passengers]) => ({ reason, passengers }))
    .sort((a, b) => b.passengers - a.passengers).slice(0, 5);
  const total = completed.passengers || 0;
  return {
    activeTrips: active.reduce((sum, cohort) => sum + (cohort.count || 0), 0),
    completedTrips: total,
    averageWaitMinutes: total ? completed.waitMinutesTotal / total : 0,
    averageJourneyMinutes: total ? completed.journeyMinutesTotal / total : 0,
    transferShare: total ? completed.transferPassengers / total : 0,
    transfersPerPassenger: total ? completed.transfersTotal / total : 0,
    completedSatisfaction: total ? completed.satisfactionTotal / total : null,
    accessibility: { ...access, score: access.opportunities ? access.reachable / access.opportunities : null },
    busiestRelations, failures
  };
}
