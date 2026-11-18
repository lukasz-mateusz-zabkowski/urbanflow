# UrbanFlow ALPHA 1.2.1 — Smart Route Editor & Routing Recovery

## Status

**GO for technical review of the feature branch.** The ordered seven-stop route is connected in the local directed road graph, every adjacent segment has OSM-derived geometry, the editor’s mobile drag was exercised, and the full local test/audit suite passes. Three segments still carry strong detour warnings; review them before accepting the route in a campaign. This is not a claim that OSM data models every traffic or vehicle restriction.

## Git and CI

- Base: `79501928a7eea148701c79a4c476e91de5635aa5` (`v1.2.0-alpha`)
- Branch: `fix/alpha-1.2.1-smart-route-editor`
- Starting implementation HEAD: `75bc48fa4b45e4bf5b91c6742ba99d9cbece101a`
- Routing implementation SHA: `3f4c70608abb4b67e2191d036cead34c1817ec53`.
- GitHub Actions for that implementation SHA: [run 44277060772](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44277060772), success; all six jobs passed (Node 18/20/22, browser, security audit and container health).
- A report-only follow-up records that run. Its exact branch HEAD and Actions result are verified in the task completion message.
- No merge, tag, GitHub Release or deployment was performed.

## Data source and generated graph

- Provider: [Geofabrik, Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie.html), pinned snapshot `malopolskie-261117.osm.pbf`, timestamp `2026-11-16T21:22:36Z`.
- PBF size: 203,834,395 bytes. SHA-256: `ef2cd6018902dc64871ca98ec827bf8628c6172b29f96fde7c4e722584c566e1`; MD5: `c8aacea203bd8ce5bde71195ebb94197`.
- The BBBike Cracow extract was checked first but its stated bounds do not cover all game areas and stops. The regional snapshot covers the playable extent plus a 3 km margin.
- Generated road graph: 534,216 nodes, 1,033,128 directed edges, 1,123 node turn rules, 5,858 explicit grade-level connectors.
- Separate tram graph: 14,041 nodes and 14,329 directed edges. Tram routing does not fall back to the road graph.
- Compressed graph assets: 10,000,752 byte road graph and 189,539 byte tram graph; manifest 2,322 bytes. The PBF remains outside the browser bundle. Express serves the `.bin.gz` assets with `Content-Encoding: gzip`; browser Fetch transparently decodes them.
- Regeneration: `npm run routing:build`. The script verifies pinned SHA-256 and MD5 before generating resources. Source documentation, filters and regeneration steps are in [docs/OSM-ROUTING-DATA.md](docs/OSM-ROUTING-DATA.md).
- License: ODbL 1.0. The app retains OpenStreetMap attribution and a license link. The generated graph is marked as an OSM-derived ODbL database.

## Routing and seven-stop reproduction

The prior curated graph snapped places to isolated vertices and produced large off-road access distances. The new pathfinder snaps each stop to a directed eligible road edge, splits the graph at the projection, and runs Dijkstra with OSM node turn restrictions for each consecutive stop pair. Bus-access rules, one-way directions, grade separation and bridge connections are included. Stop-to-road access is shown separately and capped at 120 m. No direct line is accepted as a surface-road fallback.

Existing IDs and order were used:

`s-stradom → s-kazimierz → s-plac-wolnica → s-dietla → s-podgorze → s-plac-bohaterow-getta → s-rynek-podgorski`

All six legs were graph-connected. Total modelled road distance: **9.630 km**; estimated road time: **25.6 minutes**. Largest stop-to-edge snap: **48 m**. Per-leg modelled distance and detour ratio (distance divided by direct distance):

| Segment | Road distance | Detour | Result |
|---|---:|---:|---|
| Stradom → Kazimierz | 1.833 km | ×9.85 | Connected; warning shown |
| Kazimierz → Plac Wolnica | 2.374 km | ×7.94 | Connected; warning shown |
| Plac Wolnica → Dietla | 1.915 km | ×6.46 | Connected; warning shown |
| Dietla → Podgórze | 1.511 km | ×1.58 | Connected |
| Podgórze → Plac Bohaterów Getta | 0.968 km | ×1.81 | Connected |
| Plac Bohaterów Getta → Rynek Podgórski | 1.029 km | ×3.31 | Connected |

The three high-detour paths remain visible warnings. The screenshot review showed their geometry following road edges and legal mapped crossings over the Wisła; no straight shortcut crosses buildings or water. The previous curated graph returned an invalid route of about 11.46 km, with snaps up to 520 m and detours up to ×15.0. These are graph-model measurements, not observed traffic distances.

One real gap remains: the Igołomia start point has no eligible bus road inside 120 m in this snapshot. Starting that scenario now reports the affected stop and blocks construction without spending money or saving empty/fake geometry. Other configured start routes tested against the same graph connected.

## Smart editor and stop display

- Selected stop order is numbered; adjacent segments are calculated separately and the currently edited segment gets a hit area above stop markers.
- Dragging a segment onto an available stop inserts it between that segment’s two endpoints. Mouse, touch and Escape cancellation are supported; dropping elsewhere cancels. The panel remains an alternate editor.
- Insertion stages a preview through existing line edit/preview operations. No cost or line mutation occurs until the player confirms the rebuild.
- Route geometry, distance, travel time, rebuilding preview, vehicle need and line transfer data are recalculated through the existing systems.
- Discovery is limited per pass and ranks candidates by their distance from the routed geometry. Previously served stops retain visibility priority; local markers appear as zoom increases.
- Save schema stays at 9; stop IDs and existing campaign lines remain unchanged. Saved bus geometry refreshes from the local graph when possible without charges or campaign changes; unavailable saved routes retain their old geometry and show a warning.

## Validation

- `npm ci`: passed; install reported 0 vulnerabilities.
- `npm test`: **173 passed, 0 failed**.
- `npm run test:browser`: **10 passed, 0 failed**. Covered desktop 1920×1080, 1366×768 and 1280×720; mobile 390×844 and 360×800; route preview/cancel, save/timetable behavior, UI errors, and mobile touch drag.
- Seven-stop visual browser review: desktop 1280×720 and mobile 390×844; both passed. The review draws the actual OSM road graph beneath the selected path so raster tile gaps cannot hide the graph geometry.
- Touch drag uses mobile Chromium emulation and CDP `touchStart/touchMove/touchEnd`. The test confirms `touchstart` targets the route hit path, inserts the stop into the chosen segment draft, and preserves the saved line and budget before confirmation.
- Routing benchmark (15 warm runs, same local Node environment): median **54.67 ms**, p95 **78.40 ms** for the six-leg relation. Initial graph decode and spatial-index construction are excluded from these route-search samples.
- `npm run audit:all`: passed, 0 vulnerabilities.
- `npm run audit:production`: passed, 0 vulnerabilities.

## Screenshots

Playwright artifacts are outside the repository at:

`%TEMP%\urbanflow-alpha-1.2.1-routing-qa\`

Key evidence:

- `osm-seven-stop-desktop-1280x720.png`
- `osm-seven-stop-mobile-390x844.png`
- `mobile-390x844-touch-route-insertion.png`
- `desktop-1280x720-route-insertion-preview.png`
- `mobile-390x844-place-profile.png`

The two seven-stop images were visually inspected after the final visual spec run. The mobile drag screenshot shows the staged insertion toast; the test asserts that line order and budget remain unchanged until confirmation.

## Limits and risks

- The graph reports 192 via-way turn restrictions that this version cannot model. Conditional restrictions, vehicle height/weight limits, turn lanes, signals, curb-side boarding and live traffic are not represented.
- Long detours remain warnings and still require player review; a connected shortest path is not proof that the path is the best service design.
- Igołomia’s start relation is unavailable within the strict 120 m access cap. Add a reviewed source/corridor or adjust the city start point based on verified geography before making that scenario available for surface service.
- Tram graph is isolated and filtered to OSM tram infrastructure. Metro and rail keep separate existing models.
- Local benchmark is not a Raspberry Pi performance claim.

## Recommendation

**GO for technical review on the feature branch**, with the three detour warnings and Igołomia restriction explicitly retained. Keep the branch unmerged until the route reviewer accepts those paths and decides how to handle the disconnected Igołomia start.
