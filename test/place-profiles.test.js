import test from 'node:test';
import assert from 'node:assert/strict';
import { describePlace } from '../public/js/place-profiles.js';
import { CITIES } from '../public/js/cities.js';
import { latentDemand } from '../public/js/demand.js';

test('place profile explains an actual interchange and uses the simulation demand model', () => {
  const point = CITIES.krakow.points.find(item => item.id === 'krowodrza');
  const profile = describePlace(point, CITIES.krakow, [{ name: 'Linia 1', stops: ['krowodrza', 'centrum'] }], 480);
  assert.equal(profile.name, 'Krowodrza Górka');
  assert.equal(profile.type, 'Węzeł przesiadkowy');
  assert.match(profile.description, /przesiad/i);
  assert.equal(profile.demand.estimated, true);
  assert.equal(profile.demand.score, latentDemand([point], [], 480)[0].potential);
  assert.ok(profile.connections.includes('Linia 1'));
  assert.ok(profile.connections.some(item => item.includes('Zielonki')));
});

test('profile safely describes the existing stop type without inventing demand statistics', () => {
  const point = { id: 'stop-1', name: 'Przystanek testowy', lat: 50, lng: 20, type: 'stop', demand: 2, profile: 'local' };
  const profile = describePlace(point, CITIES.krakow, [], 720);
  assert.equal(profile.type, 'Przystanek lokalny');
  assert.equal(profile.demand.estimated, true);
  assert.equal(profile.connections.length, 0);
  assert.ok(profile.description.length > 10);
});
