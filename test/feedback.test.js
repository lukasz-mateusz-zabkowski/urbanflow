import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackReport, FEEDBACK_CATEGORIES, FEEDBACK_VERSION } from '../public/js/feedback.js';

test('feedback report validates inputs, records the game version, and excludes diagnostics by default', () => {
  const report = createFeedbackReport({ category: FEEDBACK_CATEGORIES[0], description: 'Mapa zgubiła rozmiar.', rating: '4', testerId: '' }, null);
  assert.equal(report.ok, true);
  assert.equal(report.report.gameVersion, FEEDBACK_VERSION);
  assert.equal(report.report.diagnostics, undefined);
  assert.equal(report.report.testerId, undefined);
});

test('feedback diagnostics are attached only after explicit consent and malformed input is rejected', () => {
  const input = { category: FEEDBACK_CATEGORIES[2], description: 'Opis problemu', rating: 5, includeDiagnostics: true };
  const report = createFeedbackReport(input, { city: 'krakow', lines: 2 });
  assert.deepEqual(report.report.diagnostics, { city: 'krakow', lines: 2 });
  assert.equal(createFeedbackReport({ ...input, category: 'Dowolne', rating: 9 }, null).ok, false);
  assert.equal(createFeedbackReport({ ...input, description: '   ' }, null).ok, false);
});
