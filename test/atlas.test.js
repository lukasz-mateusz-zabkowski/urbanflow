import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_VIEWS, filterAndSortLines, loadAtlasPreferences, saveAtlasPreferences } from '../public/js/atlas.js';

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
  assert.deepEqual(saved, { view: 'development', lineFilter: 'tram', lineSort: 'profitability' });
  assert.deepEqual(loadAtlasPreferences(storage), saved);
  assert.deepEqual(loadAtlasPreferences({ getItem: () => '{bad json' }), { view: 'transport', lineFilter: 'all', lineSort: 'load' });
  assert.deepEqual(saveAtlasPreferences({ view: 'untrusted', lineFilter: 'nope', lineSort: 'budget' }, storage),
    { view: 'transport', lineFilter: 'all', lineSort: 'load' });
});
