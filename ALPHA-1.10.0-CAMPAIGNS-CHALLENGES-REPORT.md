# UrbanFlow Atlas 1.10.0 — Campaigns & City Challenges

Date: 2026-11-25  
Status: **GO for technical review; not merged, tagged, or deployed**

## Candidate and scope

- Base: `5f67fb9884e1776856406d5bebc258e635e34445` (`v1.9.0-alpha`). The requested `a9e82fe...` is an ancestor, but current `origin/main` and the release tag point to the later 1.9.0 quality-gate commit. The feature branch was created from that verified current main.
- Implementation commit: `e68792d8e0944e04bf88bb4085b31da13e2b63b8`.
- Documentation commit currently containing this report: `5529db626051f71736c267f49a446a92ef422e30`.
- Branch: `feature/alpha-1.10.0-campaign-challenges`.
- `origin/main` remains unchanged at the base SHA.
- Application version: `1.10.0-alpha`; save schema remains **13**.
- Candidate runtime: `http://127.0.0.1:3111/`. Port 3109 was already occupied by an existing 1.8.0 instance, which was left untouched. Baseline 1.9.0 for comparison ran temporarily on 3110; that test process was stopped after the benchmark. Candidate on 3111 remains running.

## Implemented

- Added three deterministic challenge campaigns: network recovery, financial recovery, and city growth. Each uses the existing routing, passenger cohorts, operating finance, investments, and City Evolution state.
- Challenge clocks advance with simulation time and stop while paused. Objectives are evaluated from campaign ticks, bounded by simulation deadlines, and finalized once on a normal terminal campaign outcome.
- Unavailable routes do not satisfy connection goals. Weekly finance objectives require complete sampled weeks.
- Added challenge selection, objective/deadline display, workspace shortcuts, and a completion/failure summary with measured outcomes.
- Protects existing local campaign data: starting a new campaign when a save exists requires export and explicit replacement confirmation; damaged raw save text can also be exported.
- Challenge state is additive and validated in schema 13. Old saves do not gain invented challenge progress, and existing classic campaign flow remains separate.
- Calibrated the growing-city employment objective to +0.1% after testing the actual growth model. At 52 weeks, +0.3% was not achievable under current dynamics; the resident objective remains +0.3%.

## Deterministic scenario evidence

The scenario tests exercise the normal game simulation, rather than awarding scripted results:

| Challenge | Outcome | Simulation time | Observed evidence |
|---|---|---:|---|
| Network recovery | Completed | 9,720 min (~6.75 days) | Useful connection, 2,500 carried passengers, modeled access +30% |
| Financial recovery | Completed | 29,880 min (~2.075 weeks) | Two complete positive operating weeks and cash target reached |
| City growth | Completed | ~34.96 weeks | Existing economic investment and local service; target district +33 residents / +17 jobs; access 39 |

Results are from deterministic test fixtures and do not imply guaranteed outcomes for arbitrary campaigns.

## Validation

- `npm ci`: passed.
- `npm test`: **283 passed, 0 failed** (Node.js 24; final run duration 45.008 s).
- `npm run test:browser`: **50 passed, 0 failed** (Playwright; 4.9 min), including campaign selection/save-protection across desktop and mobile layouts and the broader regression suite.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `git diff --check`: passed.
- `/health` on 3111: status `ok`, app `UrbanFlow`, version `1.10.0-alpha`, commit exactly `e68792d8e0944e04bf88bb4085b31da13e2b63b8`, environment `alpha-test`.
- Live OSM check against the candidate: **16/16 unique real tile requests successful**, no non-200 responses, no page errors. Example: `https://tile.openstreetmap.org/11/1137/693.png`. This is separate from deterministic browser tests that use local test tiles.
- Comparative warmed Atlas UI measurement (1366×768; four alternating fresh-session rounds, 60 samples per version): analytics-layer selection median 30.9 ms / p95 33.3 ms on 1.9.0 and median 30.7 ms / p95 44.9 ms on 1.10.0. Median delta: −0.6%. This is a local UI interaction benchmark, not a full simulation or hardware guarantee; p95 was 11.6 ms higher on this run.

## Visual artifacts

Artifacts are outside the repository to avoid committing bulky screenshots:

`C:\Users\Łukasz\AppData\Local\Temp\urbanflow-alpha-1.10.0-campaigns`

Examples:

- `desktop-1920x1080-atlas-network.png`
- `desktop-1920x1080-atlas-network.png`
- `desktop-1366x768-atlas-land-use.png`
- `mobile-390x844-atlas-network.png`
- `mobile-360x800-atlas-land-use.png`
- `selection-1920x1080.png` and `selection-360x800.png` — campaign choice at desktop and mobile widths.
- `desktop-live-osm-1366x768.png` — screenshot from the real-tile check above.

Playwright screenshots and traces are test artifacts; the live OSM screenshot is the evidence for external map tiles.

## GitHub Actions and delivery

The implementation commit was pushed to the feature branch. GitHub Actions run **45564310931** completed successfully for `e68792d8e0944e04bf88bb4085b31da13e2b63b8`; all six jobs passed: Node 18, Node 20, Node 22, browser-test, security-audit, and container-health.

https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45564310931

Container health runs on GitHub Actions; Docker/Linux Engine is unavailable locally, so no local container run is claimed. The report-only commit `5529db626051f71736c267f49a446a92ef422e30` was also checked separately; all six jobs passed in run **45564983163**: https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45564983163.

## Limitations and release boundary

- The current branch is a candidate for review, not a release. It has not been merged, tagged, published, or deployed.
- Scenario balance is deterministic and model-driven but remains alpha tuning; broad campaign balance should be validated with playtest feedback.
- Local browser tests ran on this Windows/Node 24 machine. CI provides the supported hosted matrix and container validation.
- No changes were made to Raspberry Pi, production, or main.

