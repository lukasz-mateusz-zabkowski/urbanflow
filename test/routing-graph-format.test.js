import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRoutingGraphBinary } from '../public/js/routing.js';
import { routeOnOsmGraph } from '../public/js/routing-osm.js';
import { encodeRoutingGraphBinary, graphFor } from '../scripts/build-routing-graph.mjs';

function fixture() {
  const bytes = new ArrayBuffer(20 + 3 * 8 + 4 * 4 + 3 * 20 + 16);
  const view = new DataView(bytes);
  new Uint8Array(bytes, 0, 4).set([85, 70, 71, 49]); // UFG1
  view.setUint16(4, 1, true); view.setUint16(6, 20, true);
  view.setUint32(8, 3, true); view.setUint32(12, 3, true); view.setUint32(16, 1, true);
  const coordinates = 20;
  [[500000000, 199000000], [500010000, 199010000], [500020000, 199020000]].flat().forEach((v, i) => view.setInt32(coordinates + i * 4, v, true));
  const offsets = coordinates + 3 * 8;
  [0, 1, 2, 3].forEach((v, i) => view.setUint32(offsets + i * 4, v, true));
  const edges = offsets + 4 * 4;
  [[1, 12000, 2000, 41, 6, 0, 0], [2, 14000, 2400, 42, 6, 0, 1], [0, 12000, 2000, 41, 6, 0, 0]].forEach((edge, i) => {
    const p = edges + i * 20;
    view.setUint32(p, edge[0], true); view.setUint32(p + 4, edge[1], true); view.setUint32(p + 8, edge[2], true);
    view.setUint32(p + 12, edge[3], true); view.setUint8(p + 16, edge[4]); view.setInt8(p + 17, edge[5]); view.setUint8(p + 18, edge[6]);
  });
  const rules = edges + 3 * 20;
  view.setUint32(rules, 1, true); view.setUint32(rules + 4, 41, true); view.setUint32(rules + 8, 42, true); view.setUint32(rules + 12, 0, true);
  return bytes;
}

test('decodes compact routing graph columns and node-based turn restrictions', () => {
  const graph = decodeRoutingGraphBinary(fixture());
  assert.equal(graph.nodeCount, 3);
  assert.equal(graph.edgeCount, 3);
  assert.deepEqual(graph.coordinate(1), [50.001, 19.901]);
  assert.deepEqual(graph.edgesFrom(1)[0], { to: 2, distanceKm: 0.014, travelSeconds: 2.4, wayId: 42, highway: 'primary', level: 0, bridge: true, tunnel: false, connector: false });
  assert.deepEqual(graph.turnRules.get(1), [{ fromWay: 41, toWay: 42, kind: 'no' }]);
});

test('rejects malformed routing graph binary headers rather than interpreting them as a route', () => {
  assert.throws(() => decodeRoutingGraphBinary(new ArrayBuffer(20)), /magic/i);
});

test('directed route search refuses the reverse of a one-way street without drawing a direct fallback', () => {
  const bounds = { south: 49.99, north: 50.02, west: 19.89, east: 19.93 };
  const coordinates = new Map([[1, { lat: 50, lng: 19.9 }], [2, { lat: 50.01, lng: 19.92 }]]);
  const graph = graphFor([{ id: 1, refs: [1, 2], tags: { highway: 'primary', oneway: 'yes' } }], coordinates, [], bounds, 'road').graph;
  const encoded = encodeRoutingGraphBinary(graph);
  const routeGraph = decodeRoutingGraphBinary(encoded, bounds);
  const forward = routeOnOsmGraph({ lat: 50, lng: 19.9 }, { lat: 50.01, lng: 19.92 }, routeGraph);
  const reverse = routeOnOsmGraph({ lat: 50.01, lng: 19.92 }, { lat: 50, lng: 19.9 }, routeGraph);
  assert.equal(forward.valid, true);
  assert.equal(reverse.valid, false);
  assert.deepEqual(reverse.coordinates, []);
});

test('turn restriction at a shared OSM via node is enforced during graph search', () => {
  const bounds = { south: 49.99, north: 50.02, west: 19.89, east: 19.93 };
  const coordinates = new Map([[1, { lat: 50, lng: 19.9 }], [2, { lat: 50.005, lng: 19.91 }], [3, { lat: 50.01, lng: 19.92 }]]);
  const ways = [
    { id: 100, refs: [1, 2], tags: { highway: 'primary', oneway: 'yes' } },
    { id: 200, refs: [2, 3], tags: { highway: 'secondary', oneway: 'yes' } }
  ];
  const restrictions = [{ id: 500, kind: 'no', members: [
    { type: 'way', ref: 100, role: 'from' }, { type: 'node', ref: 2, role: 'via' }, { type: 'way', ref: 200, role: 'to' }
  ] }];
  const source = graphFor(ways, coordinates, restrictions, bounds, 'road').graph;
  const encoded = encodeRoutingGraphBinary(source);
  const result = routeOnOsmGraph({ lat: 50, lng: 19.9 }, { lat: 50.01, lng: 19.92 }, decodeRoutingGraphBinary(encoded, bounds));
  assert.equal(result.valid, false);
  assert.match(result.reason, /Brak połączenia/i);
});
