# Passenger mobility model (Alpha 0.8.0)

## Scope and inputs

Mobility runs locally in the existing six-minute simulation tick. A regular travel pattern is an aggregate origin-destination cohort template derived from visible place profiles, each place's existing `demand`, and the simulation calendar. The current templates cover work and school returns, shopping, recreation, and occasional travel. Each pattern stores stable IDs, direction, allowed day types, departure minute, and an aggregate passenger count. No individual resident objects are created.

The initial alpha shares are explicit in `public/js/mobility.js`: work 0.32, school 0.28, shopping 0.22, recreation 0.25, and occasional 0.08 of the lower existing demand at its endpoints. Counts are rounded from that demand; a template is omitted when its source data yields zero. These shares are tuning parameters, not additional economic or population statistics. Existing stochastic short-trip demand remains in place for already served locations.

Tick departures use minute labels `[end - duration, end)` and the calendar's day type for each minute. Passenger demand also averages the existing place-profile demand curve and day factor across those same minutes. This keeps demand consistent with the per-minute timetable and cost calculation at Sunday/Monday and special-day boundaries.

## Route choice and transfers

The planner reuses the local directed line graph and per-line weekly timetable metrics. Its deterministic Dijkstra search uses a binary heap and route states `(stop, line, transfer count)`, with at most two transfers. The generalized cost includes in-vehicle time, half-headway expected waiting, a transfer penalty, and a penalty for the line's observed segment load. Capacity per tick and estimated available seats are reported with the route. There are no route-service network requests.

The route report distinguishes a disconnected relation, a connected relation with no current service, insufficient seats, and an estimated journey over 100 minutes. A passenger who encounters a removed or edited line is returned to the last known stop and the destination is replanned. A failed connection remains in the normal wait/abandon process; the existing 120-minute wait limit is unchanged.

One ticket fare is divided among completed line legs by distance. A transfer does not create another fare. Existing per-line revenue and passenger-kilometre accounting remain the source for economy and subsidies.

## Quality and access

Completed-trip quality is a separate observed measure. Its alpha parameters are 0.55 points per waiting minute, 0.18 per in-vehicle minute, 10 points per transfer, and 0.5 points per minute with no estimated spare capacity; the score is clamped to 0–100. Wait, total trip time, transfers, and crowding are retained as weighted passenger totals so averages are reproducible. This does not overwrite the campaign's existing satisfaction balance.

Network accessibility is reported separately as reachable scheduled demand divided by total scheduled demand opportunities. Failures retain their specific cause (no connection, no service, low capacity, long wait, or excessive time). These values are simulation observations, not a citywide accessibility forecast.

## Persistence and compatibility

Save schema 5 persists aggregate pattern definitions and completed/accessibility counters. Waiting and riding cohorts persist their journey, ride, wait, crowding, and transfer state for deterministic continuation. Schemas 2 and 3 still migrate their line timetables and campaign fields as before, then initialize mobility state. Schema 4 receives an empty mobility history and retains all other data unchanged. Patterns for currently visible places are populated by the game after loading, avoiding storing static city data in saves.

Input validation bounds pattern count by the existing city's place count, rejects invalid IDs/day types/minutes/counts, rejects unsafe nested keys, and retains the existing 2 MB recovery behavior.

## Performance

Cohorts aggregate passengers with equivalent journey state. The route planner has a two-transfer bound and routes are cached by OD for each passenger tick. `test/mobility-performance.test.js` exercises repeatable 20-tick workloads at 5/20/50 lines and 100/1,000/5,000 passengers. The campaign-balance test also records maximum simulation tick time, cohort count, and serialized save size.

## Local verification

Run `npm test` for simulation, migration, model, and performance checks. Run `npm run test:browser` for desktop/mobile UI checks and screenshot artifacts. Playwright uses the existing development dependency and does not add a runtime dependency.
