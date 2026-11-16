# Dynamic timetable model (Alpha 0.6.0)

Each line stores a version-1 timetable in `line.timetable`. It contains a calendar key (`all-days`) and a list of half-open minute-of-day periods. The default periods cover the complete day exactly once: morning peak 06:00–09:00, midday 09:00–15:00, afternoon peak 15:00–19:00, evening 19:00–23:00, and night 23:00–06:00. The night interval wraps midnight; 00:00–05:59 belongs to the same interval. Boundaries are stored on the timetable periods and used by the time lookup helpers rather than duplicated in simulation code.

Frequency is departures per hour. Zero means that the line is out of service for that period. The maximum remains specific to the transport type. The UI offers four starter presets:

| Preset | Morning | Midday | Afternoon | Evening | Night |
| --- | ---: | ---: | ---: | ---: | ---: |
| Economic | 2 | 1 | 2 | 1 | 0 |
| Balanced | 4 | 3 | 4 | 3 | 2 |
| Intensive | 6 | 4 | 6 | 3 | 1 |
| All-day | 3 | 2 | 3 | 2 | 1 |

The balanced values are initial Alpha parameters. Their day-weighted mean is 3 departures/hour, matching the previous uniform default. A line's vehicle limit, vehicle capacity, speed, maintenance, and per-kilometre cost continue to come from the existing transport model. Scheduled frequency is capped by the assigned fleet and round-trip time. This effective service determines passenger wait estimates and hourly capacity. The existing passenger fare and subsidy formulas are unchanged.

Simulation ticks crossing a timetable boundary are evaluated minute by minute for the tick duration. The resulting service, capacity, fleet use, and operating cost are averaged over those minutes; economy then charges the average hourly cost multiplied by tick minutes. This avoids charging an entire tick at whichever period happens to be active at its end. Passenger cohorts remain deterministic for a fixed game state and random seed.

Schema 2 saves migrate in place to schema 3 when loaded. Each legacy line gets the same stored `frequency` in all five periods (`legacy-uniform`). Campaign, lines, and other saved progress are retained. Schema-3 writes include each line's active timetable and optional previous timetable so the line editor can restore its last configuration. The storage key remains `urbanflow.krakow.v2` for backward discoverability; the embedded schema version governs migration.

The model includes a calendar field so a future version can add weekday/weekend variants. Alpha 0.6.0 accepts only `all-days`; it does not infer a weekday from the simulation clock.
