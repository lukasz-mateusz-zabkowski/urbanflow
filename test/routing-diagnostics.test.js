import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLineDetails, routeSegmentDetails } from '../public/js/routing.js';
import { CITIES } from '../public/js/cities.js';
import { attachStops } from '../public/js/cities.js';

test('Bronowice to Krowodrza Górka follows the configured road graph and reports why', () => {
  const city = CITIES.krakow;
  const result = routeSegmentDetails(city.points.find(point => point.id === 'bronowice'), city.points.find(point => point.id === 'krowodrza'), 'bus', city);
  assert.equal(result.source, 'lokalny graf drogowy UrbanFlow');
  assert.equal(result.algorithm, 'Dijkstra po lokalnym grafie, dopasowanie do odcinka');
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
  assert.equal(result.mode, 'tramway');
  assert.equal(result.source, 'lokalny graf drogowy UrbanFlow');
  assert.ok(result.distanceKm > 0);
  assert.ok(result.travelMinutes > 0);
});

test('rail and metro use their configured offline geometries and expose snap distance', () => {
  const rail = routeLineDetails(['bronowice', 'krowodrza'], 'suburban', CITIES.krakow);
  const metro = routeLineDetails(['bronowice', 'krowodrza'], 'metro', CITIES.krakow);
  assert.equal(rail.source, 'lokalny korytarz kolejowy UrbanFlow');
  assert.equal(rail.algorithm, 'Dijkstra po lokalnym grafie, dopasowanie do odcinka');
  assert.ok(rail.snappedDistanceKm > 0);
  assert.equal(metro.source, 'model bezpośredni UrbanFlow');
  assert.equal(metro.algorithm, 'przebieg tunelowy bez grafu ulic');
  assert.equal(metro.snappedDistanceKm, 0);
});

test('Krakow seven-stop report exposes the incomplete downtown graph instead of pricing a false detour', () => {
  const city = { ...CITIES.krakow, points: CITIES.krakow.points.map(point => ({ ...point })), stopsAttached: false };
  attachStops(city, [
    { id: 's-stradom', name: 'Stradom', lat: 50.0525, lng: 19.944 },
    { id: 's-kazimierz', name: 'Kazimierz', lat: 50.051, lng: 19.945 },
    { id: 's-plac-wolnica', name: 'Plac Wolnica', lat: 50.0505, lng: 19.949 },
    { id: 's-dietla', name: 'Dietla', lat: 50.053, lng: 19.95 },
    { id: 's-podgorze', name: 'Podgórze', lat: 50.048, lng: 19.96 },
    { id: 's-plac-bohaterow-getta', name: 'Plac Bohaterów Getta', lat: 50.047, lng: 19.953 },
    { id: 's-rynek-podgorski', name: 'Rynek Podgórski', lat: 50.048, lng: 19.949 }
  ]);
  const result = routeLineDetails(['s-stradom', 's-kazimierz', 's-plac-wolnica', 's-dietla', 's-podgorze', 's-plac-bohaterow-getta', 's-rynek-podgorski'], 'bus', city);
  assert.equal(result.valid, false);
  assert.ok(result.detourRatio > 4 || result.maxSnapDistanceKm > 0.8);
  assert.match(result.reason, /niepewn|objazd|graf/i);
  assert.equal(result.segments.length, 6);
  assert.ok(result.segments.every(segment => segment.coordinates.length >= 2));
  assert.deepEqual(result.coordinates.filter((coordinate, index, all) => !index || JSON.stringify(coordinate) !== JSON.stringify(all[index - 1])).filter(coordinate =>
    ['50.0525,19.944', '50.051,19.945', '50.0505,19.949', '50.053,19.95', '50.048,19.96', '50.047,19.953', '50.048,19.949']
      .includes(`${coordinate[0]},${coordinate[1]}`)), [
    [50.0525, 19.944], [50.051, 19.945], [50.0505, 19.949], [50.053, 19.95], [50.048, 19.96], [50.047, 19.953], [50.048, 19.949]
  ]);
});
