# UrbanFlow Alpha 1.4.0 — Final Onboarding Quality Gate

## Status

**GO for technical review and integration.** The final onboarding and route-editor browser checks pass locally, and GitHub Actions run [#72](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44593036174) passed all six jobs on implementation commit `72e3b79c55014f272d50e3cf144fc4aeacb3a3a8`. The feature branch remains separate from `main`; no tag, release, production deployment, or Raspberry Pi operation was made.

## Repository

- Repository: `lukasz-mateusz-zabkowski/urbanflow`
- Base `main`: `22abeccf742908c6a1262a6c1853662a7a488922` (unchanged)
- Branch: `feature/alpha-1.4.0`
- Tested feature implementation commit: `a8bd0830a4cdb745daced247149e0407a97ec0b7`
- Final browser-regression commit: `72e3b79c55014f272d50e3cf144fc4aeacb3a3a8`
- The feature branch was pushed and its remote head was verified equal to the local head.
- Two unrelated, untracked user documents remain untouched: `URBANFLOW-1.0.1-RELEASE-HARDENING.md` and `URBANFLOW-RELEASE-INTEGRATION-1.0.0.md`.

## Twelve-step onboarding audit

| Step | Completion evidence for new saves | Legacy save behavior |
|---|---|---|
| Map and panel | Selecting a real map point records map exploration. | An existing line can stand in for this earlier action. |
| First goal | Selecting the scenario hub/center or a starter route records goal selection. | Existing line is accepted. |
| Plan a bus line | Selecting two or more bus stops or a starter route records a plan. | Existing line is accepted. |
| Review cost | The valid preview must be visible in the decision panel; preview does not spend money. | Existing line is accepted rather than forcing a repeat. |
| Build line | A real line must exist. | Existing line is retained. |
| Start simulation | Elapsed game time must be greater than zero. | Saved simulation time is retained. |
| Carry passengers | The simulation's carried-passenger counter must be positive. | Saved counter is retained. |
| Inspect fleet | After real service, the player opens a line detail; merely owning a line is insufficient for new saves. | Existing vehicle/service statistics are used. |
| Diagnose network | Observed network history must exist and the player must view a diagnostic layer. | Existing diagnostic state/history is recognized. |
| Improve network | `networkVersion` must advance after the diagnostic baseline. | Existing later network changes are recognized. |
| Discover opportunities | Player opens City Evolution or Land Use. | Existing unlocked campaign content is recognized. |
| Learn investments | Player opens Investments, or an existing legacy project is present. | Existing approved/completed investments are recognized. |

Fresh schema-11 saves use a small versioned set of action flags for steps that cannot be inferred from simulation state. These flags add no reward and do not change campaign progress, passenger counts, or money. Schema remains 11. Older saves without the flags are treated as legacy and use existing campaign facts, so progress is not reset. A finished campaign pauses any remaining tutorial steps and does not restart the campaign.

## Changes

- Tightened new-player completion rules: line existence alone no longer counts as cost review, fleet inspection, diagnostics, opportunities, or investment discovery.
- Added persisted action tracking for route/goal planning, visible valid cost review, fleet detail visit, opportunities, and investment view. Diagnostic completion is recorded only after network observations exist and the diagnostic view is rendered.
- Kept skip/restart as preferences only; neither grants rewards nor resets the campaign.
- Added save validation for the new optional tutorial tracker while preserving pre-1.4 schema-11 saves.
- Added a full real-UI desktop walkthrough that executes all 12 steps, carries passengers through the simulation, pauses before reload, and checks saved budget, lines, passenger totals, and schema after resuming.
- Added mobile touch checks at 390×844 and 360×800 for map/panel navigation, route preview/build, line details, purchase cancellation without spending, and overflow.
- The first mobile automation attempt exposed a test setup issue: its helper opened the panel over the map, intercepting marker taps. The flow now closes the panel before tapping the map. A reload comparison also now pauses the simulation first, so it compares a stable saved state.
- Added a CI step for `compose.alpha-test.yml` using a per-run project name. It builds, starts, checks version and SHA, verifies loopback port binding and no mounts, requests the page and Leaflet asset, stops the service, and cleans up.

## Validation

- `npm ci`: passed; 0 vulnerabilities reported during install.
- `npm test`: **232 passed, 0 failed**.
- `npm run test:browser`: **25 passed, 0 failed**.
- Full first-player walkthrough: all 12 steps completed through the standard game UI in **about 6 seconds**; 54 passengers were transported by the simulation; schema 11, budget, line count, and carried total were unchanged across a paused reload.
- Mobile UI: route planning/build, safe purchase cancellation, line details and no horizontal overflow passed at 390×844 and 360×800.
- Legacy-save tests: schema-11 campaigns without onboarding fields load and retain campaign, budget and transit state; developed saves infer prior progress from saved simulation facts.
- Ended-campaign test: remaining tutorial work is unavailable without changing the final game state.
- Feedback tests: local JSON is created without automatic upload; diagnostics remain absent unless the separate explicit consent is given. Context and diagnostics are not inferred from a save.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `git diff --check`: passed.
- GitHub Actions [run #70](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44589545144): **all six jobs succeeded** (Node 18, 20 and 22; browser test; security audit; container health). The container-health job also ran the isolated alpha Compose profile successfully.
- A subsequent run [#71](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44590155053) exposed a timing-sensitive tutorial assertion: simulation time advanced while the test expected exactly step 5. The browser test now pauses the simulation around line creation and verifies the saved line before resuming. The route-editor test also now scrolls the panel's actual CTA into view, asserts its visibility, and clicks normally rather than using a forced off-screen click.
- Final branch run [#72](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44593036174) on `72e3b79c55014f272d50e3cf144fc4aeacb3a3a8`: **all six jobs succeeded**: Node 18, 20 and 22, browser test, security audit, and container health.

## Isolated alpha test profile

`docker compose -f compose.alpha-test.yml config` passed with an explicit SHA. The resolved profile binds only `127.0.0.1:3101`, has no volume mounts, is tagged with the supplied commit SHA, and has restart disabled. The Docker Desktop Linux engine was unavailable locally, so no local container was started. The new CI check exercised the real Compose build/start/health/version/SHA/asset/port/mount/stop/cleanup path on an isolated GitHub runner. No public endpoint or production configuration was used.

## Screenshots

Playwright saved real game-interface screenshots outside the repository under `%TEMP%\urbanflow-alpha-1.4.0-visual-qa\`:

- `onboarding-desktop-start.png`
- `onboarding-desktop-completed.png`
- `onboarding-desktop-feedback.png`
- `onboarding-mobile-start.png`
- `onboarding-mobile-line-details-390.png`
- `onboarding-mobile-line-details-360.png`
- `onboarding-mobile-feedback.png`

The browser tests use deterministic local SVG basemap tiles while exercising the real app interface and local game/routing code; the screenshots do not validate live map-tile service availability.

## Limits and release state

- A live local Docker start/stop could not be performed because Docker Desktop's Linux engine pipe was unavailable; the equivalent isolated Compose runtime test passed in CI.
- Dismissed contextual hints are deduplicated during the current UI session; a still-applicable condition may be shown again in a later session.
- No merge, tag, GitHub Release, production deployment, or Raspberry Pi operation was performed.
- Recommendation: review and integrate `feature/alpha-1.4.0` through the repository's normal process.
