import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from '../public/js/cities.js';
import { readOsmPbf } from './osm-pbf-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = Object.freeze({
  url: 'https://download.geofabrik.de/europe/poland/malopolskie-261117.osm.pbf',
  file: 'malopolskie-261117.osm.pbf',
  md5: 'c8aacea203bd8ce5bde71195ebb94197',
  sha256: 'ef2cd6018902dc64871ca98ec827bf8628c6172b29f96fde7c4e722584c566e1',
  dataTimestamp: '2026-11-16T21:22:36Z',
  provider: 'Geofabrik regional extract',
  sourcePage: 'https://download.geofabrik.de/europe/poland/malopolskie.html'
});
const GENERATOR_VERSION = 'urbanflow-osm-graph-2';
const ROAD_SPEED_KMH = Object.freeze({ motorway: 90, trunk: 70, primary: 50, secondary: 45, tertiary: 40,
  unclassified: 30, residential: 30, living_street: 10, service: 20, road: 25, bus_guideway: 25,
  pedestrian: 5, track: 15 });
const ALLOWED_HIGHWAYS = new Set(Object.keys(ROAD_SPEED_KMH).flatMap(value => [value, `${value}_link`]));
const HIGHWAYS = [...new Set([...ALLOWED_HIGHWAYS, 'tram', 'level_connector'])].sort();
const HIGHWAY_CODES = new Map(HIGHWAYS.map((value, index) => [value, index]));

function parseArgs(argv) {
  const result = { input: null, output: path.join(root, 'public', 'data', 'routing', 'krakow.json'), marginKm: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') result.input = path.resolve(argv[++index]);
    else if (argv[index] === '--output') result.output = path.resolve(argv[++index]);
    else if (argv[index] === '--margin-km') result.marginKm = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isFinite(result.marginKm) || result.marginKm < 0 || result.marginKm > 15) throw new Error('--margin-km must be between 0 and 15.');
  return result;
}

async function downloadSource(target) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.download`;
  const command = process.platform === 'win32' ? 'curl.exe' : 'curl';
  await new Promise((resolve, reject) => {
    const child = spawn(command, ['--location', '--fail', '--retry', '2', '--silent', '--show-error', '--output', temporary, SOURCE.url], { stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`curl failed with exit code ${code}.`)));
  });
  await (await import('node:fs/promises')).rename(temporary, target);
}

async function fileDigests(filename) {
  const hash = createHash('sha256'); const md5 = createHash('md5');
  for await (const chunk of createReadStream(filename)) { hash.update(chunk); md5.update(chunk); }
  return { sha256: hash.digest('hex'), md5: md5.digest('hex') };
}

const accessAllowed = tags => {
  const isAllowed = (key, value) => ['yes', 'designated', 'permissive', 'official', 'public'].includes(String(value || '').toLowerCase())
    || (key === 'bus' && ['destination', 'delivery'].includes(String(value || '').toLowerCase()));
  if (tags.bus) return isAllowed('bus', tags.bus);
  for (const key of ['psv', 'motor_vehicle', 'vehicle', 'access']) if (tags[key]) return isAllowed(key, tags[key]);
  return true;
};

export function roadWay(tags) {
  const highway = tags.highway;
  if (!highway || !ALLOWED_HIGHWAYS.has(highway) || tags.area === 'yes' || !accessAllowed(tags)) return false;
  if (highway === 'bus_guideway' && !['yes', 'designated', 'permissive'].includes(tags.bus)) return false;
  if (['pedestrian', 'track'].includes(highway) && !['yes', 'designated', 'permissive'].includes(tags.bus)) return false;
  if (['reversible', 'alternating'].includes(tags['oneway:bus'] || tags.oneway)) return false;
  return true;
}

function tramWay(tags) {
  if (tags.railway !== 'tram' || ['yard', 'siding', 'spur', 'crossover'].includes(tags.service)) return false;
  return !['no', 'private'].includes(tags.access) && !['no', 'private'].includes(tags.tram)
    && !['reversible', 'alternating'].includes(tags['oneway:tram'] || tags.oneway);
}

function parseSpeed(tags, kind) {
  const highway = tags.highway || 'residential';
  let speed = kind === 'tram' ? 25 : ROAD_SPEED_KMH[highway.replace(/_link$/, '')] || 25;
  const raw = tags.maxspeed || (kind === 'tram' ? tags['maxspeed:tram'] : tags['maxspeed:bus']);
  if (raw) {
    const match = String(raw).match(/\d+(?:\.\d+)?/);
    if (match) speed = Number(match[0]) * (/mph/i.test(raw) ? 1.60934 : /knots?/i.test(raw) ? 1.852 : 1);
  }
  return Math.max(5, Math.min(kind === 'tram' ? 80 : 130, speed));
}

function layerOf(tags) {
  const explicit = Number(tags.layer);
  if (tags.layer !== undefined && Number.isFinite(explicit)) return Math.max(-5, Math.min(5, explicit));
  if (tags.bridge && tags.bridge !== 'no') return 1;
  if (tags.tunnel && tags.tunnel !== 'no') return -1;
  return 0;
}

function oneWayDirection(tags, kind) {
  const value = String(tags[kind === 'tram' ? 'oneway:tram' : 'oneway:bus'] ?? tags['oneway:psv'] ?? tags.oneway ?? '').toLowerCase();
  if (value === '-1') return -1;
  if (['yes', 'true', '1'].includes(value) || (!value && (tags.junction === 'roundabout' || ['motorway', 'motorway_link'].includes(tags.highway)))) return 1;
  return 0;
}

function inside(point, bounds) { return point.lat >= bounds.south && point.lat <= bounds.north && point.lng >= bounds.west && point.lng <= bounds.east; }

async function accessBounds(city, marginKm) {
  const stops = JSON.parse(await readFile(path.join(root, 'public', 'data', 'krakow-stops.json'), 'utf8')).stops;
  const points = [...city.points, ...stops];
  const latBuffer = marginKm / 110.574; const lngBuffer = marginKm / (111.32 * Math.cos(50 * Math.PI / 180));
  return { south: Math.min(...points.map(point => point.lat)) - latBuffer,
    north: Math.max(...points.map(point => point.lat)) + latBuffer,
    west: Math.min(...points.map(point => point.lng)) - lngBuffer,
    east: Math.max(...points.map(point => point.lng)) + lngBuffer };
}

function tagRestriction(tags) {
  const value = tags['restriction:bus'] || tags['restriction:psv'] || tags.restriction;
  if (!value || tags.except?.split(';').map(item => item.trim()).some(item => ['bus', 'psv'].includes(item))) return null;
  if (value.startsWith('no_')) return 'no';
  if (value.startsWith('only_')) return 'only';
  return null;
}

export function graphFor(ways, coordinates, restrictions, bounds, kind) {
  const nodes = []; const nodeLevels = []; const nodeIndexes = new Map(); const osmNodeIndexes = new Map(); const edges = [];
  const endpointLayers = new Map(); const skipped = { clippedSegments: 0, zeroLengthSegments: 0, waysWithoutGeometry: 0 };
  const ensureNode = (osmId, level) => {
    const key = `${osmId}:${level}`;
    if (nodeIndexes.has(key)) return nodeIndexes.get(key);
    const point = coordinates.get(osmId); if (!point || !inside(point, bounds)) return -1;
    const index = nodes.length; nodes.push([Math.round(point.lat * 1e7), Math.round(point.lng * 1e7)]); nodeLevels.push(level); nodeIndexes.set(key, index);
    if (!osmNodeIndexes.has(osmId)) osmNodeIndexes.set(osmId, []);
    osmNodeIndexes.get(osmId).push(index);
    return index;
  };
  for (const way of ways) {
    const level = layerOf(way.tags); const refs = way.refs;
    if (refs.length < 2) { skipped.waysWithoutGeometry += 1; continue; }
    const points = refs.map(id => coordinates.get(id));
    if (points[0] && inside(points[0], bounds)) {
      const index = ensureNode(refs[0], level); if (index >= 0) { if (!endpointLayers.has(refs[0])) endpointLayers.set(refs[0], new Set()); endpointLayers.get(refs[0]).add(index); }
    }
    const last = refs.length - 1;
    if (points[last] && inside(points[last], bounds)) {
      const index = ensureNode(refs[last], level); if (index >= 0) { if (!endpointLayers.has(refs[last])) endpointLayers.set(refs[last], new Set()); endpointLayers.get(refs[last]).add(index); }
    }
    let segments = 0;
    for (let index = 1; index < refs.length; index += 1) {
      const a = points[index - 1], b = points[index];
      if (!a || !b || !inside(a, bounds) || !inside(b, bounds)) { skipped.clippedSegments += 1; continue; }
      const lengthM = haversineMeters(a, b);
      if (lengthM < 0.5) { skipped.zeroLengthSegments += 1; continue; }
      const from = ensureNode(refs[index - 1], level); const to = ensureNode(refs[index], level);
      if (from < 0 || to < 0) { skipped.clippedSegments += 1; continue; }
      const speedKmh = parseSpeed(way.tags, kind); const travelSeconds = lengthM / (speedKmh / 3.6);
      const segment = { from, to, lengthM, travelSeconds, wayId: way.id, highway: way.tags.highway || 'tram', level,
        bridge: way.tags.bridge && way.tags.bridge !== 'no' ? 1 : 0, tunnel: way.tags.tunnel && way.tags.tunnel !== 'no' ? 1 : 0 };
      const direction = oneWayDirection(way.tags, kind);
      if (direction >= 0) edges.push(segment);
      if (direction <= 0) edges.push({ ...segment, from: to, to: from });
      segments += 1;
    }
    if (!segments) skipped.waysWithoutGeometry += 1;
  }

  // OSM shared node IDs represent legal connections. The same ID may be
  // connected across levels only where a way endpoint proves a shared OSM
  // junction (e.g. a bridge abutment meeting a road that continues through).
  let levelConnectors = 0;
  for (const osmId of endpointLayers.keys()) {
    const list = osmNodeIndexes.get(osmId) || [];
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) {
      if (nodeLevels[list[a]] === nodeLevels[list[b]]) continue;
      edges.push({ from: list[a], to: list[b], lengthM: 0, travelSeconds: 0, wayId: 0, highway: 'level_connector', level: 0, connector: 1 });
      edges.push({ from: list[b], to: list[a], lengthM: 0, travelSeconds: 0, wayId: 0, highway: 'level_connector', level: 0, connector: 1 });
      levelConnectors += 2;
    }
  }

  const turnRules = [];
  for (const restriction of restrictions) {
    const from = restriction.members.find(member => member.role === 'from' && member.type === 'way');
    const to = restriction.members.find(member => member.role === 'to' && member.type === 'way');
    const viaNodes = restriction.members.filter(member => member.role === 'via' && member.type === 'node');
    if (!from || !to || viaNodes.length !== 1) continue;
    const viaIndexes = osmNodeIndexes.get(viaNodes[0].ref) || [];
    for (const via of viaIndexes) turnRules.push([via, from.ref, to.ref, restriction.kind]);
  }
  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (const edge of edges) adjacency[edge.from].push([edge.to, Math.round(edge.lengthM), Math.round(edge.travelSeconds), edge.wayId, edge.highway, edge.level, edge.bridge, edge.tunnel, edge.connector || 0]);
  for (const arcs of adjacency) arcs.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
  const edgeCount = adjacency.reduce((sum, arcs) => sum + arcs.length, 0);
  return { graph: { nodes, adjacency, turnRules }, stats: { nodes: nodes.length, directedEdges: edgeCount, turnRules: turnRules.length, levelConnectors,
    wideWayIds: [...new Set(edges.map(edge => edge.wayId).filter(Boolean))].filter(id => id > 0xffffffff).length, ...skipped } };
}

export function encodeRoutingGraphBinary(graph) {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.adjacency.reduce((sum, arcs) => sum + arcs.length, 0);
  const ruleCount = graph.turnRules.length;
  const coordinateOffset = 20;
  const adjacencyOffset = coordinateOffset + nodeCount * 8;
  const edgeOffset = adjacencyOffset + (nodeCount + 1) * 4;
  const rulesOffset = edgeOffset + edgeCount * 24;
  const bytes = new Uint8Array(rulesOffset + ruleCount * 24);
  const view = new DataView(bytes.buffer);
  bytes.set([85, 70, 71, 50]); // UFG2: 64-bit OSM way identifiers
  view.setUint16(4, 2, true); view.setUint16(6, 20, true);
  view.setUint32(8, nodeCount, true); view.setUint32(12, edgeCount, true); view.setUint32(16, ruleCount, true);
  let edgeIndex = 0;
  for (let node = 0; node < nodeCount; node += 1) {
    view.setInt32(coordinateOffset + node * 8, graph.nodes[node][0], true);
    view.setInt32(coordinateOffset + node * 8 + 4, graph.nodes[node][1], true);
    view.setUint32(adjacencyOffset + node * 4, edgeIndex, true);
    for (const edge of graph.adjacency[node]) {
      const offset = edgeOffset + edgeIndex * 24;
      view.setUint32(offset, edge[0], true);
      view.setUint32(offset + 4, Math.max(0, Math.round(edge[1] * 1000)), true);
      view.setUint32(offset + 8, Math.max(0, Math.round(edge[2] * 1000)), true);
      view.setBigUint64(offset + 12, BigInt(edge[3]), true);
      view.setUint8(offset + 20, HIGHWAY_CODES.get(edge[4]) ?? HIGHWAY_CODES.get('road'));
      view.setInt8(offset + 21, edge[5]);
      view.setUint8(offset + 22, (edge[6] ? 1 : 0) | (edge[7] ? 2 : 0) | (edge[8] ? 4 : 0));
      edgeIndex += 1;
    }
  }
  view.setUint32(adjacencyOffset + nodeCount * 4, edgeIndex, true);
  graph.turnRules.forEach((rule, index) => {
    const offset = rulesOffset + index * 24;
    view.setUint32(offset, rule[0], true); view.setBigUint64(offset + 4, BigInt(rule[1]), true);
    view.setBigUint64(offset + 12, BigInt(rule[2]), true); view.setUint32(offset + 20, rule[3] === 'only' ? 1 : 0, true);
  });
  return bytes;
}

function haversineMeters(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function buildRoutingGraph({ input, output, marginKm = 3 } = {}) {
  const city = CITIES.krakow; const bounds = await accessBounds(city, marginKm);
  const coordinates = new Map(); const roadWays = []; const tramWays = []; const restrictions = []; const localWayIds = new Set();
  let pbfHeader = null; let seenNodes = 0; let seenWays = 0; let seenRelations = 0;
  const nodeFilter = point => inside({ lat: point.lat, lng: point.lon }, bounds);
  await readOsmPbf(input, {
    header: header => { pbfHeader = header; },
    node: node => { coordinates.set(node.id, { lat: node.lat, lng: node.lon }); seenNodes += 1; },
    nodeFilter,
    way: way => {
      seenWays += 1;
      // Only keep ways that touch the game-area node cache. The source PBF
      // covers the entire voivodeship; retaining all its highways needlessly
      // grows the generator's working set by more than an order of magnitude.
      if (way.refs.some(id => coordinates.has(id))) {
        const roadEligible = roadWay(way.tags), tramEligible = tramWay(way.tags);
        if (roadEligible) roadWays.push(way);
        if (tramEligible) tramWays.push(way);
        if (roadEligible || tramEligible) localWayIds.add(way.id);
      }
    },
    relation: relation => {
      seenRelations += 1;
      const localViaNode = relation.members.some(member => member.role === 'via' && member.type === 'node' && coordinates.has(member.ref));
      const localViaWay = relation.members.some(member => member.role === 'via' && member.type === 'way' && localWayIds.has(member.ref));
      if (relation.tags.type === 'restriction' && (localViaNode || localViaWay)) {
        const kind = tagRestriction(relation.tags);
        if (kind) restrictions.push({ ...relation, kind });
      }
    }
  });
  if (!pbfHeader) throw new Error('OSM PBF has no header block.');
  roadWays.sort((a, b) => a.id - b.id); tramWays.sort((a, b) => a.id - b.id); restrictions.sort((a, b) => a.id - b.id);
  const roadWayIds = new Set(roadWays.map(way => way.id)); const tramWayIds = new Set(tramWays.map(way => way.id));
  const relevantRestrictions = wayIds => restrictions.filter(item => wayIds.has(item.members.find(member => member.role === 'from')?.ref)
    && wayIds.has(item.members.find(member => member.role === 'to')?.ref));
  const road = graphFor(roadWays, coordinates, relevantRestrictions(roadWayIds), bounds, 'road');
  const tram = graphFor(tramWays, coordinates, relevantRestrictions(tramWayIds), bounds, 'tram');
  if (road.stats.nodes < 1000 || road.stats.directedEdges < 2000) throw new Error(`Generated road graph is unexpectedly small (${road.stats.nodes} nodes, ${road.stats.directedEdges} directed edges).`);
  const payload = { schemaVersion: 2, binaryFormatVersion: 2, generatorVersion: GENERATOR_VERSION, bounds,
    stats: { sourceNodesInBounds: seenNodes, sourceWays: seenWays, sourceRelations: seenRelations,
      eligibleRoadWays: roadWays.length, eligibleTramWays: tramWays.length, road: road.stats, tram: tram.stats,
      unsupportedViaWayRestrictions: restrictions.filter(item => item.members.some(member => member.role === 'via' && member.type === 'way')).length } };
  const roadBytes = encodeRoutingGraphBinary(road.graph);
  const tramBytes = tram.stats.nodes ? encodeRoutingGraphBinary(tram.graph) : null;
  const roadCompressed = gzipSync(roadBytes, { level: 9 });
  const tramCompressed = tramBytes ? gzipSync(tramBytes, { level: 9 }) : null;
  const graphDataSha256 = createHash('sha256').update(roadBytes).update(tramBytes || Buffer.alloc(0)).digest('hex');
  const asset = { metadata: { graphVersion: `${GENERATOR_VERSION}:${SOURCE.sha256.slice(0, 12)}`, graphDataSha256,
    generatorVersion: GENERATOR_VERSION, source: SOURCE.provider, sourceUrl: SOURCE.url, sourcePage: SOURCE.sourcePage,
    sourceFile: SOURCE.file, sourceMd5: SOURCE.md5, sourceSha256: SOURCE.sha256,
    sourceDataTimestamp: SOURCE.dataTimestamp, pbfReplicationTimestamp: pbfHeader.replicationTimestamp,
    pbfWritingProgram: pbfHeader.writingProgram, license: 'Open Database License (ODbL) v1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1.0/',
    attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
    generatedGraphLicense: 'ODbL-1.0', bounds, marginKm, statistics: payload.stats }, ...payload };
  const directory = path.dirname(output);
  const roadUrl = 'krakow-road-graph.bin.gz'; const tramUrl = tramBytes ? 'krakow-tram-graph.bin.gz' : null;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, roadUrl), roadCompressed);
  if (tramCompressed) await writeFile(path.join(directory, tramUrl), tramCompressed);
  await import('node:fs/promises').then(fs => Promise.all([
    fs.rm(path.join(directory, 'krakow-road-graph.bin'), { force: true }),
    fs.rm(path.join(directory, 'krakow-tram-graph.bin'), { force: true })
  ]));
  asset.metadata.roadEncoding = 'gzip'; asset.metadata.tramEncoding = tramCompressed ? 'gzip' : null;
  asset.metadata.roadUrl = roadUrl; asset.metadata.tramUrl = tramUrl;
  await writeFile(output, `${JSON.stringify(asset)}\n`);
  const bytes = roadCompressed.byteLength + (tramCompressed?.byteLength || 0) + Buffer.byteLength(JSON.stringify(asset)) + 1;
  return { output, bytes, metadata: asset.metadata };
}

export async function verifySource(filename) {
  const { sha256, md5 } = await fileDigests(filename);
  if (sha256 !== SOURCE.sha256 || md5 !== SOURCE.md5) throw new Error(`PBF checksum mismatch: got SHA-256 ${sha256} and MD5 ${md5}; expected pinned Geofabrik snapshot checksums.`);
  return { sha256, md5 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const defaultInput = path.join(root, 'data', 'osm-input', SOURCE.file);
    const input = args.input || defaultInput;
    try { await (await import('node:fs/promises')).stat(input); }
    catch (error) {
      if (error.code !== 'ENOENT' || args.input) throw error;
      await downloadSource(input);
    }
    const hashes = await verifySource(input);
    const result = await buildRoutingGraph({ input, output: args.output, marginKm: args.marginKm });
    console.log(JSON.stringify({ ...result, hashes }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
