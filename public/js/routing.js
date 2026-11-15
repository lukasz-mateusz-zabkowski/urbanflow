import { haversineKm } from './transport.js?v=8';

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
  if (!start || !target) return [];
  const distance = new Map([[start, 0]]); const previous = new Map(); const visited = new Set();
  while (true) {
    let current = null; let best = Infinity;
    for (const [id, value] of distance) if (!visited.has(id) && value < best) { current = id; best = value; }
    if (current === null) return [];
    if (current === target) break;
    visited.add(current);
    for (const edge of graph.get(current)?.edges || []) {
      const next = best + edge.distance;
      if (next < (distance.get(edge.to) ?? Infinity)) { distance.set(edge.to, next); previous.set(edge.to, current); }
    }
  }
  const ids = [target];
  while (ids[0] !== start) ids.unshift(previous.get(ids[0]));
  return ids.map(id => graph.get(id).coordinate);
}

export function routeSegment(a, b, type, city, provider = null) {
  if (!a || !b) return [];
  if (provider?.route) return provider.route(a, b, type);
  if (type === 'metro') return [coordinate(a), coordinate(b)];
  const corridors = RAIL_TYPES.has(type) ? city?.railGeometry : SURFACE_TYPES.has(type) ? city?.roadGeometry : null;
  const graph = buildGraph(corridors);
  if (!graph.size) return [coordinate(a), coordinate(b)];
  const start = closestNode(graph, a); const target = closestNode(graph, b);
  const path = shortestPath(graph, start, target);
  return [coordinate(a), ...path, coordinate(b)].filter((item, index, items) => !index || key(item) !== key(items[index - 1]));
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

export const routingMode = type => type === 'metro' ? 'direct' : RAIL_TYPES.has(type) ? 'rail-corridor' : 'road';
