import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../public/js/cities.js';
import { UrbanFlowGame } from '../public/js/game.js';
import { applyAtlasTheme, loadAtlasTheme, saveAtlasTheme } from '../public/js/theme.js';

test('Atlas City, Network, and Midnight themes apply independently of campaign data', () => {
  const game = new UrbanFlowGame(CITIES.krakow, { random: () => 0.3 });
  const before = structuredClone(game.state);
  const root = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };

  for (const theme of ['city', 'network', 'midnight']) {
    assert.equal(applyAtlasTheme(theme, root), theme);
    assert.equal(root.attributes['data-atlas-theme'], theme);
  }

  assert.deepEqual(game.state, before);
});

test('Atlas theme preference is validated and stored separately from game saves', () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(saveAtlasTheme('midnight', storage), 'midnight');
  assert.equal(loadAtlasTheme(storage), 'midnight');
  assert.equal(saveAtlasTheme('unknown', storage), 'city');
  assert.equal(loadAtlasTheme(storage), 'city');
});

test('Atlas theme stylesheet defines distinct network and midnight presentation tokens', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /data-atlas-theme="network"/);
  assert.match(css, /data-atlas-theme="midnight"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
