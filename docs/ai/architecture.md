# AI Bot 架構

## 範圍

電腦對手如何接上 Gameplay session：依賴邊界、驅動迴圈、可用的查詢、確定性與決策紀錄。策略內容見
[heuristic-policy.md](heuristic-policy.md)，對戰評估見 [evaluation.md](evaluation.md)，後續計畫見
[AI Bot WBS](../roadmap/11-ai-bot-wbs.md)。

兩個入口使用同一個驅動：`scripts/ai-match.mjs` 在 Node 中讓兩個電腦座位打完整局（headless），瀏覽器 UI 則讓 New Game 或選單指定的
電腦座位逐步行動（人對電腦、電腦對電腦觀戰）；UI 的呈現與操作見 [docs/ui/computer-players.md](../ui/computer-players.md)。
座位由誰操作存在 `SeatBinding.controller`（`HUMAN` 或 `BOT {policyId, seed}`），隨存檔保存。

## 現行行為

### 依賴邊界

```text
src/core  src/domain  src/rules（型別、公開圖表）  src/gameplay（GameSession 公開 API）
                                   ▲
                                src/ai
                                   ▲
                    scripts/ai-match.mjs（headless runner）
                    src/index.ts 的 COMPUTER_PLAYERS（由套件根注入 UI controller）
```

- `src/ai` 只能 import `core`、`domain`、`gameplay`，以及 `rules` 的**型別**與 `rules/tables/`（印刷的 CRT、Barrage 等表，
  玩家看得到的公開資料）。不能 import 規則函式、`serialization`、`testing`、`ui`、`generation`、`game-flow`。
- 引擎各層不能 import `src/ai`；只有套件根 `src/index.ts` 可以重新匯出。
- 兩條規則由 `tests/integration/foundation-gate.test.ts` 的 import 掃描強制。
- 因此電腦拿不到 `GameState`：它看到的是座位的 `GameplayView`（含 projection 與 pending decision），以及透過 session
  查詢得到的合法行動與 explanation facts。

- UI 不 import `src/ai`：瀏覽器與測試把 `COMPUTER_PLAYERS`（`src/index.ts`，型別 `ComputerPlayers`，`src/ui/computer-players.ts`）傳給
  `createUiController`。沒有傳入時，綁定電腦的座位會以「卡住」呈現。
- 策略以 `policyId` 從存檔建立（`src/ai/registry.ts`：`heuristic`、`random-legal`，以及測試用的 `test-stall:<revision>`，
  在該 revision 之後找不到行動）；不認得的 id 讓該座位卡住，不猜。

### 驅動迴圈（`src/ai/seat-runner.ts`、`src/ai/driver.ts`）

`createBotSeatRunner` 的 `step()` 一次決定並 dispatch 一個行動；`runBotMatch`（headless）反覆呼叫它，UI 以所選速度逐步呼叫。
回傳 `ACTED`、`FINISHED`、`WAITING`（輪到真人，或 session 非 ACTIVE）或 `STUCK`。每一步：

1. 生命週期為 `FINISHED` 就結束；`FAULTED`／`CLOSED` 以 `FATAL` 停止；其他非 `ACTIVE` 回 `WAITING`（headless 視為 `FATAL`）。
2. 決定誰行動：有 pending decision 的座位優先（常是守方），否則是 `actingPlayerId` 的座位。兩者都不是電腦座位時回 `WAITING`
   （headless 以 `NO_BOT_FOR_ACTOR` 停止）。
3. 每個座位的 `BotPhaseMemory` 以 `gameTurn:playerTurnIndex:phase:segment` 為 key，換步驟就清空。
4. 同一步驟的已接受行動數超過預算（預設：己方棋子數 × 6 + 50）時以 `BOT_BUDGET_EXCEEDED` 停止。
5. 呼叫 `policy.decide`。回傳 `null` 時以 `BOT_STALLED` 停止；不會自動 `ADVANCE_SEQUENCE`，以免把錯誤偽裝成放棄行動。
6. Dispatch 選中的行動；被拒時依序試 `alternatives`，最多 3 次。全部被拒以 `FAILED_ACTION` 停止；重試後才被接受也記一筆
   `FAILED_ACTION` 錯誤。Session 回 `FATAL` 時立即停止。
7. `onDecision` 收到每個決策的 trace。

另有整局上限 `maxActions`（headless），到達時停止原因為 `MAX_ACTIONS`。

Dispatch 的 request ID 含 runner 的 `nonce`：session 會拒絕已見過的 request ID，而讀入的存檔記得所有已接受行動的 ID，所以重新建立
的 runner（讀檔後）必須用不同的 nonce。

### 查詢（`src/ai/access.ts`）

`BotActionAccess` 包裝 session 查詢，同一決策內快取：

| 方法 | 用途 |
|---|---|
| `families()` | 目前啟用的行動種類 |
| `candidates(kind, pieceId?, budget = 400)` | 合法候選行動 |
| `movementRange(pieceId)` | 可達格、路徑與 MP |
| `explain(action)` | 驗證行動並取得玩家看得到的 facts（勝率、DRM、費用，以及補給預判） |
| `traceCoverage(pieceId?)` | 任何單位或指定單位（含 12.6f、13.1d）的 trace 範圍 |
| `feedCoverage(pieceId?)` | 每個友方補給堆能餵到的範圍（12.6c） |
| `drawReach(hexId)` | 放在該格的 SP 能被取用的範圍：5 Truck MP 的補給路徑加相鄰格（12.3a、12.3c），規則層 `queryDrawReach` |
| `attackStrength(attackerIds, targetHexId)` | 這些己方單位在目標旁以 Combat Mode 進攻時，在守方可選的每種地形下計入的戰力與戰鬥線型，以及目標的 hedgehog 等級（9.4b、16.0d）；只用己方單位與公開地形，規則層 `queryAttackStrength` |

補給預判（移動後的 trace、口糧、戰後前進、撤退、重建）由規則層以 owner-only facts 提供，計算在
`src/rules/supply/relocation-impact.ts`、`src/rules/supply/ration-budget.ts` 等處，電腦只讀結果。
遠距威脅 `objectiveRaidThreats` 與攻擊戰勝利條件 `attackVictory` 由 `src/rules/query/projection.ts` 從可見 counter、
公開地形與天氣計算，雙方得到相同的公開資訊。

### 公開知識與情勢分析

- `src/ai/knowledge.ts`：`BotGameFacts`（地圖、counter 印刷值、目標點、回合上限），由 generated package 建立。
- `src/ai/analysis.ts`：每次決策從 projection 重算 `Situation`（己方單位、敵方 stack 與隱藏數估計、目標點控制、
  `threatAt` 威脅值）。
- `src/ai/odds.ts`：從 explanation facts 以公開 Combat／Barrage Table 預估結果分布（不含 Surprise 9.8）。

### 確定性

- 每個決策的亂數由 `hash(座位 seed, stateHash, 本 revision 第幾次決策)` 派生（`src/ai/rng.ts`，FNV-1a + mulberry32），
  不保存狀態。策略在一個步驟內還有計畫記憶（`BotPhaseMemory.notes`：哪些單位已處理、已認領的補給），所以只有「相同局面加相同步驟記憶」
  才保證相同選擇：步驟起點的局面（存檔、重播）與同一個 runner 的 `undoTo`（runner 為每個決策前的 revision 保存步驟記憶快照，還原時取回）
  都成立；在步驟中途讀檔則沒有記憶，策略重新規劃該步驟的其餘部分（TODO `computer-mid-step-load`）。
- 電腦的亂數與規則的骰子分開；每局結束後以存檔重播比對終局 state hash（`scripts/ai-match.mjs`）。
- Policy 不讀 wall clock。

### Policy 與 trace

`BotPolicy = { id, version, decide }`；`version` 在行為改變時提升，寫入 trace 與對局結果。現有：

| Policy | 版本 | 用途 |
|---|---|---|
| `random-legal` | 2 | 從合法行動加權隨機；找規則死路與覆蓋缺口，不是強度基準 |
| `heuristic` | 85 | 標準策略（[heuristic-policy.md](heuristic-policy.md)）；可傳入權重與標籤（版本變成 `85+<標籤>`） |

`BotDecisionTrace` 每個決策一筆：policy@version、步驟、revision、ACTION／DECISION、行動、意圖、分數與分項、
dispatch 結果、嘗試次數與被拒的行動、決策與 dispatch 耗時。

`createBotSeatRunner` 與 `runBotMatch` 可傳入 `observation: { runId, onDecision }`，另收集候選查詢與派送報告。觀測器只在啟用時建立，每個決策獨立持有資料；回呼收到與策略物件分離的報告。回呼在 runner 完成該行動的計數與記憶更新後執行，無選擇或派送失敗也會回報。回呼拋錯會向呼叫端傳遞，已接受行動不會撤回，呼叫端不能因此重送。同一 runner 的觀測序號在 reset 或還原後仍遞增；重建 runner 須另給 run ID。舊 `onDecision` trace 回呼的時序保持原樣。

`ai-match.mjs --observe-decisions` 寫入每局的 `.observations.jsonl` 與 `.observation-manifest.json`，可與 `--trace` 分別啟用。manifest 版本 2 記錄實際出現的 report schema 版本與 coverage，允許同局混合版本 1 與 2。manifest 綁定完整 JS 建置、使用的凍結策略建置或權重檔、種子、初始及終局 hash，並分列收到與寫入的筆數。只有 `complete: true` 才能視為完整對局觀測；中斷、未完成對局及觀測檔寫入失敗都保持不完整。若遊戲存檔目的地仍可寫，新增觀測輸出的初始化、逐筆寫入或結束寫入失敗會保留遊戲結果，並使 CLI 回報失敗；這項處理不涵蓋舊 trace 回呼的失敗。報告涵蓋範圍及研究限制由[決策閘門觀測契約](vp-metrics.md#決策閘門的觀測契約)維護。

## 決策

- 電腦只看座位看得到的資訊，邊界以 import 掃描強制，而不是靠約定。
- 卡住就停止並回報，不自動結束階段。
- 亂數由局面派生而不保存，讓存讀檔與重播不需要電腦的亂數狀態；步驟記憶另以 revision 快照保存，只為同一個 runner 的還原。
- UI 不 import 電腦；由套件根注入，維持引擎各層單向依賴。被拒絕的做法：電腦座位也走交接畫面（人要點過沒有隱藏資訊的畫面）、卡住時替電腦結束階段（把錯誤藏起來，可能默默輸掉）。
- 補給預判放在規則層，用與真正執行相同的規則計算；電腦自己不重寫規則。

## 已知缺口

- 電腦在頁面主執行緒決策（預設大小單一決策 p95 約 0.23 s、最大約 0.65 s）：決策期間頁面不回應輸入，Pause 在該行動結束後才生效
  （TODO `computer-main-thread`）。
- 步驟中途讀檔，電腦不記得該步驟已做的計畫（TODO `computer-mid-step-load`）。
- 只有一個電腦策略可選，沒有難度等級（WBS §5 待決）。
- 沒有同步驟重複局面偵測（`BOT_LOOP`），只靠步驟預算。
- 沒有跨步驟的 belief 記憶，也沒有資訊洩漏測試（替換隱藏敵軍時決策必須不變）；目前以 import 邊界與 projection 保證。
- 情勢分析用 hex 距離近似，沒有地形距離場。
- 以上的關閉條件見 [AI Bot WBS](../roadmap/11-ai-bot-wbs.md)。

## 驗證

- `tests/ai/bot-driver.test.ts`：驅動迴圈、重試、停止原因。
- `tests/ai/seat-runner.test.ts`：逐步 runner、等待真人、卡住、從還原的 checkpoint 重放相同動作、request ID 不與前一個 runner 衝突。
- `tests/ui/computer-players.test.ts`：UI controller 中的人對電腦、電腦對電腦、暫停與單步、讀檔接續、卡住與接手。
- `scripts/product-acceptance/run-computer.mjs`、`run-computer-scale.mjs`：在真實瀏覽器操作（驗收列 BOT-01 至 BOT-09）。
- `tests/integration/foundation-gate.test.ts`：依賴邊界。
- `tests/ai/bot-found-regressions.test.ts`：電腦對局找到並修正的規則缺陷。
