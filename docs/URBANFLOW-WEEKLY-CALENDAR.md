# Weekly mobility calendar (Alpha 0.7.0)

## Calendar rules

The game clock starts at 06:00 on Monday, 5 January 2026. Elapsed simulation minutes determine the date and weekday in UTC; no player machine timezone or daylight-saving rule affects the simulation. The simulation day runs from 06:00 through 05:59 the following date. `state.calendar.startDate` stores the calendar anchor, while `specialDays` contains explicit ISO dates marked by the player. A special date takes precedence over its ordinary weekday. The game does not fetch public-holiday data.

## Per-line schedules

`line.timetable` uses version 2 and stores a profile for each `weekday`, `saturday`, `sunday`, and `special` service day. Each profile is a version-1 daily timetable with configurable half-open minute ranges. The default ranges cover the day without gaps, including the 23:00–06:00 interval that crosses midnight. Frequencies are departures per hour; zero suspends scheduled service in that period.

`sameEveryDay` indicates that the player is using one shared schedule. Editing a period or choosing a preset while enabled updates all day profiles together. Turning it off preserves the current values and subsequent changes apply only to the selected day. Copying a profile always makes the schedules independent. The line editor can also restore the previous weekly schedule.

Built-in presets are the same Alpha baselines established in 0.6.0. The balanced values retain the former three departures/hour weighted daily mean. Vehicle speed, vehicle limit, capacity, maintenance, kilometre cost, fares, and passenger subsidies remain the existing game model.

## Demand and simulation effects

Existing place types and demand profiles receive role-specific day factors in `public/js/demand.js`. Work and education demand falls on Saturdays and Sundays; leisure, center, and airport demand is relatively stronger. Those values are provisional Alpha modifiers applied to existing demand weights. They do not create extra fares, change population, or alter economic coefficients. The existing commute relation boosts only apply on weekdays.

Each simulation tick passes the day type for every minute it spans. Line metrics use the line profile for each minute to calculate scheduled service, effective frequency under the assigned fleet, capacity, and running cost. `applyEconomyTick` charges the average cost over the tick, including midnight and week crossings. Passenger generation and routing use the day type at the tick endpoint, with the same deterministic random stream as before.

## Save compatibility

The storage key stays `urbanflow.krakow.v2`; its embedded schema version is now 4. Version 2 line frequencies are copied to every day and period. Version 3 daily profiles are copied to all four day types. The migration preserves line IDs, progress, and the active campaign. Version 4 stores the calendar plus active and previous line schedules. Malformed calendars and schedules are rejected through the existing recovery-save path.

## Current limits

There is no holiday database, weekday/weekend variation by season, service exceptions beyond explicitly marked special dates, local timezone handling, or calendar editor for arbitrary future ranges. `specialDays` is capped at 366 dates. The next extension can add a calendar rule layer without changing the per-line timetable shape.
