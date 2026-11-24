# UrbanFlow Atlas 1.8.0 — Economy & Strategic Management

## Status

**Candidate status: GO for code/test SHA `ca28f593fe2ab23b12ceab77afbf94eccd0cd2d5`.** All six GitHub Actions jobs passed on that SHA. The report-only follow-up commit will trigger a separate workflow; its result is not implied by the earlier run. No merge, tag, release or deployment was performed.

## Candidate and scope

- Version: `1.8.0-alpha`
- Base: `70b1bce4983b7f9c45eb3db5345e65dd6702df2b` (`v1.7.0-alpha`)
- Feature branch: `feature/alpha-1.8.0-economy-management`
- Save schema: 13 (required for persistent finance ledger and planning reserve)
- Production and Raspberry Pi: not accessed or changed.
- Ports 3101–3106: left untouched. Candidate runs on `http://127.0.0.1:3107/`, bound to loopback. `/health` currently reports `1.8.0-alpha` and source commit `ca28f593fe2ab23b12ceab77afbf94eccd0cd2d5`.

## Finance model

The game’s existing `state.revenue`, `state.expenses` and `state.budget` remain the sources of truth for observed operating income, operating costs and available cash. The new finance module does not reapply fare income or operating costs. It separately records capital and other one-time cash events: line construction/rebuild, vehicle purchases, investment approval/refund, city-asset maintenance and campaign grants. Campaign grants are kept outside operating revenue.

The ledger has idempotency keys where an operation can be retried, bounded event details (64), daily cash-flow samples (28), and weekly samples (12), with lifetime totals per event type. The plan reserve is a target only: it neither debits nor locks the campaign budget. Existing methods still perform purchases and approvals. Preview calculations are read-only.

Credit was not introduced: the game has no established debt balance, repayment schedule or bankruptcy treatment for loans. Strategic finance goals are derived from observed operating aggregates, budget, reserve target and planned project commitments; no new currency or repeated rewards were added.

## History, forecasts and migration

Finance views separate current cash, observed operating result, one-time costs/grants and recurring investment upkeep. Historical periods use existing observed daily/weekly network aggregates, with one-time events joined by simulation date/week. Old records are not fabricated.

Forecast horizons are 24 hours, 7 days and 28 days. They require respectively 3, 7 and 14 complete observed days and report a low/expected/high range plus known modeled maintenance commitments. They do not simulate future passenger choices or guarantee profit. When history is insufficient the UI reports that directly.

Schema 12 migrates to 13 with an empty event history and `historyComplete: false`; this preserves existing budget, lines, fleet, timetable, campaign, city, investment and mobility data without inventing historical capital events. Older supported schemas continue through existing migrations. Malformed finance state is rejected by validation and recovered to a safe empty ledger while retaining the rest of a valid campaign.

## Local verification

- `npm ci`: passed (72 packages installed; 73 audited, 0 vulnerabilities at install).
- `npm test`: **268 passed, 0 failed, 0 skipped**.
- `npm run test:browser`: **39 passed** (5.5 minutes after the click correction), including finance UI at 1920×1080, 1366×768, 390×844 and 360×800; full 12-step tutorial; Operations decision preview/apply; investments; passenger/city and routing; tram construction/edit/save/reload; local OSM graph views. Deterministic browser tests use local tile fixtures and are not evidence that the public tile service is reachable.
- `npm run audit:all`: passed, 0 vulnerabilities.
- `npm run audit:production`: passed, 0 vulnerabilities.
- `git diff --check`: passed.
- Real OpenStreetMap tile request: passed separately against the local candidate SHA `ca28f593fe2ab23b12ceab77afbf94eccd0cd2d5`. Playwright observed 6 unique tile requests, all HTTP 200; a tile rendered at 256×256, with no browser page errors. This is one desktop check of the public tile endpoint, not an availability guarantee.
- Live-map screenshot: `%TEMP%\urbanflow-alpha-1.8.0-live-osm-final\desktop-live-osm-1366x768.png`.

## Scenario and performance evidence

The Node suite includes deterministic 12-, 52- and 104-week economy/campaign scenarios. A 104-week finance test confirms repeatable operating cash, one-time ledger bounds, and daily/weekly history limits. Existing economy scenarios deliberately include a large-network loss, fleet shortages and excess frequency rather than forcing every scenario profitable.

Paired benchmark, same Node 24.19.0 process, 3 warm-up samples and 31 measured samples of 300 ticks each:

| Metric | 1.7.0 baseline | 1.8.0 candidate |
|---|---:|---:|
| Tick median | 0.665 ms | 0.660 ms |
| Tick p95 | 1.068 ms | 1.156 ms |
| Serialized save | 116,109 bytes | 116,949 bytes |

The candidate save is 840 bytes (+0.72%). Median tick time differs by -0.8%; p95 is +8.3% (about 0.089 ms). These are measurements from this Surface Book environment, not a performance guarantee. Finance snapshot/history/forecast/goals calculations measured below 0.003 ms p95 per call in this synthetic microbenchmark. The exposed-GC heap delta was negative, so it is not a meaningful retained-memory measurement; no memory improvement is claimed.

Finance UI screenshots are local test artifacts, not repository assets:

`%TEMP%\urbanflow-alpha-1.8.0-finance\` (`desktop-1920x1080.png`, `desktop-1366x768.png`, `mobile-390x844.png`, `mobile-360x800.png`).

## CI finding and correction

GitHub Actions run [45385668354](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45385668354) on implementation SHA `3f18966d4d1bbe7a91cc30d494913122f5fda469` completed with 5 of 6 jobs successful. Node 18, 20 and 22, security audit and container health passed. The browser job had 38/39 passes: its desktop route-edit test expected an inserted stop after a forced click, but observed 7 stops instead of 8. GitHub did not provide the failure trace artifact.

The test used `force: true` without asserting that the insertion control was in the viewport after the editor's delayed panel scroll. It now scrolls the control into view, asserts visibility, uses a normal click, and records that the click reached the correct control before retaining the same 8-stop assertion. The exact desktop scenario passed five consecutive local repetitions after this change; the full local suite then passed 39/39. No application behavior or assertions were weakened. Requesting a rerun of only the failed GitHub job returned 403 (`Resource not accessible by integration`), so a fresh full workflow was run.

Fresh workflow [45388428914](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45388428914) on code/test SHA `ca28f593fe2ab23b12ceab77afbf94eccd0cd2d5`: all six jobs succeeded — `test (18)`, `test (20)`, `test (22)`, `browser-test`, `security-audit`, `container-health`.

## Final branch handling

- The report-only follow-up will be pushed to the feature branch. It does not change application or test code; a new six-job Actions run is still required on that resulting HEAD.
- No merge, tag, release, deployment or production change is included in this work.

