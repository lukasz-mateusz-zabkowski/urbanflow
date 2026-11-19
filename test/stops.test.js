import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, attachStops } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { pickStopsToReveal } from '../public/js/stops.js';
import { passengerTick } from '../public/js/passengers.js';
import { validateState } from '../public/js/storage.js';
import { clusterStops, parseCsv, fromGtfs } from '../scripts/import-stops.mjs';

const freshCity = extra => {
  const base = CITIES.krakow;
  const city = { ...base, points: base.points.map(p => ({ ...p })), stopsAttached: false };
  attachStops(city, extra);
  return city;
};
const stopsNear = [
  { id: 's-a', name: 'Przy trasie', lat: 50.0060, lng: 20.0430, w: 2 },   // między Bieżanowem a Wieliczką
  { id: 's-b', name: 'Daleko', lat: 50.2500, lng: 19.5000, w: 1 },
  { id: 's-c', name: 'Przy Centrum', lat: 50.0630, lng: 19.9400, w: 1 }
];

test('nowa linia odsłania przystanki przy trasie, a nie te z drugiego końca regionu', () => {
  const city = freshCity(stopsNear);
  const game = new UrbanFlowGame(city);
  assert.equal(game.visiblePoints().some(p => p.type === 'stop'), false);
  const revealed = [];
  game.events.onStopsRevealed = list => revealed.push(...list.map(s => s.id));
  assert.equal(game.chooseStarterRoute('loop-center').ok, true);
  assert.ok(revealed.includes('s-a') && revealed.includes('s-c'));
  assert.ok(!revealed.includes('s-b'));
  assert.deepEqual(game.state.revealedStops.sort(), revealed.sort());
  assert.ok(game.visiblePoints().some(p => p.id === 's-a'));
});

test('odkryty przystanek można wykorzystać w kolejnej linii, nieodkryty nie', () => {
  const city = freshCity(stopsNear);
  const game = new UrbanFlowGame(city);
  game.chooseStarterRoute('loop-center');
  assert.equal(game.previewLine('bus', ['dworzec', 's-b']).ok, false);
  assert.equal(game.previewLine('bus', ['dworzec', 's-c']).ok, true);
});

test('pickStopsToReveal respektuje limity i nie powtarza przystanków', () => {
  const route = [{ lat: 50, lng: 19.9 }, { lat: 50, lng: 20.0 }];
  const stops = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, type: 'stop', lat: 50.001 + i * 0.0001, lng: 19.9 + i * 0.0016 }));
  const first = pickStopsToReveal(stops, new Set(), route);
  assert.ok(first.length > 0 && first.length <= 8);
  const second = pickStopsToReveal(stops, new Set(first), route);
  assert.equal(second.filter(id => first.includes(id)).length, 0);
});

test('nieobsługiwane przystanki nie generują popytu', () => {
  const city = freshCity(stopsNear);
  const game = new UrbanFlowGame(city);
  game.chooseStarterRoute('loop-center');
  const before = game.state.cohorts.length;
  passengerTick(game.state, game.visiblePoints(), 720, () => 0.01);
  const origins = new Set(game.state.cohorts.map(c => c.origin));
  assert.ok(!origins.has('s-a') && !origins.has('s-c'));
  assert.ok(game.state.cohorts.length > before);
});

test('zapis z odkrytymi przystankami przechodzi walidację, a zapis ze złym id nie', () => {
  const city = freshCity(stopsNear);
  const game = new UrbanFlowGame(city);
  game.chooseStarterRoute('loop-center');
  const copy = JSON.parse(JSON.stringify(game.state));
  assert.equal(validateState(copy, city), true);
  copy.revealedStops.push('nie-istnieje');
  assert.equal(validateState(copy, city), false);
  const legacy = JSON.parse(JSON.stringify(game.state)); delete legacy.revealedStops;
  assert.equal(validateState(legacy, city), true, 'stare zapisy bez pola działają');
});

test('import: klastruje słupki, nadaje unikalne id i czyta CSV GTFS', () => {
  const clustered = clusterStops([
    { name: 'Rondo X 01', lat: 50.0001, lng: 19.9 }, { name: 'Rondo X 02', lat: 50.0003, lng: 19.9002 },
    { name: 'Rondo X', lat: 50.05, lng: 19.95 }, { name: 'Łąkowa', lat: 50.01, lng: 19.91 }]);
  assert.equal(clustered.length, 3);
  assert.equal(new Set(clustered.map(s => s.id)).size, 3);
  assert.ok(clustered.some(s => s.id === 's-lakowa'));
  const csv = '\uFEFFstop_id,stop_name,stop_lat,stop_lon\n1,"Dworzec, Główny",50.0671,19.9450\n2,Poza,52.0,21.0\n';
  assert.equal(parseCsv(csv).length, 2);
  assert.deepEqual(fromGtfs(csv, [49.93, 19.75, 50.14, 20.15]).map(s => s.name), ['Dworzec, Główny']);
});
