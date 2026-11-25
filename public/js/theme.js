export const ATLAS_VIEWS = Object.freeze({
  city: { label: 'Atlas City', available: true },
  network: { label: 'Atlas Network', available: false },
  regional: { label: 'Atlas Regional', available: false },
  midnight: { label: 'Atlas Midnight', available: false },
  studio: { label: 'Atlas Studio', available: false }
});

export const ATLAS_THEMES = Object.freeze({
  city: { label: 'Atlas City', description: 'Czytelna mapa miasta i rozwój obszarów.' },
  network: { label: 'Atlas Network', description: 'Kontrastowa analiza tras, przystanków i przepływów.' },
  midnight: { label: 'Atlas Midnight', description: 'Ciemny interfejs do dłuższej pracy analitycznej.' }
});

export const ATLAS_THEME_STORAGE_KEY = 'urbanflow.atlas.theme.v1';

function validTheme(value) {
  return Object.hasOwn(ATLAS_THEMES, value) ? value : 'city';
}

export function loadAtlasTheme(storage = globalThis.localStorage) {
  try { return validTheme(storage?.getItem(ATLAS_THEME_STORAGE_KEY)); }
  catch { return 'city'; }
}

export function saveAtlasTheme(theme, storage = globalThis.localStorage) {
  const selected = validTheme(theme);
  try { storage?.setItem(ATLAS_THEME_STORAGE_KEY, selected); } catch { /* Theme choice is optional. */ }
  return selected;
}

export function applyAtlasTheme(theme = 'city', root = globalThis.document?.documentElement) {
  const selected = validTheme(theme);
  root?.setAttribute('data-atlas-theme', selected);
  return selected;
}

export function applyAtlasView(view = 'city', root = globalThis.document?.documentElement) {
  const selected = ATLAS_VIEWS[view]?.available ? view : 'city';
  root?.setAttribute('data-atlas-view', selected);
  return selected;
}
