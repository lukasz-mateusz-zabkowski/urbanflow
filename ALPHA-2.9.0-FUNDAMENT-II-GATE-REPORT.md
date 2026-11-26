# UrbanFlow Atlas 2.9.0 — Fundament II candidate gate

Updated: 2026-11-26
Base `main`: `d19ab71763f47585e398502e7b4ebc76d18b418f`
Branch: `feature/alpha-2.9.0-fundament-ii-completion`

## Decision

**FUNDAMENT II INCOMPLETE.** The candidate is based on current `main`, which contains the accepted 2.0.0 and 2.5.0 history and the container-health fix. The previous version of this report was stale: it described 2.0/2.5 as unmerged and referenced the old base `4cfb07...`. The current upstream main is `d19ab71763f47585e398502e7b4ebc76d18b418f`.

## Candidate changes and evidence

- Retained the 104-week City Evolution deterministic save/resume regression from the existing 2.9 candidate history; it verifies exact post-load evolution and bounded reports, land use, population, jobs and demand.
- Added the Atlas Regional map perspective using 11 modeled satellite points. It reports direct service from current routable line stops only and offers map focus and a shortcut to the existing planner. It does not invent boundary polygons or regional transit links.
- Added five deterministic 52-week policy scenarios to distinguish cautious investment, network expansion, profit focus, accessibility focus and poor management.
- Corrected package metadata to `2.9.0-alpha` and updated the feedback version regression to keep `package.json` and lockfile aligned.
- Added tester and beta/monetization architecture proposals. These do not create accounts, ads, payments, external services or real user data collection.

## Validation status

| Check | Result |
|---|---|
| `npm ci` | PASS, 72 packages, 0 installation vulnerabilities |
| `npm test` | PASS, 320/320 after updating the stale expected version |
| `npm run test:browser` | PASS, 58/58 |
| `npm run audit:all` | PASS, 0 vulnerabilities |
| `npm run audit:production` | PASS, 0 vulnerabilities |
| Real OSM tiles | Pending separate live candidate check |
| Final branch GitHub Actions | Pending push of final report SHA |
| Human playtest | Not performed; kit prepared only |

Deterministic Playwright captures use intercepted local SVG tiles. They are evidence of layout/interaction, not proof of live OSM availability. The visual review uses the written Atlas requirements because the November 2026 concept art is not in this repository.

## Integration boundary

No merge, tag, GitHub Release or deployment is part of this candidate task. The feature branch must receive separate approval before integration. See `URBANFLOW-ATLAS-STRATEGY-COMPLETION-REPORT.md` for screenshots, scenario results and performance measurements.
