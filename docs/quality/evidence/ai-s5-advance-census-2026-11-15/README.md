# S5.4a: attacks that clear an objective nobody then enters

Boundary: replays of recorded games; no new game and no continuation. The standard is unchanged (heuristic@86). This
record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S5.4a (section 7.6) of the [AI strategy
improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md).
The user (2026-11-15): 「開始執行S5」.

## Result

**The registered stop rule holds: S5.4b is not implemented.** Recoverable VP (an advance was offered, no option was
supplied, and the attacker did not hold the hex when its next player turn began) is 0.49 ± 0.14 a game over the 68 games,
below the registered 0.5. Every one of these events failed for the same reason: no option could pay the advance's ration
(`supply.advanceFunded` false). That is the case S5.4b's drop-point fix addresses. The value is close to the threshold;
the rule was fixed before the data were read and is applied as written.

**Exploratory, not registered: most of the VP lies elsewhere.** Two thirds of the events had no advance offered. In
every one of them the attackers had survived but retreated, so the rules offered no advance (`src/rules/combat/combat.ts`,
ADVANCE step). The retreat is the attacker's own choice: an option result splits into step losses and retreat, and outside
the objective-holding case the responder takes the retreat to keep its steps (`src/ai/decisions.ts`, OPTION_SPLIT,
heuristic@75's rule). These hexes, not held when the attacker's next player turn begins, are worth 1.46 ± 0.31 VP a game.
That is about three times the funding case. It is an upper bound: taking the loss instead costs steps, and an advancing
unit may still be thrown out. Candidate v77 changed this choice on the last player turn only and was not taken further
(`docs/ai/heuristic-policy.md`).

| A game | heuristic@86 self-play (28) | Theater policy attacking heuristic@85 (40) | All (68) |
|---|---:|---:|---:|
| Events (attack on an objective clears it, the attacker does not hold it) | 0.75 | 0.70 | 0.72 |
| Their objective VP | 1.79 | 2.35 | 2.12 |
| No advance offered: the attackers retreated (an option result) | 0.43 | 0.50 | 0.47 |
| — VP of those not held when the attacker's next player turn began | 1.18 | 1.65 | **1.46 ± 0.31** |
| Advance offered, no supplied option (all "not funded") | 0.32 | 0.20 | 0.25 |
| — **Recoverable VP (stop rule)** | 0.43 | 0.53 | **0.49 ± 0.14** |
| A supplied advance offered and not taken | 0 | 0 | 0 |
| Entered later in the same player turn | 0.14 | 0.05 | 0.09 |
| Held when the attacker's next player turn began | 0.11 | 0.07 | 0.09 |
| Held at the end of the game | 0.43 | 0.50 | 0.47 |

No event had every attacker eliminated or a survivor unable to move. The 32 retreat events had 1 to 6 attackers left
(1: 11, 2: 13, 3 or more: 8) and are spread over Game Turns 1 to 7.

## Method

[registration.json](registration.json), committed in `ea22a91` before the census was run. Build `467b5bb`.

```sh
P=artifacts/ai-promotion
node scripts/ai-advance-census.mjs $P/frozen-v87r-v86selfplay-independent/attack-western $P/frozen-v87-v86selfplay-development/attack-western \
  $P/frozen-v87r-v86selfplay-independent/attack-eastern $P/frozen-v87-v86selfplay-development/attack-eastern --out artifacts/ai-s5/census/selfplay.json
node scripts/ai-advance-census.mjs artifacts/ai-theater-untraced-games/attack-western --policy theater-weights --out artifacts/ai-s5/census/theater.json
```

The reason an advance was not offered (attackers eliminated, retreated, or unable to move) was added to the tool after the
registered run. Rerunning with it left every registered number unchanged.

## Limits

- 49 events in 68 games; 54 of the games are on Western maps.
- The self-play games of a seed pair are identical, so they count once: 28 games for 56 recorded.
- Neither class says what the hex would have been worth had the attacker entered it; a continuation test of the option
  choice would.

## Raw data

`artifacts/ai-s5/census/{selfplay,theater}.json` (events and summaries) of the `ai-truck-shuttle` worktree.
