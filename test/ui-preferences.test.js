import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelWidth, loadPanelWidth, savePanelWidth, PANEL_WIDTH_KEY } from '../public/js/ui-preferences.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};

test('panel width stays usable and leaves room for the map', () => {
  assert.equal(clampPanelWidth(100, 1280), 320);
  assert.equal(clampPanelWidth(2000, 1280), 560);
  assert.equal(clampPanelWidth(560, 900), 432);
});

test('panel width preference persists separately and invalid values use the desktop default', () => {
  const storage = memoryStorage();
  assert.equal(loadPanelWidth(storage, 1280), 462);
  assert.equal(savePanelWidth(storage, 500, 1280), 500);
  assert.equal(loadPanelWidth(storage, 1280), 500);
  assert.equal(storage.getItem(PANEL_WIDTH_KEY), '500');
  storage.setItem(PANEL_WIDTH_KEY, 'NaN');
  assert.equal(loadPanelWidth(storage, 1280), 462);
});
