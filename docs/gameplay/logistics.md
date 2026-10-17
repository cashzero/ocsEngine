# Logistics helpers

## Scope

Player-facing Phase B transport planning, fuel estimates and Supply prediction. The browser and
controller use Gameplay queries; planning runs the production Rule Engine on immutable state copies.
Acceptance authority: SUP-B01–08 in `docs/quality/03-product-operation-verification-plan.md`.

## Current behavior

The optional Logistics tab is available in the acting player's Movement and Supply phases. Transport
planning takes a friendly on-map source dump, destination hex and whole Token quantity. Trucks can be
excluded. A preview lists every move route, load/unload and completion, MP spent and remaining,
deliverable quantity and resulting destination stock. Preview/cancel do not change authoritative state.
Partial loads are legal: splitting a counter is unnecessary merely to carry fewer Tokens than capacity.
Each truck completes its trips before another begins; it returns for another load when the remaining MP and source stock permit. Unload destinations require friendly combat
units or an existing friendly dump (13.2f); rejected destinations show nearby legal alternatives.
Insufficient stock/capacity/MP reports the deliverable amount and shortfall; the player can explicitly
send the available quantity, include more trucks or choose a relay hex. Routes needing random capture
or a pending decision are refused by the planner. Future enemy actions are not simulated.

New SP placed during the Reinforcement Phase can be loaded and transported in the following Movement Phase.
They are not blocked merely because they arrived this turn; new SP at a railroad entry may also entrain there under
13.3e and 13.6b. Within one phase, however, each SP may use only one transport type and cannot be loaded again after
unloading (12.2a). SP just landed by sea or detrained therefore cannot be picked up by a truck in that same phase.
The restriction follows the delivered quantity even when it merges into an existing dump; earlier stock remains
available to load. Delivered SP can be consumed immediately, including for fuel or combat supply (12.2b).
Rule text: [supply transport](../rules/ocs-series-rules-v4.3.md#122-transportation-of-supply) and
[reinforcements](../rules/ocs-series-rules-v4.3.md#136-reinforcements).

Confirmation first checks the original revision and preflights every action. It creates a checkpoint,
then dispatches each action normally, preserving history, save and replay semantics. A rejection reports
how many steps completed; those steps remain in history and the checkpoint permits explicit restoration.
The final state hash must equal the preflight result. A stale preview cannot be applied. Loading, undoing, changing selection or completing a handoff clears the preview; the privacy lock also hides it immediately.

Fuel estimates take selected own units, show the available single-unit, formation and HQ payments and
sources, and recommend a legal sequence by selected units covered per Token, simulating each payment
against the stock remaining. Already fueled or non-fueled units need no payment. A missing reachable
source offers a planner handoff with destination and quantity prefilled. Recommendations are legal
witnesses, not a claim of global cost optimality.

Supply prediction uses current positions and stock, deducts mandatory internal recovery first, then
uses the rules' grouped ration allocation. It lists units out of trace, payable groups and unfed units;
the allocation-search limit is shown explicitly when encountered. In Supply the helper applies mandatory
recovery followed by those grouped CHECK_SUPPLY payments. Prediction does not guarantee future enemy
moves, later arrivals, the result of attrition dice or unchanged positions. Fuel and supply calculations
never read enemy hidden pieces for display.

## Decisions

Helpers issue ordinary legal actions rather than introducing an alternate logistics rule. A complete
preflight is mandatory; it cannot authorize random outcomes. There is no silent rollback of already
accepted actions. Optional payment-source preferences and recurring routes remain unapproved B3/B4
work in `docs/roadmap/09-supply-logistics-ux-wbs.md`.

## Known gaps

`05-todo-inventory.md`: `logistics-helper-scope`, `logistics-benchmark`,
`logistics-multiphase`, `logistics-multimodal`. These original roadmap extensions are not completed
by the eight product-operation rows.

## Verification

- SUP-B01–08 and ACT-06: [acceptance table](../quality/03-product-operation-verification-plan.md).
- [Built-browser evidence](../quality/evidence/operations-2026-10-15/README.md): immutable preview/cancel,
  manual/helper final-state equivalence, source shortfall, actual MP exhaustion, natural out-of-trace
  Supply, whole turns, file save/load and replay.
- `tests/gameplay/logistics-planning.test.ts` and `tests/ui/logistics-lifecycle.test.ts` support
  reducer equivalence, trip sequencing and preview lifecycle isolation.
