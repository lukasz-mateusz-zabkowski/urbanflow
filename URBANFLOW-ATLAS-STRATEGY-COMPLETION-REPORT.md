# UrbanFlow Atlas — strategy completion report

Date: 2026-11-26
Branch: `feature/alpha-2.9.0-fundament-ii-completion`
Integrated base: `origin/main` at `d19ab71763f47585e398502e7b4ebc76d18b418f`
Implementation commit: `797cf5d856683ddeac74259409db610620a4567f`
Release metadata: `2.9.0-alpha`
Save schema: 13

## Status by work area

| Area | Status | Evidence |
|---|---|---|
| Update 2.9 candidate from current main | DONE locally | Feature branch includes `d19ab71763f47585e398502e7b4ebc76d18b418f`; ancestry is preserved, no reset/rebase. |
| Release metadata | DONE | `package.json` and lockfile are 2.9.0-alpha; server `/health` derives version from `package.json`. Feedback test now asserts the release version and package/lock agreement. |
| Atlas Regional planning perspective | DONE for bounded 2.9 scope | New perspective selector and modeled settlement list/focus/plan actions; still no boundary polygons or interregional transit model. |
| Five Atlas workspaces and Studio | DONE in current main lineage | Existing five workspace ids retained; 2.0 Studio code is in planning. Theme and workspace changes remain UI preferences, separate from campaign save. |
| Long campaign save/resume | DONE in existing candidate history; revalidated locally | `test/city-evolution.test.js`: 104-week deterministic continuity with save/load at week 53, capped 12 reports, bounded population, jobs, land shares and demand. |
| Strategic behavior simulation | DONE as deterministic model test | New `test/strategy-scenarios.test.js`; five 52-week cases share the same modeled initial profile, repeat exactly and yield distinct area access, occupancy, demand and investment cost. These are simulated policies, not human playtests or observed city forecasts. |
| Tester kit | DONE as preparation | `URBANFLOW-ATLAS-2.9.0-PLAYTEST-KIT.md`; no external invitations or sessions conducted. |
| Beta / AdSense / micropayment design | DONE as a proposal only | `URBANFLOW-BETA-ADS-MICROPAYMENTS-ARCHITECTURE.md`; no hosting, auth, ads, telemetry or payments enabled. |
| Original visual concept comparison | PARTIAL | UI was reviewed against written Atlas requirements. Original November 2026 concept art was not available in this repository; no pixel- or concept-level match is claimed. |
| Atlas theme screenshots | DONE for automated visual evidence | Theme-switching E2E passed on desktop and 360×800 mobile; captures show City, Network and Midnight. This is Chromium emulation, not physical-device acceptance. |
| Real OSM runtime check | DONE | Live candidate server on `127.0.0.1:3113`; 16 unique tiles returned 200 and the page had no JavaScript errors. |
| GitHub Actions for candidate SHA | PENDING | Must be read after pushing final SHA. |
| Human playtest | NOT PERFORMED | No real tester responses are available. |
| Fundamental II integration | BLOCKED pending authorization | The candidate will remain on its feature branch. No main merge, tag, GitHub Release or deployment is authorized by this master prompt. |

## Candidate functionality

The added Regional perspective reuses existing Kraków satellite scenario points. It reports direct service only when a current line includes the settlement as a stop and is not marked routing unavailable. It does not infer transport from proximity or draw synthetic boundaries. A player can center the map on a settlement, view its profile and open Planning to choose stops. This is a planning aid; service itself still has to be built and validated by the existing routing engine.

Workspace and perspective state stay in the separate Atlas preference store. Switching perspective does not advance time, charge money, change fleet, add routes or change campaign save data. Campaign save schema remains 13.

## Automated strategic scenario results (52 simulated weeks)

All five tests use the same initial modeled city and fixed scenario inputs. The following values are model outputs for the Bieżanów area, not real demographic forecasts:

| Simulated policy | Access (0–100) | Residents | Jobs | Attractiveness | Demand factor | Modeled demand potential | Budget |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cautious investor | 0 | 10,167 | 2,355 | 23.78 | 0.896 | 12.745 | 500,000 |
| Aggressive network expansion | 50 | 11,814 | 2,732 | 59.98 | 1.041 | 16.277 | 500,000 |
| Profit focus | 41 | 11,452 | 2,640 | 52.49 | 1.009 | 15.778 | 500,000 |
| Accessibility focus with housing project | 41 | 11,509 | 2,689 | 53.18 | 1.014 | 16.216 | 415,000 |
| Poor management / overloaded corridor | 0 | 10,339 | 2,446 | 27.82 | 0.911 | 12.960 | 500,000 |

Each outcome retained 12 weekly reports; the same scenario reproduced byte-for-byte on repeat. The test validates different modeled outcomes and bounded demand (0.8–1.25). It is a controlled simulation, not a full alternative campaign engine or user study.

## Screenshots

Playwright captured the running game interface at the following sizes. UI-layout E2E tests intercept map tiles with a local SVG fixture, so these captures document layout and interactions only:

- `artifacts/alpha-2.9.0/desktop-transport.png`, `desktop-planning.png`, `desktop-passengers.png`, `desktop-development.png`, `desktop-operations.png` (1366×768)
- `artifacts/alpha-2.9.0/mobile-390x844-transport.png`, `...-planning.png`, `...-passengers.png`, `...-development.png`, `...-operations.png`
- `artifacts/alpha-2.9.0/mobile-360x800-transport.png`, `...-planning.png`, `...-passengers.png`, `...-development.png`, `...-operations.png`
- `artifacts/alpha-2.9.0/atlas-regional-desktop.png` and `atlas-regional-mobile.png` (Regional perspective)
- `artifacts/alpha-2.9.0/desktop-city.png`, `desktop-network.png`, `desktop-midnight.png` and `mobile-360x800-city.png`, `mobile-360x800-network.png`, `mobile-360x800-midnight.png` (theme captures from the verified theme-switch test)
- `artifacts/alpha-2.9.0/desktop-live-osm-1366x768.png` (real OSM, separate from fixture tests)
- Development subviews and notification layout captures are also in the same directory.

No original Atlas concept art was found, so the review compares actual UI to documented requirements rather than claiming an exact match.

## Local validation

| Check | Result |
|---|---|
| `npm ci` | PASS; 72 packages installed, 0 vulnerabilities reported |
| `npm test` | PASS after updating stale 2.5.0 expected version: 320/320 |
| `npm run test:browser` | PASS: 58/58, including 12-step onboarding, touch drag, tram editor, Regional, five workspaces and responsive viewports |
| `npm run audit:all` | PASS; 0 vulnerabilities |
| `npm run audit:production` | PASS; 0 vulnerabilities |
| Atlas theme visual E2E | PASS: 2/2 desktop and 360×800 mobile; theme changes preserve campaign/workspace and pass tested contrast checks |
| `git diff --check` | PASS |
| Candidate `/health` | PASS: `2.9.0-alpha`, commit `797cf5d856683ddeac74259409db610620a4567f` |
| Static game assets | PASS: `/`, `/js/main.js`, `/styles.css`, Leaflet all HTTP 200 |
| Loopback bind | PASS: listener on `127.0.0.1:3113` |
| Live OpenStreetMap tiles | PASS: 16/16 unique tiles HTTP 200, 0 page errors |
| Candidate GitHub Actions | Pending push and final SHA workflow |

The initial Node run after setting 2.9.0 failed because `test/feedback.test.js` still asserted `2.5.0-alpha`. That obsolete expectation was updated to assert 2.9.0-alpha and `package-lock.json` agreement; the complete rerun passed 320/320. No assertion was removed or weakened.

## Performance comparison

`scripts/benchmark-living-city.mjs` was run against the 1.7.0 baseline worktree and this candidate on the same local Node environment. Each run performs five warm-up samples and then reports median/p95 over repeated samples. These are single-run comparisons and are sensitive to machine noise:

| Lines | Measurement | 1.7.0 baseline | Candidate 2.9.0 | Interpretation |
|---:|---|---:|---:|---|
| 1 | Weekly evolution median / p95 | 0.18 / 0.43 ms | 0.14 / 0.40 ms | Small sample-level variation; no performance claim |
| 20 | Weekly evolution median / p95 | 0.74 / 1.10 ms | 0.70 / 1.32 ms | Median lower, p95 +0.22 ms; repeat before attributing a regression |
| 20 | Demand median / p95 | 0.06 / 0.32 ms | 0.05 / 0.09 ms | Small local timing sample |
| 1 | serialized city profile | 131,605 B | 131,605 B | unchanged |
| 20 | serialized city profile | 128,914 B | 128,914 B | unchanged |

The candidate adds map/UI list work only when the Regional perspective is active; it does not add work to every simulation tick. These benchmark numbers describe this developer machine and are not a Raspberry Pi guarantee.

## Beta and monetization readiness

`URBANFLOW-BETA-ADS-MICROPAYMENTS-ARCHITECTURE.md` proposes an isolated private host, individually revocable access, pinned image and health validation, no automatic deployments, no default telemetry, and server-verified cosmetic entitlements if purchases are considered in the future. It explicitly keeps game balance out of paid items. This is architecture only. No credentials, accounts, servers, ads or payments were created. Before implementation, business/hosting decisions, privacy/legal review and separate authorization are required.

## Release and branch decision

`main` remains untouched. No tag or release was created. Implementation commit `797cf5d856683ddeac74259409db610620a4567f` was tested locally and runs on loopback port 3113. The documentation/evidence update will be pushed on the feature branch and its exact SHA must receive successful GitHub Actions before the candidate can be presented for review. Even after green CI, this report does not authorize integration. Fundament II remains **INCOMPLETE** until Regional scope is accepted or completed, visual/human gates and all other release criteria are met, and each required main integration receives separate approval.
