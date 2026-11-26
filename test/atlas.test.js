import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_VIEWS, filterAndSortLines, loadAtlasPreferences, regionalNetworkSummary, saveAtlasPreferences } from '../public/js/atlas.js';
import { CITIES } from '../public/js/cities.js';

test('Atlas exposes five distinct view definitions without adding campaign fields', () => {
  assert.deepEqual(ATLAS_VIEWS.map(view => view.id), ['transport', 'planning', 'passengers', 'development', 'operations']);
  assert.ok(ATLAS_VIEWS.every(view => view.label && view.description && view.analyticsMode));
});

test('line manager filters buses and trams and sorts using observed simulation values', () => {
  const lines = [
    { id: 'bus-a', type: 'bus', stats: { load: 0.4, costPerHour: 70, balancePerHour: 10 } },
    { id: 'tram-a', type: 'tram', stats: { load: 0.9, costPerHour: 100, balancePerHour: -5 } },
    { id: 'bus-b', type: 'bus', stats: { load: 0.7, costPerHour: 40, balancePerHour: 30 } }
  ];
  assert.deepEqual(filterAndSortLines(lines, 'bus', 'load').map(line => line.id), ['bus-b', 'bus-a']);
  assert.deepEqual(filterAndSortLines(lines, 'all', 'cost').map(line => line.id), ['tram-a', 'bus-a', 'bus-b']);
  assert.deepEqual(filterAndSortLines(lines, 'all', 'profitability').map(line => line.id), ['bus-b', 'bus-a', 'tram-a']);
  assert.deepEqual(filterAndSortLines(lines, 'tram', 'load').map(line => line.id), ['tram-a']);
});

test('Atlas view and line preferences are validated and persisted independently', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const saved = saveAtlasPreferences({ view: 'development', lineFilter: 'tram', lineSort: 'profitability' }, storage);
  assert.deepEqual(saved, { view: 'development', lineFilter: 'tram', lineSort: 'profitability', perspective: 'city' });
  assert.deepEqual(loadAtlasPreferences(storage), saved);
  assert.deepEqual(loadAtlasPreferences({ getItem: () => '{bad json' }), { view: 'transport', lineFilter: 'all', lineSort: 'load', perspective: 'city' });
  assert.deepEqual(saveAtlasPreferences({ view: 'untrusted', lineFilter: 'nope', lineSort: 'budget' }, storage),
    { view: 'transport', lineFilter: 'all', lineSort: 'load', perspective: 'city' });
});

test('regional perspective reports modeled settlements and only direct, routable line service', () => {
  const state = { lines: [
    { id: 'served', name: 'Linia Skawina', stops: ['skawina', 'lagiewniki'], routingUnavailable: null },
    { id: 'unavailable', name: 'Niedostępna', stops: ['michalowice', 'gorka-narodowa'], routingUnavailable: 'brak połączenia' },
    { id: 'city-only', name: 'Miejska', stops: ['dworzec', 'nowa-huta'] }
  ] };
  const summary = regionalNetworkSummary(CITIES.krakow, state);
  assert.equal(summary.modelledSettlementCount, 11);
  assert.equal(summary.directlyServedCount, 1);
  assert.equal(summary.unservedCount, 10);
  assert.deepEqual(summary.settlements.find(item => item.id === 'skawina').activeLines, ['Linia Skawina']);
  assert.deepEqual(summary.settlements.find(item => item.id === 'michalowice').activeLines, []);
  assert.equal(summary.settlements.find(item => item.id === 'igolomia').availableForNewGame, false);
  assert.equal(summary.source, 'modelled-settlement-points-and-current-campaign-lines');
});

test('regional preference is independent from the five workspaces and validated on load', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(saveAtlasPreferences({ perspective: 'regional' }, storage), {
    view: 'transport', lineFilter: 'all', lineSort: 'load', perspective: 'regional'
  });
  assert.equal(loadAtlasPreferences(storage).perspective, 'regional');
  assert.equal(saveAtlasPreferences({ perspective: 'bogus' }, storage).perspective, 'city');
});
