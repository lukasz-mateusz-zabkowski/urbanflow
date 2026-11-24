# UrbanFlow Atlas 1.6.0 — Transport Operations

## Status

**GO for technical review.** Local Node, Playwright, audit, benchmark, and real OSM checks pass. All six GitHub Actions jobs passed for both the implementation commit and the report-only branch HEAD recorded below. No merge, tag, release, production access, or Raspberry Pi operation was performed.

## Branch and commits

- Base: `v1.5.0-alpha` / `232d9c339e0d043ad2671eae163c39ddc34bd0c5`.
- Implementation commit: `bc810bbd0f4008ea0ee24d47ecff2da572fbfa09` on `feature/alpha-1.6.0-transport-operations`.
- Implementation branch was pushed to GitHub and matched this commit before this documentation-only report commit.
- Report-only branch HEAD tested in GitHub Actions: `588e1314aa5d2f13120eb520c98b10b9035647ce`; it follows the implementation commit and changes no application or test source.
- The work is isolated in `urbanflow-alpha-1.6.0`; the original worktree and its untracked user documents were not altered.

## What changed

- Operations now shows owned, assigned, and reserve vehicles by transport type, reserve maintenance using the existing model, and observed line costs only when there is complete history for the aggregate.
- Every active line appears with evidence-based capacity/idle signals and an explicit **Open line** action that always opens its details. It works when the line was already selected.
- A proposal simulator compares current and proposed frequency, seats/hour, required vehicles, and modelled operating cost/hour at the same game time and service-day type. It supports reserve assignment/removal, purchase and assignment, a uniform frequency, and an existing timetable profile.
- Preview and cancellation do not mutate the campaign. Applying asks for confirmation and calls the existing game methods. Forecast passenger counts, future queues, fares, or revenue are intentionally not invented.
- The existing timetable editor and line detail remain the source for period-by-period schedule controls. No second timetable or passenger engine was added.
- Campaign save schema remains **11**. UI preferences and preview state are not added to campaign saves.

## Verification

- `npm ci`: passed; 72 packages installed, 0 reported vulnerabilities.
- `npm test`: **245 passed, 0 failed**.
- `npm run test:browser`: **32 passed**. Includes operations preview/apply and fleet navigation at 1920×1080, 1366×768, 390×844, and 360×800, alongside tutorial, timetable, investment, bus, tram, save/resume, and OSM graph regressions.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `git diff --check`: passed.
- Live OSM check against the candidate on port 3105: 9 unique tile requests, **9 HTTP 200**, 1 rendered tile in the captured view, 0 page errors. Screenshot: `%TEMP%/urbanflow-alpha-1.6.0-live-osm/desktop-live-osm-1366x768.png`.
- Operations screenshots: `%TEMP%/urbanflow-alpha-1.6.0-operations/desktop-1920x1080.png`, `desktop-1366x768.png`, `mobile-390x844.png`, `mobile-360x800.png`. These Playwright screens use a local SVG tile fixture; they are not presented as live OSM evidence.

## Performance

`npm run benchmark:operations` ran on Node `v24.19.0` with 20 warm-up iterations and 100 measured iterations, using 20 synthetic lines and 22 modeled areas:

| Operation | Median | p95 |
|---|---:|---:|
| Existing-model single-line `lineMetrics` calculation (1.5.0 proxy) | 0.003 ms | 0.013 ms |
| Current/proposed decision comparison, including staged timetable clone | 0.078 ms | 0.150 ms |
| Fleet snapshot for 20 lines | 0.099 ms | 0.295 ms |

The baseline is a proxy measured in the same environment, not a historical 1.5.0 run. Heap delta was `-44,616` bytes over the run and is too small/noisy to claim a memory improvement. These Node measurements do not guarantee browser frame time or performance on other hardware.

## Local candidate

- `http://127.0.0.1:3105/` remains running from this worktree.
- `/health`: version `1.6.0-alpha`, commit `bc810bbd0f4008ea0ee24d47ecff2da572fbfa09`, `alpha-test` environment.
- Listener is bound to `127.0.0.1`. Existing listeners on 3101–3104 remained present and were not stopped or modified.
- Screenshot checks show a responsive operations panel. The test browser applied a confirmed reserve vehicle while the game clock was paused; live play continues to incur ordinary tick costs as designed.

## GitHub Actions

- Run: [Tests #45345381008](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45345381008) for `bc810bbd0f4008ea0ee24d47ecff2da572fbfa09` — **success**.
- `test (18)`, `test (20)`, `test (22)`, `browser-test`, `security-audit`, and `container-health`: all succeeded.
- Run: [Tests #45345892456](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45345892456) for report-only HEAD `588e1314aa5d2f13120eb520c98b10b9035647ce` — **success**, all six jobs.

## Limits and next step

The simulator compares operational service/cost metrics at one shared moment. It does not run two future passenger simulations and cannot claim ridership, revenue, or profitability improvement. Observed costs are withheld where history is incomplete. Desktop-browser touch emulation is not a physical phone test. The benchmark's 1.5 baseline is a model-calculation proxy, not a prior release measurement.

**Recommendation: GO for technical review.**
