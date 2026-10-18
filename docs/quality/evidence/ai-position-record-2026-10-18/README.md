# Position metrics recorded from the existing games

Boundary: offline replays of saved headless bot-against-bot games. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. The metric definitions are in
[policy-errors](../../../ai/policy-errors.md#局勢指標).

## Question

The user (2026-10-18): position matters but VP, Kill, Loss and Supply do not show it; add position measurements and record
them, and analyse once there is data.

## Inputs and command

- Engine: this commit's build (`scripts/ai-position-metrics.mjs` with `nextTurnMetrics`). Every game was replayed on it and
  reached its recorded final state hash.
- Games: 368 from 24 ai-match directories, all 32×24, six divisions (two armored), eight turns, no on-map air — v79 self-play
  (`v84-development`), heuristic@85 against frozen v79 before and after the ration fix (`frozen-v85-development`,
  `ration-fix-games`), heuristic@83 and the no-effort defender against frozen v79 on seeds 1330000–1330139
  (`defender-1330`), the heuristic@82 independent run (`frozen-v82r-independent`) and the heuristic@81 development batch
  (`frozen-v81-development`). File list, games, rows, policies and SHA-256 per file: [manifest.json](manifest.json).

```sh
node scripts/ai-position-record.mjs <match directory> --out artifacts/ai-positions/<name>.jsonl   # 10 directories at a time
```

## Observed

368 games, 5,888 player-turn rows, 0 skipped. One row per game and player turn, before its first action: both players'
current-position metrics (VP, objectives, steps, DG, contact, distance to the enemy, out of trace, SP, HQs) and next-turn
metrics (objectives at risk and in reach, exposed stacks and steps, HQs and dump SP in the opponent's reach, units able to
move), what happened in that player turn (steps lost, objectives gained and lost per player), the final VP, the engagement
and each player's policy. The two games of a pair in `v84-development` are the same game (v79 on both sides).

## Limits

The next-turn metrics project each side to its Movement Segment with every unit fueled and ignore the opponent's moves in
between; attack potential counts every unit that could reach the target, so a unit counts toward several targets.
Supply lines the opponent could cut are not measured (`bot-position-supply-cut`). No analysis is made here.

## Raw data

The ignored `artifacts/ai-positions/*.jsonl` of the `ai-truck-shuttle` worktree.
