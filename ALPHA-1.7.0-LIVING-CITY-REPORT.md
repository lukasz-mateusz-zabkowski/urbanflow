# URBANFLOW ALPHA 1.7.0: LIVING CITY REPORT

## Status

**Status: pending final validation.** This is a feature-branch candidate; it has not been merged, tagged, released, or deployed. Final commit, test and CI results will be recorded after validation.

## Scope and architecture

1.7.0 extends the existing weekly City Evolution, Land Use, demand and campaign systems. It does not add a second economic engine, passenger generator or city state. Transport accessibility now weights reachable complementary-use districts by modeled residents and jobs. A served area with no reachable complementary destination receives no artificial baseline accessibility benefit.

The City Development workspace now presents a Living City profile, symbolic map markers, observed weekly snapshots, an optional side-by-side comparison of two modeled areas, and a shortcut to Network Planning. Markers show modeled attractiveness, growth potential and resident trend; they do not represent precise district boundaries.

City evolution remains a deterministic weekly simulation update, independent of rendering frequency. Existing damped growth, capacity, land-use reserve, service quality and investment constraints remain in force. Area demand factors flow through the existing OD/cohort pipeline and do not create an additional cohort stream.

## Calibration and matched scenarios

The benchmark uses the same deterministic Krakow campaign setup for three 12-week and 52-week cases: no new service, service only, and service with a housing investment in Bieżanów. These are simulation parameters, not real demographic forecasts.

Candidate benchmark run (Node on the current Windows development environment):

| Scenario | Weeks | Bieżanów transport access | Residents | Jobs | Residential attractiveness | Capacity | Demand factor | Budget |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| No new service | 12 | 0 | 11,155 | 2,594 | 27.02 | 13,622 | 0.98265 | 500,000 |
| Service only | 12 | 41 | 11,383 | 2,640 | 53.63 | 13,622 | 1.00273 | 500,000 |
| Service + housing investment | 12 | 41 | 11,401 | 2,640 | 54.33 | 16,775 | 1.00432 | 415,000 |
| No new service | 52 | 0 | 10,167 | 2,355 | 23.78 | 13,622 | 0.89561 | 500,000 |
| Service only | 52 | 42 | 11,566 | 2,673 | 54.78 | 20,161 | 1.01885 | 500,000 |
| Service + housing investment | 52 | 42 | 11,586 | 2,673 | 54.78 | 20,395 | 1.02061 | 415,000 |

The investment changes modeled housing capacity, not immediate occupancy. Actual population changes remain gradual and bounded. In the no-service scenario, the modeled district declines over time; service improves access and the development trend. This is an internal game-model comparison, not evidence that a particular real line would cause these demographic outcomes.

## Save compatibility

Save schema advances from 11 to 12 because truthful per-area weekly history is persistent state. Schema 11 migrates without changing campaign, budget, lines, fleet, cohorts, investments or current district profiles. Historical snapshots not present in old saves remain empty rather than being fabricated. Weekly history remains capped at 12 reports.

## Performance measurements

Measurements use five warm-up iterations and 30 samples. They are machine-dependent and not Raspberry Pi guarantees. Comparison was run in the same Node process environment with the benchmark script pointed at the 1.6.0 main worktree and the 1.7.0 candidate.

| Lines | Version | Weekly access + development median / p95 | Demand forecast median / p95 | Serialized City Evolution | Heap used at sample |
|---:|---|---:|---:|---:|---:|
| 1 | 1.6.0 | 0.22 / 0.46 ms | 0.09 / 0.22 ms | 32,762 B | 7,876,400 B |
| 1 | 1.7.0 | 0.18 / 0.39 ms | 0.07 / 0.18 ms | 131,605 B | 7,022,720 B |
| 20 | 1.6.0 | 0.85 / 1.53 ms | 0.06 / 0.11 ms | 29,397 B | 7,196,712 B |
| 20 | 1.7.0 | 0.98 / 1.78 ms | 0.07 / 0.16 ms | 128,914 B | 7,130,136 B |

The main measurable cost is the additional bounded weekly history, which makes the serialized City Evolution state about 129–132 KB in this scenario (roughly four times the prior state). It is limited to 12 reports and the project’s existing save-size validation. Timings are short and noisy; they do not establish a general speedup or regression.

## Validation results

| Check | Result |
|---|---|
| `npm ci` | PASS; 73 packages audited, 0 vulnerabilities |
| `npm test` | PASS; 253 tests, 0 failed |
| `npm run test:browser` | PASS; 35 tests across desktop/mobile, 0 failed |
| `npm run audit:all` | PASS; 0 vulnerabilities |
| `npm run audit:production` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS |
| Live OSM tile verification | pending |
| Local app on `127.0.0.1:3106` | pending |
| GitHub Actions (six jobs) | pending |

Living City focused Playwright coverage has passed at 1366×768, 390×844 and 360×800 during development. It checks selecting a modeled area, its profile, two-area comparison, map selection, transition to planning, no horizontal overflow and no page errors. This is not a physical-phone test.

Screenshots are kept outside the repository at `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.7.0-living-city\`. The focused Living City suite saved desktop 1366×768, mobile 390×844 and mobile 360×800 screenshots. The independent live OSM screenshot will be added to the same directory.

## Known limitations

- Accessibility measures connected service-stop components and modeled complementary-use reach; it is not door-to-door routing or a travel-time accessibility study.
- District residents, jobs, attractiveness and development are game parameters, not observed demographic or planning data.
- Older save histories cannot be backfilled with observations that were never recorded.
- The bounded weekly snapshot increases save size; the benchmark’s City Evolution payload is approximately 130 KB.
- Browser emulation does not replace physical device testing. No Raspberry Pi performance claim is made.

## Release decision

**GO/NO GO will be set after the full local test suite, live map check, branch push and all six GitHub Actions jobs.**
