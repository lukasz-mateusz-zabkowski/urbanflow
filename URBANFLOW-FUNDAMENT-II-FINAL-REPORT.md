# UrbanFlow Fundament II — final report

Updated: 2026-11-26
Decision: **FUNDAMENT II INCOMPLETE**

## Evidence summary

| Gate | Status | Evidence / limitation |
|---|---|---|
| Atlas Studio 2.0.0 | DONE on integrated `main` lineage | Candidate workspace and `planningStudioSnapshot` use existing route and finance methods; preview is read-only. |
| Atlas City / Network / Midnight 2.5.0 | DONE on integrated `main` lineage | Theme module, CSS tokens, independent preference and theme tests exist. Final candidate screenshots still require visual acceptance. |
| 2.9.0 completion candidate | PARTIAL | Based on current main plus deterministic 104-week save/resume fix. Adds modeled Regional planning perspective and five deterministic 52-week strategy cases. Candidate is not merged and has no release tag. |
| Save compatibility | PASS in local suite | Save schema remains 13; legacy migration tests and 104-week save/resume test exist. |
| Automated validation | PASS locally; CI PASS on evidence SHA | Node 320/320; Playwright 58/58; full and production npm audits 0 vulnerabilities. Separate theme E2E 2/2; live candidate check loaded 16/16 unique OSM tiles with no page errors. Actions run [45792144812](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/45792144812) passed 6/6 on `bea2f1fcc7ec3ceb6843065da69ddeda65c9011e`; a later documentation-only commit requires its own CI confirmation. |
| Atlas Regional | PARTIAL | 11 modeled satellite points, current direct-routable-stop status, focus and planning navigation. No verified boundaries, OSM settlement ingest, regional transit timetable or regional passenger simulation. |
| Human playtest | BLOCKED / not performed | Automated strategies and browser flows are not external tester results. The playtest kit is prepared; no invitations or sessions have occurred. |
| Closed beta / monetization | DESIGN ONLY | Architecture proposal exists. No hosting, authentication, ads, payment processor, telemetry or external operation has been configured. |

## Why this is not complete

Fundament II cannot be labeled complete while the 2.9.0 candidate awaits final branch SHA confirmation and a separate integration approval. The Regional view is deliberately point-based and does not satisfy a future requirement for verified regional boundaries or interregional service simulation. The original November 2026 concept art was not present in the repository, so a one-to-one art comparison cannot be claimed. No real tester feedback exists.

## Changed evidence

See `URBANFLOW-ATLAS-STRATEGY-COMPLETION-REPORT.md` and `URBANFLOW-FUNDAMENT-II-MASTER-PLAN.md` for candidate status, screenshots, benchmark readings, test records and next steps. Neither this report nor the candidate authorizes main integration, tagging, external beta launch or monetization.
