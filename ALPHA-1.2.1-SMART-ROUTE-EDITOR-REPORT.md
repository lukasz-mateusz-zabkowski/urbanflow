# UrbanFlow ALPHA 1.2.1 — Routing Quality & Campaign Recovery

## Status

**NO GO pending final branch CI.** The previously confirmed routing and campaign fixes remain validated locally. This follow-up improves cross-platform Playwright reliability; its GitHub Actions result is required before GO.

This status is for review of the branch. It does not claim that the OSM extract models every traffic rule, vehicle restriction, or exact curb-side stop position.

## Git and CI

- Base: `79501928a7eea148701c79a4c476e91de5635aa5` (`v1.2.0-alpha`).
- Branch: `fix/alpha-1.2.1-smart-route-editor`.
- Starting HEAD for this follow-up: `28ef4b1ad9276d607f7307d30126a8ad9352eb27`.
- Implementation commit: `faaf58b1c2cc246b52ae5833ff1bb44cb36f7450`. GitHub Actions [run 44301904567](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44301904567) passed for this SHA; all six jobs succeeded. Follow-up runs [44302362816](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44302362816), [44308760114](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44308760114), and [44309732288](https://github.com/lukasz-mateusz-zabkowski/urbanflow/actions/runs/44309732288) exposed browser-test assumptions around cancellation, mobile touch drop coordinates, and map projection. The latest local fixes await a new branch CI run.
- No merge, tag, GitHub Release, Raspberry Pi operation, or deployment was performed.

## Final routing QA follow-up (2026-11-18)

- The mobile standard-game route test now exposes the test map after initialization, invalidates its size after the build-panel interaction, and centers the viewport on the seven-stop downtown scenario before selecting stops. The previous version tried to select local stops while zooming from the campaign-wide view.
- The touch-drag test adds a second zoom step and verifies the touch release is within 250 m of the stop's projected map location. It still requires a successful staged insertion using touch input, while confirming the saved route and budget are unchanged before confirmation.
- Both targeted mobile tests passed three consecutive local repetitions. Full local browser suite: 12/12 passed. Actions for the pushed follow-up are still pending; branch status remains NO GO until all six jobs pass.

## OSM source and graph integrity

- Provider: [Geofabrik, Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie.html), pinned snapshot `malopolskie-261117.osm.pbf`, timestamp `2026-11-16T21:22:36Z`.
- PBF SHA-256: `ef2cd6018902dc64871ca98ec827bf8628c6172b29f96fde7c4e722584c566e1`; MD5: `c8aacea203bd8ce5bde71195ebb94197`. The source PBF is kept outside the browser bundle.
- Generated road graph: 534,216 nodes, 1,033,128 directed edges, 1,123 node turn restrictions, 5,858 grade-level connectors. Tram is a separate graph with 14,041 nodes and 14,329 edges.
- The UFG2 binary format now preserves 64-bit OSM way IDs and a deterministic highway-class mapping. The current three downtown road selections use IDs that fit in 32 bits, so the UFG2 change improves integrity but is not the cause of their route correction.
- Compressed browser assets: road 10,038,332 bytes; tram 189,667 bytes. The versioned manifest and format header are checked by tests. The browser fetches the gzip assets on demand; HTTP gzip decoding was verified by the browser suite.
- `npm run routing:build` regenerates assets from the pinned PBF. Attribution, filters, transformation steps, and ODbL 1.0 terms are documented in `docs/OSM-ROUTING-DATA.md`. OpenStreetMap attribution remains visible in the app.
- Graph filters separate bus-accessible road edges from tram infrastructure. Explicit `psv=yes` overrides motor-vehicle restrictions for public service vehicles where present. One-way edges, node turn restrictions, grade separation and mapped bridges are represented. 192 via-way restrictions remain unsupported.

## Downtown detour diagnosis

The seven locations in this reproduction are approximate game seed points, not exact OSM platform IDs. Their coordinates are: Stradom `[50.0525, 19.944]`, Kazimierz `[50.051, 19.945]`, Plac Wolnica `[50.0505, 19.949]`, Dietla `[50.053, 19.95]`, Podgórze `[50.048, 19.96]`, Plac Bohaterów Getta `[50.047, 19.953]`, Rynek Podgórski `[50.048, 19.949]`.

Diagnosis compared shortest distance, fastest estimated time, and balanced routing. The shortest and fastest route shapes did not explain the old multi-fold results. The root cause was the snap search considering only the 12 nearest directed edge candidates. Expanding it to 96 allows the route search to find nearby legal directed edges outside the old truncated set. One-way rules still affect which edge direction can be entered or exited. The balanced default selects the faster route only if it stays within 15% of the shortest route; otherwise it selects the shortest route. It never draws a straight road fallback.

| Consecutive points | Old 12-candidate route | New shortest | New fastest | Balanced choice | Graph findings |
|---|---:|---:|---:|---:|---|
| Stradom → Kazimierz | 1.831 km (reported 1.833 km) | 0.181 km | 0.183 km | 0.183 km; 2.36 min | Old snap candidates were within about 12/34 m, but the selected directed options made a long legal loop. The selected road is Plac Nowy, `living_street`, `oneway=yes`, `motor_vehicle=private`, `psv=yes`, maxspeed 20. Modelled pedestrian access is about 87/64 m, displayed separately. |
| Kazimierz → Plac Wolnica | 2.376 km (reported 2.374 km) | 0.372 km; 3.38 min | 0.418 km; 2.42 min | 0.418 km; 2.42 min | Faster option is 12.4% longer, within the 15% rule. Selected streets include Nowa, Józefa and Wąska; one-way direction and PSV access tags constrain the route. Snap offsets are about 10/88 m. |
| Plac Wolnica → Dietla | 1.918 km (reported 1.915 km) | 0.449 km; 2.76 min | 0.548 km; 1.78 min | 0.449 km; 2.76 min | Faster option is 22% longer and is rejected by the balanced rule. The selected path uses Świętego Wawrzyńca and Starowiślna. Snap offsets are about 58/98 m. |

For Stradom → Kazimierz, the nearest mapped Miodowa candidate (way `294584406`, `living_street`) is about 9 m from the seed, while the selected Plac Nowy road is farther away (about 90 m) but explicitly permits PSV traffic. The route therefore uses an eligible public-service road rather than a closer edge with incompatible access. For the other two legs, nearby alternatives include the Nowa/Józefa/Wąska corridor and Świętego Wawrzyńca/Starowiślna; the route diagnostic records candidate way IDs, road class, level, direction projection and distance. No evidence showed a speed-only objective selecting the old long loops. OSM turn restrictions and one-way links remain relevant to the route shape.

The reported route distances include the modelled stop-to-road access links. These are not bus-road geometry: the renderer now draws OSM road paths as solid linework and stop-to-road access as dashed orange links. Because game line cost and distance can still include these short access connectors, those values are estimates for this seed-point model. The points are approximate, and the extract does not identify them as exact stop platforms.

## Seven-stop route and editor

Order preserved:

`s-stradom → s-kazimierz → s-plac-wolnica → s-dietla → s-podgorze → s-plac-bohaterow-getta → s-rynek-podgorski`

The six balanced route legs total **4.593 km** and **12.15 minutes** in the routing diagnostic, including modelled access time. The game’s line metrics use its existing service model, so displayed travel estimates can differ. Each consecutive leg is routed separately and returned with road geometry. The standard game browser test selected all seven stops in order, opened the line preview, built the line, selected it, staged a segment insertion, verified cancellation leaves saved stops and budget unchanged, confirmed the edit, then saved and reloaded the changed line.

Desktop and mobile visual checks show the six path legs. The desktop standard-game screenshot shows the built line in the normal interface. The mobile test covers the touch-layout preview; a separate mobile touch-drag test confirms staged stop insertion without committing cost or geometry before confirmation.

## Igołomia start scenario

The configured seed is `[50.0912, 20.2611]`. The closest bus-eligible road in the pinned local OSM graph is approximately **143 m** away, beyond the existing 120 m snap limit. A local scan found no mapped bus stop/platform/tram stop within 400 m of the seed. This is a point-to-eligible-road gap, not a proven public-transport access prohibition or proof that the regional extract contains every local road.

The coordinate was not moved. Igołomia now has `availableForNewGame: false`, so random new-game selection cannot offer an unbuildable start. Its existing identifier remains available to legacy save loading; route construction reports the access problem before charging or creating fake geometry. Ten other configured starts remain eligible and passed graph connectivity checks.

## Validation

- `npm ci`: passed; install reported 0 vulnerabilities.
- `npm test`: **177 passed, 0 failed** (including route graph, campaign starts, and 52-week/persistence simulations).
- `npm run test:browser`: **12 passed, 0 failed** in 1.4 minutes on 2026-11-18. Covered desktop 1920 x 1080, 1366 x 768, 1280 x 720; mobile 390 x 844 and 360 x 800; OSM route views, normal-game ordered route build/edit/cancel/confirm/reload, mobile route preview and touch drag, map resize, save/timetable, and UI behavior.
- `npm run audit:all`: passed, 0 vulnerabilities.
- `npm run audit:production`: passed, 0 vulnerabilities.
- Routing benchmark: 15 warmed runs on the local development machine; six-leg route search median **54.67 ms**, p95 **78.40 ms**. Graph decode and spatial-index construction are excluded. This is not a Raspberry Pi performance claim.
- Screenshots are stored outside the repository under `%LOCALAPPDATA%\Temp\urbanflow-alpha-1.2.1-final-routing-qa\`; key files include `osm-seven-stop-desktop-1280x720.png`, `osm-seven-stop-mobile-390x844.png`, `standard-seven-stop-built-desktop.png`, `standard-seven-stop-desktop-preview.png`, `standard-seven-stop-edit-preview.png`, `standard-seven-stop-mobile-preview.png`, and `mobile-390x844-touch-route-insertion.png`. The desktop OSM map, mobile OSM map, standard built line and touch insertion artifacts were visually reviewed. No screenshot or PBF was added to the repository.
- `npm ci`: passed again with 0 vulnerabilities. `npm test`: 177 passed, 0 failed. `npm run audit:all`: 0 vulnerabilities. `npm run audit:production`: 0 vulnerabilities. Local checks were rerun on 2026-11-18 after the Playwright test fixes. The final branch SHA and Actions run remain to be verified after push.

## Remaining limitations and recommendation

- The synthetic seed points are not surveyed stop platforms; direct access connectors are a modelling approximation and their contribution remains in line metrics.
- OSM does not model conditional restrictions, all via-way restrictions, signals, curb-side boarding, traffic, or every vehicle dimension. The 192 unsupported via-way restrictions are not silently treated as verified legal movements.
- Igołomia is deliberately unavailable for random new campaigns until its service point or route is verified; old campaigns can load safely.
- Tram remains on its separate OSM tram graph. Metro and rail use their existing models.
- No production or Raspberry Pi checks were performed, as requested.

**Recommendation: NO GO until final CI is green**, with the limitations above visible to reviewers. Do not treat this as a production deployment approval.
