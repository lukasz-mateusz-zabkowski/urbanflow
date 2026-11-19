# UrbanFlow ALPHA 1.3.1 — Tramway report

## Scope

This candidate adds three explicit tram construction modes: build track along the local road graph, draw a manual track with map control points, or reuse the local OSM tram graph. New street-mode track follows the same directed road geometry used for bus routing; tram service itself is stored as tram infrastructure. Existing line and campaign systems remain in place.

Bus previews and construction now use the local road graph even if an external routing provider is supplied. Vehicle distance and geometry exclude pedestrian access connectors; connectors remain visible as access legs. When a saved bus route can no longer be refreshed, its old geometry and stop order remain intact and the line is marked unavailable instead of drawing a fabricated straight route.

The synthetic `centrum` node is retained for old saves and existing lines, but is hidden from new campaigns and cannot be added to new lines. New starter routes and campaign objectives use Dworzec Główny as the real central interchange. Igołomia remains readable in existing campaigns but is excluded from new random starts because its nearest bus-permitted road is approximately 143 m away, beyond the configured 120 m access limit.

Tram construction data is saved in schema 11. Schema 10 receives an empty track ledger and default street mode; older migrations continue through schema 11. Route geometry and track segment identifiers remain persisted with the game state.

## Economics and consistency

- Track preview is free; the displayed construction cost is charged once on confirmation.
- Street/manual tram construction charges the existing line construction rate in proportion to newly built track; reused track is not charged again. Existing OSM track mode charges no new track capex. Fleet purchasing follows the existing fleet rules.
- Track commits validate the whole plan before mutating the ledger. A failed route or unaffordable preview does not modify the budget or track state.
- Manual geometry is explicitly a player-authored alignment. The game checks coordinate bounds, segment lengths and selected stop order, but cannot prove that it avoids buildings, rivers or engineering obstacles.

## Verification

Baseline was `d9632740bb1ebe21fc1210b39da995961ec394fb` on `feature/alpha-1.3.1-tramway-construction`. Existing untracked release documents were preserved.

- `npm ci`: passed; 72 packages installed, 0 vulnerabilities reported during install.
- `npm test`: 207/207 passed, including schema 10→11 migration, manual track construction, track reuse, a 318-point real OSM street-tram route, legacy-centre save handling, campaign completion, 52-week simulation and strict local-road routing.
- `npm run test:browser`: 17/17 passed. Desktop 1920×1080, 1366×768, 1280×720 and mobile 390×844, 360×800 were exercised; the mobile segment insertion test used touch input.
- `npm run audit:all`: passed, 0 vulnerabilities.
- `npm run audit:production`: passed, 0 vulnerabilities.
- GitHub Actions and branch push: pending final commit.

The street-tram regression exposed the initial 300-coordinate route ceiling and duplicate/short OSM points. The accepted geometry now matches the save limit of 500 coordinates, zero-length duplicates are normalized, and short measured graph edges are retained. The test builds and validates the full track reference without charging during preview.

Campaign regression scenarios completed all objectives deterministically in 8.62–11.15 simulated real-time minutes across four seeds; passenger conservation, positive remaining budget and final stress-test completion were asserted. The lower bound in this candidate's campaign test is 8.5 minutes because replacing the synthetic Centrum starter with the actual Dworzec route shortened these deterministic runs; the upper bound remains 35 minutes.

The OSM graph and tram data source are unchanged. This sprint does not add a new PBF dataset. Existing attribution and ODbL notices remain in the interface.

## Screenshots and limitations

Playwright writes visual artifacts outside the repository under `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.0.0-visual-qa` (routing-specific checks use `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.2.1-routing-qa`). Tram panel screenshots:

- `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.3.1-tramway-qa\tramway-manual-desktop-1366x768.png`
- `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.3.1-tramway-qa\tramway-manual-mobile-390x844.png`

Manual track points are not a substitute for engineering validation, and the local graph's road access rules are only as complete as the packaged OSM data. New tram track persists as player-authored infrastructure, while the game does not simulate signaling, curves, gradients or detailed right-of-way conflicts.

## Release status

**Status: NO GO pending branch push and GitHub Actions.** Local tests and audits pass. This is a feature branch candidate only; no merge, tag, release publication or deployment is performed.
