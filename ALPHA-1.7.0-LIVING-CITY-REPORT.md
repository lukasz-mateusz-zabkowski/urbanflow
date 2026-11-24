# URBANFLOW ALPHA 1.7.0: LIVING CITY REPORT

## Status

**Local status: GO. GitHub Actions: pending final push.** This is a feature-branch candidate; it has not been merged, tagged, released, or deployed.

- Base: `05eb5a618701dc445e27519a5f1ff997748ff542` (`main`, 1.6.0-alpha)
- Candidate implementation commit: `7a43ed382d321f450cffe33c35d0e76cb87f0e1c`
- Final code commit after regression fix: `d77a996cdcff2577f839d30994a3a5567fdbde93`
- Branch: `feature/alpha-1.7.0-living-city`

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

Final review found completed hub modernization counted twice in district investment history because the same completed effect appeared in both the asset list and completion history. The snapshot now counts active projects plus completed history exactly once. A regression test verifies the corrected count; investment effects and economy are unchanged.

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
| `npm test` | PASS; 254 tests, 0 failed |
| `npm run test:browser` | PASS; 35 tests across desktop/mobile, 0 failed |
| `npm run audit:all` | PASS; 0 vulnerabilities |
| `npm run audit:production` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS |
| Live OSM tile verification | PASS; 7/7 successful tile responses, no page errors |
| Local app on `127.0.0.1:3106` | PASS; health version and SHA match candidate; loopback listener |
| GitHub Actions (six jobs) | PASS on branch SHA `cb0eefa4edd279740357666951b0e181b8ddbe6e`; [run 45367827598](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45367827598) |
| Final main workflow before test hardening | 5/6 jobs passed; Playwright failed the desktop stop-insertion assertion (expected 8 draft stops, observed 7). The test helper now confirms the paused state and saved draft mutation. The focused test passed 3/3 repetitions and the full local suite passed 35/35; CI for the correction is pending. |

Living City focused Playwright coverage has passed at 1366x768, 390x844 and 360x800 during development. It checks selecting a modeled area, its profile, two-area comparison, map selection, transition to planning, no horizontal overflow and no page errors. This is not a physical-phone test.

Screenshots are kept outside the repository at `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.7.0-living-city\`:

- `desktop-1366x768-living-city.png`
- `mobile-390x844-living-city.png`
- `mobile-360x800-living-city.png`
- `desktop-live-osm-1366x768.png`

The final real OSM run used the 1.7.0 application code commit `d77a996cdcff2577f839d30994a3a5567fdbde93` on `http://127.0.0.1:3106/`. `/health` returned version `1.7.0-alpha` and that code SHA. Seven unique OpenStreetMap tile requests returned 200; one rendered tile was confirmed, with no browser page errors. The server listens on `127.0.0.1:3106`; ports 3101-3105 were not touched. No physical-phone test was performed.

## Known limitations

- Accessibility measures connected service-stop components and modeled complementary-use reach; it is not door-to-door routing or a travel-time accessibility study.
- District residents, jobs, attractiveness and development are game parameters, not observed demographic or planning data.
- Older save histories cannot be backfilled with observations that were never recorded.
- The bounded weekly snapshot increases save size; the benchmark’s City Evolution payload is approximately 130 KB.
- Browser emulation does not replace physical device testing. No Raspberry Pi performance claim is made.

## Release decision

**Local validation: GO. Integration remains pending until the corrected candidate and resulting main both pass all six GitHub Actions jobs.**
