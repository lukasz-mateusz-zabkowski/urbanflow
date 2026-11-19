const EARTH_KM = 6371;
// Initial ALPHA track price: separate from existing rolling-stock and line setup rates.
export const TRAM_TRACK_COST_PER_KM = 2000;
const pointKey = point => point.map(value => Math.round(value * 1e5) / 1e5).join(',');
const coordKey = point => pointKey(point);
const finitePoint = point => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;

export function trackSegmentId(a, b) {
  if (!finitePoint(a) || !finitePoint(b)) return null;
  const ends = [coordKey(a), coordKey(b)].sort();
  return `track:${ends[0]}:${ends[1]}`;
}

export function createTramInfrastructure() { return { version: 1, segments: [] }; }

export function haversineKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validGeometry(geometry, minimumSegmentKm = 0.005) {
  // Save validation permits up to 500 route points; keep street-built track
  // geometry aligned with that bound instead of rejecting valid OSM routes.
  if (!Array.isArray(geometry) || geometry.length < 2 || geometry.length > 500 || geometry.some(point => !finitePoint(point))) return false;
  return geometry.slice(1).every((point, index) => {
    const distance = haversineKm(geometry[index], point);
    return distance >= minimumSegmentKm && distance <= 10;
  });
}

function segmentsOf(geometry, mode) {
  return geometry.slice(1).map((to, index) => {
    const from = geometry[index];
    return { id: trackSegmentId(from, to), from: [...from], to: [...to], lengthKm: haversineKm(from, to), mode };
  });
}

export function planTrackSegments(infrastructure, geometry, { mode = 'manual', costPerKm = TRAM_TRACK_COST_PER_KM } = {}) {
  if (!validateTramInfrastructure(infrastructure)) return { valid: false, reason: 'Zapis infrastruktury tramwajowej jest uszkodzony.' };
  if (!['street', 'manual', 'existing'].includes(mode) || !Number.isSafeInteger(costPerKm) || costPerKm < 0) return { valid: false, reason: 'Nieprawidłowa konfiguracja budowy torów.' };
  const normalized = Array.isArray(geometry) ? geometry.filter((point, index) => index === 0 || haversineKm(geometry[index - 1], point) > 0.00001) : geometry;
  // OSM ways can contain very short connector edges; retain them as measured
  // graph geometry while excluding zero-length duplicate coordinates.
  if (!validGeometry(normalized, 0.0001)) return { valid: false, reason: 'Geometria torowiska ma nieprawidłowe współrzędne, długości lub liczbę punktów.' };
  const candidates = segmentsOf(normalized, mode);
  const existing = new Set(infrastructure.segments.map(segment => segment.id));
  const withinPlan = new Set(), reused = new Set();
  const newSegments = [], reusedSegments = [];
  for (const segment of candidates) {
    if (withinPlan.has(segment.id) || existing.has(segment.id)) reused.add(segment.id);
    else { withinPlan.add(segment.id); newSegments.push(segment); }
  }
  newSegments.forEach(segment => { segment.paidCost = Math.round(segment.lengthKm * costPerKm); });
  const cost = newSegments.reduce((sum, segment) => sum + segment.paidCost, 0);
  return { valid: true, mode, geometry: normalized.map(point => [...point]), newSegments, reusedSegments: [...reused],
    segmentIds: candidates.map(segment => segment.id), lengthKm: candidates.reduce((sum, segment) => sum + segment.lengthKm, 0), cost };
}

export function commitTrackPlan(infrastructure, plan, builtAt = 0) {
  if (!validateTramInfrastructure(infrastructure) || !plan?.valid || !Array.isArray(plan.newSegments)) return false;
  if (!Number.isSafeInteger(builtAt) || builtAt < 0) return false;
  const byId = new Set(infrastructure.segments.map(segment => segment.id));
  if (plan.newSegments.some(segment => !segment || byId.has(segment.id) || segment.id !== trackSegmentId(segment.from, segment.to))) return false;
  infrastructure.segments.push(...plan.newSegments.map(segment => ({ ...segment, builtAt })));
  return true;
}

export function validateTramInfrastructure(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.segments) || value.segments.length > 10000) return false;
  const ids = new Set();
  for (const segment of value.segments) {
    if (!segment || typeof segment.id !== 'string' || segment.id !== trackSegmentId(segment.from, segment.to) || ids.has(segment.id)
      || !Number.isFinite(segment.lengthKm) || segment.lengthKm <= 0 || segment.lengthKm > 10
      || !['street', 'manual', 'existing'].includes(segment.mode)
      || !Number.isSafeInteger(segment.builtAt) || segment.builtAt < 0
      || !Number.isSafeInteger(segment.paidCost) || segment.paidCost < 0) return false;
    ids.add(segment.id);
  }
  return true;
}

function project(point, a, b) {
  const scale = Math.cos(point[0] * Math.PI / 180);
  const px = point[1] * scale, py = point[0];
  const ax = a[1] * scale, ay = a[0], bx = b[1] * scale, by = b[0];
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { point: projected, offsetKm: haversineKm(point, projected), t };
}

export function buildManualTramGeometry(stops, controlPoints, { maxStopOffsetKm = 0.2 } = {}) {
  if (!Array.isArray(stops) || stops.length < 2 || !stops.every(finitePoint) || !Array.isArray(controlPoints) || controlPoints.length < 2
    || controlPoints.length > 300 || !controlPoints.every(finitePoint)) return { valid: false, reason: 'Wybierz co najmniej dwa przystanki i dwa punkty przebiegu.' };
  if (!Number.isFinite(maxStopOffsetKm) || maxStopOffsetKm <= 0 || maxStopOffsetKm > 1) return { valid: false, reason: 'Nieprawidłowa tolerancja przystanku.' };
  const geometry = controlPoints.map(point => [...point]);
  if (haversineKm(stops[0], geometry[0]) > maxStopOffsetKm || haversineKm(stops.at(-1), geometry.at(-1)) > maxStopOffsetKm) {
    return { valid: false, reason: 'Ręczne torowisko musi zaczynać się i kończyć przy skrajnych wybranych przystankach.' };
  }
  geometry[0] = [...stops[0]]; geometry[geometry.length - 1] = [...stops.at(-1)];
  if (!validGeometry(geometry)) return { valid: false, reason: 'Geometria torowiska ma nieprawidłowe współrzędne lub odcinki.' };
  const cumulative = [0];
  for (let index = 1; index < geometry.length; index += 1) cumulative.push(cumulative.at(-1) + haversineKm(geometry[index - 1], geometry[index]));
  const projectedStops = stops.map(stop => {
    let best = null;
    for (let index = 1; index < geometry.length; index += 1) {
      const item = project(stop, geometry[index - 1], geometry[index]);
      const alongKm = cumulative[index - 1] + haversineKm(geometry[index - 1], item.point);
      if (!best || item.offsetKm < best.offsetKm) best = { ...item, alongKm };
    }
    return best;
  });
  if (projectedStops.some(item => item.offsetKm > maxStopOffsetKm)) return { valid: false, reason: 'Przebieg ręczny nie przechodzi wystarczająco blisko każdego wybranego przystanku.' };
  if (projectedStops.some((item, index) => index && item.alongKm <= projectedStops[index - 1].alongKm)) return { valid: false, reason: 'Ręczny przebieg nie odwiedza wybranych przystanków w podanej kolejności.' };
  for (let index = 1; index < projectedStops.length - 1; index += 1) {
    const stop = projectedStops[index];
    let edge = 1;
    while (edge < cumulative.length - 1 && cumulative[edge] < stop.alongKm) edge += 1;
    const list = geometry.slice(0, edge);
    list.push([...stop.point], ...geometry.slice(edge));
    geometry.splice(0, geometry.length, ...list);
  }
  return { valid: validGeometry(geometry), coordinates: geometry, lengthKm: geometry.slice(1).reduce((sum, point, index) => sum + haversineKm(geometry[index], point), 0),
    reason: 'Ręczny przebieg zapisuje punkty kontrolne bez przyciągania do ulic. Przeszkody terenowe wymagają oceny gracza.' };
}
