# Operations decision simulator

The Operations workspace is a read-only view over the active campaign plus explicit proposals. It does not create a forked game, advance time, invoke the passenger simulation, or touch the random generator.

## Fleet dashboard

Owned vehicles come from the saved global fleet; assigned vehicles are summed from active line assignments; reserve is `max(0, owned - assigned)`. Assignment ratio is assigned divided by owned (zero if no vehicles are owned). Reserve maintenance follows the game's existing vehicle maintenance coefficient. Per-line operating costs are shown only when that line has observed history; an aggregate cost is shown only when every active line of that type has observations, so partial history is never presented as a complete total. Capacity signals use observed load/queues and the existing timetable's modelled vehicle requirement. A surplus is described as potentially idle for the current service period, not as a directive to sell vehicles.

## Compared proposals

For the selected line, supported previews are:

- assign one vehicle from reserve;
- move one vehicle back to reserve (a line retains at least one);
- buy and assign one vehicle (existing vehicle cost, fleet cap, and current budget checks apply);
- set one uniform frequency, within the transport type's existing limits;
- apply an existing timetable profile to the current service-day type.

Both sides use the same saved route, current minute, current calendar/service-day type, city events, and current transport model. The preview reports modelled requested/effective frequency, seats per hour, required vehicles, and operating cost per hour. Current passenger load, queue, and revenue are labelled as observations. It does not forecast the next passenger count, queue, fares, profit, or campaign outcome.

## Commit boundary

Preview and cancel do not mutate game state. Apply asks for confirmation and delegates to the existing `UrbanFlowGame` vehicle or timetable methods. Buying is charged only by the established purchase method. There is no new save field or derived preview data persisted. A campaign that has ended cannot preview a commit-eligible proposal or apply a proposal.

## Limits

The simulator is a same-moment service/cost comparison, not a cloned passenger simulation. It deliberately cannot promise that adding capacity raises ridership or revenue. The “needs capacity” and “potentially idle” fleet signals are diagnostics for review; players remain responsible for the decision.
