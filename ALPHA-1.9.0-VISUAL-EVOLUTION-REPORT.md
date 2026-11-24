# UrbanFlow Atlas 1.9.0 — Visual Evolution Report

## Result

**Status: GO for technical review.** The 1.9.0 candidate is implemented on `feature/alpha-1.9.0-visual-evolution`, runs locally on `127.0.0.1:3108`, and passed the local test suite, live OSM tile check, and the first six-job GitHub Actions run.

## Revisions and runtime

- Base: `v1.8.0-alpha`, `a9e82fe65273b9ea35594afd9a7c516a582c6930`.
- Implementation commit: `8f398ec8f02d0d2197726307a4c0705dd6475ddd`.
- Package version: `1.9.0-alpha`.
- Candidate health reports the package version and full implementation SHA. The server listens on `127.0.0.1:3108` only.
- Local runtime: Node `v24.19.0`, npm `11.17.0`.
- Campaign save schema remains **13**; workspace preferences remain separate in local storage.

## What changed

- Added a workspace title, description, and position indicator for each of the five Atlas views.
- Reorganized existing task sections by workspace: transport, planning, passenger flow, development, and operations now emphasize their relevant existing tools and metrics.
- Restricted analytics layer choices to the active workspace while keeping the shared simulation as the data source.
- Kept workspace and analytics navigation controls mounted across ordinary renders; this preserves keyboard focus and avoids needless DOM replacement.
- Route creation, stop insertion, and saved route drafts open Network Planning so the active task stays visible.
- Selected-line vehicles receive an additional visual highlight. Atlas cards, navigation states, map controls, and mobile sheets use the refreshed Atlas visual language, with reduced-motion support.
- Updated existing browser scenarios to follow contextual navigation and added workspace regression coverage at desktop and two mobile sizes.

No simulation, economy, route geometry, campaign, or save-schema mechanics were changed.

## Visual review

Compared the same Operations entry state in 1.8.0 and 1.9.0. The 1.8.0 panel showed campaign guidance beneath the tabs; 1.9.0 adds a distinct Operations identity and brings the actual network diagnostics, fleet and finance dashboard into the workspace. The 1.9.0 screenshots also show a clearer active-tab state, panel hierarchy, KPI grouping, and compact mobile navigation.

Desktop screenshots (1366×768) and mobile screenshots (390×844, 360×800) for all five workspaces, plus Development sublayers, are stored outside the repository at:

`%TEMP%\urbanflow-alpha-1.9.0-visual-qa\`

The folder includes `desktop-{transport,planning,passengers,development,operations}.png`, corresponding `mobile-390x844-*` and `mobile-360x800-*` files, the 1.8.0 Operations comparison, and a separate real OSM capture. Screenshots were kept out of Git.

## Validation

| Check | Result |
|---|---|
| `npm ci` | Passed; 72 packages installed, 0 vulnerabilities |
| `npm test` | Passed: 273 tests, 0 failures |
| `npm run test:browser` | Passed: 42 tests, 0 failures; desktop, mobile, tutorial, tramway, routing, investments, Living City, and Atlas views covered |
| `npm run audit:all` | Passed; 0 vulnerabilities |
| `npm run audit:production` | Passed; 0 vulnerabilities |
| `git diff --check` | Passed |
| Live OSM check | Passed: 16 unique tile requests, 16 HTTP 200 responses, no non-200 tiles or browser errors |

The live OSM screenshot is `desktop-live-osm-1366x768.png`; it uses actual `tile.openstreetmap.org` imagery. Deterministic browser tests continue to use local mocked SVG tiles. The map attribution remains visible.

## Performance comparison

Measurements compare the exact 1.8.0 tag worktree and 1.9.0 on the same Windows/Node 24.19.0 environment. They are local browser/runtime measurements, not a device-wide guarantee.

- Passenger Flow analytics layer selection to two paint frames, 30 warmed Chromium samples at 1366×768: baseline median/p95 `34.3/47.5 ms`; candidate `30.8/47.3 ms` (median `-10.2%`, p95 `-0.4%`).
- Simulation tick, 31 samples × 300 ticks after warmup: baseline median/p95 `0.410/0.622 ms`; candidate `0.387/0.551 ms`.
- Serialized benchmark campaign: `116,970 bytes` in both versions.
- Dashboard read calculations stayed below `0.005 ms/call` p95 in the local synthetic benchmark; this does not measure a full frame or predict performance on other hardware.

## OSM and limitations

The live check confirms real OSM raster tiles load successfully and render with the map overlays. The deterministic screenshots are intentionally not evidence of live OSM availability. The live check is a single modest viewport request, not a test of long-term tile-provider availability.

No physical phone test was performed; touch behavior was exercised through Playwright mobile emulation. The design continues to use the existing Leaflet renderer and symbolic modeled city areas rather than parcel polygons.

## GitHub Actions

Implementation commit workflow: [run 45437644342](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45437644342) — **SUCCESS**. All six jobs passed: Node 18, Node 20, Node 22, Playwright, security audit, and container health. A separate run is required for the report commit and is checked before delivery.

## Local candidate

Candidate URL: `http://127.0.0.1:3108/`  
Health: `http://127.0.0.1:3108/health`  
Health reports version `1.9.0-alpha`, implementation SHA `8f398ec8f02d0d2197726307a4c0705dd6475ddd`, and environment `alpha-test`.
