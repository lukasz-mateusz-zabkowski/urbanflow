# UrbanFlow Alpha 0.5.0 Implementation Plan

> **For agentic workers:** Execute the checked tasks in order and verify each with `node --test`.

**Goal:** Prepare UrbanFlow 0.5.0 for local acceptance with a usable adjustable panel, explainable place and route information, local tester feedback, and an Atlas-ready visual token layer.

**Architecture:** Keep the existing Express, Leaflet, native ES modules, and schema-2 saves. Add small pure modules for place profiles, routing diagnostics, and feedback serialization; keep presentation in the existing UI and CSS. Store panel width separately from game saves.

**Tech Stack:** Node.js 18+, native JavaScript, Leaflet 1.9.4, CSS custom properties, Node test runner.

**Spec:** User-provided UrbanFlow Alpha 0.5.0 sprint brief (2026-11-16).

## Global Constraints

- Do not deploy to production or modify Raspberry Pi services or databases.
- Preserve version 0.4.0 save compatibility and existing game mechanics.
- No new runtime framework or public feedback backend.
- Do not change the map renderer.
- Work on `feature/alpha-0.5.0`, never merge to `main`.

## Review Focus

- An unreachable or disconnected routing graph must be labeled as a direct fallback rather than silently described as a routed path (routing tests).
- Missing or unknown place profiles must show neutral, engine-derived information without fabricated demand values (profile tests).
- Invalid stored panel widths and malformed feedback form data must be safely bounded or rejected (settings and feedback tests).
- Leaflet must recalculate its viewport after panel resizing and remain usable on small screens (local browser review).
- Opt-in diagnostic data must be absent by default from exported feedback (feedback tests).

### Task 1: Route calculation details

**Files:** Modify `public/js/routing.js`; create `test/routing-diagnostics.test.js`.

- [x] Test Bronowice–Krowodrza Górka graph route, algorithm/source metadata, and disconnected fallback metadata.
- [x] Add `routeSegmentDetails` and `routeLineDetails`; retain existing coordinate-returning APIs.
- [x] Run focused and full Node test suites.

### Task 2: Place profiles

**Files:** Create `public/js/place-profiles.js`, `test/place-profiles.test.js`; modify `public/js/map.js`, `public/js/main.js`, `public/js/ui.js`, `public/index.html`.

- [x] Test supported point types, model-derived estimated demand, and service connections.
- [x] Add escaped desktop tooltips and a selected-place details card usable on touch.
- [x] Run focused and full Node test suites.

### Task 3: Resizable panel and Atlas tokens

**Files:** Modify `public/index.html`, `public/styles.css`, `public/js/ui.js`, `public/js/map.js`; create `public/js/theme.js`, `test/ui-preferences.test.js`, `docs/URBANFLOW-ATLAS.md`.

- [x] Test panel width clamping and safe preference read/write.
- [x] Add a wider default, pointer and keyboard separator, collapse/reopen controls, and mobile sheet behavior.
- [x] Observe map size changes and call Leaflet `invalidateSize`.
- [x] Centralize existing colors, type, spacing, and elevation tokens; document future Atlas views.
- [ ] Run focused and full Node test suites; inspect desktop and mobile locally. (Tests passed; visual inspection was blocked by the GUI approval review.)

### Task 4: Tester feedback

**Files:** Create `public/js/feedback.js`, `test/feedback.test.js`; modify `public/index.html`, `public/js/ui.js`, `public/styles.css`.

- [x] Test required fields, categories, rating bounds, version metadata, privacy defaults, and JSON export.
- [x] Add a dialog with copy and JSON download actions; diagnostics require explicit opt-in.
- [x] Run focused and full Node test suites.

### Task 5: Release preparation

**Files:** Modify `package.json`, `package-lock.json`, `server.js`, `README.md`; create `CHANGELOG.md`, `ALPHA-0.5.0-REPORT.md`, `.github/workflows/test.yml`.

- [x] Set application and health endpoint version to 0.5.0 without changing save schema.
- [x] Add CI using the existing Node test suite and Node 18/20/22.
- [x] Document local start, routing findings, known limits, and rollback-safe release boundaries.
- [ ] Run full tests, start local server, verify health and browser behavior, inspect diff, commit on the feature branch, and prepare a PR if GitHub write access permits. (96 tests, server, health, diff, commit, and push verified; visual review was blocked and GitHub PR creation returned 403.)
