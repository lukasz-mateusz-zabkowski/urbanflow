# UrbanFlow Investments (ALPHA 1.3.0)

Atlas Investments adds a compact project lifecycle to the existing city and land-use simulation. The system operates on the existing modeled districts; it does not create parcels, buildings, tax revenue, or a second passenger generator.

## Financing and accounting

The current game has one spendable `state.budget`, used by the transport authority, fleet purchases, campaign grants, and operating cash. ALPHA 1.3.0 keeps that wallet as the player's scarce capital pool instead of minting a separate fund without a modeled source. Investment capital expenditure, refunds, and hub maintenance are tracked in `state.investments` and weekly investment summaries. These values do not enter transport `revenue`, `expenses`, or line profitability.

Catalog values are explicit provisional gameplay parameters:

| Project | Initial cost | Duration | Completion effect | Continuing cost |
|---|---:|---:|---|---:|
| Housing | 85,000 | 3 weeks | Converts 6 percentage points of reserve to residential use and advances intensity one level; residents fill capacity gradually through City Evolution. | None modeled |
| Economic | 110,000 | 4 weeks | Converts 6 points of reserve to offices and advances intensity one level; jobs and work travel change through existing City Evolution and demand. | None modeled |
| Hub modernization | 72,000 | 2 weeks | Raises the selected served district's queue handling limit by 50% per level, to a maximum of 2× and a global cap of 1,200 waiting passengers. This changes the existing passenger queue-retention/overcrowding mechanism. | 400 per upgraded level per full week, prorated for partial weeks |

The refund for canceling a construction project is 50% of its paid capital cost; the remainder is a sunk cost. Canceling a plan before approval costs nothing. Projects are charged once when approved. Effects are applied once at completion. Land reserve is held while housing/economic projects are planned or in construction, so autonomous Land Use development cannot consume the same reserve before completion.

Approvals are disabled after the campaign is won or lost; an already planned but unapproved project stays uncharged and can still be canceled. If a hub project was approved while its stop was served and the player later removes all lines serving it, construction still completes. The upgraded stop is treated as a persistent city asset, so its maintenance remains payable even while temporarily unserved. The player can restore service or account for that continuing cost.

These values are alpha tuning parameters, not construction estimates. The model intentionally allows a weakly connected housing project to add capacity and demand pressure without immediately creating residents or a guaranteed return. Hub modernization only applies to a district represented in an existing line.

## Simulation and weekly reporting

Project time uses deterministic simulation minutes. The normal game tick advances each active project; a completion is applied before passenger generation and before a same-tick weekly City Evolution update. Weekly summaries are idempotent by week and report active/completed/canceled projects, capital costs, refunds, and hub maintenance separately from the transit network's operating result.

Housing/economic completion changes the existing `cityEvolution.districts[id].landUse` shares, intensity, and capacity. The existing bounded `landUseDemandFactor` then changes origin/destination demand by use, time of day, and service day. Future occupancy remains gradual, bounded by City Evolution, transport access, and capacity. No cohorts are created by project completion itself.

Hub modernization changes only queue limits and overcrowding thresholds for the selected district. It does not add vehicle seats or alter line operating costs, fares, timetable, routing, or transfer path selection.

## Save schema 10

Schema 10 adds the bounded `investments` project/history/weekly ledger and per-point `hubCapacityByPoint`. Migrations from schemas 2 through 9 initialize those fields deterministically and preserve budget, lines, fleet, timetables, mobility cohorts, campaign, and City Evolution. The project ledger limits active projects to 6, retained event history to 40, weekly reports to 52, and hub assets to 44 (two upgrades for each of 22 modeled areas). Invalid status transitions, non-finite costs, duplicate weekly settlements, malformed assets, or invalid hub capacity factors are rejected by save validation.

The schema-9 migration does not invent a project or charge an existing campaign. Previously saved active lines and cohorts remain as they were; investment effects begin only when the player plans and approves a project after migration.
