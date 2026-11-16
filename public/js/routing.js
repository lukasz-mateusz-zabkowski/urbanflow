import { haversineKm, lineMetrics } from './transport.js?v=8';

const SURFACE_TYPES = new Set(['bus', 'tram']);
const RAIL_TYPES = new Set(['suburban', 'intercity']);
const coordinate = point => [Number(point.lat), Number(point.lng)];
const key = ([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

function addEdge(graph, a, b) {
  const distance = haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
  if (!graph.has(key(a))) graph.set(key(a), { coordinate: a, edges: [] });
  if (!graph.has(key(b))) graph.set(key(b), { coordinate: b, edges: [] });
  graph.get(key(a)).edges.push({ to: key(b), distance });
  graph.get(key(b)).edges.push({ to: key(a), distance });
}

function buildGraph(corridors = []) {
  const graph = new Map();
  for (const corridor of corridors) for (let index = 1; index < corridor.length; index += 1) addEdge(graph, corridor[index - 1], corridor[index]);
  return graph;
}

function closestNode(graph, point) {
  let result = null; let best = Infinity;
  for (const [id, node] of graph) {
    const distance = haversineKm(point, { lat: node.coordinate[0], lng: node.coordinate[1] });
    if (distance < best) { best = distance; result = id; }
  }
  return result;
}

function shortestPath(graph, start, target) {
  if (!start || !target) return null;
  const distance = new Map([[start, 0]]); const previous = new Map(); const visited = new Set();
  while (true) {
    let current = null; let best = Infinity;
    for (const [id, value] of distance) if (!visited.has(id) && value < best) { current = id; best = value; }
    if (current === null) return null;
    if (current === target) break;
    visited.add(current);
    for (const edge of graph.get(current)?.edges || []) {
      const next = best + edge.distance;
      if (next < (distance.get(edge.to) ?? Infinity)) { distance.set(edge.to, next); previous.set(edge.to, current); }
    }
  }
  const ids = [target];
  while (ids[0] !== start) ids.unshift(previous.get(ids[0]));
  return { coordinates: ids.map(id => graph.get(id).coordinate), distanceKm: distance.get(target) };
}

const routeDistance = coordinates => coordinates.slice(1).reduce((sum, item, index) => sum + haversineKm(
  { lat: coordinates[index][0], lng: coordinates[index][1] }, { lat: item[0], lng: item[1] }), 0);

export function routeSegmentDetails(a, b, type, city, provider = null) {
  if (!a || !b) return { coordinates: [], distanceKm: 0, source: 'brak danych', algorithm: 'brak', reason: 'Nie wybrano obu punktów.', mode: routingMode(type) };
  if (provider?.route) {
    const coordinates = provider.route(a, b, type) || [];
    return { coordinates, distanceKm: routeDistance(coordinates), source: provider.name || 'usługa zewnętrzna',
      algorithm: provider.algorithm || 'algorytm dostawcy', reason: 'Trasę zwrócił skonfigurowany dostawca zewnętrzny.', mode: routingMode(type) };
  }
  if (type === 'metro') {
    const coordinates = [coordinate(a), coordinate(b)];
    return { coordinates, distanceKm: routeDistance(coordinates), source: 'model bezpośredni UrbanFlow', algorithm: 'przebieg tunelowy bez grafu ulic', reason: 'Model metra prowadzi bezpośrednio między wybranymi punktami.', mode: 'direct' };
  }
  const corridors = RAIL_TYPES.has(type) ? city?.railGeometry : SURFACE_TYPES.has(type) ? city?.roadGeometry : null;
  const graph = buildGraph(corridors);
  const direct = [coordinate(a), coordinate(b)];
  const mode = routingMode(type);
  const source = RAIL_TYPES.has(type) ? 'lokalny korytarz kolejowy UrbanFlow' : 'lokalny graf drogowy UrbanFlow';
  if (!graph.size) return { coordinates: direct, distanceKm: routeDistance(direct), source: 'geometria punktów', algorithm: 'bezpośredni fallback',
    reason: 'Brak grafu dla tego środka transportu; pokazano prostą linię między punktami.', mode };
  const start = closestNode(graph, a); const target = closestNode(graph, b);
  const path = shortestPath(graph, start, target);
  if (!path) return { coordinates: direct, distanceKm: routeDistance(direct), source, algorithm: 'bezpośredni fallback',
    reason: 'Brak połączenia w lokalnym grafie; pokazano prostą linię między punktami.', mode };
  const coordinates = [coordinate(a), ...path.coordinates, coordinate(b)].filter((item, index, items) => !index || key(item) !== key(items[index - 1]));
  return { coordinates, distanceKm: routeDistance(coordinates), source, algorithm: 'Dijkstra, najkrótsza odległość',
    reason: RAIL_TYPES.has(type) ? 'Wybrano najkrótszy dostępny korytarz kolejowy.' : 'Wybrano najkrótszy dostępny korytarz w lokalnym grafie drogowym.', mode,
    snappedDistanceKm: haversineKm(a, { lat: graph.get(start).coordinate[0], lng: graph.get(start).coordinate[1] })
      + haversineKm(b, { lat: graph.get(target).coordinate[0], lng: graph.get(target).coordinate[1] }) };
}

export function routeSegment(a, b, type, city, provider = null) {
  return routeSegmentDetails(a, b, type, city, provider).coordinates;
}

export function routeLine(stops, type, city, provider = null) {
  const byId = new Map((city?.points || []).map(point => [point.id, point]));
  const points = (stops || []).map(id => byId.get(id)).filter(Boolean);
  const coordinates = [];
  for (let index = 1; index < points.length; index += 1) {
    const segment = routeSegment(points[index - 1], points[index], type, city, provider);
    coordinates.push(...(coordinates.length ? segment.slice(1) : segment));
  }
  return coordinates;
}

export function polylineDistanceKm(coordinates = []) {
  return coordinates.slice(1).reduce((sum, point, index) => sum + haversineKm(
    { lat: coordinates[index][0], lng: coordinates[index][1] }, { lat: point[0], lng: point[1] }), 0);
}

export function routeLineDetails(stops, type, city, provider = null, minuteOfDay = 720) {
  const byId = new Map((city?.points || []).map(point => [point.id, point]));
  const points = (stops || []).map(id => byId.get(id)).filter(Boolean);
  if (points.length < 2) return { coordinates: [], distanceKm: 0, travelMinutes: 0, source: 'brak danych', algorithm: 'brak', reason: 'Potrzebne są co najmniej dwa punkty.', mode: routingMode(type) };
  const segments = points.slice(1).map((point, index) => routeSegmentDetails(points[index], point, type, city, provider));
  const coordinates = segments.reduce((all, item) => all.concat(all.length ? item.coordinates.slice(1) : item.coordinates), []);
  const routeModes = new Set(segments.map(item => item.mode));
  const fallback = segments.some(item => item.algorithm === 'bezpośredni fallback');
  const detail = {
    coordinates, distanceKm: routeDistance(coordinates), source: [...new Set(segments.map(item => item.source))].join(' + '),
    algorithm: fallback ? 'mieszany, zawiera fallback bezpośredni' : [...new Set(segments.map(item => item.algorithm))].join(' + '),
    reason: [...new Set(segments.map(item => item.reason))].join(' '),
    mode: routeModes.size === 1 ? segments[0].mode : 'mixed',
    snappedDistanceKm: segments.reduce((sum, item) => sum + (item.snappedDistanceKm || 0), 0), segments
  };
  detail.travelMinutes = lineMetrics({ type, stops, routeGeometry: coordinates }, city, minuteOfDay).travelMinutes;
  return detail;
}

export const routingMode = type => type === 'metro' ? 'direct' : RAIL_TYPES.has(type) ? 'rail-corridor' : 'road';
