# Dynamic timetable model (Alpha 0.7.0)

Each line stores a version-2 weekly timetable in `line.timetable`, with a `profiles` object for `weekday`, `saturday`, `sunday`, and `special`. Every profile contains the version-1 list of half-open minute-of-day periods. The default periods cover the complete day exactly once: morning peak 06:00–09:00, midday 09:00–15:00, afternoon peak 15:00–19:00, evening 19:00–23:00, and night 23:00–06:00. The night interval wraps midnight; 00:00–05:59 belongs to the same interval. Boundaries are model data and used by the time lookup helpers rather than duplicated in simulation code.

Frequency is departures per hour. Zero means that the line is out of service for that period. The maximum remains specific to the transport type. The UI offers four starter presets:

| Preset | Morning | Midday | Afternoon | Evening | Night |
| --- | ---: | ---: | ---: | ---: | ---: |
| Economic | 2 | 1 | 2 | 1 | 0 |
| Balanced | 4 | 3 | 4 | 3 | 2 |
| Intensive | 6 | 4 | 6 | 3 | 1 |
| All-day | 3 | 2 | 3 | 2 | 1 |

The balanced values are initial Alpha parameters. Their day-weighted mean is 3 departures/hour, matching the previous uniform default. A line's vehicle limit, vehicle capacity, speed, maintenance, and per-kilometre cost continue to come from the existing transport model. Scheduled frequency is capped by the assigned fleet and round-trip time. This effective service determines passenger wait estimates and hourly capacity. The existing passenger fare and subsidy formulas are unchanged.

Simulation time starts at 06:00 on Monday, 5 January 2026. Calendar dates and weekdays derive from elapsed simulation time in UTC, so they do not depend on the host time zone. A saved calendar stores this `startDate` and a sorted list of up to 366 ISO `specialDays`. A special date overrides the regular weekday type. The date is an explicit Alpha calendar anchor, not a real-world holiday database.

Simulation ticks crossing a timetable period, midnight, or week boundary are evaluated minute by minute for the tick duration. The resulting service, capacity, fleet use, and operating cost are averaged over those minutes; economy then charges average hourly cost multiplied by tick minutes. This avoids charging an entire tick at whichever period happens to be active at its end. Passenger origin/destination demand also receives day-type factors for existing work, education, leisure, center, and airport profiles. These are relative Alpha modifiers over existing demand scores, not new passenger counts or economic formulas. Passenger cohorts remain deterministic for a fixed game state and random seed.

Schema 2 and schema 3 saves migrate in place to schema 4 when loaded. Schema 2 lines get the legacy stored `frequency` in all five periods and all four day profiles (`legacy-uniform`). Schema 3 daily timetables are copied to all four day profiles. Campaign, lines, and saved progress are retained. Schema-4 writes store the calendar, each line's weekly timetable, and an optional previous timetable. The storage key remains `urbanflow.krakow.v2` for backward discoverability; the embedded schema version governs migration.

The current editor supports weekday, Saturday, Sunday, and marked special dates. It does not yet model public holidays, school calendars, seasonal changes, or locality-specific closures.
