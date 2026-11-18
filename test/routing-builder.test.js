import test from 'node:test';
import assert from 'node:assert/strict';
import { graphFor, roadWay } from '../scripts/build-routing-graph.mjs';

test('vehicle filter excludes footways and permits a pedestrian street only when bus access is explicit', () => {
  assert.equal(roadWay({ highway: 'footway', access: 'yes' }), false);
  assert.equal(roadWay({ highway: 'pedestrian', bus: 'designated' }), true);
  assert.equal(roadWay({ highway: 'track', bus: 'no' }), false);
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
