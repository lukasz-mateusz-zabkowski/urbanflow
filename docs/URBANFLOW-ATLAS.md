# UrbanFlow Atlas

UrbanFlow is a browser strategy game about public transport, passenger service, operating finances and gradual city change. It uses JavaScript, Node.js, Leaflet and local OpenStreetMap-derived routing resources. The game does not model parcel boundaries or claim that its modeled district and settlement values are observed demographic data.

## Five Atlas workspaces

- **Transport** monitors lines, vehicles, stops and network issues.
- **Planning** builds and edits routes, previews their costs and connects to existing fleet, timetable and investment tools.
- **Passengers** presents observed queues, load, missed demand and service accessibility.
- **City Development** presents modeled city evolution, land use and investments.
- **Operations** brings together fleet, finance, diagnostics and decision comparison.

These workspaces operate on the same campaign state. Switching workspaces does not advance the simulation or alter campaign data. Presentation preferences are stored separately from campaign saves.

## City and Regional perspectives

The City Development workspace has two map perspectives:

- **City** keeps the normal city-scale view.
- **Regional** frames Kraków with the modeled satellite settlement points and reports direct service only when an active, routable line has that settlement as a stop. The list can focus a settlement or open planning around it.

Regional settlement points come from the game's scenario parameters. They are not fetched from OSM. The current perspective has no verified municipal boundary polygons, regional transit timetable, or interregional demand simulation. It therefore does not draw a fictitious city boundary or infer service from proximity to a schematic corridor. An unavailable route is not counted as service.

## Map data and attribution

The local road and tram routing graph is generated from OpenStreetMap-derived data. Its source, date, transformations, license notes and regeneration steps are documented with the routing assets under `public/data/routing/`. Map tiles are requested from the configured tile provider at runtime; deterministic browser tests use local SVG fixtures and are not evidence that the public tile provider is reachable.

## Technical boundaries

Simulation changes occur in game ticks and weekly evolution updates, not as a side effect of rendering. Visual map layers are derived from the active campaign state. Long-lived campaign state is versioned and migrated by the storage layer; workspace and map perspective preferences remain separate from saves.
