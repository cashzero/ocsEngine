# M9-AI：AI Bot（電腦對手）WBS

狀態：**IN PROGRESS**。B0–B8 進行中（headless 對局、人機與觀戰、策略評估已整合，仍有後勤、行為與驗收缺口）；B9 exit gate 未關閉。本文件只維護工作分解；現況與量測結果寫在 `docs/ai/`，產品操作狀態以 `03` §K 為準。

需求來源（使用者，2026-10-06）：「規劃並設計ai bot」。
使用者決定（2026-10-06）：「先做headless mode 我們需要快速疊代」——同意在 M8 完成前先做不碰 UI 的 B0–B4；
「必須能讓bot中間能快速對局」——電腦對電腦必須能快速大量對局，對局速度列為 B2 的驗收條件（§2 B2）。

設計文件：

- [BCS AI 與 Self-play 研究](../study/13-bcs-ai-and-selfplay.md)
- [AI Bot 架構](../ai/architecture.md)
- [Heuristic 策略](../ai/heuristic-policy.md)
- [AI 對戰評估](../ai/evaluation.md)

## 0. 依賴與未關閉的 gate

AI 依賴 M8 的 generated scenario、New Game、存讀檔與 Game End。依使用者的 headless 與 UI 要求，
這些整合已執行；M8 仍為 **IN PROGRESS**，不能由電腦對局或 BOT 驗收列反推完成。
M8、M9 的驗收邊界仍以 `docs/quality/03-product-operation-verification-plan.md` 為準。

各類工作的依賴如下：

| 類別 | 步驟 | 與 M8 的關係 |
|---|---|---|
| 不碰 UI 的 headless 工具 | B0–B4 | 已依使用者同意實作；完整對局支援 deadlock 與 action 覆蓋檢查，不能代替 UI 操作 |
| 電腦對手行為 | B5–B6 | 依賴 B0–B4；行為調校不影響 M8 |
| 產品 UI 與驗收 | B7–B9 | 已依使用者要求整合並操作；未通過的 M8 與 BOT 列、行為基準仍須各自驗收 |

## 1. 產品流程與驗收邊界

1. New Game 設定 map／OOB，為每一方選「玩家」或「電腦」，預覽，開始。
2. 人對電腦：人類操作自己的回合；人類攻擊時電腦即時回應守方決策；電腦的回合自動進行並在地圖與 history 中可見；
   至少完成一整個 Game Turn，再一路打到 Game End。
3. 電腦對電腦：開始後無人操作即可打到 Game End，可暫停、調速、存檔。
4. 中途存檔、讀檔後電腦接續；undo；最終 replay hash 相符。
5. 電腦卡住時有可見錯誤與「改由我操作」。

此流程已轉成 `docs/quality/03-product-operation-verification-plan.md` §K 的驗收列，不得縮小；
後續設施砲擊的電腦操作另列 BOT-12。各列通過不代表完整 AI 行為 gate 已完成。

## 2. 步驟

### B0 契約與前置缺口（IN PROGRESS）

- BCS 研究文件（已撰寫，見上方連結）。
- 公開 objective 控制權已由 projection 的 `objectives` 提供；不要求取得未公開的完整 `hexControl`。
- 確認 OCS 4.9 下對方增援時程是否公開；未確認前 belief 不使用。
- `SeatBinding.controller` 已使用 `HUMAN` 或 `BOT {policyId, seed}`；未帶 controller 的舊存檔視為 HUMAN。
- New Game request 已有各電腦座位的 bot seed，與既有四個 seed 正交。
- `BotGameFacts` 提供地圖、counter 印刷值、目標點與回合上限；公開圖表與依賴邊界見 [AI 架構](../ai/architecture.md)。
- `src/ai` 的 import 邊界由 `tests/integration/foundation-gate.test.ts` 檢查。
- 完成證據：上述測試；save migration round-trip；boundary test 對刻意違規的檔案會失敗。

### B1 座位驅動與 action 存取（IN PROGRESS）

已實作：`createBotSeatRunner` 由 headless 的 `runBotMatch` 與 UI 共用，包含待決擁有者優先、合法候選、重試、
錯誤停止、階段記憶與 decision trace。驅動與查詢契約見 [AI 架構](../ai/architecture.md)；UI 的暫停與接手見 B7。
同 phase 重複局面（`BOT_LOOP`）偵測仍未做，目前只靠 step 預算。既有回歸見
`tests/ai/bot-driver.test.ts`、`tests/ai/seat-runner.test.ts` 與 `tests/ui/computer-players.test.ts`。

- `createBotSeatRunner` 與 UI 驅動：判斷何時行動（自己的 pending decision 優先、`actingPlayerId`）、單一序列化迴圈、暫停／停止、
  失敗處理（重試下一 candidate 最多 3 次、`BOT_STALLED`、`BOT_LOOP`、`BOT_BUDGET_EXCEEDED`）。
- `BotActionAccess`：families → candidates、`getMovementRange`、drafts、revision 內快取；只 dispatch session 產生或驗證過的 action。
- Bot RNG 以 `hash(botSeed, stateHash, ordinal)` 派生。
- Telemetry sink（JSON Lines decision trace）。
- 完成證據：controller 單元測試（守方決策在非 phasing 時回應、handoff 進行中不 dispatch、每種失敗都停止且可見）；
  rules RNG 隔離測試。

### B2 隨機合法電腦與 headless runner（M9.1，IN PROGRESS）

已完成：`random-legal@2`（`src/ai/policies/random-legal.ts`）、`scripts/ai-match.mjs`（`npm run ai:match -- --matches 20 --parallel 4`；
worker 平行、`--fix-map`／`--fix-oob`、`--trace`、每局存檔並以 `loadSession` 驗證 replay hash）、Gameplay session 的
`persistence: 'MANUAL'`（模擬時不在每個 action 後自動存檔）。

對局量測與證據集中於 [AI 對戰評估](../ai/evaluation.md)，不以舊版本的吞吐或局數推定現行 B2 已完成。
規則回歸由 `tests/ai/bot-found-regressions.test.ts` 支援；目前 Repl 已是可移動的戰鬥單位，契約見
[補充與重建](../rule-engine/replacements.md)。

尚未完成的驗收：下列 100 局、Large 20 局、Air 20 局；速度目標（暫定，待使用者確認）：預設規模單場 ≤ 10 秒（單 worker），
4 worker 吞吐 ≥ 每分鐘 10 局。


- `random-legal@2`：從合法 action 中加權隨機（ADVANCE_SEQUENCE 權重低但非零，避免每 phase 立即結束；MOVE 以 range 取樣）。
  用途是找 action 覆蓋、deadlock、replay 問題，**不是**行為品質基準。
- `scripts/ai-match.mjs`：Node 直接跑 `dist/`，seeds、雙方 policy、局數、turn limit、輸出目錄；summary.json／summary.md／trace.jsonl／最終 save 與 replay。
- 完成證據：預設規模 100 局（map／OOB／deployment／rules seed 各自變化）全部打到 Game End，Error 為零；
  另含 Large 地圖 20 局與開啟 Air 的 20 局；記錄每局耗時與決策延遲分布；發現的規則或 gameplay 缺陷各自開 TODO 或修正，不在 bot 端繞過。

### B3 觀察、belief 與情勢分析（IN PROGRESS）

已實作：`src/ai/knowledge.ts`（公開的印刷數值）、`src/ai/analysis.ts`（己方單位、敵方 stack 含隱藏數估計、
objective 控制、最近敵軍、威脅值）；projection 新增 `objectives`（每個 objective 的 VP 與目前控制方，雙方可見）。
未完成：距離場（目前以 hex 距離近似）、跨 phase 的 belief 記憶、資訊洩漏測試、64×48 分析耗時記錄。

- `BotObservation`（projection + PublicGameFacts + 公開歷史）、隱藏敵軍 belief、`AnalysisCache`（距離場、威脅／支援影響圖、前線、
  補給覆蓋、objective 價值、地形防禦）。Pathfinding 用 binary heap。
- 完成證據：資訊洩漏測試（替換敵方隱藏單位，決策不變）；分析結果在小型 fixture 上的期望值測試；
  64×48 地圖上一次完整分析的耗時記錄。

### B4 Pending decision responders（IN PROGRESS）

已實作的 responder 與各決策選擇見 [Heuristic 策略](../ai/heuristic-policy.md)「待決回應」；每個回答在 trace 寫出 responder 名稱。
Air 與 CARGO_LOSS 仍用第一個選項（TODO `bot-air`）。已有局部案例與真實局面續局回歸，仍須補齊每種 decision 的規則 fixture，不能由假 context 測試代替。

- 為每種 decision 寫 responder（現況見 [Heuristic 策略](../ai/heuristic-policy.md)「待決回應」），皆有 random-legal 後備與 `RESPONDER_FALLBACK` Warning。
- 完成證據：每種 decision 至少一個規則 fixture 測試；B2 runner 中 ground decision 的 fallback 次數為零。

### B5 Heuristic baseline（M9.2，IN PROGRESS）

- Operational plan、各 phase planner（Reinforcement、Movement、Supply、Reaction、Barrage、Combat、Exploitation）、move score、combat EV、
  防病態規則。權重寫在 versioned 設定檔。

使用者要求（2026-10-06）：「開始做會看局勢的電腦：會選目標、計算攻擊勝率、守方決策選對自己有利的選項」；
「先確定bot會正確完成 正確包含使用可用資源獲得勝利」。驗收（數值門檻為提案，使用者確認前不得放寬，只能提高）：

| 項目 | 條件 | 量測 |
|---|---|---|
| B5-1 完成 | heuristic 對 random-legal 20 組交換座位（40 局）與 heuristic 對 heuristic 20 局：全部 FINISHED，Error 為零，最終存檔 replay hash 相符 | runner summary |
| B5-2 獲勝 | 對 random-legal 勝率 ≥ 90%（40 局，雙方座位各半），且每個座位勝率都 ≥ 80% | runner summary |
| B5-3 奪取目標 | ≥ 80% 的局在結束時控制至少一個開局時不屬於自己的 objective | 每局 objective 控制前後對照 |
| B5-4 會打仗 | 有接敵的局中 ≥ 90% 宣告過地面攻擊；平均攻擊 odds 欄位不低於 3:1（OPEN 欄等值）；barrage 在射程內有目標的局中 ≥ 50% 使用 | 每座位 action 統計與 trace |
| B5-5 用資源 | 機械化單位移動前付 fuel；增援全部放上地圖；有可重建選項時當回合重建；卡車在局中至少一次把 SP 運往前線 HQ；終局時 ≥ 80% 戰鬥單位在補給中 | 每座位 action 統計與終局 projection |
| B5-6 守方決策 | 每種 ground pending decision 都由規則化 responder 回答（非隨機後備），且選擇理由寫入 trace | trace 中 responder 名稱 |
| B5-7 可讀 | 人工檢視 3 局完整 trace（不同 map 風格）並記錄不合理行為；明顯錯誤（攻擊 1:2、把卡車開到敵軍旁）列為修正項 | `scripts/ai-narrate.mjs`；修正寫入 `docs/ai/heuristic-policy.md` |

空軍（`bot-air`）不在 B5 範圍：電腦會派 Air Barrage 與 refit，其他任務與空中待決的缺口見 §3 TODO。

狀態：**IN PROGRESS**。最後一次 B5 量測在 heuristic@5（預設地圖全部 PASS）；東歐風格未達 90%（TODO `bot-eastern-front`）；
標準策略 heuristic@79 尚未重跑 B5。量測數字與重跑缺口見 [AI 對戰評估](../ai/evaluation.md)。

### B6 Logistics-aware（M9.3，IN PROGRESS）

已在 heuristic 中實作的部分（卡車、鐵路、海運、共同口糧、補給保護）見 [Heuristic 策略](../ai/heuristic-policy.md)；
未完成的部分是 `docs/quality/05-todo-inventory.md` 的 AI TODO。

- SP 需求估計、卡車運補、dump 位置安全、extender、炸 dump、fuel 方法選擇、Supply Phase 的 SP 預算。
- 完成證據：與 B5 相比 `HIGH_OOS` 與 `LOGISTICS_EXPOSURE` 明顯下降，且 objective 得分不下降（成對比較）；
  8 回合以上的局不因補給枯竭而崩潰。

### B7 產品 UI 整合（IN PROGRESS）

使用者要求（2026-10-15）：「AI 遊戲介面 | New Game 選電腦玩家、人機對戰、電腦對戰觀戰、行動播放／暫停／調速、讀檔後電腦接續、卡住時人工接」。
已實作並在真實瀏覽器操作（證據見 `03` §K，BOT-05 另在預設大小）：New Game 的 Players、`SeatBinding.controller` 與存檔、人對電腦（無交接畫面、
守方決策由電腦即時回應）、電腦對電腦觀戰與切換視角、播放／暫停／單步／四段速度／跟隨、讀檔後電腦接續、Undo 還原後相同決定、卡住的橫幅與
「Play it myself」。呈現與契約見 [docs/ui/computer-players.md](../ui/computer-players.md)；驗收列與證據見
`docs/quality/03-product-operation-verification-plan.md` §K。仍開啟：BOT-09 的效能門檻與決策期間即時回應（`computer-main-thread`）、
空軍提示（`bot-air`）、history 的電腦「思考中」狀態只有面板文字、步驟中途讀檔（`computer-mid-step-load`）、難度等級（§5）。

- New Game 每方「玩家／電腦」、電腦 seed；人對電腦不出現交接畫面、守方決策即時回應；
  電腦行動播放（速度、暫停）、「電腦思考中」狀態、history 敘述；電腦卡住的錯誤與「改由我操作此方」；
  電腦對電腦觀戰（選視角）；存讀檔後電腦接續；undo 說明。
- Air 開啟時提示電腦只派 Air Barrage 與 refit，其他任務與待決選擇仍受限（TODO `bot-air`）。
- 完成證據：驗收計畫 §K 的 BOT 列在真實瀏覽器操作通過。

### B8 行為基準報告（IN PROGRESS）

已有策略升級、後勤與兵力集中研究，見 [AI 對戰評估](../ai/evaluation.md)。完整的 B2／B5 重測與場景矩陣仍未完成。

- 寫入 [AI 對戰評估](../ai/evaluation.md)：seed 矩陣、Error／Warning 統計、勝負與 objective 分布、延遲、代表性 trace 摘錄；
  已知弱點寫入 `docs/quality/05-todo-inventory.md`。

### B9 M9 exit gate（PLANNED）

- `docs/roadmap.md`「各層完成定義」的 AI gate：多組 generated scenarios 完成；failed action、deadlock、infinite loop、replay mismatch 為零；
  人與電腦 dispatch 相同 action 結果一致；決策確定且 rules RNG 不受影響。
- 加上驗收計畫 §K 的 BOT 列全部 PASS。任何一項未達成，M9 維持 IN PROGRESS。

## 3. TODO

AI 的開放 TODO 集中在 `docs/quality/05-todo-inventory.md`「AI」。難度等級（`bot-difficulty`）是否要做列在 §5。

## 4. 驗收列

BOT 列在驗收計畫 §K（`docs/quality/03-product-operation-verification-plan.md`）；各列狀態與證據以該處為準。

## 5. 待決範圍

New Game 預設雙方為玩家；座位選擇與播放契約見 [電腦玩家介面](../ui/computer-players.md)。
BOT-09 的數值門檻仍是提案，以 `03` 該列為準。是否加入難度等級（`bot-difficulty`）統一記在
[TODO 清單](../quality/05-todo-inventory.md)「待使用者決定」。

## 6. 自我對戰提升（M10 前置，停用）

權重自我對戰依使用者決定停用，改以重播研究與凍結標準策略的對戰評估改進行為。
工具 `scripts/ai-train.mjs` 保留，原 T2～T5 不再追求；停用原因、現行 VP > Kill > Loss 的判準、
種子登記與策略升級流程只維護於 [AI 對戰評估](../ai/evaluation.md)。
這項決定不取消 B2、B5、B8、B9 或任何仍開放的 AI TODO。
