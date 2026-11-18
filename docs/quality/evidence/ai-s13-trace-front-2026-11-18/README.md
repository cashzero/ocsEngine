# S13.1: what keeps the attacker's trace short of the objectives

Boundary: replays of recorded games; no new game. The standard is heuristic@91 and is unchanged. This record changes no
row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S13.1 (section 10) of the [AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-18): 「同意 B5併入S13 開始執行S13.1」.

## Result

**In Eastern Europe the trace is short because of where the Supply Sources are, not where the HQs stand. No HQ placement
reaches about half of the open objective VP from Game Turn 3 on. The rail toward those objectives runs through the
defenders. One Extender could reach almost all of them as an upper bound, but it takes 5 of the attacker's 6 Transport
Points.** [S9](../ai-s9-eastern-attack-2026-11-18/README.md) found that the trace stays about 6 hexes short; this record
splits that gap into its parts.

Data: the 80 games heuristic@88 attacked in its independent batch (40 a style), replayed. At the end of each of the
attacker's Movement Phases (just before its Supply Phase), every objective the attacker does not hold goes in exactly one
category. An objective counts as reached when its hex or a hex beside it is in trace.

- **in trace now**: the hex or a hex beside it is in trace.
- **HQ placement**: one of the attacker's HQs on a hex where the current sources still feed it would throw to the
  objective, but no HQ does. Split by whether the HQ could have reached such a hex in that Movement Phase.
- **sources**: no HQ anywhere the current sources feed would throw to it.

Objective VP a game not held at the end of the attacker's Movement Phase:

| Game Turn | East: open | in trace | HQ, could reach this phase | HQ, farther | **sources** | one Extender reaches (of sources) | West: open | in trace | HQ, this phase | HQ, farther | sources |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11.95 | 1.95 | 0.47 | 0.03 | **9.50** | 7.65 | 16.57 | 3.80 | 2.63 | 0.28 | 9.88 |
| 3 | 10.00 | 2.23 | 1.48 | 0.23 | **6.10** | 5.70 | 11.43 | 5.10 | 2.70 | 0.45 | 3.17 |
| 5 | 8.45 | 2.27 | 1.25 | 0.53 | **4.40** | 4.33 | 6.45 | 3.70 | 1.60 | 0.30 | 0.85 |
| 8 | 6.22 | 2.00 | 0.50 | 0.47 | **3.23** | 3.17 | 3.45 | 2.20 | 0.45 | 0.40 | 0.40 |

- **The difference between the styles is the sources.** From Game Turn 3, the VP no HQ could reach is 6.10 to 3.23 a game
  in the East against 3.17 to 0.40 in the West. HQ placement loses about the same in both: 1.78 against 1.90 at Game
  Turn 5, of which 1.25 against 1.60 was within the HQs' reach that phase. So HQ placement is a smaller lever, and it is not
  the Eastern one.
- **Rail does not carry the sources forward.** The attacker has about 6 detrainable rail hexes in the East against about 17
  in the West (Game Turn 5). Nearly every Eastern objective is on or beside a rail line (nearest rail hex 1.1 away). But
  the rail path from the attacker's source rail hexes to it runs about 25 hexes. On the way it crosses about 8.8 hexes rail
  trace cannot pass: 3.5 enemy combat units, 4.7 enemy ZOC and 0.6 enemy-held stations (Game Turns 3–6, weighted by VP). These
  are the defenders themselves, so opening the rail is the same as winning the battle, not a way to win it.
- **One Extender (12.7) is the rule that carries a source forward.** Take one Extender on the single hex that brings the
  most of the attacker's source-blocked VP within reach, at least 2 hexes from any enemy combat unit (not in its ZOC).
  It reaches 4.33 of the 4.40 VP at Game Turn 5 and 5.70 of 6.10 at Game Turn 3. In 38 of 40 Eastern games at Game
  Turn 3 it gains something (6.00 VP where it does). The best hex is a median 19 hexes beyond the current sources: the
  Extender links back over up to 20 Truck MP. It is usually just 2 hexes from the enemy (31 of 38), outside trace (38 of
  38), and a median 10.5 hexes from the nearest attacker truck. Kept at least 3 hexes from the enemy, it reaches nearly as
  much: 5.75 VP at Game Turn 3 and 4.33 at Game Turn 5, from a hex a median 19 hexes beyond the sources.
- **Its cost is the trucks.** An Extender takes 5 Transport Points on one counter (combined first, 12.7e). The attacker has
  3 TP on the map at Game Turn 1, at least 5 by Game Turn 3 in 38 of 40 Eastern games, and 6–7 in 36 of 40 at Game Turn 5. Its trucks unload
  107 T a game at the front (rail moves 250 T), so an Extender would remove most of that haulage.
- The bot never combines trucks or forms an Extender (no `COMBINE_TRANSPORT` or `FORM_EXTENDER` in `src/ai/`).

What the bounds leave out: truck movement to the Extender hex, the enemy moving onto it (it then collapses, 9.14d), the
SP that combat and fuel still need, and whether reaching an objective turns into taking it. "Reached" is necessary for an
attack in supply, not sufficient. The bounds rank the levers and are not VP estimates.

## Method

```sh
npm run build
P=artifacts/ai-promotion/frozen-v88-independent
node scripts/ai-trace-front-study.mjs $P/attack-eastern $P/attack-western --extender --out artifacts/ai-s13/trace-front.json
node scripts/ai-trace-front-study.mjs $P/attack-eastern --extender --extender-gap 3 --out artifacts/ai-s13/trace-front-gap3.json
```

`scripts/ai-trace-front-study.mjs` documents each distance. dBound is the side's direct draw, or the throw (`queryHqThrow`)
of any of its HQs from the 8 hexes nearest the objective where `queryTraceCoverage(hq).directHexIds` says that HQ would be
fed. dHqReach does the same over the hexes `queryProjectedReach` (Move Mode) gave each HQ at the start of that Movement
Phase. The Extender probe puts one of the attacker's trucks on a hex with its Extender face, as the rule layer's
`extenderConnectsAt` does. It keeps the hex if `friendlySourceHexes` then lists it, and repeats dBound. Three linked hexes
nearest each source-blocked objective are tried, and the one bringing the most VP within 1 hex is kept for the whole side.
Truck haulage is the attacker's `UNLOAD_SUPPLY` and `RAIL_MOVE` tokens in the saves.

## Limits

- One batch, 40 games a style, against heuristic@86's defender, with heuristic@88 attacking (heuristic@91 changes only
  advances and option choices).
- The Extender and HQ bounds ignore truck movement, stacking and the enemy's next moves, and try a limited set of hexes
  (8 per HQ and objective, 3 Extender hexes per objective).

## Raw data

`artifacts/ai-s13/` in the main checkout (`trace-front.json`, `trace-front.txt`, `trace-front-gap3.*`).
