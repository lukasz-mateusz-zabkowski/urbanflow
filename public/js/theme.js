export const ATLAS_VIEWS = Object.freeze({
  city: { label: 'Atlas City', available: true },
  network: { label: 'Atlas Network', available: false },
  regional: { label: 'Atlas Regional', available: false },
  midnight: { label: 'Atlas Midnight', available: false },
  studio: { label: 'Atlas Studio', available: false }
});

export function applyAtlasView(view = 'city', root = globalThis.document?.documentElement) {
  const selected = ATLAS_VIEWS[view]?.available ? view : 'city';
  root?.setAttribute('data-atlas-view', selected);
  return selected;
}
