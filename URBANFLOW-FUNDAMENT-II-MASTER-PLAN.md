# UrbanFlow — Fundament II master plan

Updated: 2026-11-26
Work branch: `feature/alpha-2.9.0-fundament-ii-completion`
Base integrated `main` at work start: `d19ab71763f47585e398502e7b4ebc76d18b418f`

## Current evidence matrix

| Requirement | Current state | Evidence | Remaining work | Priority / exit condition |
|---|---|---|---|---|
| Transport economy | Implemented in the shared game model; no second ledger in this work | `public/js/economy.js`, `finance.js`, finance and simulation tests | Full final candidate CI and manual balance acceptance | High: full suite and no duplicate accounting |
| Atlas Studio | Integrated in `main` through the 2.0.0 lineage | Plan workspace and `planningStudioSnapshot`; test `atlas-studio.test.js` | Verify on final main after 2.9 candidate review | High: plan preview uses shared methods and does not mutate save |
| Atlas City / Network / Midnight | Integrated through 2.5.0 lineage | `theme.js`, `styles.css`, theme tests and visual E2E | Final screenshot/accessibility review | Medium: all themes contrast and preserve campaign |
| Atlas Regional | Added on this 2.9 candidate as a regional planning perspective over modeled satellite points | `regionalNetworkSummary`, regional panel, map focus, `test/atlas.test.js`, `e2e/atlas-regional.spec.js` | Real OSM map validation is separate; verified boundaries and regional service simulation are absent | High: document the modeled-only limits and do not imply regional routing |
| Long Living City campaign | Existing 104-week save/resume regression; `-0` determinism fix included in candidate history | `test/city-evolution.test.js`, `ALPHA-2.9.0-FUNDAMENT-II-GATE-REPORT.md` | Re-run in full suite | High: exact state continuity after resume |
| Strategy variation | Existing 12/52-week model comparisons plus this candidate's five 52-week behavior scenarios | `scripts/benchmark-living-city.mjs`, `test/strategy-scenarios.test.js` | Human strategy feedback remains uncollected | High: simulated strategies stay labeled as simulations |
| Invited playtest | Kit now prepared; no actual external testers have participated | `URBANFLOW-ATLAS-2.9.0-PLAYTEST-KIT.md` | Owner selects host, invites testers and collects feedback | Medium: never report a test session until actual responses exist |
| Beta / ads / micropayments | Architecture proposal only; no integrations or external changes | `URBANFLOW-BETA-ADS-MICROPAYMENTS-ARCHITECTURE.md` | Infrastructure, privacy/business choices and separate approvals | Blocked for launch; no accounts, ad requests or payments |
| Save schema | Version 13 retained | `public/js/storage.js`, storage migration suite; view prefs kept separate | Re-run migration/resume tests | High: no save schema change for presentation perspective |
| Release integration | 2.0 and 2.5 are ancestors of current `main`; 2.9 is a candidate | Git ancestry; current branch | Separate approval required before merging or tagging | Blocked until explicit integration approval |

## Milestone status

| Milestone | Status | Completed | Still open |
|---|---|---|---|
| 2.0 Atlas Studio | DONE on main | Contextual planning workflow and shared previews | None identified in this candidate audit; final regression suite still required |
| 2.5 Atlas Visual System | DONE on main | City, Network, Midnight presentation and preferences | Final visual acceptance is distinct from automated layout captures |
| 2.9 Fundament II gate | PARTIAL candidate | Long-campaign deterministic fix; package metadata; Regional planning perspective; strategic simulation tests and QA kit | Regional boundaries and regional transit model; final local validation/CI; integration approval; visual/human acceptance |
| Closed beta / commercial readiness | DESIGN ONLY | Proposed isolation, privacy, ad placement and entitlement architecture | External host/account choices, privacy/business review and separately authorized implementation |

## Safety and release policy

The current candidate is isolated from `main`. This plan does not authorize a merge, tag, release, deployment, external beta, advertisements or payments. Raspberry Pi, VPS, Cloudflare and DNS remain untouched. No worktree or existing user save should be deleted to advance this plan.

## Next steps

1. Complete Node, Playwright, audit, benchmark and real OSM validation on this candidate.
2. Push only this feature branch and verify its GitHub Actions run.
3. Review report and visual evidence; keep Fundament II **INCOMPLETE** until all criteria and separate integration approvals are satisfied.
4. Decide whether true regional boundaries/routing belong in a later foundation; do not represent the current point-based view as that feature.
