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
  const existing = infrastructure.segments;
  const withinPlan = new Set(), reused = new Set();
  const newSegments = [], segmentIds = [];
  const project = (point, a, b) => {
    const scale = Math.cos(point[0] * Math.PI / 180);
    const px = point[1] * scale, py = point[0];
    const ax = a[1] * scale, ay = a[0], bx = b[1] * scale, by = b[0];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { t, distanceKm: haversineKm(point, projected) };
  };
  const toleranceKm = 0.00075;
  for (let index = 1; index < normalized.length; index += 1) {
    const from = normalized[index - 1], to = normalized[index], cuts = [0, 1];
    for (const segment of existing) for (const endpoint of [segment.from, segment.to]) {
      const projected = project(endpoint, from, to);
      if (projected.distanceKm <= toleranceKm && projected.t > 0.000001 && projected.t < 0.999999) cuts.push(projected.t);
    }
    cuts.sort((a, b) => a - b);
    const uniqueCuts = cuts.filter((value, cutIndex) => !cutIndex || value - cuts[cutIndex - 1] > 0.000001);
    for (let cutIndex = 1; cutIndex < uniqueCuts.length; cutIndex += 1) {
      const low = uniqueCuts[cutIndex - 1], high = uniqueCuts[cutIndex];
      if (high - low < 0.000001) continue;
      const a = [from[0] + (to[0] - from[0]) * low, from[1] + (to[1] - from[1]) * low];
      const b = [from[0] + (to[0] - from[0]) * high, from[1] + (to[1] - from[1]) * high];
      const match = existing.find(segment => {
        const pa = project(a, segment.from, segment.to), pb = project(b, segment.from, segment.to);
        return pa.distanceKm <= toleranceKm && pb.distanceKm <= toleranceKm
          && Math.abs(pa.t - pb.t) > 0.000001;
      });
      if (match) { reused.add(match.id); segmentIds.push(match.id); continue; }
      const segment = { id: trackSegmentId(a, b), from: a, to: b, lengthKm: haversineKm(a, b), mode };
      if (withinPlan.has(segment.id) || existing.some(item => item.id === segment.id)) reused.add(segment.id);
      else { withinPlan.add(segment.id); newSegments.push(segment); }
      segmentIds.push(segment.id);
    }
  }
  newSegments.forEach(segment => { segment.paidCost = Math.round(segment.lengthKm * costPerKm); });
  const cost = newSegments.reduce((sum, segment) => sum + segment.paidCost, 0);
  return { valid: true, mode, geometry: normalized.map(point => [...point]), newSegments, reusedSegments: [...reused],
    segmentIds: [...new Set(segmentIds)], lengthKm: normalized.slice(1).reduce((sum, point, index) => sum + haversineKm(normalized[index], point), 0), cost };
}

export function commitTrackPlan(infrastructure, plan, builtAt = 0) {
  if (!validateTramInfrastructure(infrastructure) || !plan?.valid || !Array.isArray(plan.newSegments)) return false;
  if (!Number.isSafeInteger(builtAt) || builtAt < 0) return false;
  const byId = new Set(infrastructure.segments.map(segment => segment.id));
  if (!Array.isArray(plan.segmentIds) || plan.segmentIds.some(id => typeof id !== 'string')
    || plan.newSegments.some(segment => !segment || byId.has(segment.id) || segment.id !== trackSegmentId(segment.from, segment.to)
      || !finitePoint(segment.from) || !finitePoint(segment.to) || !['street', 'manual', 'existing'].includes(segment.mode)
      || !Number.isFinite(segment.lengthKm) || Math.abs(segment.lengthKm - haversineKm(segment.from, segment.to)) > 0.00001
      || !Number.isSafeInteger(segment.paidCost) || segment.paidCost < 0)) return false;
  const addedIds = new Set(plan.newSegments.map(segment => segment.id));
  if (plan.segmentIds.some(id => !byId.has(id) && !addedIds.has(id))) return false;
  const nextSegments = [...infrastructure.segments, ...plan.newSegments.map(segment => ({ ...segment, builtAt }))];
  if (!validateTramInfrastructure({ ...infrastructure, segments: nextSegments })) return false;
  infrastructure.segments = nextSegments;
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

export function routeOnPlayerTramTracks(infrastructure, stops, city, { maxStopOffsetKm = 0.05 } = {}) {
  if (!validateTramInfrastructure(infrastructure) || !Array.isArray(stops) || stops.length < 2) return { valid: false, reason: 'Brak poprawnej infrastruktury tramwajowej.' };
  const points = new Map((city?.points || []).map(point => [point.id, point]));
  const legs = [];
  for (let leg = 1; leg < stops.length; leg += 1) {
    const start = points.get(stops[leg - 1]), end = points.get(stops[leg]);
    if (!start || !end) return { valid: false, reason: `Nie znaleziono przystanku ${stops[leg - 1]} lub ${stops[leg]}.` };
    const graph = new Map();
    const nodeKey = point => `n:${point.map(value => Math.round(value * 1e6)).join(':')}`;
    const addNode = (id, coordinate) => { if (!graph.has(id)) graph.set(id, { coordinate: [...coordinate], edges: [] }); };
    const addEdge = (aId, bId, a, b, trackId) => {
      addNode(aId, a); addNode(bId, b);
      const distance = haversineKm(a, b);
      graph.get(aId).edges.push({ to: bId, distance, trackId });
      graph.get(bId).edges.push({ to: aId, distance, trackId });
    };
    const snaps = [], splitPointsById = new Map();
    const trackEndpoints = infrastructure.segments.flatMap(segment => [segment.from, segment.to]);
    for (const segment of infrastructure.segments) {
      const splitPoints = [{ t: 0, coordinate: segment.from }, { t: 1, coordinate: segment.to }];
      for (const endpoint of trackEndpoints) {
        const cut = project(endpoint, segment.from, segment.to);
        if (cut.offsetKm <= 0.00075 && cut.t > 0.000001 && cut.t < 0.999999) splitPoints.push({ t: cut.t, coordinate: cut.point });
      }
      splitPoints.sort((a, b) => a.t - b.t);
      const unique = splitPoints.filter((item, index) => !index || item.t - splitPoints[index - 1].t > 0.000001);
      splitPointsById.set(segment.id, unique);
      for (let cutIndex = 1; cutIndex < unique.length; cutIndex += 1) {
        const a = unique[cutIndex - 1].coordinate, b = unique[cutIndex].coordinate;
        addEdge(nodeKey(a), nodeKey(b), a, b, segment.id);
      }
      for (const [kind, point] of [['start', start], ['end', end]]) {
        const snap = project([point.lat, point.lng], segment.from, segment.to);
        if (snap.offsetKm <= maxStopOffsetKm) snaps.push({ kind, segment, ...snap });
      }
    }
    const startSnap = snaps.filter(snap => snap.kind === 'start').sort((a, b) => a.offsetKm - b.offsetKm)[0];
    const endSnap = snaps.filter(snap => snap.kind === 'end').sort((a, b) => a.offsetKm - b.offsetKm)[0];
    if (!startSnap || !endSnap) return { valid: false, reason: 'Brak własnego torowiska w zasięgu 50 m od jednego z przystanków.' };
    const startId = 'snap:start', endId = 'snap:end';
    const connectSnap = (id, point, snap) => {
      const cuts = splitPointsById.get(snap.segment.id) || [];
      let before = cuts[0], after = cuts.at(-1);
      for (const cut of cuts) {
        if (cut.t <= snap.t) before = cut;
        if (cut.t >= snap.t) { after = cut; break; }
      }
      for (const cut of new Set([before, after])) {
        const cutId = nodeKey(cut.coordinate);
        addEdge(id, cutId, snap.point, cut.coordinate, snap.segment.id);
      }
      return { id, coordinate: snap.point, offsetKm: snap.offsetKm, point };
    };
    const s = connectSnap(startId, start, startSnap), e = connectSnap(endId, end, endSnap);
    if (startSnap.segment.id === endSnap.segment.id) addEdge(startId, endId, startSnap.point, endSnap.point, startSnap.segment.id);
    const distances = new Map([[startId, 0]]), previous = new Map(), visited = new Set();
    while (true) {
      let current = null, best = Infinity;
      for (const [id, distance] of distances) if (!visited.has(id) && distance < best) { current = id; best = distance; }
      if (current === null || current === endId) break;
      visited.add(current);
      for (const edge of graph.get(current)?.edges || []) {
        const next = best + edge.distance;
        if (next < (distances.get(edge.to) ?? Infinity)) { distances.set(edge.to, next); previous.set(edge.to, { from: current, edge }); }
      }
    }
    if (!distances.has(endId)) return { valid: false, reason: 'Własne torowisko nie łączy kolejnych przystanków.' };
    const ids = [endId];
    while (ids[0] !== startId) ids.unshift(previous.get(ids[0]).from);
    const coordinates = [[start.lat, start.lng], s.coordinate, ...ids.slice(1, -1).map(id => graph.get(id).coordinate), e.coordinate, [end.lat, end.lng]]
      .filter((point, index, all) => !index || haversineKm(point, all[index - 1]) > 0.00001);
    const trackIds = [...new Set(ids.slice(1).map(id => previous.get(id)?.edge.trackId).filter(Boolean))];
    legs.push({ coordinates, distanceKm: distances.get(endId) + s.offsetKm + e.offsetKm, trackIds });
  }
  const coordinates = legs.reduce((all, leg) => all.concat(all.length ? leg.coordinates.slice(1) : leg.coordinates), []);
  return { valid: true, coordinates, vehicleCoordinates: coordinates, distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    trackIds: [...new Set(legs.flatMap(leg => leg.trackIds))], source: 'Własne torowisko UrbanFlow', algorithm: 'Najkrótsza ścieżka po zapisanych segmentach tramwajowych',
    reason: 'Trasa wykorzystuje istniejącą infrastrukturę wybudowaną w tej kampanii.', mode: 'tramway', segments: legs };
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
