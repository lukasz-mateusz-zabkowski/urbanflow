import { TRANSPORT_TYPES } from './transport.js?v=10';
import { createUniformTimetable, createWeeklyTimetable, migrateDailyTimetable, validateWeeklyTimetable } from './timetable.js?v=10';
import { createSimulationCalendar, validateSimulationCalendar } from './simulation.js?v=10';

export const SAVE_KEY = 'urbanflow.krakow.v2';
export const SAVE_VERSION = 4;
const goals = new Set(['wieliczka', 'gateway', 'center', 'passengers', 'quality', 'buses', 'tram', 'huta', 'airport', 'profit', 'stress']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const transportType = value => typeof value === 'string' && Object.hasOwn(TRANSPORT_TYPES, value);

// Saves are untrusted input. Bound traversal as well as the simulation's arrays,
// and reject special keys before adopting any nested object.
function safeData(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object') return true;
  if (depth > 20 || seen.has(value)) return false;
  seen.add(value);
  const valid = Object.entries(value).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && safeData(item, seen, depth + 1));
  seen.delete(value);
  return valid;
}

export function validateState(s, city) {
  if (!safeData(s)) return false;
  if (!plain(s) || !finite(s.budget) || !['playing', 'won', 'lost'].includes(s.status)) return false;
  if (!validateSimulationCalendar(s.calendar)) return false;
  if (!['revenue', 'expenses', 'carried', 'generated', 'abandoned', 'elapsedMinutes', 'lowQualityMinutes', 'networkVersion'].every(k => nonnegative(s[k]))) return false;
  if (['subsidies', 'passengerKm', 'fleetPurchases'].some(key => s[key] !== undefined && !nonnegative(s[key]))) return false;
  if (s.fleetReserveCostPerHour !== undefined && !nonnegative(s.fleetReserveCostPerHour)) return false;
  if (!finite(s.satisfaction) || s.satisfaction < 0 || s.satisfaction > 100 || ![1, 2, 4].includes(s.speed) || typeof s.paused !== 'boolean') return false;
  if (!Number.isInteger(s.nextLineId) || s.nextLineId < 1 || ![0, 1, 2].includes(s.unlockedPointLevel) || typeof s.airportUnlocked !== 'boolean') return false;
  if (!nonnegative(s.stopCapacity) || s.stopCapacity === 0 || !nonnegative(s.nextEventAt) || !nonnegative(s.activeEventUntil) || !nonnegative(s.demandModifier)) return false;
  const pointIds = new Set(city.points.map(p => p.id));
  const lineId = id => typeof id === 'string' && /^line-[1-9]\d*$/.test(id) && Number(id.slice(5)) < s.nextLineId;
  const validStops = stops => Array.isArray(stops) && stops.length <= city.points.length && stops.every(id => pointIds.has(id)) && new Set(stops).size === stops.length;
  if (!Array.isArray(s.lines) || s.lines.length > 100 || new Set(s.lines.map(l => l?.id)).size !== s.lines.length) return false;
  for (const l of s.lines) {
    if (!plain(l) || !lineId(l.id) || !transportType(l.type) || !validStops(l.stops) || l.stops.length < 2) return false;
    if (!Number.isInteger(l.vehicles) || l.vehicles < 1 || l.vehicles > 16 || !finite(l.frequency) || l.frequency < 1 || l.frequency > TRANSPORT_TYPES[l.type].maxFrequency) return false;
    if (!validateWeeklyTimetable(l.timetable, TRANSPORT_TYPES[l.type].maxFrequency)) return false;
    if (l.previousTimetable !== undefined && l.previousTimetable !== null
      && !validateWeeklyTimetable(l.previousTimetable, TRANSPORT_TYPES[l.type].maxFrequency)) return false;
    if (!nonnegative(l.distanceKm) || !nonnegative(l.cost) || !nonnegative(l.ageMinutes) || !plain(l.stats) || !['carried', 'revenue', 'expenses'].every(k => nonnegative(l.stats[k]))) return false;
    if (typeof l.name !== 'string' || l.name.length > 100 || !/^#[0-9a-f]{6}$/i.test(l.color)) return false;
    if (l.infrastructureCost !== undefined && !nonnegative(l.infrastructureCost)) return false;
    if (l.routingMode !== undefined && !['road', 'rail-corridor', 'direct'].includes(l.routingMode)) return false;
    if (l.routeGeometry !== undefined && (!Array.isArray(l.routeGeometry) || l.routeGeometry.length < 2 || l.routeGeometry.length > 500
      || l.routeGeometry.some(item => !Array.isArray(item) || item.length !== 2 || !finite(item[0]) || !finite(item[1]) || Math.abs(item[0]) > 90 || Math.abs(item[1]) > 180))) return false;
    const optionalStats = ['boardings', 'revenuePerHour', 'costPerHour', 'avgWaitMinutes', 'waitMinutesTotal', 'waiting', 'onboard', 'passengerKm', 'subsidy', 'idleCostPerHour'];
    if (optionalStats.some(key => l.stats[key] !== undefined && !nonnegative(l.stats[key]))) return false;
    if (l.stats.balancePerHour !== undefined && !finite(l.stats.balancePerHour)) return false;
    if (l.stats.load !== undefined && (!nonnegative(l.stats.load) || l.stats.load > 1)) return false;
    if (l.stats.segmentLoad !== undefined && (!plain(l.stats.segmentLoad) || Object.entries(l.stats.segmentLoad).some(([index, load]) => !/^\d+$/.test(index) || !nonnegative(load) || load > 1.5))) return false;
    if (l.stats.history !== undefined && (!Array.isArray(l.stats.history) || l.stats.history.length > 100 || l.stats.history.some(entry => !plain(entry) || !['at', 'revenue', 'cost', 'minutes'].every(key => nonnegative(entry[key])) || entry.minutes === 0))) return false;
    if (l.serviceRemainder !== undefined && (!plain(l.serviceRemainder) || Object.entries(l.serviceRemainder).some(([key, value]) => !key.startsWith(`${l.id}:`) || !/^line-[1-9]\d*:(1|-1):\d+$/.test(key) || !nonnegative(value) || value >= 1))) return false;
  }
  if (s.revealedStops !== undefined && !validStops(s.revealedStops)) return false;
  if (!validStops(s.selectedNodes) || !transportType(s.selectedType) || !Array.isArray(s.unlocked) || !s.unlocked.includes('bus') || s.unlocked.some(t => !transportType(t)) || new Set(s.unlocked).size !== s.unlocked.length) return false;
  if (s.editingLineId !== null && !s.lines.some(l => l.id === s.editingLineId)) return false;
  if (!plain(s.preferences) || ['tutorialCollapsed', 'goalsCollapsed'].some(key => typeof s.preferences[key] !== 'boolean')) return false;
  if (s.analyticsMode !== undefined && !['off', 'demand', 'queues', 'load', 'profit', 'travel', 'access'].includes(s.analyticsMode)) return false;
  if (s.startScenarioId !== undefined && !city.points.some(point => point.startScenario === s.startScenarioId)) return false;
  if (s.fleet !== undefined) {
    if (!plain(s.fleet)) return false;
    for (const type of Object.keys(TRANSPORT_TYPES)) {
      const entry = s.fleet[type]; const owned = typeof entry === 'number' ? entry : entry?.owned;
      const assigned = s.lines.filter(line => line.type === type).reduce((sum, line) => sum + line.vehicles, 0);
      if (!integer(owned) || owned < assigned || owned > 1000) return false;
    }
  }
  const legacyRequiredPoints = ['wieliczka', 'biezanow', 'ruczaj', 'nowa-huta', 'centrum', 'bronowice', 'dworzec', 'balice'];
  if (!plain(s.passengers) || legacyRequiredPoints.some(id => pointIds.has(id) && !Object.hasOwn(s.passengers, id))) return false;
  for (const [id, queue] of Object.entries(s.passengers)) {
    if (!pointIds.has(id) || !plain(queue) || !integer(queue.waiting) || !plain(queue.destinations)) return false;
    if (Object.entries(queue.destinations).some(([destination, count]) => !pointIds.has(destination) || !integer(count))) return false;
  }
  if (!Array.isArray(s.cohorts) || s.cohorts.length > 5000) return false;
  const validLeg = leg => {
    if (!plain(leg) || !lineId(leg.lineId) || !pointIds.has(leg.from) || !pointIds.has(leg.to) || leg.from === leg.to) return false;
    if (!integer(leg.fromIndex) || !integer(leg.toIndex) || Math.max(leg.fromIndex, leg.toIndex) >= city.points.length || leg.fromIndex === leg.toIndex) return false;
    if (leg.direction !== Math.sign(leg.toIndex - leg.fromIndex) || !validStops(leg.stopSequence) || leg.stopSequence.length !== Math.abs(leg.toIndex - leg.fromIndex) + 1) return false;
    if (leg.stopSequence[leg.direction === 1 ? 0 : leg.stopSequence.length - 1] !== leg.from || leg.stopSequence[leg.direction === 1 ? leg.stopSequence.length - 1 : 0] !== leg.to) return false;
    if (!Array.isArray(leg.segments) || leg.segments.length !== leg.stopSequence.length - 1 || leg.segments.some((key, index) => key !== `${leg.lineId}:${leg.direction}:${Math.min(leg.fromIndex, leg.toIndex) + index}`)) return false;
    return ['distanceKm', 'travelMinutes', 'waitMinutes', 'weight'].every(key => nonnegative(leg[key])) && leg.travelMinutes > 0;
  };
  for (const group of s.cohorts) {
    if (!plain(group) || !['origin', 'destination', 'currentStop'].every(key => pointIds.has(group[key])) || group.origin === group.destination) return false;
    if (!integer(group.count) || !group.count || !['waiting', 'riding'].includes(group.phase) || !integer(group.legIndex)) return false;
    if (!nonnegative(group.waitMinutes) || !nonnegative(group.totalWaitMinutes) || group.totalWaitMinutes < group.waitMinutes) return false;
    if (group.route !== null && (!Array.isArray(group.route) || group.route.length > city.points.length || !group.route.every(validLeg))) return false;
    if (!Array.isArray(group.completedLegs) || group.completedLegs.length > 100 || group.completedLegs.some(leg => !plain(leg) || !lineId(leg.lineId) || !nonnegative(leg.distanceKm))) return false;
    if (group.phase === 'riding' && (!group.route?.[group.legIndex] || !nonnegative(group.remainingMinutes) || group.remainingMinutes === 0)) return false;
  }
  const c = s.campaign;
  if (!plain(c) || !Array.isArray(c.completed) || c.completed.some(id => !goals.has(id)) || new Set(c.completed).size !== c.completed.length) return false;
  if (!['qualityMinutes', 'profitableDays', 'profitMinutes', 'grants'].every(k => nonnegative(c[k])) || !finite(c.profitStart)) return false;
  if (c.profitDay !== null && (!integer(c.profitDay) || c.profitDay < 1)) return false;
  if (c.stress !== undefined) {
    const stress = c.stress;
    if (!plain(stress) || !['locked', 'active', 'passed'].includes(stress.status) || !integer(stress.phaseIndex) || stress.phaseIndex > 4) return false;
    if (!['phaseMinutes', 'criticalMinutes', 'startGenerated', 'startAbandoned', 'minSatisfaction'].every(key => nonnegative(stress[key]))) return false;
    if (stress.startBudget !== null && !finite(stress.startBudget)) return false;
  }
  if (!integer(s.tutorialStep) || typeof s.lossReason !== 'string') return false;
  if (['transportMinutes', 'economyMinutes', 'finishedAt', 'realElapsedSeconds', 'playSeconds'].some(key => s[key] !== undefined && !nonnegative(s[key]))) return false;
  if (s._pendingLineRevenue !== undefined && (!plain(s._pendingLineRevenue) || Object.entries(s._pendingLineRevenue).some(([id, revenue]) => !lineId(id) || !nonnegative(revenue)))) return false;
  if (s._pendingLinePassengerKm !== undefined && (!plain(s._pendingLinePassengerKm) || Object.entries(s._pendingLinePassengerKm).some(([id, value]) => !lineId(id) || !nonnegative(value)))) return false;
  if (s.cityEvents !== undefined) {
    if (!Array.isArray(s.cityEvents) || s.cityEvents.length > 20) return false;
    for (const event of s.cityEvents) {
      if (!plain(event) || typeof event.id !== 'string' || event.id.length > 80 || typeof event.title !== 'string' || typeof event.message !== 'string') return false;
      if (!nonnegative(event.startMinute) || !nonnegative(event.endMinute) || event.endMinute <= event.startMinute) return false;
      if (event.announcedMinute !== undefined && (!nonnegative(event.announcedMinute) || event.announcedMinute > event.startMinute)) return false;
      if (event.locationId !== null && event.locationId !== undefined && !pointIds.has(event.locationId)) return false;
      if (event.affectedTypes !== undefined && (!Array.isArray(event.affectedTypes) || event.affectedTypes.some(type => !transportType(type)))) return false;
      if (['demandMultiplier', 'globalDemandMultiplier', 'speedMultiplier', 'capacityMultiplier'].some(key => event[key] !== undefined && !nonnegative(event[key]))) return false;
    }
  }
  if (s.nextEventId !== undefined && (!integer(s.nextEventId) || s.nextEventId < 1)) return false;
  if (s.stressDemandMultiplier !== undefined && !nonnegative(s.stressDemandMultiplier)) return false;
  if (s.diagnostics !== undefined) {
    const diagnostics = s.diagnostics;
    if (!plain(diagnostics) || !plain(diagnostics.relations) || !plain(diagnostics.generatedByPoint) || !plain(diagnostics.deliveredByPoint) || !plain(diagnostics.failures) || !plain(diagnostics.failureByPoint)) return false;
    if ([diagnostics.relations, diagnostics.generatedByPoint, diagnostics.deliveredByPoint, diagnostics.failures].some(object => Object.values(object).some(value => !nonnegative(value)))) return false;
    if (Object.values(diagnostics.failureByPoint).some(value => !plain(value) || Object.values(value).some(count => !nonnegative(count)))) return false;
    if (diagnostics.lastUpdated !== undefined && !nonnegative(diagnostics.lastUpdated)) return false;
  }
  return true;
}

export function saveGame(storage, state, cityId = 'krakow') {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, cityId, savedAt: Date.now(), state }));
    return { ok: true };
  } catch { return { ok: false, message: 'Zapis niedostępny — sprawdź ustawienia lub wolne miejsce przeglądarki.' }; }
}
export function loadGame(storage, city) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
    if (!raw) return { state: null, error: null };
    if (raw.length > 2000000) throw new Error('size');
    let data = JSON.parse(raw);
    if (data.cityId !== city.id) throw new Error('format');
    let migrated = false;
    if ([2, 3].includes(data.version) && plain(data.state) && Array.isArray(data.state.lines)) {
      const oldVersion = data.version;
      data = { ...data, version: SAVE_VERSION, state: {
        ...data.state,
        calendar: data.state.calendar || createSimulationCalendar(),
        lines: data.state.lines.map(line => {
          const maxFrequency = TRANSPORT_TYPES[line.type]?.maxFrequency;
          const sourceTimetable = oldVersion === 2
            ? createUniformTimetable(line.frequency, maxFrequency)
            : line.timetable;
          return {
            ...line,
            timetable: migrateDailyTimetable(sourceTimetable, maxFrequency),
            previousTimetable: line.previousTimetable
              ? migrateDailyTimetable(line.previousTimetable, maxFrequency) : undefined
          };
        })
      } };
      migrated = true;
    }
    if (data.version !== SAVE_VERSION || !validateState(data.state, city)) throw new Error('format');
    if (migrated) {
      try { storage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* Keep the migrated in-memory state playable. */ }
    }
    return { state: data.state, error: null };
  } catch {
    if (raw) { try { storage.setItem(`${SAVE_KEY}.recovery`, raw); } catch { /* Keep the original if storage is unavailable. */ } }
    return { state: null, error: 'Nie udało się odczytać zapisu. Oryginał zachowano; nową grę rozpocznij świadomie.' };
  }
}
export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); return { ok: true }; }
  catch { return { ok: false, message: 'Nie można usunąć zapisu z przeglądarki.' }; }
}
