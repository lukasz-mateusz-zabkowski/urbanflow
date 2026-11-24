export const ATLAS_PREFERENCE_KEY = 'urbanflow.atlas.preferences.v1';

export const ATLAS_VIEWS = Object.freeze([
  { id: 'transport', label: 'Transport', title: 'Sieć transportowa', eyebrow: 'ATLAS / SIEĆ', description: 'Obserwuj przebieg linii, obsługiwane punkty i problemy sieci.', analyticsMode: 'off' },
  { id: 'planning', label: 'Planowanie', title: 'Planowanie sieci', eyebrow: 'ATLAS / PROJEKT', description: 'Projektuj trasy, porównuj koszt i flotę, a zatwierdzaj dopiero po sprawdzeniu przebiegu.', analyticsMode: 'off' },
  { id: 'passengers', label: 'Pasażerowie', title: 'Przepływy pasażerów', eyebrow: 'ATLAS / RUCH', description: 'Analizuj kolejki, obciążenie, dostępność podróży i zarejestrowane niepowodzenia.', analyticsMode: 'flow' },
  { id: 'development', label: 'Rozwój miasta', title: 'Rozwój miasta', eyebrow: 'ATLAS / MIASTO', description: 'Porównuj modelowane obszary, dostępność transportu i aktywne inwestycje.', analyticsMode: 'cityEvolution' },
  { id: 'operations', label: 'Operacje', title: 'Operacje i finanse', eyebrow: 'ATLAS / ZARZĄDZANIE', description: 'Zarządzaj flotą i finansami, diagnozuj problemy oraz porównuj decyzje operacyjne.', analyticsMode: 'profit' }
]);

const FILTERS = new Set(['all', 'bus', 'tram']);
const SORTS = new Set(['load', 'cost', 'profitability']);

const safePreferences = value => ({
  view: ATLAS_VIEWS.some(item => item.id === value?.view) ? value.view : 'transport',
  lineFilter: FILTERS.has(value?.lineFilter) ? value.lineFilter : 'all',
  lineSort: SORTS.has(value?.lineSort) ? value.lineSort : 'load'
});

export function loadAtlasPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ATLAS_PREFERENCE_KEY);
    return raw ? safePreferences(JSON.parse(raw)) : safePreferences(null);
  } catch {
    return safePreferences(null);
  }
}

export function saveAtlasPreferences(preferences, storage = globalThis.localStorage) {
  const safe = safePreferences(preferences);
  try { storage?.setItem(ATLAS_PREFERENCE_KEY, JSON.stringify(safe)); } catch { /* Atlas preferences are optional. */ }
  return safe;
}

export function filterAndSortLines(lines = [], filter = 'all', sort = 'load') {
  const selected = FILTERS.has(filter) ? filter : 'all';
  const criterion = SORTS.has(sort) ? sort : 'load';
  const metric = line => Number.isFinite(Number(line.stats?.[criterion === 'profitability' ? 'balancePerHour' : criterion === 'cost' ? 'costPerHour' : 'load']))
    ? Number(line.stats?.[criterion === 'profitability' ? 'balancePerHour' : criterion === 'cost' ? 'costPerHour' : 'load']) : 0;
  return [...lines]
    .filter(line => selected === 'all' || line.type === selected)
    .sort((a, b) => metric(b) - metric(a) || String(a.id).localeCompare(String(b.id)));
}
