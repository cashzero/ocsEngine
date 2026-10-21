# Best payable attack at Combat (plan P11.1)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## What was run

- Inputs: the same 48 Western Europe Axis-attack games as the [theater survey](../ai-theater-survey-2026-10-21/README.md)
  (P7 confirmation, `artifacts/ai-position-confirmation/attack-temperate`).
- Engine: `dist` built with `npm run build` from `cc0c68f`; Node v26.9.0. Scripts as committed with this record:
  `scripts/ai-theater-supply.mjs` (SHA-256 `88b9511d…`), `scripts/ai-theater-attack-check.mjs` (`74588d2c…`).
- Command, 5 min 3 s:

```sh
node scripts/ai-theater-attack-check.mjs dist artifacts/ai-theater-attack-check/attack-western.json artifacts/ai-position-confirmation/attack-temperate
```

- Output: `artifacts/ai-theater-attack-check/attack-western.json` (SHA-256 `b7c3cd45…`, not committed);
  [summary.json](summary.json) holds the counts below.

## Instrument

`bestPayableAttack(m, state, actorId, targetHexId)` returns the attack on a defended hex with the highest odds column
that the rules accept now. Candidates are the adjacent own units the rules accept attacking alone. If all of them
together are accepted, they reach the best column (adding an attacker never lowers it) and the weakest not needed are
dropped; otherwise subsets are searched in column order, among the ten strongest above ten candidates. Supply choices
come from the engine's `defaultAttackerSupply`; `validateAction` settles every attacker's declared supply together, so
an accepted attack is a payable one. Odds assume every defender pays its combat supply.

The check replays every recorded action and requires each game to reach its saved final hash. It calls the function:

1. before every recorded regular `DECLARE_COMBAT`, on the declared target;
2. at every Combat segment entry, on every objective the phasing player does not hold and the enemy defends, attacked
   or not. When the action stops at the entry, the state after it is used; an `ADVANCE_SEQUENCE` that passes through it
   is rebuilt from its lifecycle transitions, which must regenerate the recorded events and final state; other entries
   are counted as unavailable.

Every call asserts the serialized state is unchanged.

## Results

| Check | Observed |
|---|---|
| Games replayed to the saved final hash | 48 of 48 |
| Recorded regular attacks | 828 |
| Best column below the declared column | **0** (acceptance) |
| Best column above the declared column | 21 (2.5%) |
| Declared attacker sets without a `defaultAttackerSupply` choice | 0 |
| Attacks where jointly paying individually eligible units forced a lower column | 0 |
| Adjacent own units rejected alone, by violation | not capable 69, already used 48, prohibited terrain 33, exploitation mode 10; no supply reason |
| Combat entries probed / unavailable | 8 unavailable (inside a decision response that passes through Combat) |
| Objective probes at entries | 1,749; 503 with adjacent own units; 500 with a payable attack |
| Objectives with adjacent units but no attack because of supply | **0** |
| Payable objectives attacked later in that segment | Axis 271 of 373; Allied 19 of 127 |
| Columns of payable objectives not attacked | 0: 57, 1: 45, 2: 54, 3: 32, 4: 16, 5: 5, 6: 1 |
| Columns of payable objectives attacked | 0–2: 43, 3–5: 143, 6–8: 59, 9–12: 45 |
| Time per call | median 6 ms, max 1.2 s |

## Conclusions

- The instrument meets the P11.1 acceptance: at every recorded attack it finds a rule-accepted, payable attack at least
  as strong, without changing the state.
- In these games combat supply does not block attacks at the Combat segment: no adjacent unit is rejected for supply,
  and no defended objective with adjacent units goes unattacked for want of supply. Objectives left unattacked had low
  columns (almost all 0–4). What limits attacks at this point is the strength placed adjacent, which is decided in the
  Movement phase.
- The 21 higher-column cases do not show a missed attack: the function ignores units the bot keeps for other attacks
  in the same segment.

## Limits

Bot-against-bot games of one policy (heuristic@85); its trucks follow the main effort, so supply may bind for other
policies or for a human. Combat-entry supply is after this turn's fuel and rations are paid
([payment timing audit](../ai-theater-supply-audit-2026-10-20/README.md)); supply that kept units from moving adjacent
(fuel, trace) is not measured here. `defaultAttackerSupply` is one choice generator; it never failed on a declared set,
but another choice order could pay a set it rejects.
