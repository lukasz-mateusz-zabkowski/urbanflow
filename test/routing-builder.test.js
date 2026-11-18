import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRoutingGraphBinary, graphFor, roadWay } from '../scripts/build-routing-graph.mjs';
import { decodeRoutingGraphBinary } from '../public/js/routing-osm.js';

test('vehicle filter excludes footways and permits a pedestrian street only when bus access is explicit', () => {
  assert.equal(roadWay({ highway: 'footway', access: 'yes' }), false);
  assert.equal(roadWay({ highway: 'pedestrian', bus: 'designated' }), true);
  assert.equal(roadWay({ highway: 'track', bus: 'no' }), false);
  assert.equal(roadWay({ highway: 'living_street', motor_vehicle: 'private' }), false);
  assert.equal(roadWay({ highway: 'living_street', motor_vehicle: 'private', psv: 'yes' }), true);
});

test('binary graph v2 preserves full 64-bit OSM way IDs and matching turn restrictions', () => {
  const wideFromWay = 4_322_000_123, wideToWay = 8_616_967_419;
  const coordinates = new Map([[1, { lat: 50, lng: 19.9 }], [2, { lat: 50.001, lng: 19.901 }], [3, { lat: 50.002, lng: 19.902 }]]);
  const ways = [
    { id: wideFromWay, refs: [1, 2], tags: { highway: 'residential', oneway: 'yes' } },
    { id: wideToWay, refs: [2, 3], tags: { highway: 'secondary' } }
  ];
  const restriction = { id: 500, kind: 'no', members: [
    { type: 'way', ref: wideFromWay, role: 'from' }, { type: 'node', ref: 2, role: 'via' }, { type: 'way', ref: wideToWay, role: 'to' }
  ] };
  const built = graphFor(ways, coordinates, [restriction], { south: 49.99, north: 50.01, west: 19.89, east: 19.91 }, 'road');
  const decoded = decodeRoutingGraphBinary(encodeRoutingGraphBinary(built.graph), { south: 49.99, north: 50.01, west: 19.89, east: 19.91 });
  assert.equal(decoded.edgesFrom(0).find(edge => edge.wayId === wideFromWay).wayId, wideFromWay);
  assert.equal(decoded.edgesFrom(1).find(edge => edge.wayId === wideToWay).wayId, wideToWay);
  assert.equal(decoded.edgesFrom(0).find(edge => edge.wayId === wideFromWay).highway, 'residential');
  assert.ok([...decoded.turnRules.values()].flat().some(rule => rule.fromWay === wideFromWay && rule.toWay === wideToWay));
  assert.notEqual(wideFromWay >>> 0, wideFromWay, 'fixture must expose a 32-bit alias');
});

test('binary graph decoder rejects v1 rather than silently decoding truncated IDs', () => {
  const legacy = new Uint8Array(20);
  legacy.set([85, 70, 71, 49]);
  new DataView(legacy.buffer).setUint16(4, 1, true);
  new DataView(legacy.buffer).setUint16(6, 20, true);
  assert.throws(() => decodeRoutingGraphBinary(legacy), /invalid magic header|Unsupported routing graph binary version/);
});

test('graph builder keeps a one-way bus street directed and attaches node turn restrictions', () => {
  const coordinates = new Map([[1, { lat: 50, lng: 19.9 }], [2, { lat: 50.001, lng: 19.901 }], [3, { lat: 50.002, lng: 19.902 }]]);
  const ways = [
    { id: 100, refs: [1, 2], tags: { highway: 'primary', oneway: 'yes' } },
    { id: 200, refs: [2, 3], tags: { highway: 'secondary' } }
  ];
  const restriction = { id: 500, kind: 'no', members: [
    { type: 'way', ref: 100, role: 'from' }, { type: 'node', ref: 2, role: 'via' }, { type: 'way', ref: 200, role: 'to' }
  ] };
  const result = graphFor(ways, coordinates, [restriction], { south: 49.99, north: 50.01, west: 19.89, east: 19.91 }, 'road').graph;
  assert.equal(result.adjacency.flat().filter(edge => edge[3] === 100).length, 1);
  assert.ok(result.turnRules.some(rule => rule[0] !== undefined && rule[1] === 100 && rule[2] === 200 && rule[3] === 'no'));
});

test('connects a bridge abutment to a continuing road at the same OSM node but different graph level', () => {
  const coordinates = new Map([
    [1, { lat: 50, lng: 19.9 }], [2, { lat: 50.001, lng: 19.901 }],
    [3, { lat: 50.002, lng: 19.902 }], [4, { lat: 50.001, lng: 19.902 }]
  ]);
  const ways = [
    { id: 100, refs: [1, 2, 3], tags: { highway: 'secondary' } },
    { id: 200, refs: [2, 4], tags: { highway: 'secondary', bridge: 'yes', layer: '1' } }
  ];
  const result = graphFor(ways, coordinates, [], { south: 49.99, north: 50.01, west: 19.89, east: 19.91 }, 'road');
  const [groundInterior] = result.graph.adjacency.flatMap((arcs, from) => arcs.filter(edge => edge[8]).map(edge => [from, edge[0]]));
  assert.ok(groundInterior, 'expected a zero-length level connector for the shared bridge abutment');
  assert.notEqual(groundInterior[0], groundInterior[1]);
});

test('geometric crossings with distinct OSM node IDs remain disconnected across bridge levels', () => {
  const coordinates = new Map([
    [1, { lat: 50, lng: 19.9 }], [2, { lat: 50.001, lng: 19.901 }], [3, { lat: 50.002, lng: 19.902 }],
    [4, { lat: 49.999, lng: 19.902 }], [5, { lat: 50.001, lng: 19.901 }], [6, { lat: 50.003, lng: 19.9 }]
  ]);
  const ways = [
    { id: 100, refs: [1, 2, 3], tags: { highway: 'secondary' } },
    { id: 200, refs: [4, 5, 6], tags: { highway: 'secondary', bridge: 'yes', layer: '1' } }
  ];
  const result = graphFor(ways, coordinates, [], { south: 49.99, north: 50.01, west: 19.89, east: 19.91 }, 'road');
  assert.equal(result.stats.levelConnectors, 0);
  assert.ok(result.graph.adjacency.flat().some(edge => edge[3] === 200));
  assert.ok(!result.graph.adjacency.flat().some(edge => edge[8]));
});
