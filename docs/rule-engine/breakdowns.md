# Breakdowns (OCS 20.0)

## Scope

Detaching and absorbing Breakdown units, and the naming and parent tracking this product adds beyond the board game. The
rule behavior is the note of the manifest row `breakdowns`; code in `src/rules/breakdown/breakdown.ts`.

## Current behavior

### Rules

- Only multi-step "Other" units with a Breakdown pool can detach: the generator's single-counter infantry and airborne
  divisions. Armor/Mech, one-step units and units of multi-unit formations cannot.
- **When (20.0a, 20.0e)**: in a Movement Segment (Movement, Reaction or Exploitation), as the unit begins to move, before it
  spends any MP. Detaching costs no MP and does not end other units' moves (6.1g); both the parent and the Breakdown may
  still move this phase. It is also offered in the retreat and advance decisions after combat: the Breakdown joins the
  retreat (which may then split) or may advance on its own.
- **Result (20.0c, 20.0f)**: the parent loses a step (its RE falls with its steps, as for a combat loss); a 1 RE, one-step
  Breakdown appears in the hex with the parent's mode, face and markers (Out of Supply, Low/Exhausted). The last step can
  never be detached.
- **Action Rating (20.0b)**: a Breakdown's printed AR may not exceed its parent's; an absorbing unit's AR may not exceed the
  Breakdown's.
- **Absorption (20.0d, 20.0g)**: at the end of every phase, a reduced multi-step unit must absorb each Breakdown of the same
  pool, mode and markers in its hex and regains a step; the Breakdown returns to the pool (not the Dead Pile). The parent
  absorbs when it is there and eligible; with one eligible unit it absorbs; with two or more and no parent the owner chooses
  (`BREAKDOWN_ABSORPTION` decision). Pools are never crossed (German army Breakdowns never join a Fallschirmjäger division).
- **Hidden information (4.9a)**: the enemy's Log only shows "An enemy unit reorganized"; absorption is shown only to its
  owner. Whether a Breakdown counter is visible follows the normal top-of-stack rule.

### Pools (BtR counters)

| Pool | Breakdown (combat / move face) | Used by |
|---|---|---|
| US | 5-4-3 / 3-4-5 (GPID 88) | US infantry and airborne divisions (AR 4) |
| US | 5-3-3 / 3-3-5 (GPID 80) | US divisions with AR 3 (none generated now) |
| German | 3-4-2 / 2-4-4 (GPID 709) | German divisions with AR 4 (none generated now) |
| German | 3-3-2 / 2-3-4 (GPID 710) | German infantry divisions (AR 3) |
| Luftwaffe | 4-3-2 / 2-3-4 (GPID 1207) | Fallschirmjäger (AR 3) |

Each division takes the strongest Breakdown of its pool whose AR does not exceed its own. All are Leg, 1 RE, one step and
not rebuildable. Generator code: `src/generation/oob/breakdowns.ts`, counters in `counter-corpus.ts`.

### In the UI

The Unit tab has one "Detach a Breakdown (5-4-3, 1 RE; the division loses a step)" button; detaching can be undone. Below
the End button the deck lists the Breakdowns that the phase end will absorb ("2/101.Abn rejoins 101.Abn", or "is absorbed
by 90.Inf or 13.Abn (you choose)").

## Decisions

- **Simple names** (user decision): a Breakdown is named `<number>/<division>`, e.g. `1/101.Abn`, taking the lowest number
  not in use on the map for that division. A first version used regiment names and let the player pick the regiment; the
  user found it too complicated.
- **Parent tracking** (user request, beyond the board game): a `PARENT` relation links the Breakdown to its division, so the
  parent absorbs it first when it can.
- **No counter-mix limit** on the number of Breakdowns.
- The name is the piece's `status:unit-name`, printed on the counter and therefore visible to the enemy.

## Known gaps

- `03` has no Breakdown rows. Proposed rows BRK-01 to BRK-07 below await user approval (`05` pending decision 3):

| ID | Operation | Expected |
|---|---|---|
| BRK-01 | Select an infantry or airborne division in a Movement Segment | The Unit tab offers Detach with the printed values |
| BRK-02 | Detach a Breakdown | The division loses a step; an `N/<division>` 1 RE Breakdown appears in the hex and may move this phase; Undo restores |
| BRK-03 | End the phase with a Breakdown in its reduced parent's hex | Warned before End; absorbed, the parent regains a step, the Log says so |
| BRK-04 | View the enemy's screen after the hand-over | The enemy Log does not name the division |
| BRK-05 | End the phase with a Breakdown and two or more eligible absorbers, none its parent | Warned "(you choose)"; the owner chooses before the phase ends |
| BRK-06 | Retreat a multi-step division after combat | The retreat may detach a Breakdown first; they retreat together or separately |
| BRK-07 | Advance a multi-step division after combat | The advance may detach a Breakdown, which may advance alone |

- The deck's confirmation after detaching uses the generic text and does not name the new Breakdown (it is in the Log and
  roster).

## Verification

- `tests/rules/breakdowns.test.ts`; `tests/ui/command-deck.test.ts` (Detach button, numbering, absorption warning, enemy
  Log, Undo).
- Browser runs: `scripts/breakdown-ui-gate.mjs` (default New Game) and `scripts/breakdown-positions-gate.mjs` (loaded
  positions for absorber choice, retreat and advance); records in `docs/quality/evidence/breakdowns-2026-10-03/`.
