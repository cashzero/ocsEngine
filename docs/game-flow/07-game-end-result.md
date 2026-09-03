# M8.7 Game End result

Game End is shown only when Gameplay reports lifecycle `FINISHED`, which occurs after the Rule sequence reaches `COMPLETE`. The UI reads the authoritative projected `victory` object and displays winner/draw, both scores, reason and final revision.

Terminal actions are read-only exports or a clean transition:

- download final save;
- download deterministic replay;
- open New Game and replace the finished session only after successful generation.

The UI never computes victory or mutates final scores.

Implementation: `gameEndHtml` in `src/ui/browser.ts`.

