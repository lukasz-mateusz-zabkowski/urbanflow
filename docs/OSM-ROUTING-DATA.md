# Local OSM routing data

UrbanFlow's Kraków surface routing uses a compact, locally served graph generated from OpenStreetMap data. The browser does not receive the source PBF and does not call Overpass or a routing service.

## Pinned source and regeneration

- Provider: [Geofabrik, Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie.html)
- Snapshot: `malopolskie-261117.osm.pbf`
- Data timestamp: `2026-11-16T21:22:36Z`
- SHA-256: `ef2cd6018902dc64871ca98ec827bf8628c6172b29f96fde7c4e722584c566e1`
- MD5: `c8aacea203bd8ce5bde71195ebb94197`
- Database license: Open Database License (ODbL) 1.0

Run `npm run routing:build` to download the pinned snapshot to the ignored `data/osm-input/` directory, verify both checksums, then regenerate `public/data/routing/krakow.json`, `krakow-road-graph.bin.gz`, and `krakow-tram-graph.bin.gz`. The graph files are gzip encoded and the server sends them with `Content-Encoding: gzip`; browser Fetch transparently decompresses them. To build from an already downloaded copy, run `node scripts/build-routing-graph.mjs --input <path-to-pbf>`. The generator rejects source files with a mismatched checksum. `--margin-km` accepts 0–15 km and defaults to 3 km around all configured Kraków points and stops.

The user-facing map attribution links to OpenStreetMap contributors and the ODbL. The generated graph is a transformed database derived from OSM and is identified as ODbL-1.0 in its manifest. When distributing the graph, retain that attribution and license link and comply with ODbL share-alike and database-access obligations. The underlying OSM copyright and attribution rules are documented at [OSMF attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) and the [ODbL text](https://opendatacommons.org/licenses/odbl/1.0/).

BBBike's Cracow extract was checked first. Its published boundary (`19.76–20.16°E`, `49.96–50.14°N`) does not cover all current playable Kraków locations and stops, so the regional Geofabrik snapshot was selected to avoid truncating routes at the edge of the playable map.

## Graph contents

The manifest carries source hashes, timestamps, bounds, generator version, graph digest, counts, license, and asset paths. Graph assets use `UFG1` version 1 binary records: signed E7 latitude/longitude node pairs, CSR adjacency offsets, fixed-size directed edge records (target, distance, estimated travel milliseconds, OSM way id, highway class, level, and bridge/tunnel/connector flags), followed by node-based turn restrictions. The browser decodes these into typed arrays and builds a bounded spatial index when a graph is first used. The road asset is fetched when a Kraków game starts; the tram asset is fetched only when tram routing is selected.

## Road and tram filtering

- Bus graph includes public road classes used by motor traffic (motorways through residential, service, unclassified and links); `track` and `pedestrian` ways are accepted only with explicit bus access. Footways, cycleways, paths, rail, and untagged bus guideways are excluded.
- `bus`, `psv`, `motor_vehicle`, `vehicle`, and `access` tags are checked in mode-first order. `oneway:bus`, `oneway:psv`, general `oneway`, roundabouts, and motorway defaults produce directed arcs; reversible/alternating directions are omitted.
- `layer`, bridge, and tunnel tags keep grade-separated nodes separate. A shared OSM node is connected across graph levels only when an eligible way ends there, preserving explicit bridge abutments while leaving geometric crossings with different OSM node IDs disconnected.
- Node-based `no_*` and `only_*` restrictions that apply to buses are applied during graph search. The manifest reports via-way restrictions it could not model.
- Tram routing uses only `railway=tram` ways and a separate graph. It never falls back to the road graph. Metro, suburban and intercity services retain their separate existing models.
- Edge time is an estimate derived from highway class or a mapped `maxspeed` tag. It is not a live traffic prediction.

## Accuracy limits

The graph follows OSM connectivity, direction, selected access tags, bridge/tunnel levels, and supported node-based turn restrictions. OSM may omit or misstate local restrictions. The current graph does not model conditional restrictions, turn lanes, vehicle height/weight limits, live traffic, signal delay, curb-side boarding rules, or complete via-way turn restrictions. A short connector from a stop to the nearest eligible road edge is shown separately and is capped at 120 m. Long detours remain visible as warnings; the selected geometry still follows directed graph edges. If no connected path exists, the preview is rejected and reports the affected segment.

The game preserves saved stop order. It recomputes saved surface-line geometry from the local graph when a path is available, without charging construction costs or changing campaign progress. When a saved path cannot be rebuilt, its prior geometry remains in the save and the UI warns that it could not be matched to the OSM network.
