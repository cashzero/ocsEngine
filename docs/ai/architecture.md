# AI Bot 架構

## 範圍

電腦對手如何接上 Gameplay session：依賴邊界、驅動迴圈、可用的查詢、確定性與決策紀錄。策略內容見
[heuristic-policy.md](heuristic-policy.md)，對戰評估見 [evaluation.md](evaluation.md)，後續計畫見
[AI Bot WBS](../roadmap/11-ai-bot-wbs.md)。

目前只有 headless 對局：`scripts/ai-match.mjs` 在 Node 中讓兩個電腦座位打完整局。產品 UI 沒有電腦座位。

## 現行行為

### 依賴邊界

```text
src/core  src/domain  src/rules（型別、公開圖表）  src/gameplay（GameSession 公開 API）
                                   ▲
                                src/ai
                                   ▲
                    scripts/ai-match.mjs（headless runner）
```

- `src/ai` 只能 import `core`、`domain`、`gameplay`，以及 `rules` 的**型別**與 `rules/tables/`（印刷的 CRT、Barrage 等表，
  玩家看得到的公開資料）。不能 import 規則函式、`serialization`、`testing`、`ui`、`generation`、`game-flow`。
- 引擎各層不能 import `src/ai`；只有套件根 `src/index.ts` 可以重新匯出。
- 兩條規則由 `tests/integration/foundation-gate.test.ts` 的 import 掃描強制。
- 因此電腦拿不到 `GameState`：它看到的是座位的 `GameplayView`（含 projection 與 pending decision），以及透過 session
  查詢得到的合法行動與 explanation facts。

### 驅動迴圈（`src/ai/driver.ts`）

`runBotMatch` 反覆執行：

1. 生命週期為 `FINISHED` 就結束；不是 `ACTIVE` 就以 `FATAL` 停止。
2. 決定誰行動：有 pending decision 的座位優先（常是守方），否則是 `actingPlayerId` 的座位。兩者都沒有綁電腦時以
   `NO_BOT_FOR_ACTOR` 停止。
3. 每個座位的 `BotPhaseMemory` 以 `gameTurn:playerTurnIndex:phase:segment` 為 key，換步驟就清空。
4. 同一步驟的已接受行動數超過預算（預設：己方棋子數 × 6 + 50）時以 `BOT_BUDGET_EXCEEDED` 停止。
5. 呼叫 `policy.decide`。回傳 `null` 時以 `BOT_STALLED` 停止；不會自動 `ADVANCE_SEQUENCE`，以免把錯誤偽裝成放棄行動。
6. Dispatch 選中的行動；被拒時依序試 `alternatives`，最多 3 次。全部被拒以 `FAILED_ACTION` 停止；重試後才被接受也記一筆
   `FAILED_ACTION` 錯誤。Session 回 `FATAL` 時立即停止。
7. `onDecision` 收到每個決策的 trace。

另有整局上限 `maxActions`，到達時停止原因為 `MAX_ACTIONS`。

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
  不保存狀態。相同局面經 undo、存讀檔、重播都得到相同選擇。
- 電腦的亂數與規則的骰子分開；每局結束後以存檔重播比對終局 state hash（`scripts/ai-match.mjs`）。
- Policy 不讀 wall clock。

### Policy 與 trace

`BotPolicy = { id, version, decide }`；`version` 在行為改變時提升，寫入 trace 與對局結果。現有：

| Policy | 版本 | 用途 |
|---|---|---|
| `random-legal` | 2 | 從合法行動加權隨機；找規則死路與覆蓋缺口，不是強度基準 |
| `heuristic` | 66 | 標準策略（[heuristic-policy.md](heuristic-policy.md)）；可傳入權重與標籤（版本變成 `66+<標籤>`） |

`BotDecisionTrace` 每個決策一筆：policy@version、步驟、revision、ACTION／DECISION、行動、意圖、分數與分項、
dispatch 結果、嘗試次數與被拒的行動、決策與 dispatch 耗時。

## 決策

- 電腦只看座位看得到的資訊，邊界以 import 掃描強制，而不是靠約定。
- 卡住就停止並回報，不自動結束階段。
- 亂數由局面派生而不保存，讓存讀檔與重播不需要電腦的內部狀態。
- 補給預判放在規則層，用與真正執行相同的規則計算；電腦自己不重寫規則。

## 已知缺口

- UI 沒有電腦座位：New Game 不能選電腦、沒有人對電腦或觀戰流程、`SeatBinding` 沒有 controller 欄位（WBS B0、B7）。
- 沒有同步驟重複局面偵測（`BOT_LOOP`），只靠步驟預算。
- 沒有跨步驟的 belief 記憶，也沒有資訊洩漏測試（替換隱藏敵軍時決策必須不變）；目前以 import 邊界與 projection 保證。
- 情勢分析用 hex 距離近似，沒有地形距離場。
- 以上的關閉條件見 [AI Bot WBS](../roadmap/11-ai-bot-wbs.md)。

## 驗證

- `tests/ai/bot-driver.test.ts`：驅動迴圈、重試、停止原因。
- `tests/integration/foundation-gate.test.ts`：依賴邊界。
- `tests/ai/bot-found-regressions.test.ts`：電腦對局找到並修正的規則缺陷。
