export const FEEDBACK_VERSION = '0.9.0';
export const FEEDBACK_CATEGORIES = Object.freeze([
  'Błąd techniczny', 'Interfejs i grafika', 'Mechanika gry', 'Balans ekonomiczny', 'Pomysł na rozwój'
]);

export function createFeedbackReport(input = {}, diagnostics = null, { version = FEEDBACK_VERSION, now = () => new Date() } = {}) {
  const errors = [];
  const category = String(input.category || '');
  const description = String(input.description || '').trim();
  const rating = Number(input.rating);
  if (!FEEDBACK_CATEGORIES.includes(category)) errors.push('Wybierz kategorię zgłoszenia.');
  if (!description || description.length > 3000) errors.push('Opis musi mieć od 1 do 3000 znaków.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Ocena musi wynosić od 1 do 5.');
  if (errors.length) return { ok: false, errors };
  const report = { schemaVersion: 1, gameVersion: version, createdAt: now().toISOString(), category, description, rating };
  const testerId = String(input.testerId || '').trim().slice(0, 60);
  if (testerId) report.testerId = testerId;
  if (input.includeDiagnostics === true && diagnostics && typeof diagnostics === 'object') report.diagnostics = diagnostics;
  return { ok: true, report };
}

export const feedbackJson = report => JSON.stringify(report, null, 2);
