# UrbanFlow Atlas 2.9.0 — private playtest kit

**Candidate:** `2.9.0-alpha`  
**Audience:** 3–5 invited testers  
**External playtest status:** not yet run. Automated simulations and browser tests do not represent human feedback.

## Before a session

Use a fresh browser profile or private window so each tester has an independent `localStorage` save. Start a new campaign; do not import a personal save. The game currently stores campaigns in the browser and does not require a tester account. Do not send a save or feedback automatically. If a tester chooses to share a report, review free-text fields first.

## First 10 minutes — first route

1. Start a Kraków campaign and read the opening objective.
2. Choose the suggested starter route.
3. Open Planning, inspect route geometry, cost and fleet requirement, then build only after reviewing the preview.
4. Start the simulation and observe whether passengers board.

**Success:** tester can explain the next action, distinguish preview from purchase, and find the active line on the map.  
**Time:** 10–15 minutes.

## First 30 minutes — service decisions

1. Review passengers and network diagnostics.
2. Compare one operating decision (frequency or fleet) before confirming it.
3. Check the line's costs, revenue and observed service values in Operations.
4. Open City Development and switch between City and Regional perspectives.
5. In Regional, focus one settlement and use Plan; note that only direct routable service is reported.

**Success:** tester can identify one service problem, describe evidence for it and make a deliberate network change.  
**Time:** 20–30 minutes.

## First 60 minutes — city and management

1. Complete any available tutorial steps without using developer tools.
2. Inspect modeled areas, land use and investment constraints.
3. Plan or complete one affordable investment if the campaign allows.
4. Observe a weekly report and explain which values are observed and which are modeled.
5. Save, reload the page and resume.

**Success:** campaign continues with the same budget, lines, fleet and progress; tester can describe at least one trade-off.  
**Time:** 45–60 minutes.

## Feedback form

Rate each 1–5 (1 = difficult/poor, 5 = clear/good):

- I knew what to do next: __
- Route building and cost preview were understandable: __
- Passenger and network problems were understandable: __
- Finance and investment consequences were understandable: __
- The map and Atlas workspaces were readable: __
- Mobile/desktop controls felt comfortable: __
- Performance felt smooth: __
- I would play another session: yes / no / unsure

What was confusing?  
What felt rewarding?  
Where did the game feel unfair or unclear?  
Device/browser and viewport (optional):  
Steps to reproduce a problem (avoid personal data):

## Issue register template

| ID | Session label (tester chooses) | Version/SHA | Device | Scenario | Severity | Frequency | Steps/evidence | Status |
|---|---|---|---|---|---|---|---|---|
| PT-001 |  | 2.9.0-alpha /  |  |  |  | first / repeat |  | new |

Suggested severity: **Blocker** (cannot continue or save), **High** (core decision broken), **Medium** (workaround exists), **Low** (visual or wording). Record frequency separately; one severe reproducible issue still needs review. Do not record IP addresses, account credentials, device identifiers or private browser storage.

## Session strategy

Run one tester at a time on a separate browser profile. Ask them to think aloud, but do not guide a decision unless they are blocked. Collect only the form above and voluntary issue details. This kit does not create a hosted service, tester accounts or automatic telemetry.
