import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApp } from '../server.js';
import { createFeedbackReport, FEEDBACK_CATEGORIES } from '../public/js/feedback.js';

const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

test('feedback report validates inputs, records the game version, and excludes diagnostics by default', () => {
  assert.equal(packageVersion, '1.4.1-alpha');
  const report = createFeedbackReport({ category: FEEDBACK_CATEGORIES[0], description: 'Mapa zgubiła rozmiar.', rating: '4', testerId: '' }, null);
  assert.equal(report.ok, true);
  assert.equal(report.report.gameVersion, 'unknown');
  assert.equal(report.report.diagnostics, undefined);
  assert.equal(report.report.testerId, undefined);
});

test('feedback export takes its version from the existing app health source', async t => {
  const server = createApp({ commitSha: 'a'.repeat(40) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.ok, true);
  const health = await response.json();
  assert.equal(health.version, packageVersion);

  const report = createFeedbackReport({ category: FEEDBACK_CATEGORIES[0], description: 'Version source check', rating: 5 }, null, { version: health.version });
  assert.equal(report.report.gameVersion, health.version);
});

test('feedback diagnostics are attached only after explicit consent and malformed input is rejected', () => {
  const input = { category: FEEDBACK_CATEGORIES[2], description: 'Opis problemu', rating: 5, includeDiagnostics: true };
  const report = createFeedbackReport(input, { city: 'krakow', lines: 2 });
  assert.deepEqual(report.report.diagnostics, { city: 'krakow', lines: 2 });
  assert.equal(createFeedbackReport({ ...input, category: 'Dowolne', rating: 9 }, null).ok, false);
  assert.equal(createFeedbackReport({ ...input, description: '   ' }, null).ok, false);
});

test('feedback supports the six playtest categories and includes only explicitly selected context fields', async () => {
  const { FEEDBACK_CATEGORIES: categories } = await import('../public/js/feedback.js');
  assert.deepEqual(categories, ['Błąd', 'Niezrozumiała mechanika', 'Sugestia', 'Problem z wydajnością', 'Problem z interfejsem', 'Ocena pierwszej rozgrywki']);
  const result = createFeedbackReport({ category: categories[5], description: 'Pierwsza sesja', rating: 4, includeContext: true },
    { city: 'krakow', lineCount: 1, elapsedMinutes: 12, budget: 3000, save: '{secret}' },
    { version: '1.4.0-alpha', context: { device: 'mobile', resolution: '390x844', screen: 'game', tutorialStep: 'passengers', userAgent: 'secret' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.report.context, { device: 'mobile', resolution: '390x844', screen: 'game', tutorialStep: 'passengers' });
  assert.equal(result.report.diagnostics, undefined);
  assert.equal(JSON.stringify(result.report).includes('secret'), false);
});

test('feedback never includes diagnostic data unless the separate diagnostics consent is checked', () => {
  const result = createFeedbackReport({ category: 'Błąd', description: 'Test', rating: 3, includeContext: true },
    { city: 'krakow', lineCount: 2, elapsedMinutes: 30, budget: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.report.context, undefined);
  assert.equal(result.report.diagnostics, undefined);
});
