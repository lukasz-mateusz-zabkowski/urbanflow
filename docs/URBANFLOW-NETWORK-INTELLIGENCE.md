# UrbanFlow Network Intelligence (1.0.0)

Atlas Network reads simulation counters and line statistics. It does not send data to an analytics service or alter passenger decisions.

## Metric definitions

- **Point coverage** is the share of currently visible city points named as a stop by at least one line. It measures geographic service coverage only; it does not prove that a passenger can complete a trip.
- **Trip availability** is reachable recorded trip opportunities divided by all recorded opportunities in the sample. It is `null` when no trip opportunity was recorded. It uses actual timetable and route-planning results.
- **Denied opportunities** are trip requests that could not be assigned a route when requested. **Abandoned passengers** are already-created cohorts that later left the system. They are kept separate so a denied request and an abandonment are not summed as if they were disjoint.
- **Carried passengers** are completed journeys from the simulation's `transported` counter. A passenger transferring between lines is counted once when the journey completes.
- **Capacity utilization** is observed mean segment occupancy (`line.stats.segmentLoad`), expressed as a fraction of vehicle capacity. It is not an exact count of passengers crossing each segment.
- **Average wait** in a tick is the mean accumulated waiting time of the passengers currently waiting at that sample. Period means weight each tick by the number waiting at that sample. A period with no waiting passengers has zero measured waiting time.
- **Fleet utilization** in scenario reports is required vehicles divided by assigned vehicles; values over 100% identify a vehicle shortage.
- **Revenue** is fare revenue plus the existing passenger-kilometre subsidy. **Operating cost** is time-weighted line operations plus the existing reserve-fleet maintenance charge. Construction and vehicle purchases are one-time capital costs and are not included in operating balance.

The analytical map retains the existing semantics: measured segment occupancy, observed queues, failed-trip diagnostics, and hourly line profitability. Demand forecasts remain estimates. The map never treats occupancy as an exact passenger-throughput counter.

## History and aggregation

- Up to 96 detailed tick samples are kept (9.6 simulated hours at six minutes per tick).
- Up to 84 daily buckets and 12 weekly buckets are kept. Current periods are partial; the initial day can also be partial because the game starts at 06:00.
- A sample ending exactly at midnight is assigned using the interval start, so a tick that ran before midnight is not moved into the next date.
- Passenger, denied, abandoned, revenue, cost, and balance values are summed. Wait is weighted by observed waiting passengers. Coverage and capacity utilization are averages of observed tick samples, never sums of percentages. Trip availability is recomputed from summed reachable and total opportunities.
- Every history array has a fixed maximum size. At the 12-week checkpoint the save retains the latest 84 daily and 12 weekly buckets.
- UI comparisons are descriptive observations, not forecasts or proof that a particular player change caused the difference.

## Economy audited for Alpha 1.0.0

No base rates were changed. The measured parameter set remains:

- Fare: 7 PLN per completed transported passenger.
- Passenger-distance subsidy: 0.28 PLN per passenger-kilometre.
- Line cost per hour: transport-type base maintenance, 48% of maintenance per active fleet vehicle, 16% of maintenance per idle assigned vehicle, and distance × scheduled frequency × two directions × vehicle kilometre cost. Existing rail-corridor discounts remain in force.
- Reserve fleet: 10% of the vehicle type's maintenance rate per unassigned vehicle.
- Capacity and scheduled frequency continue to come from the existing vehicle type, timetable, route round-trip time, and assigned fleet.

The deterministic balance suite tests positive, near-break-even, and loss-making conditions. It intentionally does not require every network to be profitable. A synthetic 20-line, high-frequency metro scenario produces an operating loss, showing that fleet and service expansion can outpace fare and subsidy revenue. Full campaign tests remain the player-facing progression check. Scenario networks isolate operating economics and omit one-time construction and vehicle purchase costs.

## Save compatibility

Save schema 7 adds bounded daily and weekly analytics. Schemas 2 through 5 migrate through the existing calendar, timetable, and mobility migrations. Schema 6 keeps its 96 historical windows; its former `availability` field is migrated to `coverage`, because it measured served points, and receives no fabricated trip-availability value. Older schemas without the tick history start with empty analytical history. Lines, fleet, budget, timetables, calendar, cohorts, mobility counters, and campaign state remain intact.
