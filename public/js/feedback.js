export const FEEDBACK_VERSION = '1.4.1-alpha';
export const FEEDBACK_CATEGORIES = Object.freeze([
  'Błąd', 'Niezrozumiała mechanika', 'Sugestia', 'Problem z wydajnością', 'Problem z interfejsem', 'Ocena pierwszej rozgrywki'
]);

const contextFields = ['device', 'resolution', 'screen', 'tutorialStep'];
const diagnosticFields = ['city', 'lines', 'lineCount', 'activeLines', 'elapsedMinutes', 'budget', 'waiting', 'carried'];
const cleanString = (value, max = 80) => typeof value === 'string' ? value.trim().slice(0, max) : null;

export function createFeedbackReport(input = {}, diagnostics = null, { version = FEEDBACK_VERSION, now = () => new Date(), context = null } = {}) {
  const errors = [];
  const category = String(input.category || '');
  const description = String(input.description || '').trim();
  const rating = Number(input.rating);
  if (!FEEDBACK_CATEGORIES.includes(category)) errors.push('Wybierz kategorię zgłoszenia.');
  if (!description || description.length > 3000) errors.push('Opis musi mieć od 1 do 3000 znaków.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Ocena musi wynosić od 1 do 5.');
  if (errors.length) return { ok: false, errors };
  const report = { schemaVersion: 2, gameVersion: cleanString(version, 40) || FEEDBACK_VERSION, createdAt: now().toISOString(), category, description, rating };
  const testerId = String(input.testerId || '').trim().slice(0, 60);
  if (testerId) report.testerId = testerId;
  if (input.includeContext === true && context && typeof context === 'object') {
    const selected = Object.fromEntries(contextFields.map(key => [key, cleanString(context[key])]).filter(([, value]) => value));
    if (selected.resolution && !/^\d{2,5}x\d{2,5}$/.test(selected.resolution)) delete selected.resolution;
    if (Object.keys(selected).length) report.context = selected;
  }
  if (input.includeDiagnostics === true && diagnostics && typeof diagnostics === 'object') {
    const selected = Object.fromEntries(diagnosticFields.map(key => [key, diagnostics[key]])
      .filter(([, value]) => typeof value === 'string' ? value.length <= 40 : Number.isFinite(value) && value >= 0));
    if (Object.keys(selected).length) report.diagnostics = selected;
  }
  return { ok: true, report };
}

export const feedbackJson = report => JSON.stringify(report, null, 2);
