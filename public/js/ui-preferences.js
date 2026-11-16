export const PANEL_WIDTH_KEY = 'urbanflow.ui.panel-width.v1';
export const DEFAULT_PANEL_WIDTH = 462;
export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH = 560;

export function clampPanelWidth(value, viewportWidth = globalThis.innerWidth || 1280) {
  const number = typeof value === 'string' ? parseFloat(value) : Number(value);
  const maximum = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.floor(Number(viewportWidth) * 0.48)));
  return Math.round(Math.min(maximum, Math.max(MIN_PANEL_WIDTH, Number.isFinite(number) ? number : DEFAULT_PANEL_WIDTH)));
}

export function loadPanelWidth(storage = globalThis.localStorage, viewportWidth = globalThis.innerWidth || 1280) {
  try {
    const stored = Number(storage?.getItem(PANEL_WIDTH_KEY));
    return clampPanelWidth(Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_PANEL_WIDTH, viewportWidth);
  } catch { return clampPanelWidth(DEFAULT_PANEL_WIDTH, viewportWidth); }
}

export function savePanelWidth(storage, value, viewportWidth = globalThis.innerWidth || 1280) {
  const width = clampPanelWidth(value, viewportWidth);
  try { storage?.setItem(PANEL_WIDTH_KEY, String(width)); } catch { /* Preference is optional. */ }
  return width;
}
