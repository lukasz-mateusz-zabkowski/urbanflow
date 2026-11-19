import { haversineKm, lineMetrics } from './transport.js?v=10';
import { decodeRoutingGraphBinary, routeOnOsmGraph } from './routing-osm.js?v=3';
export { decodeRoutingGraphBinary } from './routing-osm.js?v=3';
export { diagnoseOsmRoute } from './routing-osm.js?v=3';

const SURFACE_TYPES = new Set(['bus', 'tram']);
const RAIL_TYPES = new Set(['suburban', 'intercity']);
export const ROUTING_QUALITY = Object.freeze({ maxSnapDistanceKm: 0.8, maxDetourRatio: 4 });
const graphRegistry = new Map();
const graphLoads = new Map();

export function registerRoutingGraph(cityId, manifest, roadBuffer = null, tramBuffer = null) {
  if (manifest.binaryFormatVersion !== 2) throw new Error('Unsupported routing graph manifest format. Regenerate local OSM graph assets.');
  if (!manifest?.metadata?.graphVersion) throw new Error('Routing graph manifest is missing its version metadata.');
  const registered = graphRegistry.get(cityId) || { metadata: manifest.metadata, road: null, tram: null };
  registered.metadata = manifest.metadata;
  if (roadBuffer) registered.road = decodeRoutingGraphBinary(roadBuffer, manifest.bounds);
  if (tramBuffer) registered.tram = decodeRoutingGraphBinary(tramBuffer, manifest.bounds);
  graphRegistry.set(cityId, registered);
  return manifest.metadata;
}

export async function loadRoutingGraph(cityId, type = 'bus', fetcher = globalThis.fetch) {
  const mode = type === 'tram' ? 'tram' : 'road';
  if (graphRegistry.get(cityId)?.[mode]) return graphRegistry.get(cityId).metadata;
  const loadKey = `${cityId}:${mode}`;
  if (graphLoads.has(loadKey)) return graphLoads.get(loadKey);
  const loading = (async () => {
    if (typeof fetcher !== 'function') throw new Error('Fetch API is unavailable for loading the local routing graph.');
    const manifestResponse = await fetcher(`/data/routing/${cityId}.json`, { cache: 'force-cache' });
    if (!manifestResponse.ok) throw new Error(`Routing graph manifest returned HTTP ${manifestResponse.status}.`);
    const manifest = await manifestResponse.json();
    const asset = manifest.metadata[mode === 'road' ? 'roadUrl' : 'tramUrl'];
    if (!asset) throw new Error(`No local ${mode} routing graph is available for this city.`);
    const response = await fetcher(`/data/routing/${asset}`, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${mode} routing graph returned HTTP ${response.status}.`);
    return registerRoutingGraph(cityId, manifest, mode === 'road' ? await response.arrayBuffer() : null,
      mode === 'tram' ? await response.arrayBuffer() : null);
  })();
  graphLoads.set(loadKey, loading);
  try { return await loading; } catch (error) { graphLoads.delete(loadKey); throw error; }
}

export function getRoutingGraphStatus(cityId) {
  const item = graphRegistry.get(cityId);
  return item ? { loaded: Boolean(item.road), roadLoaded: Boolean(item.road), tramLoaded: Boolean(item.tram), version: item.metadata.graphVersion, source: item.metadata.source,
    roadNodes: item.road?.nodeCount || 0, roadEdges: item.road?.edgeCount || 0, tramNodes: item.tram?.nodeCount || 0 }
    : { loaded: false, loading: [...graphLoads.keys()].some(key => key.startsWith(`${cityId}:`)) };
}
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

function cloneGraph(graph) {
  return new Map([...graph].map(([id, node]) => [id, { coordinate: [...node.coordinate], edges: node.edges.map(edge => ({ ...edge })) }]));
}

function projectToSegment(point, a, b) {
  const scaleX = 111.32 * Math.cos(point.lat * Math.PI / 180);
  const px = point.lng * scaleX, py = point.lat * 110.574;
  const ax = a[1] * scaleX, ay = a[0] * 110.574, bx = b[1] * scaleX, by = b[0] * 110.574;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const snapped = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { coordinate: snapped, distanceKm: haversineKm(point, { lat: snapped[0], lng: snapped[1] }) };
}

// Project each stop onto a road edge and split the graph there. This avoids
// snapping to a distant endpoint when a locally supplied corridor is sparse.
function snapToEdge(graph, point, suffix) {
  let match = null;
  for (const [from, node] of graph) for (const edge of node.edges) {
    if (from > edge.to) continue;
    const projection = projectToSegment(point, node.coordinate, graph.get(edge.to).coordinate);
    if (!match || projection.distanceKm < match.distanceKm) match = { from, to: edge.to, ...projection };
  }
  if (!match) return null;
  if (match.distanceKm < 0.001) {
    const from = graph.get(match.from), to = graph.get(match.to);
    const node = haversineKm({ lat: match.coordinate[0], lng: match.coordinate[1] }, { lat: from.coordinate[0], lng: from.coordinate[1] })
      <= haversineKm({ lat: match.coordinate[0], lng: match.coordinate[1] }, { lat: to.coordinate[0], lng: to.coordinate[1] }) ? from : to;
    return { id: key(node.coordinate), coordinate: node.coordinate, distanceKm: match.distanceKm };
  }
  const id = `snap:${suffix}:${key(match.coordinate)}`;
  if (!graph.has(id)) {
    const fromNode = graph.get(match.from), toNode = graph.get(match.to);
    fromNode.edges = fromNode.edges.filter(edge => edge.to !== match.to);
    toNode.edges = toNode.edges.filter(edge => edge.to !== match.from);
    graph.set(id, { coordinate: match.coordinate, edges: [] });
    const toStart = haversineKm({ lat: fromNode.coordinate[0], lng: fromNode.coordinate[1] }, { lat: match.coordinate[0], lng: match.coordinate[1] });
    const toEnd = haversineKm({ lat: toNode.coordinate[0], lng: toNode.coordinate[1] }, { lat: match.coordinate[0], lng: match.coordinate[1] });
    fromNode.edges.push({ to: id, distance: toStart });
    toNode.edges.push({ to: id, distance: toEnd });
    graph.get(id).edges.push({ to: match.from, distance: toStart }, { to: match.to, distance: toEnd });
  }
  return { id, coordinate: match.coordinate, distanceKm: match.distanceKm };
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
  if (!a || !b) return { coordinates: [], distanceKm: 0, source: 'brak danych', algorithm: 'brak', reason: 'Nie wybrano obu punktów.', mode: routingMode(type), valid: false };
  const direct = [coordinate(a), coordinate(b)];
  const directDistanceKm = routeDistance(direct);
  if (provider?.route && type !== 'bus') {
    const coordinates = provider.route(a, b, type) || [];
    const valid = coordinates.length >= 2;
    const distanceKm = routeDistance(coordinates);
    return { coordinates, distanceKm, directDistanceKm, detourRatio: distanceKm / Math.max(0.05, directDistanceKm),
      source: provider.name || 'usługa zewnętrzna', algorithm: provider.algorithm || 'algorytm dostawcy',
      reason: valid ? 'Trasę zwrócił skonfigurowany dostawca zewnętrzny.' : 'Dostawca nie zwrócił geometrii trasy.', mode: routingMode(type), valid };
  }
  if (type === 'metro') return { coordinates: direct, distanceKm: directDistanceKm, directDistanceKm, detourRatio: 1,
    source: 'model bezpośredni UrbanFlow', algorithm: 'przebieg tunelowy bez grafu ulic',
    reason: 'Model metra prowadzi bezpośrednio między wybranymi punktami.', mode: 'direct', valid: true };

  const osmGraph = graphRegistry.get(city?.id);
  if (osmGraph && SURFACE_TYPES.has(type)) {
    const graph = type === 'tram' ? osmGraph.tram : osmGraph.road;
    if (!graph) return { coordinates: [], distanceKm: 0, directDistanceKm, detourRatio: Infinity,
      source: 'Geofabrik OSM regional extract', algorithm: 'lokalny graf OSM',
      reason: type === 'tram' ? 'Brak wiarygodnego grafu torowisk tramwajowych dla tego obszaru.' : 'Brak grafu dla pojazdu.',
      mode: routingMode(type), valid: false };
    return { ...routeOnOsmGraph(a, b, graph), mode: routingMode(type) };
  }
  if (typeof window !== 'undefined' && SURFACE_TYPES.has(type)) return { coordinates: [], distanceKm: 0, directDistanceKm,
    detourRatio: Infinity, source: 'lokalny graf OSM (niedostępny)', algorithm: 'brak trasowania',
    reason: 'Lokalny graf ulic nie został załadowany; nie można zatwierdzić orientacyjnej prostej jako trasy.',
    mode: routingMode(type), valid: false };

  const corridors = RAIL_TYPES.has(type) ? city?.railGeometry : SURFACE_TYPES.has(type) ? city?.roadGeometry : null;
  const graph = buildGraph(corridors);
  const mode = routingMode(type);
  const source = RAIL_TYPES.has(type) ? 'lokalny korytarz kolejowy UrbanFlow' : 'lokalny graf drogowy UrbanFlow';
  if (!graph.size) return { coordinates: direct, distanceKm: directDistanceKm, directDistanceKm, detourRatio: 1,
    source: 'geometria punktów', algorithm: 'bezpośredni fallback',
    reason: 'Brak lokalnego grafu; prosta między punktami jest tylko orientacyjnym fallbackiem, nie trasą.', mode, valid: false };

  const working = cloneGraph(graph);
  const start = snapToEdge(working, a, 'start'); const target = snapToEdge(working, b, 'end');
  const path = start && target ? shortestPath(working, start.id, target.id) : null;
  if (!path) return { coordinates: direct, distanceKm: directDistanceKm, directDistanceKm, detourRatio: 1, source,
    algorithm: 'bezpośredni fallback', reason: 'Brak połączenia w lokalnym grafie; prosta między punktami nie jest wiarygodną trasą.',
    mode, valid: false, snappedDistanceKm: Infinity, maxSnapDistanceKm: Infinity };

  const coordinates = [coordinate(a), start.coordinate, ...path.coordinates.slice(1, -1), target.coordinate, coordinate(b)]
    .filter((item, index, items) => !index || key(item) !== key(items[index - 1]));
  const distanceKm = routeDistance(coordinates);
  const snappedDistanceKm = start.distanceKm + target.distanceKm;
  const maxSnapDistanceKm = Math.max(start.distanceKm, target.distanceKm);
  const detourRatio = distanceKm / Math.max(0.05, directDistanceKm);
  const valid = maxSnapDistanceKm <= ROUTING_QUALITY.maxSnapDistanceKm && detourRatio <= ROUTING_QUALITY.maxDetourRatio;
  const reason = valid
    ? (RAIL_TYPES.has(type) ? 'Wybrano najkrótszy dostępny korytarz kolejowy.' : 'Wybrano najkrótszy dostępny korytarz w lokalnym grafie drogowym.')
    : `Niepewna trasa: odsunięcie od grafu ${maxSnapDistanceKm.toFixed(2)} km, objazd ×${detourRatio.toFixed(1)}. Lokalny graf wymaga uzupełnienia.`;
  return { coordinates, distanceKm, directDistanceKm, detourRatio, source,
    algorithm: 'Dijkstra po lokalnym grafie, dopasowanie do odcinka', reason, mode,
    valid, snappedDistanceKm, maxSnapDistanceKm };
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
  return routeDistance(coordinates);
}

export function routeLineDetails(stops, type, city, provider = null, minuteOfDay = 720) {
  const byId = new Map((city?.points || []).map(point => [point.id, point]));
  const points = (stops || []).map(id => byId.get(id)).filter(Boolean);
  if (points.length < 2) return { coordinates: [], distanceKm: 0, travelMinutes: 0, source: 'brak danych', algorithm: 'brak', reason: 'Potrzebne są co najmniej dwa punkty.', mode: routingMode(type), valid: false };
  const segments = points.slice(1).map((point, index) => routeSegmentDetails(points[index], point, type, city, provider));
  const coordinates = segments.reduce((all, item) => all.concat(all.length ? item.coordinates.slice(1) : item.coordinates), []);
  const vehiclePaths = segments.map(item => item.vehicleCoordinates || item.roadCoordinates || item.coordinates);
  const stopConnectors = [];
  let discontinuity = null;
  const graph = graphRegistry.get(city?.id)?.[type === 'tram' ? 'tram' : 'road'];
  const vehicleCoordinates = vehiclePaths.reduce((all, path, index) => {
    if (!all.length) return [...path];
    const gapKm = path.length ? haversineKm({ lat: all.at(-1)[0], lng: all.at(-1)[1] }, { lat: path[0][0], lng: path[0][1] }) : Infinity;
    let connector = null;
    if (gapKm > 0.001 && graph) connector = routeOnOsmGraph(
      { lat: all.at(-1)[0], lng: all.at(-1)[1] }, { lat: path[0][0], lng: path[0][1] }, graph);
    if (gapKm > 0.001 && !connector?.valid) discontinuity ||= `Przebiegi przy przystanku ${stops[index]} nie łączą się na dopuszczalnej jezdni (przerwa ${Math.round(gapKm * 1000)} m).`;
    if (connector?.valid && connector.roadCoordinates?.length >= 2) stopConnectors.push({ stopId: stops[index], ...connector });
    const bridge = connector?.valid ? connector.roadCoordinates : [];
    return all.concat(bridge.length > 1 ? bridge.slice(1, -1) : [], path.slice(gapKm <= 0.001 ? 1 : 0));
  }, []);
  const routeModes = new Set(segments.map(item => item.mode));
  const fallback = segments.some(item => item.algorithm === 'bezpośredni fallback');
  const valid = segments.every(item => item.valid) && !discontinuity;
  const detourRatio = Math.max(...segments.map(item => item.detourRatio || 1));
  const maxSnapDistanceKm = Math.max(...segments.map(item => item.maxSnapDistanceKm || 0));
  const detail = {
    coordinates, vehicleCoordinates, stopConnectors,
    distanceKm: segments.reduce((sum, item) => sum + (item.roadDistanceKm ?? item.distanceKm), 0)
      + stopConnectors.reduce((sum, item) => sum + (item.roadDistanceKm || 0), 0),
    accessDistanceKm: segments.reduce((sum, item) => sum + (item.accessDistanceKm || 0), 0), source: [...new Set(segments.map(item => item.source))].join(' + '),
    algorithm: fallback ? 'mieszany, zawiera fallback bezpośredni' : [...new Set(segments.map(item => item.algorithm))].join(' + '),
    reason: discontinuity || [...new Set(segments.filter(item => !item.valid).map(item => item.reason))].join(' ') || [...new Set(segments.map(item => item.reason))].join(' '),
    mode: routeModes.size === 1 ? segments[0].mode : 'mixed', valid, detourRatio, maxSnapDistanceKm,
    snappedDistanceKm: segments.reduce((sum, item) => sum + (item.snappedDistanceKm || 0), 0), segments
  };
  detail.travelMinutes = lineMetrics({ type, stops, routeGeometry: vehicleCoordinates.length >= 2 ? vehicleCoordinates : coordinates }, city, minuteOfDay).travelMinutes;
  return detail;
}

export const routingMode = type => type === 'metro' ? 'direct' : type === 'tram' ? 'tramway' : RAIL_TYPES.has(type) ? 'rail-corridor' : 'road';
