# UrbanFlow Atlas Network (0.9.0)

Atlas Network reads the simulation's existing counters and line statistics. It does not call a remote analytics service or modify passenger decisions.

## Map layers

- **Przewozy**: line-segment color and width show measured vehicle occupancy (`line.stats.segmentLoad`): below 65%, 65–94%, and at least 95% of capacity.
- **Przeciążenia**: highlights only segments at or above 95% measured occupancy.
- **Kolejki**: point size uses the observed waiting passenger count at that point.
- **Braki popytu**: point size uses accumulated failed trip attempts in `diagnostics.failureByPoint`.
- **Rentowność**: line color uses rolling observed balance per hour.

Potential demand remains separately labeled as an estimate. Segment occupancy is the available measure in this simulation; it is not a count of every passenger crossing a segment.

## Problems panel

The panel reports measured overload/waiting, long point queues, accumulated failed starts, and low use combined with negative rolling balance. Each item includes an observed value, passenger impact, and player actions. It does not make service changes automatically. A missing or zero statistic is not promoted to a measured incident.

## History and comparisons

At most 96 per-tick aggregate windows are stored (about 9.6 simulated hours at the standard 6-minute tick). Each window contains carried passengers, current mean wait among waiting cohorts, mapped-point service coverage, mean segment occupancy, fare/subsidy revenue, operating cost, balance, and the network configuration version. The comparison prefers the last sample before a network configuration change, otherwise it compares adjacent ticks under the same configuration. A difference is descriptive and is not a forecast; periods may have different demand conditions. History is simulation state and is persisted in save schema 6.

## Save compatibility

Schemas 2–5 migrate to schema 6. Existing line schedules, campaign state, budget, fleet, mobility state, and passenger cohorts are retained; older saves receive an empty analytics history. Schema 6 validates the history size and each finite nonnegative metric before adopting save data.
