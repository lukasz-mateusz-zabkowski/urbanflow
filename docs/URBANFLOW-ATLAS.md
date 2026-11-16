# UrbanFlow Atlas 2.0 — fundament

Alpha 0.5 centralizes the current Atlas City look in CSS custom properties and records the names reserved for future views. `public/js/theme.js` is the presentation boundary: `applyAtlasView()` sets a view on the document root and falls back to `city`. No game rules or save fields depend on that setting.

The CSS token layer covers brand colors, text, surfaces, borders, spacing, radii, shadows, and the system font stack. Existing 0.4 colors remain the `city` values. Leaflet remains the map renderer.

## Future views

- **Atlas City:** current readable city palette and gameplay controls.
- **Atlas Network:** stronger route colors and transfer hierarchy for network planning.
- **Atlas Regional:** broader geography and regional corridors.
- **Atlas Midnight:** low glare palette for night sessions.
- **Atlas Studio:** higher contrast planning and diagnostics workspace.

Add each view as presentation tokens and map-layer styling. Keep simulation values, route selection, saved games, and passenger calculations independent from view selection. Review contrast, color-blind legibility, and mobile map visibility before enabling a view.
