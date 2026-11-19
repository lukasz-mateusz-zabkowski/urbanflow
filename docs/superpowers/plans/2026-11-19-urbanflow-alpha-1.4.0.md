# UrbanFlow ALPHA 1.4.0 Implementation Plan

> **For agentic workers:** Execute task by task with test-first changes; retain feature branch and user files.

**Goal:** Make UrbanFlow's existing campaign easier for new and returning players to understand, add state-based coaching and safe tester feedback, and prepare an isolated alpha-test configuration.

**Architecture:** Extend the current `campaign.js`, `ui.js`, `game.js` and local feedback workflow. Persist only tutorial progress/preferences needed to resume; derive goals and hints from game state. Keep feedback local JSON export and make tester mode an explicit server/build configuration with separate origin/storage, no indexing, and visible build metadata.

**Tech Stack:** Existing browser JavaScript modules, Express, Node test runner, Playwright, CSS, GitHub Actions.

**Spec:** User-provided URBANFLOW ALPHA 1.4.0 brief (2026-11-19).

## Global Constraints

- Base `main` and tag `v1.3.1-alpha` are `22abeccf742908c6a1262a6c1853662a7a488922` and `6f85a28d5ecbc52b5f3b6a13e4ea4f123c1ba54f`; work on `feature/alpha-1.4.0`.
- Preserve schema 11 unless durable tutorial state cannot safely be derived or stored in existing preferences.
- No external telemetry, public feedback backend, production deployment, Raspberry Pi operations, merge, or release tag.
- Do not alter transport/economy rules merely to make the tutorial pass.
- Preserve existing untracked user documents.

## File Map

- `public/js/campaign.js`, `public/js/game.js`: derive tutorial milestones from actual state and support skip/restart/resume without shadow campaign progress.
- `public/js/ui.js`, `public/index.html`, `public/styles.css`: accessible coach panel, objective summary, contextual hints, decision costs/risks, visible alpha-test/build badge.
- `public/js/feedback.js`: categories and privacy-minimal device/screen/tutorial metadata, local JSON only.
- `server.js`, `.env.example`, `Dockerfile` or local scripts as needed: explicit tester mode, build SHA and noindex headers; no main-triggered deployment.
- `test/*`, `e2e/*`: state-machine, privacy, responsive and real browser campaign coverage.
- `docs/alpha-test/*`, `ALPHA-1.4.0-REPORT.md`: independent-host configuration, rollback/access caveats, moderator runbook, three test scenarios, review report.

## Tasks

1. Record baseline and create deterministic tutorial-progress tests covering valid actions, skip/restart, resume and no double-counting.
2. Implement derived onboarding milestones and campaign goal explanations from existing state; preserve legacy saves and add no schema unless tests prove necessary.
3. Add state-backed contextual hints with deduplication, accessible close/restore controls and desktop/mobile placement.
4. Clarify purchase/build previews from existing preview results, showing current/after budget, cost, modeled benefits, risks and limits for line, vehicle, track and investment actions.
5. Expand local feedback schema with categories for usability/performance/first session and minimal optional diagnostics; prove no save/PII is exported and export remains local.
6. Add explicit ALPHA TEST configuration with commit/version display, noindex, distinct storage namespace/origin guidance, invite-only hosting options, no automatic main deployment and rollback instructions.
7. Add three moderator-led playtest scenarios and score sheets; automate browser checks for tutorial, hints, decision previews, feedback, desktop/mobile and 1.3.1 save migration.
8. Run `npm ci`, Node, browser, both audits; inspect desktop/mobile screenshots and real first-session flow; capture performance and limitations.
9. Write final report, commit the completed feature branch, push it, and verify GitHub Actions for final SHA.

## Review Focus

- Old schema-11 saves do not lose campaign progress, lines, fleet or tutorial state.
- A skipped or restarted tutorial never blocks game controls or duplicates rewards.
- Hints only use measured game state, avoid repeated messages, and remain dismissible on mobile.
- Feedback export contains no save, account data, or hidden browser identifiers.
- Tester mode cannot silently share production save storage or trigger deployment from `main`.

## Validation

- Baseline and per-task Node tests; final `npm test`.
- Playwright real UI runs for 1920×1080, 1366×768, 1280×720, 390×844, 360×800, including first line, passengers, diagnostics, feedback and a 1.3.1 save.
- `npm run audit:all` and `npm run audit:production`.
- Confirm no new external dependencies unless a demonstrated requirement makes one necessary.
