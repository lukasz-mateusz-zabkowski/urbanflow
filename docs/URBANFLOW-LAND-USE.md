# UrbanFlow Land Use (ALPHA 1.2.0)

Atlas Land Use adds a bounded, symbolic land-use model to the existing 22 modeled city areas. Its values are game parameters derived from the existing place profile; they are not real planning documents, parcel boundaries, or measured demographic data.

## Model

Each district stores integer percentage shares for residential, retail/services, offices, industry, public institutions, green/recreation, and development reserve. The validator requires all seven values to be nonnegative and total exactly 100%.

Districts have low, medium, or high modeled development intensity. A weekly deterministic progress value advances only when the area has enough attractiveness, transport access, and transport satisfaction, and at least four percentage points of reserve. Every intensity step consumes four points of reserve and changes the profile selected from the existing district type and attractiveness. An eight week cooldown, bounded progress, and a maximum intensity of high limit development. The model does not add residents or jobs when it raises capacity; occupancy changes remain in City Evolution's existing gradual demographic process.

Capacity is a modeled limit computed from baseline residents/jobs, land-use mix, and intensity. It is not an estimate of real-world capacity. Capacity may rise as intensity changes, but does not fall during a campaign.

## Demand integration

Land use reweights existing demand by origin, destination, time of day, and service-day type. Residential, retail, office, industrial, public, green, and reserve functions each have explicit period/day parameters in `public/js/land-use.js`. Regular OD patterns remain the existing mobility cohorts: land use adjusts their group size and destination weights, and does not add a parallel passenger generator. The resulting modeled demand remains bounded. City Evolution's population factor is applied separately as the existing demographic input; neither system creates passengers without the existing departure/generation process.

## Atlas view

Select **Zagospodarowanie** in the analytics controls to show one symbolic marker per modeled area. Marker color identifies the dominant land-use function; marker size identifies intensity. The legend labels all modeled functions and intensities. No artificial district polygon is drawn. Selecting a marker or the area dropdown displays its land-use shares, reserve, development progress, capacity, occupancy, transport access, and current weekly development signals.

## Saves and history

Save schema 9 adds a land-use profile to each City Evolution district. Schema 8 saves retain existing district population, jobs, capacities, lines, fleet, schedules, calendar, cohorts, mobility, campaign, and network history. New profiles are deterministically seeded from the stored place profile and aligned to the stored City Evolution week; existing weekly reports are extended with empty land-use fields. Schemas 2–7 continue through their existing migrations before deterministic land-use initialization.

The weekly City Evolution history remains capped at 12 reports. A report generated on the first tick of a new week uses the latest completed network weekly aggregate (the preceding service week), when present; network revenue and cost are reported as an observed balance and are not credited again to the game's budget.

## Validation

Use `npm test` for deterministic model, demand, migration, and 52-week scenarios. Use `npm run test:browser` for desktop/mobile Atlas interaction and screenshots. Benchmark figures depend on the local Node runtime and machine; they are not Raspberry Pi performance guarantees.
