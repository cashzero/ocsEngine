# Turn limit

## Scope

New Game 的 Turn limit 欄位：合法範圍、預設值如何決定、玩家覆寫後的行為，以及預設公式的實測依據。回合數與援軍的關係見 [reinforcement-balance.md](reinforcement-balance.md)，月份與天氣見 [overview.md](overview.md)。

## Current behavior

- 合法範圍 1–60 的整數（`validateNewGameRequest`，欄位 `new-game-turn-limit`）。範圍的上限另受日曆限制：最後一回合不得落在 4 月之後（天氣表只到 4 月），否則在 `OPTIONS` 階段以 `CALENDAR_EXCEEDS_WEATHER_TABLE` 失敗。
- 預設值 `defaultTurnLimit(request)` = `round((寬 + 高) / 5)`，限制在 4–60，只看地圖大小，不看師數、交戰型態或空軍。預設的 32×24 得 11 回合（`DEFAULT_NEW_GAME_REQUEST.turnLimit`），24×16 得 8，48×36 得 17。
- New Game 對話框在玩家沒有改過 Turn limit 時，隨寬、高的變動自動更新該欄位；玩家手動輸入後就保留其值，旁邊的 `Use the default (N)` 按鈕恢復自動。援軍設定依回合上限自動調整（見 reinforcement-balance.md）。

## Decisions

- **預設只依地圖大小，不依部隊規模**（使用者在看過數據後決定）。標準 bot 的 144 局顯示：地圖每多 7 格（寬+高），攻擊戰的對局多約 1.3–2.2 回合才分出結果；每方師數（3、6、10）在五個指標、兩種交戰型態下都沒有可偵測的影響（t 值在 −0.8 到 1.3 之間）。
- **每格約 5 的係數**取自攻擊戰各尺寸的中位數（24×16 約 8、32×24 約 11、48×36 約 17），並與遭遇戰在預設尺寸的中位數（約 12–13）一致。這是粗略擬合，不是精確模型。
- **衡量指標**：以「75% 的 VP 變動已完成的回合」與「75% 的目標城鎮易手已完成的回合」判斷對局何時打完。使用者否決「最後一次變動」（尾端小變動沒有意義）與 90%（太嚴格）。
- 不採用的做法：憑感覺的 `(寬+高)/7 + 1.5×師數`（曾短暫出現，沒有依據，已移除）；依師數增加回合的項目（數據不支持）。若日後有資料顯示部隊規模影響節奏，才能加回，並須在此記錄係數與依據。

## Known gaps

- `turn-limit-default-evidence`（`docs/quality/05-todo-inventory.md`）：樣本只有標準 bot、每組 6–10 局，時間指標 R² 0.04–0.17；欄位的自動更新尚未在瀏覽器操作過。

## Verification

- 單元測試：`tests/game-flow/default-turn-limit.test.ts`、`tests/ui/flow.test.ts`。
- 量測：[evidence/turn-limit-2026-10-15](../quality/evidence/turn-limit-2026-10-15/README.md)；工具 `scripts/ai-match.mjs`、`scripts/turn-limit-study.mjs`、`scripts/turn-limit-regression.mjs`。
- 驗收列：`NG-06`（預設改為 11 回合後為 `UNVERIFIED`，待瀏覽器重跑）。
