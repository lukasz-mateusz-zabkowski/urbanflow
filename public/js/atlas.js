export const ATLAS_PREFERENCE_KEY = 'urbanflow.atlas.preferences.v1';

export const ATLAS_VIEWS = Object.freeze([
  { id: 'transport', label: 'Transport', description: 'Linie, przystanki i stan sieci', analyticsMode: 'off' },
  { id: 'planning', label: 'Planowanie', description: 'Budowa i edycja infrastruktury', analyticsMode: 'off' },
  { id: 'passengers', label: 'Pasażerowie', description: 'Przewozy, kolejki i popyt', analyticsMode: 'flow' },
  { id: 'development', label: 'Rozwój miasta', description: 'Dostępność, zagospodarowanie i inwestycje', analyticsMode: 'cityEvolution' },
  { id: 'operations', label: 'Operacje', description: 'Budżet, flota i problemy sieci', analyticsMode: 'profit' }
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
