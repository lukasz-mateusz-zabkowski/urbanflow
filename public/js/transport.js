import { trafficMultiplier } from './simulation.js?v=8';
import { eventImpactForLine } from './city-events.js?v=8';
import { frequencyAt } from './timetable.js?v=9';

export const TRANSPORT_TYPES = {
  bus: { id: 'bus', name: 'Autobus', short: 'A', color: '#f2b84b', capacity: 48, speed: 27, buildCost: 95000, vehicleCost: 24000, maintenance: 36, kmCost: 1.05, maxFrequency: 8, description: 'Tani i elastyczny. W szczycie korki wydłużają przejazd.' },
  tram: { id: 'tram', name: 'Tramwaj', short: 'T', color: '#ef6f61', capacity: 100, speed: 36, buildCost: 230000, vehicleCost: 62000, maintenance: 58, kmCost: 1.45, maxFrequency: 10, description: 'Pojemny miejski kręgosłup, dobry do łączenia dzielnic.' },
  metro: { id: 'metro', name: 'Metro', short: 'M', color: '#6e8df6', capacity: 240, speed: 72, buildCost: 680000, vehicleCost: 155000, maintenance: 180, kmCost: 2.5, maxFrequency: 16, description: 'Bardzo drogie, szybkie i pojemne. Wymaga dużego popytu.' },
  suburban: { id: 'suburban', name: 'Kolej aglomeracyjna', short: 'KA', color: '#50c6a8', capacity: 180, speed: 88, buildCost: 520000, vehicleCost: 110000, maintenance: 88, kmCost: 1.9, maxFrequency: 6, description: 'Szybka kolej podmiejska. Istniejące korytarze obniżają koszty.' },
  intercity: { id: 'intercity', name: 'Kolej międzymiastowa', short: 'IC', color: '#ba7cec', capacity: 280, speed: 135, buildCost: 880000, vehicleCost: 195000, maintenance: 190, kmCost: 2.8, maxFrequency: 4, description: 'Końcowy etap rozwoju, przygotowany do przyszłych połączeń miast.' }
};

export const UNLOCK_RULES = {
  bus: () => true,
  tram: counts => counts.bus >= 2,
  metro: counts => counts.tram >= 3,
  suburban: counts => counts.tram >= 3,
  intercity: counts => counts.tram >= 4
};

// Six operating hours include enough service to assess a route before the next
// construction tier. At 1× speed this is one real minute, not instant unlocks.
export const PROGRESSION = { minAgeMinutes: 360, minCarried: 80, minSatisfaction: 60, minRidersPerHour: 8 };
export function countLines(lines) {
  return Object.fromEntries(Object.keys(TRANSPORT_TYPES).map(type => [type, lines.filter(line => line.type === type).length]));
}
const segmentKey = (a, b) => [a, b].sort().join('|');
const isSubsequence = (candidate, path) => {
  let index = 0;
  for (const stop of path) if (stop === candidate[index]) index += 1;
  return index === candidate.length;
};
export function lineEligible(line, satisfaction = 100) {
  const age = line.ageMinutes || 0;
  const stats = line.stats || {};
  return age >= PROGRESSION.minAgeMinutes && (stats.carried || 0) >= PROGRESSION.minCarried
    && satisfaction >= PROGRESSION.minSatisfaction
    && ((stats.carried || 0) / (age / 60) >= PROGRESSION.minRidersPerHour || (stats.revenue || 0) > (stats.expenses || 0));
}
export function eligibleCounts(lines, satisfaction = 100) {
  const counts = countLines([]);
  for (const type of Object.keys(TRANSPORT_TYPES)) {
    const covered = new Set();
    const accepted = [];
    // Short copies, reversals and routes assembled from existing corridors do not
    // create another progression credit. The busiest distinct routes still do.
    const candidates = lines.filter(line => line.type === type && lineEligible(line, satisfaction))
      .sort((a, b) => b.stops.length - a.stops.length || String(a.id).localeCompare(String(b.id)));
    for (const line of candidates) {
      if (accepted.some(path => isSubsequence(line.stops, path) || isSubsequence(line.stops, [...path].reverse()))) continue;
      const segments = line.stops.slice(1).map((stop, index) => segmentKey(line.stops[index], stop));
      if (!segments.some(segment => !covered.has(segment))) continue;
      counts[type] += 1;
      accepted.push(line.stops);
      segments.forEach(segment => covered.add(segment));
    }
  }
  return counts;
}
export function unlockedTypes(lines, satisfaction = 100) {
  const counts = eligibleCounts(lines, satisfaction);
  return Object.keys(TRANSPORT_TYPES).filter(type => UNLOCK_RULES[type](counts));
}
export function airportUnlocked(lines, satisfaction = 100) {
  const c = eligibleCounts(lines, satisfaction);
  return c.metro >= 3 || c.suburban >= 2 || (c.intercity >= 1 && c.metro >= 2);
}
export function usesRailCorridor(stops, city) {
  const corridors = city?.railCorridors || [];
  return stops.length >= 2 && stops.slice(1).every((stop, index) => corridors.some(corridor => {
    const path = Array.isArray(corridor) ? corridor : corridor.stops;
    return path?.includes(stops[index]) && path.includes(stop);
  }));
}
export function lineCost(type, distanceKm = 10, stops = [], city = null) {
  const transport = TRANSPORT_TYPES[type];
  if (!transport) return Infinity;
  const discount = (type === 'suburban' || type === 'intercity') && usesRailCorridor(stops, city) ? 0.7 : 1;
  return Math.round(transport.buildCost * (0.65 + Math.max(3, distanceKm) / 28) * discount);
}
export function haversineKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function lineMetrics(line, city = null, minuteOfDay = 720, context = null) {
  const type = TRANSPORT_TYPES[line.type] || TRANSPORT_TYPES.bus;
  const points = (line.stops || []).map(id => city?.points?.find(point => point.id === id));
  const routed = Array.isArray(line.routeGeometry) && line.routeGeometry.length >= 2
    ? line.routeGeometry.slice(1).reduce((sum, point, index) => sum + haversineKm(
      { lat: line.routeGeometry[index][0], lng: line.routeGeometry[index][1] }, { lat: point[0], lng: point[1] }), 0) : 0;
  const measured = routed || (points.length >= 2 && points.every(Boolean)
    ? points.slice(1).reduce((sum, point, index) => sum + haversineKm(points[index], point), 0) : 0);
  const distanceKm = Math.max(0.1, measured || line.distanceKm || 1);
  const corridorBonus = (line.type === 'suburban' || line.type === 'intercity') && usesRailCorridor(line.stops || [], city);
  const eventImpact = eventImpactForLine(context?.events, line, context?.elapsedMinutes);
  const travelMinutes = distanceKm / (type.speed * trafficMultiplier(line.type, minuteOfDay) * eventImpact.speedMultiplier) * 60 + Math.max(1, (line.stops?.length || 2) - 1) * 0.7;
  const roundTripMinutes = travelMinutes * 2 + 4;
  const vehicles = Math.max(0, Math.floor(line.vehicles ?? 2));
  const requestedFrequency = Math.max(0, Math.min(type.maxFrequency, frequencyAt(line.timetable, minuteOfDay, line.frequency ?? 3)));
  const scheduledFrequency = Math.min(requestedFrequency, vehicles * 60 / roundTripMinutes);
  const effectiveFrequency = eventImpact.capacityMultiplier > 0 ? scheduledFrequency : 0;
  const capacityPerHour = type.capacity * effectiveFrequency * eventImpact.capacityMultiplier;
  const activeFleet = scheduledFrequency * roundTripMinutes / 60;
  const activeVehicles = Math.min(vehicles, Math.ceil(activeFleet - 0.000001));
  const idleVehicles = Math.max(0, vehicles - activeVehicles);
  const idleCostPerHour = idleVehicles * type.maintenance * 0.16;
  const costPerHour = (type.maintenance + activeFleet * type.maintenance * 0.48 + idleCostPerHour
    + 2 * distanceKm * scheduledFrequency * type.kmCost) * (corridorBonus ? 0.78 : 1);
  let averageEffectiveFrequency = effectiveFrequency;
  let averageCapacityPerHour = capacityPerHour;
  let averageCostPerHour = costPerHour;
  let averageActiveFleet = activeFleet;
  let averageIdleCostPerHour = idleCostPerHour;
  const intervalMinutes = Math.floor(Number(context?.intervalMinutes) || 0);
  if (intervalMinutes > 0 && intervalMinutes <= 1440 && Number.isFinite(context?.intervalStartMinuteOfDay)) {
    let service = 0; let capacity = 0; let cost = 0; let fleet = 0; let idleCost = 0;
    for (let minute = 0; minute < intervalMinutes; minute += 1) {
      const requested = Math.max(0, Math.min(type.maxFrequency,
        frequencyAt(line.timetable, context.intervalStartMinuteOfDay + minute, line.frequency ?? 3)));
      const scheduled = Math.min(requested, vehicles * 60 / roundTripMinutes);
      const active = scheduled * roundTripMinutes / 60;
      const activeCount = Math.min(vehicles, Math.ceil(active - 0.000001));
      const idleCount = Math.max(0, vehicles - activeCount);
      const idle = idleCount * type.maintenance * 0.16;
      const hourlyCost = (type.maintenance + active * type.maintenance * 0.48 + idle
        + 2 * distanceKm * scheduled * type.kmCost) * (corridorBonus ? 0.78 : 1);
      const effective = eventImpact.capacityMultiplier > 0 ? scheduled : 0;
      service += effective; capacity += type.capacity * effective * eventImpact.capacityMultiplier;
      cost += hourlyCost; fleet += active; idleCost += idle;
    }
    averageEffectiveFrequency = service / intervalMinutes;
    averageCapacityPerHour = capacity / intervalMinutes;
    averageCostPerHour = cost / intervalMinutes;
    averageActiveFleet = fleet / intervalMinutes;
    averageIdleCostPerHour = idleCost / intervalMinutes;
  }
  return {
    distanceKm, travelMinutes, roundTripMinutes, effectiveFrequency, capacityPerHour, costPerHour,
    corridorBonus, capacity: type.capacity, intervalMinutes: effectiveFrequency ? 60 / effectiveFrequency : Infinity,
    departuresPerHour: effectiveFrequency, vehicles, requestedFrequency, activeVehicles, idleVehicles,
    idleCostPerHour, requiredVehicles: requestedFrequency ? Math.ceil(roundTripMinutes * requestedFrequency / 60 - 0.000001) : 0,
    averageEffectiveFrequency, averageCapacityPerHour, averageCostPerHour, averageActiveFleet, averageIdleCostPerHour,
    eventSpeedMultiplier: eventImpact.speedMultiplier, eventCapacityMultiplier: eventImpact.capacityMultiplier
  };
}
