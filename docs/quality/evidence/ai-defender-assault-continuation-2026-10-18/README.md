# Continuation test: the v79 defender's assault efforts

Boundary: headless continuations of saved bot-against-bot games through the Gameplay Engine (`scripts/ai-continue.mjs`).
This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Development evidence: no policy is
promoted by it.

## Question

The first item of the error list (user's method, 2026-10-18: fix observed wrong decisions first, judge by continuations on
common dice and by several outcomes rather than VP alone): the defender of an attack engagement sends groups against
objectives the attacker holds. Does dropping those efforts help, and which measurements show it?

## Inputs

- Source: `7d88f3d` (heuristic@84, v79's play) plus the knob `defenderMaxEfforts` (default 5, no change) and the scripts
  `ai-find-branches.mjs`, `ai-continue.mjs`, `ai-position-metrics.mjs`, `ai-continue-compare.py`, committed with this record.
- Games: frozen-v79 defenders in AXIS_ATTACKS games, 32×24, six divisions (two armored), eight turns, no on-map air:
  `artifacts/ai-assault/v79-baseline-development-7990052` (v79 self-play, 16 games) and the 40 games of
  `artifacts/ai-assault/defender-1330/v83-*` in which the frozen v79 defends (seeds 1330000–1330039, 1330100–1330139).
- Branch points ([branches.jsonl](branches.jsonl)): `ai-find-branches.mjs --kind defender-assault --policy frozen-v79`, the
  first defender Movement Segment from Game Turn 2 in which the defender moved a unit on an assault task, one per game:
  49 branch points.
- Variants for the defender seat: `v79` = `heuristic` (heuristic@84), `noeffort` = `heuristic:` with `defenderMaxEfforts` 0.
  Opponent: frozen heuristic@79. Three dice seeds per branch point (Rules RNG reseeded at the branch; both variants get the
  same seed). Horizons: when game turn T0 + 1 and T0 + 2 begin, and the end of the game.

```sh
node scripts/ai-find-branches.mjs <dirs> --kind defender-assault --policy frozen-v79 > branches.jsonl
node scripts/ai-continue.mjs --save <save> --at <at> --subject allied --variant v79=heuristic \
  --variant noeffort=heuristic:<weights defenderMaxEfforts 0> --opponent heuristic@artifacts/ai-promotion/frozen-v79/dist \
  --dice 3 --horizons 1,2 --out branch-<i>.jsonl          # one per branch point, 11 in parallel
python3 scripts/ai-continue-compare.py branch-*.jsonl --baseline v79 --out compare.json
```

## Observed ([compare.json](compare.json))

294 continuations, all FINISHED; 132 of 147 branch × dice reached turn T0 + 2 (branches from turn 7 do not). Differences
are noeffort − v79 for the defender ("own") and the attacker ("enemy"), averaged over the dice of a branch, mean ± SE over
branch points.

| At the end of the game (n 49) | Difference | t |
|---|---|---|
| Defender steps lost (Loss) | −2.50 ± 0.69 | −3.6 |
| Defender units on the map | +2.17 ± 0.54 | +4.0 |
| Kill − Loss | +2.91 ± 0.97 | +3.0 |
| Attacker regular attacks | −1.07 ± 0.32 | −3.4 |
| Defender's objectives with a unit on them | +0.38 ± 0.14 | +2.7 |
| VP margin | +1.90 ± 0.89 | +2.1 |
| Units out of trace: defender − attacker | +1.76 ± 0.68 | +2.6 |
| SP on the map: defender − attacker | −2.60 ± 1.19 | −2.2 |

Early horizons (n 44). Strongest differences: the attacker's objectives with a defender unit adjacent −0.30 (T0 + 1, t −4.2)
and −0.45 (T0 + 2, t −5.4), which is the change itself; attacker attacks −0.23 and −0.59 (t −2.9, −2.6); defender losses
−0.31 and −0.59 (t −1.6). Correlation of a branch's early difference with its end VP-margin difference: VP margin +0.58
(T0 + 1) and +0.66 (T0 + 2), objectives held +0.56 and +0.64, defender units +0.40 and +0.64, defender losses −0.28 and −0.57,
attacker attacks −0.30 and −0.46, attacker SP no front unit can draw +0.31 and +0.50; the VP-margin differences themselves
are small at those horizons (t 0.8).

## What this shows

- Dropping the defender's efforts is a fix by several measures: fewer steps lost, more units left, a better Kill − Loss and
  more held objectives occupied, and the VP margin moves the same way. Loss separates the variants more clearly than VP
  (t −3.6 against +2.1).
- The cost: without the counterattacks the attacker ends with fewer units out of trace (−1.15) and more SP on the map;
  the efforts did cut its supply.
- No early metric both moves clearly and predicts the end: the clearest early differences describe the change itself, and
  the ones that track the end VP difference best (early VP, objectives, own units) are small at T0 + 1 and T0 + 2.
- One error item and one fix; the correlations are over 44 branch points of this change only and do not establish a metric
  for other changes.

## Raw data

The ignored `artifacts/ai-continue/defender-assault/` of the `ai-truck-shuttle` worktree (one JSON line per variant × dice ×
horizon).
