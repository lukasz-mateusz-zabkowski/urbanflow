import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyAtlasView } from '../public/js/theme.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const map = readFileSync(new URL('../public/js/map.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/js/ui.js', import.meta.url), 'utf8');

test('map place tips have a touch accessible profile card and responsive sheet controls', () => {
  assert.match(map, /bindTooltip\(/);
  assert.match(html, /id="placeProfile"[^>]+aria-live="polite"/);
  assert.match(html, /id="mobilePanelButton"/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.build-panel\{position:fixed/);
  assert.match(ui, /selectPlace\(id\)/);
});

test('panel can be resized, keyboard adjusted, collapsed, and invalidates the map', () => {
  assert.match(html, /role="separator"[^>]+aria-valuemin="320"/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /collapsePanel\(\)/);
  assert.match(ui, /this\.map\.invalidate\?\.\(\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) var\(--panel-width,462px\)/);
});

test('tester feedback can be copied or downloaded and explains that diagnostics are optional', () => {
  assert.match(html, /id="feedbackForm"/);
  assert.match(html, /name="includeDiagnostics" type="checkbox"/);
  assert.match(html, /id="feedbackCopy"/);
  assert.match(html, /id="feedbackDownload"/);
  assert.match(ui, /Nic nie zostało wysłane/);
});

test('game UI modules load without browser globals and unknown Atlas views fall back safely', async () => {
  const { UI } = await import('../public/js/ui.js');
  assert.equal(typeof UI, 'function');
  const root = { setAttribute(name, value) { this[name] = value; } };
  assert.equal(applyAtlasView('midnight', root), 'city');
  assert.equal(root['data-atlas-view'], 'city');
});
