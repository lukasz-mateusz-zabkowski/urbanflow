# UrbanFlow ALPHA 1.2.1 — Smart Route Editor & Stop Discovery

## Status

**NO GO for release acceptance.** The editor safeguards, segment insertion and local QA are implemented, but the local Kraków road graph cannot produce a sufficiently credible street route for the requested seven-stop relation. Construction of that stop-based route is blocked rather than silently accepting a misleading path. The graph needs better local coverage before this issue can be closed.

## Git

- Base: `79501928a7eea148701c79a4c476e91de5635aa5` (`v1.2.0-alpha`)
- Branch: `fix/alpha-1.2.1-smart-route-editor`
- Implementation/final SHA: pending commit
- GitHub Actions: pending after push
- Main was not merged; no tag or release was created.

## Findings and route reproduction

The old surface route calculation attached every stop to the nearest graph **vertex**. For this route, that introduced large access legs. Routing was also liable to fall back to a direct line without distinguishing that line from a road path. The hand-curated road graph is sparse around central Kraków and does not represent enough of the streets between the selected stops.

Reproduced the ordered relation using existing stop IDs:

`s-stradom → s-kazimierz → s-plac-wolnica → s-dietla → s-podgorze → s-plac-bohaterow-getta → s-rynek-podgorski`

Routing now projects each stop onto the nearest graph **edge**, splits the local graph at that projection, and routes each adjacent pair separately. The selected stop coordinates and order are preserved in the output. The resulting route still exceeds the configured detour quality threshold (4× direct distance on a segment) or the maximum snap threshold (0.8 km); diagnostics mark it invalid. The reported graph route is approximately 11.46 km versus roughly 3 km as a straight-line lower bound; at least one segment has an extreme detour. The prior vertex-snap calculation was approximately 21.34 km. These are local model measurements, not claims about legal or traffic-feasible streets.

No dependable local street dataset was available to fill the missing corridors during this task. An external Overpass fetch was attempted but did not return usable data (the primary endpoint returned HTTP 406 and an alternate timed out). No fabricated straight line through buildings or across the river is accepted as a road route.

## Implemented

- Route diagnostics now expose direct distance, snap distance, detour ratio, segment validity, geometry source, algorithm and reason. Disconnected fallback is explicitly labelled as fallback.
- Each neighboring stop pair gets its own route calculation. New lines using real stop markers are rejected before cost is charged if the geometry is invalid.
- Existing abstract campaign points retain their current build flow for compatibility; route warnings remain visible. This is a limitation while the city graph remains incomplete.
- The line editor can stage a discovered stop between the exact endpoints of a selected segment. The staged route is previewed; cancellation charges nothing and only the existing confirmation path can commit and charge the edit.
- Selected stop order is numbered; route segments have explicit hit areas, selected-line highlighting, and an in-progress preview. Mouse segment drag/drop inserts into the chosen gap; Escape or an invalid drop cancels, and map dragging is restored.
- Added keyboard selection affordances and responsive stop density. Served, selected and actively edited stops retain priority; detailed local stops appear at closer zoom levels.
- New stop discovery caps: 6 along the route corridor, 2 in the ring and 4 fallback stops per discovery pass.
- Save schema remains 9; no stop IDs or save migrations were changed.
- Package version is `1.2.1-alpha`.

## Validation

- `npm ci`: passed; 0 vulnerabilities reported during install.
- `npm test`: passed, 161 tests.
- `npm run test:browser`: passed, 7 Playwright tests. Covered desktop 1920×1080, 1366×768, 1280×720 and mobile 390×844, 360×800. Browser tests verified route order, staged insertion and no-charge cancellation, desktop mouse drag/drop and Escape cancellation, panel/map sizing, mobile touch UI, timetable regressions and no browser JavaScript errors.
- `npm run audit:all`: passed, 0 vulnerabilities.
- `npm run audit:production`: passed, 0 vulnerabilities.
- The first browser run had five passes and two failures while waiting for external OpenStreetMap tiles. Re-ran the suite with Playwright's local deterministic tile fixture (`CI=true`); all seven tests passed. The fixture is only a visual basemap; routing tests use the real bundled road graph.
- GitHub Actions: pending push; do not treat as passed until the run for the final SHA succeeds.

## Screenshots

Artifacts are outside the repository at:

`%TEMP%\urbanflow-alpha-1.2.1-visual-qa\`

Key files:

- `desktop-1920x1080.png`, `desktop-1366x768.png`, `desktop-1280x720.png`
- `mobile-390x844.png`, `mobile-360x800.png`
- `desktop-1920x1080-route-insertion-preview.png`
- `desktop-1920x1080-atlas-network-line.png`

The insertion preview capture shows the selected segment and discovered-stop controls. Browser automation exercised the actual map path and line editor. A touch-specific drag/drop on a real phone has not been independently verified; touch operation through the panel and mobile interaction checks passed.

## Limitations and next step

The bundled downtown graph is too sparse for confident surface-road routing on the reported relation. Add a reviewed, appropriately licensed local street graph for the relevant corridors, then rerun the seven-stop regression and visual route inspection. Current detour thresholds are safeguards, not a substitute for complete street, turn-restriction or traffic data. The model does not claim to account for one-way rules or live conditions.

**Recommendation:** keep the branch available for review, but do not accept ALPHA 1.2.1 as GO until the requested relation can be routed credibly with local data and the final GitHub Actions run is green.
