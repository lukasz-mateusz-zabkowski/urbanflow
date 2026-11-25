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

test('private playtest guide, post-session survey, and campaign export are available without requiring personal data', () => {
  assert.match(html, /id="playtestGuideDialog"/);
  assert.match(html, /id="playtestGuideButton"/);
  assert.match(html, /id="playtestGuideGameButton"/);
  for (const marker of ['15 minut', '45–60 minut', 'Zapis i wznowienie']) assert.ok(html.includes(marker), marker);
  assert.match(html, /id="playtestSurvey"/);
  for (const field of ['firstImpression', 'nextStepClear', 'costsClear', 'frustratingMoment', 'likedMost', 'playAgain']) {
    assert.ok(html.includes(`name="${field}"`), field);
  }
  assert.match(html, /id="feedbackExportSave"/);
  assert.match(ui, /playtestSurvey/);
  assert.match(ui, /downloadJsonFile/);
});

test('onboarding is dismissible and state-backed, and line decisions reveal budget, risks and expected service', () => {
  assert.match(html, /id="tutorialSkip"/);
  assert.match(html, /id="tutorialRestart"/);
  assert.match(html, /role="progressbar"[^>]+id="tutorialProgress"/);
  assert.match(html, /id="lineDecisionSummary"/);
  assert.match(ui, /setTutorialStatus\('skipped'\)/);
  assert.match(ui, /lineDecisionBudget/);
  assert.match(ui, /lineDecisionRisk/);
});

test('game UI modules load without browser globals and unknown Atlas views fall back safely', async () => {
  const { UI } = await import('../public/js/ui.js');
  assert.equal(typeof UI, 'function');
  const root = { setAttribute(name, value) { this[name] = value; } };
  assert.equal(applyAtlasView('midnight', root), 'city');
  assert.equal(root['data-atlas-view'], 'city');
});
