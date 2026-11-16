import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLineDetails, routeSegmentDetails } from '../public/js/routing.js';
import { CITIES } from '../public/js/cities.js';

test('Bronowice to Krowodrza Górka follows the configured road graph and reports why', () => {
  const city = CITIES.krakow;
  const result = routeSegmentDetails(city.points.find(point => point.id === 'bronowice'), city.points.find(point => point.id === 'krowodrza'), 'bus', city);
  assert.equal(result.source, 'lokalny graf drogowy UrbanFlow');
  assert.equal(result.algorithm, 'Dijkstra, najkrótsza odległość');
  assert.equal(result.reason, 'Wybrano najkrótszy dostępny korytarz w lokalnym grafie drogowym.');
  assert.deepEqual(result.coordinates, [[50.08, 19.8932], [50.089, 19.92]]);
  assert.ok(result.distanceKm > 0);
});

test('disconnected local graph is reported as direct fallback, not as a road route', () => {
  const city = { points: [], roadGeometry: [[[50, 20], [50.01, 20]], [[49, 19], [49.01, 19]]] };
  const result = routeSegmentDetails({ lat: 50, lng: 20 }, { lat: 49, lng: 19 }, 'bus', city);
  assert.equal(result.algorithm, 'bezpośredni fallback');
  assert.match(result.reason, /brak połączenia/i);
  assert.equal(result.coordinates.length, 2);
});

test('line routing details aggregate all segments and preserve the existing offline mode', () => {
  const result = routeLineDetails(['bronowice', 'krowodrza'], 'tram', CITIES.krakow);
  assert.equal(result.mode, 'road');
  assert.equal(result.source, 'lokalny graf drogowy UrbanFlow');
  assert.ok(result.distanceKm > 0);
  assert.ok(result.travelMinutes > 0);
});

test('rail and metro use their configured offline geometries and expose snap distance', () => {
  const rail = routeLineDetails(['bronowice', 'krowodrza'], 'suburban', CITIES.krakow);
  const metro = routeLineDetails(['bronowice', 'krowodrza'], 'metro', CITIES.krakow);
  assert.equal(rail.source, 'lokalny korytarz kolejowy UrbanFlow');
  assert.equal(rail.algorithm, 'Dijkstra, najkrótsza odległość');
  assert.ok(rail.snappedDistanceKm > 0);
  assert.equal(metro.source, 'model bezpośredni UrbanFlow');
  assert.equal(metro.algorithm, 'przebieg tunelowy bez grafu ulic');
  assert.equal(metro.snappedDistanceKm, 0);
});
