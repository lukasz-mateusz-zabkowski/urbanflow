# UrbanFlow Living City model

Living City extends the existing City Evolution and Land Use systems. It does not run a second city or passenger simulation. The weekly City Evolution update reads the operating campaign state, evolves the existing district profiles and feeds their bounded demand factors to the existing OD demand calculation.

## Transport accessibility

The model builds connected components from stops served by currently operating lines. For each area it measures the modeled share of reachable jobs or residents in complementary-use areas, then combines that with the existing service share. An area receives no transport-access benefit when it has no reachable complementary destination. Access is therefore a modeled indicator of usable network reach, not a real-world travel-time study or a count of actual journeys.

The calculation also uses existing observed line wait and load statistics. Those constrain service satisfaction and the development response. It does not infer future passengers or add passengers directly.

## Development and demand

Development continues to use the existing damped weekly City Evolution and Land Use rules, capacity limits, land reserve, attractiveness and investment effects. Building service does not immediately add residents. Population and employment shift gradually and remain bounded by modeled capacities and minimums. Poor access or service quality can reduce attractiveness and development.

Area demand factors continue through the existing demand and cohort pipeline. Living City does not create a parallel random passenger generator, duplicate cohorts, or add fictional transport revenue. Weekly reports are observational snapshots of the modeled state at the time each weekly update runs.

## History and saves

Save schema 12 adds up to 12 weekly reports with snapshots for each modeled area. It stores no full-city copy per simulation tick. Each snapshot contains modeled residents/jobs, residential and economic attractiveness, transport access/satisfaction, reachable complementary-use shares, growth potential, land-use intensity/reserve, capacities, demand factor and investment count.

Schema 11 campaigns migrate to schema 12 while retaining lines, fleet, budget, campaign state, cohorts, investment state and current district state. Earlier schema migrations remain supported. Older weekly reports are kept, but their missing area snapshots stay empty: historical values are not reconstructed or invented. New weekly updates populate snapshots normally.

## Player view

The Living City layer uses symbolic markers at the existing modeled area coordinates; these are not administrative boundaries or parcel geometry. Marker fill represents modeled attractiveness, size represents growth potential, and outline color represents the resident trend. Tooltips include access, quality, residents and jobs. Markers are keyboard-operable. The panel shows the current area, last recorded weekly changes, a second-area comparison, and a link to network planning.

## Limits

Accessibility is based on connected service-stop components rather than full door-to-door journey-time analysis. District population, employment, attractiveness and potential are simulation parameters, not observed Krakow demographic data. Growth is a strategic game model and does not claim causal validation against real urban development.
