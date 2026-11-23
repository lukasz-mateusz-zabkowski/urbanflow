# UrbanFlow ALPHA 1.4.1 — Playtest Hardening Report

**Status: GO for technical review**  
**Baseline:** `80850566a35239e9c39a13caf95943d5ce919f13` (private playtest package)  
**Implementation commit:** `a81e93f1added37ffaab028ed220dfbe9b6e5539`  
**Branch:** `feature/alpha-1.4.1-playtest-hardening`  
**Validation date:** 2026-11-23

This is a test candidate, not a production release. No merge, tag, GitHub Release, Docker run, Raspberry Pi operation, or production change was performed. The existing 1.4.0 instance and its browser origin were preserved.

## Changes

- Updated the candidate version to `1.4.1-alpha`; feedback exports now use the actual application version instead of a hard-coded `1.4.0-alpha` value. A Node regression test checks the version source.
- Made deterministic local SVG map tiles the default in the browser-test fixture. The separate live OpenStreetMap check remains distinct, so fixture success is not presented as proof that OSM tiles loaded.
- Reworked the tramway browser fixture to unlock trams through the real campaign progression and simulation, rather than directly mutating the unlock state. The browser scenario now covers manual track preview, cancellation without charge, construction, geometry editing, save, reload, and restored geometry. Existing touch-drag coverage remains enabled.
- Increased only the relevant route-graph wait bounds for compressed OSM startup in the tramway browser scenario; the test still verifies the graph and route behavior.

No repeatable production-code defect was found in tram geometry, campaign persistence, buses, investments, or tutorial flow during this pass. No simulation or economic rules were changed. The previously completed first four user playtest scenarios remain user-reported; no qualitative ratings or detailed UX notes were provided. The remaining tramway and persistence flows were exercised automatically in isolated browser contexts.

## Validation

| Check | Result |
|---|---|
| `npm ci` | Pass; 72 packages installed |
| `npm test` | Pass; 237/237 tests |
| `npm run test:browser` | Pass; 26/26 tests, including desktop/mobile viewports and tramway workflows |
| `npm run audit:all` | Pass; 0 vulnerabilities |
| `npm run audit:production` | Pass; 0 vulnerabilities |
| `git diff --check` | Pass |
| GitHub Actions for implementation commit | Pass; all six jobs succeeded |

CI run: [GitHub Actions run 45171772321](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45171772321). Jobs: Node 18, 20 and 22; browser test; security audit; container health. The report-only commit is checked separately after push; its Actions result is not inferred from this implementation-commit run.

### Save/restart exercise

An isolated Playwright Chromium context created a seeded campaign, advanced the real simulation until tram unlock, built and saved a manual tram route, and captured a state summary. The local candidate server was then stopped and restarted while retaining the same isolated browser origin. After reload, the saved state matched for budget, line IDs/types/geometries, passengers carried, cohort count, campaign progress, and investments. Schema 11 remained in use. No user or production save was opened or modified. Malformed/incomplete-save handling continues to be covered by the existing automated Node tests; this run did not alter the save schema.

## Live map and interface evidence

The live-map check was separate from the deterministic fixture run: the browser loaded 16 OpenStreetMap tiles, all returned HTTP 200, and the console recorded zero JavaScript errors. The map showed Kraków tiles with the game overlays. This establishes availability during this check only, not a guarantee of the external tile service.

Screenshots and Playwright artifacts are outside the repository, under:

`%TEMP%\urbanflow-alpha-1.4.1-playtest-artifacts`

Selected evidence:

- `live-osm-desktop-1366x768.png` — live OSM map and overlays.
- `tramway-manual-desktop-1366x768.png`, `tramway-manual-mobile-390x844.png` — manual construction.
- `tramway-edit-before-desktop.png`, `tramway-edit-preview-desktop.png`, `tramway-edit-saved-desktop.png` — edit before, preview, and saved geometry.
- `tramway-edit-before-mobile.png`, `tramway-edit-preview-mobile.png` — mobile edit preview.
- `tramway-new-build-preview-desktop-1366x768.png`, `tramway-new-build-saved-desktop-1366x768.png` — new build preview and result.
- `desktop-1920x1080.png`, `desktop-1366x768.png`, `desktop-1280x720.png`, `mobile-390x844.png`, `mobile-360x800.png` — viewport coverage.

Screenshots are not committed, avoiding large test artifacts in the repository.

## Browser environments and known limits

- The deterministic suite covers 1920×1080, 1366×768, 1280×720, 390×844 and 360×800. Mobile tests exercise touch interactions in Playwright; no new physical-device manual test is claimed.
- At city-wide zoom, local stop markers can appear clustered. Zooming reveals individual stops; no data positions were changed.
- Mixed OSM routes and player-built tram track remain a known limitation from the existing design.
- Earlier user UX scores/comments were not supplied, so this report records reproducible technical checks rather than subjective playtest findings.
- Benchmarks on this Surface Book were comparable to 1.4.0 in the same script. Tick medians/p95 (ms): no projects `0.495/1.012` baseline vs `0.475/0.968` candidate; six projects `0.448/0.917` vs `0.450/0.974`. Heap deltas varied with GC/JIT (`3.19 MB` vs `4.46 MB` with no projects; `2.84 MB` vs `2.96 MB` with six). No simulation code changed, so these noisy measurements do not support a performance-improvement claim.

## Local candidate instance

The candidate is running at `http://127.0.0.1:3102/` with `URBANFLOW_ALPHA_TEST=1`. `/health` reports version `1.4.1-alpha`, commit `a81e93f1added37ffaab028ed220dfbe9b6e5539`, and `environment: alpha-test`. The listener is bound to loopback only. The existing stable instance remains at `http://127.0.0.1:3101/`; its `/health` reports `1.4.0-alpha` and `346bcbe9880d8719d4c8cf8a3d8b26a6e89b2491`. Both listeners were verified on `127.0.0.1`, and the production environment was not accessed.

## Decision

**GO for technical review of the ALPHA 1.4.1 candidate.** Automated tests, audits, the isolated save/restart exercise, live map check, and implementation-commit CI passed. This does not certify subjective UX acceptance or a physical-device test, and it does not authorize public playtesting or deployment.
