const HIGHWAYS = [...new Set(['bus_guideway', 'living_street', 'motorway', 'primary', 'road', 'secondary', 'service', 'tertiary', 'trunk', 'unclassified', 'residential', 'pedestrian', 'track']
  .flatMap(value => [value, `${value}_link`]).concat(['tram', 'level_connector']))].sort();
const EDGE_BYTES = 24;
const MAX_SNAP_KM = 0.12;
const MAX_DETOUR = 4;
const BALANCED_MAX_DISTANCE_RATIO = 1.15;
const CELL_DEGREES = 0.001;
const R = 6371.0088;

export function decodeRoutingGraphBinary(input, bounds = null) {
  const buffer = input instanceof ArrayBuffer ? input : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  if (buffer.byteLength < 20) throw new Error('Routing graph binary is truncated.');
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 85 || view.getUint8(1) !== 70 || view.getUint8(2) !== 71 || view.getUint8(3) !== 50) throw new Error('Routing graph binary has an invalid magic header.');
  if (view.getUint16(4, true) !== 2 || view.getUint16(6, true) !== 20) throw new Error('Unsupported routing graph binary version.');
  const nodeCount = view.getUint32(8, true), edgeCount = view.getUint32(12, true), ruleCount = view.getUint32(16, true);
  const coordinateOffset = 20, adjacencyOffset = coordinateOffset + nodeCount * 8;
  const edgeOffset = adjacencyOffset + (nodeCount + 1) * 4, rulesOffset = edgeOffset + edgeCount * EDGE_BYTES;
  if (rulesOffset + ruleCount * 24 !== buffer.byteLength) throw new Error('Routing graph binary has inconsistent section lengths.');
  const coordinates = new Int32Array(nodeCount * 2), offsets = new Uint32Array(nodeCount + 1);
  const targets = new Uint32Array(edgeCount), lengthsMm = new Uint32Array(edgeCount), timesMs = new Uint32Array(edgeCount);
  const wayIds = new Float64Array(edgeCount), highwayCodes = new Uint8Array(edgeCount), levels = new Int8Array(edgeCount), flags = new Uint8Array(edgeCount);
  for (let i = 0; i < nodeCount * 2; i += 1) coordinates[i] = view.getInt32(coordinateOffset + i * 4, true);
  for (let i = 0; i <= nodeCount; i += 1) offsets[i] = view.getUint32(adjacencyOffset + i * 4, true);
  for (let i = 0; i < edgeCount; i += 1) {
    const p = edgeOffset + i * EDGE_BYTES;
    targets[i] = view.getUint32(p, true); lengthsMm[i] = view.getUint32(p + 4, true); timesMs[i] = view.getUint32(p + 8, true);
    wayIds[i] = Number(view.getBigUint64(p + 12, true)); highwayCodes[i] = view.getUint8(p + 20); levels[i] = view.getInt8(p + 21); flags[i] = view.getUint8(p + 22);
  }
  const nodeDegrees = new Uint16Array(nodeCount);
  for (let node = 0; node < nodeCount; node += 1) {
    nodeDegrees[node] += offsets[node + 1] - offsets[node];
    for (let edge = offsets[node]; edge < offsets[node + 1]; edge += 1) nodeDegrees[targets[edge]] += 1;
  }
  const turnRules = new Map();
  for (let i = 0; i < ruleCount; i += 1) {
    const p = rulesOffset + i * 24, node = view.getUint32(p, true);
    const rule = { fromWay: Number(view.getBigUint64(p + 4, true)), toWay: Number(view.getBigUint64(p + 12, true)), kind: view.getUint32(p + 20, true) ? 'only' : 'no' };
    if (!turnRules.has(node)) turnRules.set(node, []);
    turnRules.get(node).push(rule);
  }
  const graph = { nodeCount, edgeCount, coordinates, offsets, targets, lengthsMm, timesMs, wayIds, highwayCodes, levels, flags, nodeDegrees, turnRules, bounds,
    coordinate(node) { return [coordinates[node * 2] / 1e7, coordinates[node * 2 + 1] / 1e7]; },
    edgesFrom(node) {
      const result = [];
      for (let i = offsets[node]; i < offsets[node + 1]; i += 1) result.push({ to: targets[i], distanceKm: lengthsMm[i] / 1e6,
        travelSeconds: timesMs[i] / 1000, wayId: wayIds[i], highway: HIGHWAYS[highwayCodes[i]] || 'unknown', level: levels[i],
        bridge: Boolean(flags[i] & 1), tunnel: Boolean(flags[i] & 2), connector: Boolean(flags[i] & 4) });
      return result;
    } };
  if (bounds) buildSpatialIndex(graph, bounds);
  return graph;
}

export function buildSpatialIndex(graph, bounds = graph.bounds) {
  if (!bounds) throw new Error('Routing graph bounds are required for point matching.');
  const width = Math.ceil((bounds.east - bounds.west) / CELL_DEGREES) + 1;
  const height = Math.ceil((bounds.north - bounds.south) / CELL_DEGREES) + 1;
  const cellOf = node => {
    const lat = graph.coordinates[node * 2] / 1e7, lng = graph.coordinates[node * 2 + 1] / 1e7;
    return Math.max(0, Math.min(height - 1, Math.floor((lat - bounds.south) / CELL_DEGREES))) * width +
      Math.max(0, Math.min(width - 1, Math.floor((lng - bounds.west) / CELL_DEGREES)));
  };
  const counts = new Uint32Array(width * height);
  for (let node = 0; node < graph.nodeCount; node += 1) counts[cellOf(node)] += 1;
  const offsets = new Uint32Array(counts.length + 1);
  for (let i = 0; i < counts.length; i += 1) offsets[i + 1] = offsets[i] + counts[i];
  const cursor = offsets.slice(0, -1), nodes = new Uint32Array(graph.nodeCount);
  for (let node = 0; node < graph.nodeCount; node += 1) nodes[cursor[cellOf(node)]++] = node;
  graph.spatial = { bounds, width, height, offsets, nodes };
  return graph.spatial;
}

function haversineKm(a, b) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function project(point, a, b) {
  const scale = Math.cos(point[0] * Math.PI / 180), xScale = 111.32 * scale;
  const px = point[1] * xScale, py = point[0] * 110.574, ax = a[1] * xScale, ay = a[0] * 110.574;
  const bx = b[1] * xScale, by = b[0] * 110.574, dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, coordinate, distanceKm: haversineKm(point, coordinate) };
}

function snapEdges(graph, point, { limit = 12 } = {}) {
  if (!graph.spatial) buildSpatialIndex(graph);
  const { bounds, width, height, offsets, nodes } = graph.spatial;
  const cellLat = Math.floor((point[0] - bounds.south) / CELL_DEGREES), cellLng = Math.floor((point[1] - bounds.west) / CELL_DEGREES);
  const found = new Map();
  for (const searchKm of [0.006, 0.012, 0.024, 0.048]) {
    const radius = Math.ceil(searchKm / CELL_DEGREES);
    for (let y = Math.max(0, cellLat - radius); y <= Math.min(height - 1, cellLat + radius); y += 1) {
    for (let x = Math.max(0, cellLng - radius); x <= Math.min(width - 1, cellLng + radius); x += 1) {
      const cell = y * width + x;
      for (let p = offsets[cell]; p < offsets[cell + 1]; p += 1) {
        const from = nodes[p], a = graph.coordinate(from);
        for (let edge = graph.offsets[from]; edge < graph.offsets[from + 1]; edge += 1) {
          if (graph.flags[edge] & 4) continue;
          const to = graph.targets[edge], projection = project(point, a, graph.coordinate(to));
          if (projection.distanceKm > MAX_SNAP_KM) continue;
          const key = `${from}:${edge}`;
          if (!found.has(key)) found.set(key, { from, to, edge, wayId: graph.wayIds[edge], ...projection });
        }
      }
    }
    }
    if (found.size) break;
  }
  return [...found.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

class MinHeap {
  values = [];
  push(item) {
    let i = this.values.length; this.values.push(item);
    while (i) { const parent = (i - 1) >> 1; if (this.values[parent].cost <= item.cost) break; this.values[i] = this.values[parent]; i = parent; }
    this.values[i] = item;
  }
  pop() {
    if (!this.values.length) return null;
    const root = this.values[0], tail = this.values.pop();
    if (this.values.length) {
      let i = 0;
      while (true) { let child = i * 2 + 1; if (child >= this.values.length) break; if (child + 1 < this.values.length && this.values[child + 1].cost < this.values[child].cost) child += 1;
        if (this.values[child].cost >= tail.cost) break; this.values[i] = this.values[child]; i = child; }
      this.values[i] = tail;
    }
    return root;
  }
}

function turnAllowed(graph, node, incomingWay, outgoingWay) {
  if (!incomingWay || !outgoingWay) return true;
  const rules = graph.turnRules.get(node);
  if (!rules) return true;
  const only = rules.filter(rule => rule.kind === 'only' && rule.fromWay === incomingWay);
  if (only.length && !only.some(rule => rule.toWay === outgoingWay)) return false;
  return !rules.some(rule => rule.kind === 'no' && rule.fromWay === incomingWay && rule.toWay === outgoingWay);
}

function search(graph, starts, targets, objective = 'time') {
  const restrictions = new Set(graph.turnRules.keys()), stateIds = new Map(), stateNodes = [], stateWays = [], dist = [], previous = [], previousEdges = [], roots = [];
  const stateFor = (node, way) => {
    const key = restrictions.has(node) ? `${node}:${way}` : `${node}:0`;
    if (stateIds.has(key)) return stateIds.get(key);
    const id = stateNodes.length; stateIds.set(key, id); stateNodes.push(node); stateWays.push(restrictions.has(node) ? way : 0);
    dist.push(Infinity); previous.push(-1); previousEdges.push(-1); roots.push(-1); return id;
  };
  const heap = new MinHeap();
  starts.forEach((start, index) => {
    const id = stateFor(start.to, start.wayId), cost = objective === 'distance'
      ? start.partialKm + start.accessKm : start.partialMs + start.accessMs;
    if (cost < dist[id]) { dist[id] = cost; previous[id] = -1; roots[id] = index; heap.push({ id, cost }); }
  });
  let best = null;
  while (heap.values.length) {
    const current = heap.pop();
    if (current.cost !== dist[current.id] || (best && current.cost >= best.cost)) continue;
    const node = stateNodes[current.id], incoming = stateWays[current.id];
    for (const target of targets) {
      if (target.from === node && turnAllowed(graph, node, incoming, target.wayId)) {
        const cost = current.cost + (objective === 'distance'
          ? target.partialKm + target.accessKm : target.partialMs + target.accessMs);
        if (!best || cost < best.cost) best = { cost, state: current.id, target };
      }
    }
    for (let edge = graph.offsets[node]; edge < graph.offsets[node + 1]; edge += 1) {
      const way = graph.wayIds[edge];
      if (!turnAllowed(graph, node, incoming, way)) continue;
      const next = graph.targets[edge], nextWay = way || incoming;
      const nextState = stateFor(next, nextWay), nextCost = current.cost + (objective === 'distance'
        ? graph.lengthsMm[edge] / 1e6 : graph.timesMs[edge]);
      if (nextCost < dist[nextState]) { dist[nextState] = nextCost; previous[nextState] = current.id; previousEdges[nextState] = edge; roots[nextState] = roots[current.id]; heap.push({ id: nextState, cost: nextCost }); }
    }
  }
  if (!best) return null;
  const states = [];
  for (let state = best.state; state >= 0; state = previous[state]) states.unshift(state);
  const start = starts[roots[best.state]];
  const pathNodes = states.map(state => stateNodes[state]);
  const coordinates = [start.coordinate, ...pathNodes.map(node => graph.coordinate(node)), best.target.coordinate];
  const pathEdges = [start.edge, ...states.slice(1).map(state => previousEdges[state]), best.target.edge];
  const bridgeEdges = [...new Set(pathEdges.filter(edge => edge >= 0 && graph.flags[edge] & 1))];
  const edgeDistanceKm = pathEdges.slice(1, -1).reduce((sum, edge) => sum + graph.lengthsMm[edge] / 1e6, 0);
  const distanceKm = start.accessKm + start.partialKm + edgeDistanceKm + best.target.partialKm + best.target.accessKm;
  const durationMs = start.accessMs + start.partialMs + pathEdges.slice(1, -1).reduce((sum, edge) => sum + graph.timesMs[edge], 0) + best.target.partialMs + best.target.accessMs;
  return { coordinates, nodeIds: pathNodes, edgeIds: pathEdges,
    durationMs, start, target: best.target, bridgeCount: bridgeEdges.length,
    bridgeWays: bridgeEdges.map(edge => graph.wayIds[edge]), distanceKm };
}

function sameEdgePath(starts, targets, graph, objective = 'distance') {
  let best = null;
  for (const start of starts) for (const target of targets) {
    if (start.from === target.from && start.edge === target.edge && target.t >= start.t) {
      const length = target.t - start.t;
      const distanceKm = start.accessKm + graph.lengthsMm[start.edge] / 1e6 * length + target.accessKm;
      const durationMs = start.accessMs + start.partialMs * length / Math.max(0.000001, 1 - start.t) + target.accessMs;
      const cost = objective === 'time' ? durationMs : distanceKm;
      if (!best || cost < best.cost) best = { cost, durationMs, distanceKm, coordinates: [start.coordinate, target.coordinate], nodeIds: [], edgeIds: [start.edge], start, target,
        bridgeCount: graph.flags[start.edge] & 1 ? 1 : 0,
        bridgeWays: graph.flags[start.edge] & 1 ? [graph.wayIds[start.edge]] : [] };
    }
  }
  return best;
}

function pointLineDistanceMeters(point, start, end) {
  const scale = Math.cos(point[0] * Math.PI / 180), x = lng => lng * 111320 * scale, y = lat => lat * 110574;
  const px = x(point[1]), py = y(point[0]), ax = x(start[1]), ay = y(start[0]), bx = x(end[1]), by = y(end[0]);
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplifyPath(graph, coordinates, nodeIds, edgeIds) {
  if (coordinates.length <= 2 || !nodeIds.length) return coordinates;
  const anchors = [0];
  for (let i = 0; i < nodeIds.length; i += 1) {
    const node = nodeIds[i];
    if (graph.wayIds[edgeIds[i]] !== graph.wayIds[edgeIds[i + 1]] || graph.turnRules.has(node) || graph.nodeDegrees[node] > 4) anchors.push(i + 1);
  }
  anchors.push(coordinates.length - 1);
  const keep = new Set(anchors), toleranceM = 2;
  const simplifyRange = (start, end) => {
    if (end <= start + 1) return;
    let farthest = -1, maxDistance = toleranceM;
    for (let i = start + 1; i < end; i += 1) {
      const distance = pointLineDistanceMeters(coordinates[i], coordinates[start], coordinates[end]);
      if (distance > maxDistance) { maxDistance = distance; farthest = i; }
    }
    if (farthest >= 0) { keep.add(farthest); simplifyRange(start, farthest); simplifyRange(farthest, end); }
  };
  for (let i = 1; i < anchors.length; i += 1) simplifyRange(anchors[i - 1], anchors[i]);
  return [...keep].sort((a, b) => a - b).map(index => coordinates[index]);
}

function candidatesFor(graph, point, limit = 96) {
  return snapEdges(graph, point, { limit }).map(edge => {
    const lengthKm = graph.lengthsMm[edge.edge] / 1e6;
    return { ...edge, accessKm: edge.distanceKm, accessMs: edge.distanceKm * 1000 / (4 / 3.6) * 1000,
      partialKm: lengthKm * (1 - edge.t), partialMs: graph.timesMs[edge.edge] * (1 - edge.t) };
  });
}

export function diagnoseOsmRoute(a, b, graph) {
  const pointA = [Number(a.lat), Number(a.lng)], pointB = [Number(b.lat), Number(b.lng)];
  const describe = point => snapEdges(graph, point, { limit: 24 }).map(edge => ({ wayId: edge.wayId,
    highway: HIGHWAYS[graph.highwayCodes[edge.edge]] || 'unknown', level: edge.level,
    edge: `${edge.from}->${edge.to}`, projection: edge.coordinate, offsetMeters: Math.round(edge.distanceKm * 1000),
    directionT: Number(edge.t.toFixed(3)), bridge: Boolean(graph.flags[edge.edge] & 1) }));
  const variants = {};
  for (const strategy of ['shortest', 'fastest', 'balanced']) variants[strategy] = routeOnOsmGraph(a, b, graph, { strategy });
  variants.shortest12Candidates = routeOnOsmGraph(a, b, graph, { strategy: 'shortest', candidateLimit: 12 });
  variants.shortest48Candidates = routeOnOsmGraph(a, b, graph, { strategy: 'shortest', candidateLimit: 48 });
  return { origin: pointA, destination: pointB, candidates: { origin: describe(pointA), destination: describe(pointB) }, variants };
}

export function routeOnOsmGraph(a, b, graph, { strategy = 'balanced', candidateLimit = 96 } = {}) {
  if (!a || !b || !graph) return { valid: false, coordinates: [], reason: 'Brak załadowanego lokalnego grafu drogowego.' };
  const pointA = [Number(a.lat), Number(a.lng)], pointB = [Number(b.lat), Number(b.lng)];
  const starts = candidatesFor(graph, pointA, candidateLimit);
  const targets = candidatesFor(graph, pointB, candidateLimit).map(edge => ({ ...edge,
    partialKm: graph.lengthsMm[edge.edge] / 1e6 * edge.t,
    partialMs: graph.timesMs[edge.edge] * edge.t }));
  if (!starts.length || !targets.length) return { valid: false, coordinates: [], source: 'OpenStreetMap / Geofabrik', algorithm: 'Dijkstra po skierowanym grafie OSM', reason: `Nie znaleziono dopuszczalnej drogi w promieniu ${MAX_SNAP_KM * 1000} m od ${!starts.length ? 'przystanku początkowego' : 'przystanku końcowego'}.`, maxSnapDistanceKm: Infinity };
  const byObjective = objective => {
    let candidate = search(graph, starts, targets, objective);
    const sameEdge = sameEdgePath(starts, targets, graph, objective);
    if (sameEdge && (!candidate || (objective === 'time'
      ? sameEdge.durationMs < candidate.durationMs : sameEdge.distanceKm < candidate.distanceKm))) candidate = sameEdge;
    return candidate;
  };
  let path, shortestPath = null, fastestPath = null, balancedReason = '';
  if (strategy === 'fastest') path = fastestPath = byObjective('time');
  else if (strategy === 'shortest') path = shortestPath = byObjective('distance');
  else {
    shortestPath = byObjective('distance');
    fastestPath = byObjective('time');
    const shortestRouteKm = shortestPath?.distanceKm || 0;
    const fastestRouteKm = fastestPath?.distanceKm || Infinity;
    const withinDistanceTolerance = shortestRouteKm > 0 && fastestRouteKm <= shortestRouteKm * BALANCED_MAX_DISTANCE_RATIO;
    path = withinDistanceTolerance ? fastestPath : shortestPath;
    balancedReason = withinDistanceTolerance
      ? `Wybrano szybszy wariant, bo jego długość mieści się w tolerancji +${Math.round((BALANCED_MAX_DISTANCE_RATIO - 1) * 100)}% względem najkrótszej drogi.`
      : `Wybrano najkrótszy wariant; najszybszy przekracza tolerancję długości +${Math.round((BALANCED_MAX_DISTANCE_RATIO - 1) * 100)}%.`;
  }
  if (!path) return { valid: false, coordinates: [], source: 'OpenStreetMap / Geofabrik', algorithm: 'Dijkstra po skierowanym grafie OSM', reason: 'Brak połączenia w lokalnym grafie z uwzględnieniem kierunku ulic i ograniczeń skrętu.', maxSnapDistanceKm: Math.max(starts[0].distanceKm, targets[0].distanceKm) };
  const startAccess = [pointA, path.start.coordinate], endAccess = [path.target.coordinate, pointB];
  const roadCoordinates = simplifyPath(graph, path.coordinates, path.nodeIds || [], path.edgeIds || []).map(point => [...point]);
  if (roadCoordinates.length >= 2) {
    roadCoordinates[0] = path.start.coordinate; roadCoordinates[roadCoordinates.length - 1] = path.target.coordinate;
  }
  const coordinates = [...startAccess, ...roadCoordinates.slice(1, -1), ...endAccess]
    .filter((item, index, list) => !index || item[0] !== list[index - 1][0] || item[1] !== list[index - 1][1]);
  const roadDistanceKm = path.distanceKm - path.start.accessKm - path.target.accessKm;
  const directKm = haversineKm(pointA, pointB), maxSnapDistanceKm = Math.max(path.start.distanceKm, path.target.distanceKm);
  const routeDistanceKm = roadDistanceKm + path.start.accessKm + path.target.accessKm;
  const detourRatio = routeDistanceKm / Math.max(0.05, directKm);
  const valid = maxSnapDistanceKm <= MAX_SNAP_KM;
  const accessSeconds = (path.start.accessMs + path.target.accessMs) / 1000;
  const roadTravelSeconds = Math.max(0, path.durationMs / 1000 - accessSeconds);
  const accessWarning = maxSnapDistanceKm >= 0.06;
  const detourWarning = detourRatio > MAX_DETOUR || accessWarning;
  const routeReason = valid ? (detourRatio > MAX_DETOUR
    ? `Połączenie jest osiągalne po drogach OSM, lecz objazd ×${detourRatio.toFixed(2)} przekracza próg ostrzegawczy${path.bridgeCount ? `; trasa zawiera ${path.bridgeCount} odcinków mostowych` : ''}. Sprawdź przebieg przed zatwierdzeniem.`
    : 'Połączenie znaleziono w lokalnym grafie OSM; krótki dostęp do jezdni pokazano osobno.')
    : `Odrzucono trasę: odsunięcie ${maxSnapDistanceKm.toFixed(3)} km, objazd ×${detourRatio.toFixed(2)}; nie wykryto przeprawy mostowej.`;
  return { valid, coordinates: valid ? coordinates : [], vehicleCoordinates: valid ? roadCoordinates : [], roadCoordinates, roadDistanceKm,
    accessDistanceKm: path.start.accessKm + path.target.accessKm, distanceKm: routeDistanceKm,
    directDistanceKm: directKm, detourRatio, maxSnapDistanceKm,
    snappedDistanceKm: path.start.distanceKm + path.target.distanceKm,
    accessSegments: [startAccess, endAccess], source: 'Geofabrik OSM regional extract (lokalny graf ODbL)',
    algorithm: strategy === 'fastest' ? 'Dijkstra: minimalny szacowany czas, krawędzie skierowane i ograniczenia skrętu OSM'
      : strategy === 'shortest' ? 'Dijkstra: minimalna długość, krawędzie skierowane i ograniczenia skrętu OSM'
        : `Wariant zrównoważony (+${Math.round((BALANCED_MAX_DISTANCE_RATIO - 1) * 100)}% tolerancji długości); Dijkstra po grafie skierowanym z ograniczeniami skrętu OSM`,
    reason: valid && accessWarning
      ? `${routeReason} Dojście do jezdni ma ${Math.round(maxSnapDistanceKm * 1000)} m; przerywana linia oznacza dostęp pieszy, nie przebieg autobusu.`
      : routeReason,
    bridgeCount: path.bridgeCount, bridgeWays: path.bridgeWays || [], detourWarning, accessWarning,
    travelSeconds: path.durationMs / 1000, roadTravelSeconds, accessSeconds,
    startSnapDistanceKm: path.start.distanceKm, endSnapDistanceKm: path.target.distanceKm,
    strategy, candidateLimit, matchedWays: [...new Set((path.edgeIds || []).filter(edge => edge >= 0).map(edge => graph.wayIds[edge]))],
    snapMatches: [path.start, path.target].map(match => ({ wayId: match.wayId, from: match.from, to: match.to,
      coordinate: match.coordinate, offsetMeters: Math.round(match.distanceKm * 1000), fractionAlongDirectedEdge: Number(match.t.toFixed(3)) })),
    ...(strategy === 'balanced' ? { shortestDistanceKm: shortestPath?.distanceKm, fastestDistanceKm: fastestPath?.distanceKm,
      fastestTravelSeconds: fastestPath?.durationMs / 1000, balancedReason } : {}) };
}
