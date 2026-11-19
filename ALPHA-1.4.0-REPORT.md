# UrbanFlow Alpha 1.4.0 report

## Status

**GO for technical review.** Local checks and all six GitHub Actions jobs passed on the pushed implementation commit. The branch has not been merged, tagged, released, or deployed.

## Repository

- Base `main` and `v1.3.1-alpha`: `22abeccf742908c6a1262a6c1853662a7a488922`.
- Working branch: `feature/alpha-1.4.0`.
- Implementation commit: `55024cc86432b40b68e5c0ef90f709e76f9602a4`.
- GitHub Actions: [run 44575890240](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44575890240) — success (Node 18, Node 20, Node 22, browser test, security audit, container health).
- Save schema remains 11; no migration was needed.

## Delivered

- Added a 12-step onboarding flow whose progress is inferred from campaign and simulation state. Skip/restart are saved preferences; they do not grant rewards or reset campaign progress. An older schema-11 save without the new preferences resumes at the next applicable step.
- Added contextual guidance from observed unavailable routes, queues, line results, budget, district model values, and active investment state. Hints are deduplicated while dismissed in the current session.
- Expanded campaign guidance with the active blocker, achievements, and the next objective. Route previews show the current/after budget, service capacity, fleet cost, route warnings, and conditions before construction.
- Added explicit purchase confirmation for vehicles and investment approvals, including current and after budget. Canceling the dialog leaves the campaign unchanged.
- Updated the local feedback form to six playtest categories. Context and diagnostic data have separate consent controls; JSON remains local and excludes full saves, user-agent strings, and automatic uploads.
- Added an alpha build/version/SHA badge and an isolated local Compose profile. It binds to loopback only, carries an exact commit SHA, uses no persistent volume, and sends noindex headers. Playtest and rollback guidance is in [ALPHA-1.4.0-PLAYTEST.md](ALPHA-1.4.0-PLAYTEST.md).
- Fixed mobile horizontal overflow caused by the alpha build badge at narrow widths. The browser checks continue to enforce the requested viewport bounds.

## Validation

- `npm ci`: passed; 0 vulnerabilities reported during install.
- `npm test`: **227 passed, 0 failed**.
- `npm run test:browser`: **22 passed, 0 failed** across desktop, mobile, routing, investment, tramway, save/reload, and feedback scenarios. After adding the final schema-11 legacy-save test and screenshot capture, the three onboarding browser tests were rerun and passed.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `git diff --check`: passed.
- Included existing schema-11 compatibility tests and a regression test for a pre-onboarding schema-11 campaign retaining budget, lines, fleet, and campaign state. Existing deterministic 52-week city/investment simulation tests pass within the Node suite.
- GitHub Actions run 44575890240: **success**, all six jobs passed for implementation SHA `55024cc86432b40b68e5c0ef90f709e76f9602a4`.

## Screenshots

Captured by Playwright to the system temporary directory; not added to the repository:

- Desktop start: `%TEMP%/urbanflow-alpha-1.4.0-visual-qa/onboarding-desktop-start.png`
- Mobile start: `%TEMP%/urbanflow-alpha-1.4.0-visual-qa/onboarding-mobile-start.png`
- Desktop feedback flow: `%TEMP%/urbanflow-alpha-1.4.0-visual-qa/onboarding-desktop-feedback.png`
- Mobile feedback flow: `%TEMP%/urbanflow-alpha-1.4.0-visual-qa/onboarding-mobile-feedback.png`

The deterministic browser suite substitutes local SVG map tiles; it verifies the real game interface and local routing data, while the basemap itself is not evidence of live tile-service rendering.

## Limits and next step

- Contextual hints are based on current recorded state, and dismissed hints may reappear in a later session if the same condition remains.
- The alpha profile is local-only by default. Any remote tester access must add invite-only access control outside this Compose file; no public service was created.
- No Raspberry Pi or production configuration was accessed.
- The report update is documentation-only; it records the verified implementation SHA above. The branch remains available for review and has not been merged.
