# UrbanFlow Atlas 2.0.0 — Atlas Studio milestone report

Date: 2026-11-25
Base: `main` / `origin/main` at `4cfb07d04c27103055e69c3ad92affd836dd205a` (`v1.11.1-alpha`)
Candidate branch: `feature/alpha-2.0.0-atlas-studio`
Status: **NO GO — validation and GitHub Actions pending**

## Scope and implementation

The audit found most of the 1.12 economy requirements already present in the base: observed ticket revenue and operating costs, fleet costs, line profitability, bounded finance history, forecasts based on complete observations, planning reserves, and operating decision previews. No new currency, debt model, or altered economic rates were justified.

The first confirmed functional gap was Atlas Studio. The existing five workspaces and their tools were present, but route construction, timetable controls, fleet management, operating comparison, and investments were separated across different panels.

This candidate adds a contextual Atlas Studio panel inside the existing **Network Planning** workspace. It summarizes the current draft, selected line, or active edit using the real game model. It exposes navigation to the existing route, timetable, fleet, decision comparison, and investment tools. It does not add a sixth workspace, a second simulation model, or campaign-save fields. Preferences continue to use the existing Atlas preference storage.

The panel reuses the current render's route preview instead of calculating the same geometry a second time. A regression test verifies that opening the panel does not trigger a duplicate route computation.

## Compatibility and functional checks

- Campaign save schema remains **13**; no migration was introduced.
- Preview is read-only: tests compare campaign state before and after context generation and workspace navigation.
- Selected line is retained when opening timetable, fleet, and decision-comparison tools.
- Investment navigation targets the existing investment view.
- Existing tram, bus, investment, tutorial, and campaign behavior remains covered by the current Node and Playwright suites.
- Candidate package version is `2.0.0-alpha`; server `/health` reports that version.

## Verification evidence

### Focused Atlas Studio checks

- Node: **4/4 passed** in `test/atlas-studio.test.js`.
- Playwright: **2/2 passed** in `e2e/atlas-studio.spec.js` (desktop 1366×768 and mobile 360×800).
- Screenshots: `%LOCALAPPDATA%\Temp\urbanflow-fundament-ii-atlas-studio\desktop-planning-studio.png` and `mobile-planning-studio.png`.
- Visual inspection after increasing text sizes found the panel readable at both tested widths, with no horizontal overflow.

### Existing suite and external map tiles

- Final full Node suite after the visual refinement: **311/311 passed**.
- Final full Playwright suite: **54/54 passed**, including desktop/mobile workspaces, all 12 tutorial steps, tram editing, investments, routing, persistence, and responsive checks.
- `npm ci`: completed successfully; 73 packages audited, zero vulnerabilities.
- `npm run audit:all`: **0 vulnerabilities**.
- `npm run audit:production`: **0 vulnerabilities**.
- `git diff --check`: passed.
- Live OSM check, separate from mocked browser tiles: **16 unique tile requests, 16 HTTP 200, zero page JavaScript errors**. Screenshot: `%LOCALAPPDATA%\Temp\urbanflow-fundament-ii-visual-qa\desktop-live-osm-1366x768.png`.
- Local Atlas layer-switch benchmark (1366×768, four alternating rounds, 60 warmed samples/version): Passenger Flow layer selection median **31.1 ms base → 30.8 ms candidate**; p95 **32.5 ms → 32.5 ms**. Median delta: **−1%**. This is a same-machine local UI measurement, not a hardware performance guarantee.

### CI and delivery

Final local validation is green. Candidate commit, branch push, and GitHub Actions are pending. The candidate has not been integrated into `main`, tagged, or deployed. The base `main` remains unchanged.

## Known limits and next steps

Atlas Studio currently provides a context hub within Network Planning and routes the player to existing tools. It does not replace those specialized panels with a single editing canvas. The benefit is reduced navigation and preserved line context, while keeping the established simulation APIs and save schema.

Commit and push only the isolated feature branch, then inspect GitHub Actions. **Do not mark Fundament II complete**: Atlas visual themes and the 2.9 completion gate remain outstanding.
