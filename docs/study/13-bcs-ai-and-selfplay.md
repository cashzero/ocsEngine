# BCS AI 與 Self-play 研究（M9 前置研究）

狀態：研究完成（2026-10-06），供 [M9 AI Bot WBS](../roadmap/11-ai-bot-wbs.md) 與
[AI Bot 架構](../ai/architecture.md) 使用。本文件只決定「保留什麼結構、拒絕什麼語意」，不移植任何 BCS 程式碼。

研究範圍：`bcsEngine/ai/*`（19 檔，約 8.7k 行）、`docs/ai-selfplay.md`、`docs/headless-selfplay.md`、
`scripts/run-ai-selfplay.mjs`、`e2e/random-ai-selfplay.spec.ts`、`utils/selfplayScenario.ts`。

## 1. BCS 的做法

```text
React context ──project──> GameState ──getLegalActions──> actions
   └─ useBotController ─ chooseBotAction(state, actions, rng) ─ botExecutor ─> UI/gameplay handlers
```

- `botPolicy.chooseBotAction`：對每個 legal action 打分，同分以 action key 排序後用 bot RNG 選；
  `exploration` 模式以 top-K + softmax（temperature、maxScoreGap）取樣。
- `botStrategy`：strategy registry（`production` 與候選 id）、每 seat 設定 `strategyId/choiceMode/seed`，
  並把 formation plan、activation sequence、joint attack、HQ management、tempo、objective consolidation、
  cross-formation reserve 等 planner 疊成分數調整。
- `botTelemetry` / `botScoreTelemetry`：每個決策記錄 turn、phase、action、score、reason、alternatives、
  actor 前後距離（敵、objective、cohesion）、計畫對齊（`ALIGNED/NEUTRAL/CONFLICTS`）與 scenario 摘要。
- Self-play：不同 map/OOB seed 生成、雙方 AI 打到回合上限；paired seeds 交換座位比較 baseline 與 candidate；
  common random numbers；結果字典序 VP → 擊殺 step → 自損 step。
- 評估分層：「能完成一局」→「行為合理」→「勝率」，勝率不得掩蓋前兩層問題；
  Error（`FAILED_ACTION`、`EARLY_TERMINATION`、`WINNER_MISMATCH`、`FORCE_COLLAPSE`、`TRAIN_EXPOSURE`）讓 CI 失敗，
  Warning（`OBJECTIVE_DRIFT`、`NO_COMBAT`、`ACTION_IMBALANCE`、`SUPPORT_CHURN`）需人工看 trace。

## 2. 量測到的教訓

| 教訓 | 證據（BCS 文件） | 對 ocsEngine 的意義 |
|---|---|---|
| executor 綁 React handler，self-play 必須跑 Playwright | full-UI 每局 64.9 秒；minimal headless 仍是 browser-backed，9.46 秒 | ocsEngine 的 Gameplay Engine 本來就 headless；bot 必須只走 `GameSession` public API，self-play 用 Node 直接跑，不需要瀏覽器 |
| legal-action model 與 executor 不一致造成 `FAILED_ACTION` | Error 分類第一項 | bot 只能 dispatch 由 `getActionCandidates`／`getMovementRange` 產生或 `validateDraft` 通過的 action |
| route open set 每次全排序，medium seed 超過 424 秒 | headless-selfplay Benchmark | pathfinding 用 binary heap；同一 revision 內快取 unit destination；保留病態 seed 為效能 regression |
| 「只 barrage 不攻擊」導致到第 10 回合仍未奪點 | Turn-limit assessment | barrage 必須與後續地面攻擊綁成同一個 attack plan，評分看整個 plan |
| faction 主導地圖讓 baseline/candidate 看似平手 | paired scoring | 比較時合併交換座位的兩局再判定 |
| 針對單張地圖寫座標／formation 名稱特判 | 調查順序第 3 點 | 規則：policy 不得出現固定 hex、unit/formation 名稱或 seed 特判，以 seed batch 驗證 |

## 3. 保留（只取結構）

1. Strategy registry 與 seat 設定（policy id、版本、選擇模式、bot seed）。
2. 「打分 + score breakdown + alternatives」的決策形狀與 deterministic tie-break。
3. Decision trace 與 score telemetry 的欄位概念（前後距離、計畫對齊、拒絕原因）。
4. 三層評估順序與 Error/Warning 分類法；Warning 不單獨失敗，Error 為 CI gate。
5. Paired、交換座位、common rules RNG、fixed-map／fixed-OOB 掃描、regression 與 promotion seed 分離。
6. 效能教訓：heap、revision 內快取、病態 seed 保留成 regression。

## 4. 拒絕

| BCS 內容 | 拒絕原因 |
|---|---|
| `activationSequence`、`formationPlan` 的 activation 部分、`hqManagementPolicy`、`combatGarrisonGuard` 等 policy | BCS activation／HQ command／Combat Train 語意；OCS 是 phase 制，沒有 activation |
| `botExecutor`（700+ 行） | 呼叫 React／UI handler；ocsEngine 以 `GameSession.dispatch` 取代 |
| `TRAIN_EXPOSURE` 等 BCS 專屬檢查 | 換成 OCS 對應：卡車／dump 暴露、HQ 暴露、補給中斷率 |
| 所有分數常數與權重 | 依 BCS 單位、AV 與 VP 校準，對 OCS 無意義 |
| Playwright self-play harness | 不需要瀏覽器；UI 驗收另由產品操作驗證計畫負責 |

## 5. 直接影響 ocsEngine 設計的結論

- Bot 是 `GameSession` 的 client：`getView` + `getActionFamilies/getActionCandidates/getMovementRange` + drafts +
  `dispatch/respondToPendingDecision`。不 import 規則函式、不讀 `GameState`。
- OCS 的「單位」決策要升到 phase 層級：一個 Movement Phase 內有數十個單位，必須先產生 phase plan 再逐步執行，
  每步仍以當下 legal candidate 為準，結果不符預期時 replan。
- Self-play 與 bot 開發用同一個 Node headless runner；UI 驗收只用來證明產品流程（人對電腦、電腦對電腦觀戰）。
