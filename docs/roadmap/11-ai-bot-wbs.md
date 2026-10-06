# M9-AI：AI Bot（電腦對手）WBS

狀態：**IN PROGRESS**（2026-10-06 建立）。B1、B2 進行中（headless 對局可跑，驗收未完成）；其餘 PLANNED。本文件是計畫，不是完成宣告。

需求來源（使用者，2026-10-06）：「規劃並設計ai bot」。
使用者決定（2026-10-06）：「先做headless mode 我們需要快速疊代」——同意在 M8 完成前先做不碰 UI 的 B0–B4；
「必須能讓bot中間能快速對局」——電腦對電腦必須能快速大量對局，對局速度列為 B2 的驗收條件（§2 B2）。

設計文件：

- [BCS AI 與 Self-play 研究](../generator-study/05-bcs-ai-and-selfplay.md)（roadmap §13 要求的 M9 前置研究）
- [M9 Bot 架構](../ai/M9-bot-architecture.md)
- [M9 評分與規劃](../ai/M9-scoring-and-planning.md)

## 0. 前置 gate 與開始條件

`docs/roadmap.md` §12–§13：M8 產品操作 gate 的所有 P0 通過前，M9 不得開始實作。2026-10-04 的執行紀錄仍有 NG-07、NG-10、
MAP-03、MAP-04 FAIL，SES 與 UI 列尚未執行，因此 M8 仍為 **IN PROGRESS**。

本 WBS 把工作分成兩類，方便使用者決定是否提前開始其中一部分：

| 類別 | 步驟 | 與 M8 的關係 |
|---|---|---|
| 不碰 UI 的 headless 工具 | B0–B4 | 可作為 M8 的測試工具（隨機電腦大量跑完整局，找 deadlock 與 action 覆蓋缺口）；提前開始需使用者同意 |
| 電腦對手行為 | B5–B6 | 依賴 B0–B4；行為調校不影響 M8 |
| 產品 UI 與驗收 | B7–B9 | 依賴 M8 的 New Game、存讀檔、Game End 流程已通過；必須等 M8 |

## 1. 產品流程（使用者要求的工作流程，待確認）

1. New Game 設定 map／OOB，為每一方選「玩家」或「電腦」，預覽，開始。
2. 人對電腦：人類操作自己的回合；人類攻擊時電腦即時回應守方決策；電腦的回合自動進行並在地圖與 history 中可見；
   至少完成一整個 Game Turn，再一路打到 Game End。
3. 電腦對電腦：開始後無人操作即可打到 Game End，可暫停、調速、存檔。
4. 中途存檔、讀檔後電腦接續；undo；最終 replay hash 相符。
5. 電腦卡住時有可見錯誤與「改由我操作」。

此流程轉成 §4 的驗收列草案；在使用者同意前不寫入 `docs/quality/03-product-operation-verification-plan.md`，也不得縮小。

## 2. 步驟

### B0 契約與前置缺口（PLANNED）

- BCS 研究文件（已撰寫，見上方連結）。
- Projection 補上公開的 objective 控制權（目前 `hexControl` 未投影；人類在地圖上看得到，電腦也需要）。
- 確認 OCS 4.9 下對方增援時程是否公開；未確認前 belief 不使用。
- `SeatBinding.controller`（`HUMAN` 或 `BOT {policyId, policyVersion, seed}`）資料欄位、save migration（舊存檔 = 雙方 HUMAN）。
- New Game request 增加每個電腦座位的 bot seed，與既有四個 seed 正交。
- `PublicGameFacts` 由 `GeneratedScenarioPackage` 建立（地圖、objectives、entry/supply region、turn limit、Piece Definitions、圖表）。
- `src/ai` import boundary test：拿不到 `GameState` 與規則執行碼。
- 完成證據：上述測試；save migration round-trip；boundary test 對刻意違規的檔案會失敗。

### B1 座位驅動與 action 存取（IN PROGRESS）

已完成（headless 部分）：`src/ai/driver.ts` 的 `runBotMatch`（pending decision 的 owner 優先，其次 acting player；
被拒時依序試替代方案最多 3 次並記為 `FAILED_ACTION`；`BOT_STALLED`、`BOT_BUDGET_EXCEEDED`、`NO_BOT_FOR_ACTOR`、`FATAL` 都停止並回報），
`src/ai/access.ts`（revision 內快取 families／candidates／movement range／draft），`src/ai/rng.ts`（`hash(seed, stateHash, ordinal)`），
decision trace（含被拒的 action 與 violation）。測試：`tests/ai/bot-driver.test.ts`。
未完成：給 UI 用的常駐 seat controller（訂閱通知、暫停、接手）屬 B7；同 phase 重複局面（`BOT_LOOP`）偵測未做，目前只靠 step 預算。


- `BotSeatController`：判斷何時行動（自己的 pending decision 優先、`actingPlayerId`）、單一序列化迴圈、暫停／停止、
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

對局速度（預設 32×24、6 師、8 回合、random-legal 雙方，約 880 個 action；同一場的最終 state hash 與優化前完全相同）：

| 版本 | 單場時間 | 說明 |
|---|---|---|
| 優化前（HEAD f0d453b，自動存檔） | 67.7 s | 每個 action 後完整存檔，存檔大小隨歷史增長 |
| 規則層快取後（MANUAL） | 19.3 s | scenario 正規化 JSON 只算一次、地圖索引快取、Hex ID 解析快取、piece-by-hex 索引、補給搜尋改 heap 並依局面快取 ZOC／敵軍／trace 結果 |
| 加上「是否有合法行動」依局面快取、random-legal@2 延遲查詢 | 12.8 s（約 820 action，15.7 ms/action） | replay 驗證另需約 3.5 s |
| 4 worker 平行 20 場（i5-7600，4 核） | 121.4 s，含 replay 驗證（每場約 6 s 吞吐） | 第一版為 157.6 s；8 worker 不會更快 |

每次只改效能時，以同一場的最終 state hash 對照改動前的建置；以上每一步都相同（random-legal@2 改變了選擇方式，因此從 v2 起重新取基準）。
批次：第 0–59 場（v1）與 v2 的 20 場全部 FINISHED、replay 相符；action 覆蓋見各批 `tmp/ai-match/*/summary.json`
（v1 的 40 場：MOVE 14,351、COMBAT 389、BARRAGE 62、REBUILD 202、CHECK_SUPPLY 3；沒有開啟 Air 的局）。

Bot 對局已找到並修正的規則缺陷（各有「修正前失敗、修正後通過」的回歸測試 `tests/ai/bot-found-regressions.test.ts`）：

1. 砲擊補給分次付款可能走進死路：先從一個 dump 付 1T 後，剩下的 dump 都不在共同路線上，規則拋出例外、session FAULTED（10.1b）。
   UI 上的玩家會遇到同樣的當機。修正：只提供付完後仍能付清的分次付款。
2. 重建單位（13.5a）可選在敵方戰鬥單位站在 Repl 上的 hex，套用時才被引擎不變式拒絕。修正：驗證與候選都排除該 hex。
   根因是已知缺口「Repl 尚未是戰鬥單位」（manifest `replacements-rebuilds`），本修正不關閉該缺口。

尚未完成的驗收：下列 100 局、Large 20 局、Air 20 局；速度目標（暫定，待使用者確認）：預設規模單場 ≤ 10 秒（單 worker），
4 worker 吞吐 ≥ 每分鐘 10 局。


- `random-legal@1`：從合法 action 中加權隨機（ADVANCE_SEQUENCE 權重低但非零，避免每 phase 立即結束；MOVE 以 range 取樣）。
  用途是找 action 覆蓋、deadlock、replay 問題，**不是**行為品質基準。
- `scripts/ai-match.mjs`：Node 直接跑 `dist/`，seeds、雙方 policy、局數、turn limit、輸出目錄；summary.json／summary.md／trace.jsonl／最終 save 與 replay。
- 完成證據：預設規模 100 局（map／OOB／deployment／rules seed 各自變化）全部打到 Game End，Error 為零；
  另含 Large 地圖 20 局與開啟 Air 的 20 局；記錄每局耗時與決策延遲分布；發現的規則或 gameplay 缺陷各自開 TODO 或修正，不在 bot 端繞過。

### B3 觀察、belief 與情勢分析（IN PROGRESS）

已實作（heuristic@1 所需的部分）：`src/ai/knowledge.ts`（公開的印刷數值）、`src/ai/analysis.ts`（己方單位、敵方 stack 含隱藏數估計、
objective 控制、最近敵軍、威脅值）；projection 新增 `objectives`（每個 objective 的 VP 與目前控制方，雙方可見）。
未完成：距離場（目前以 hex 距離近似）、跨 phase 的 belief 記憶、資訊洩漏測試、64×48 分析耗時記錄。

- `BotObservation`（projection + PublicGameFacts + 公開歷史）、隱藏敵軍 belief、`AnalysisCache`（距離場、威脅／支援影響圖、前線、
  補給覆蓋、objective 價值、地形防禦）。Pathfinding 用 binary heap。
- 完成證據：資訊洩漏測試（替換敵方隱藏單位，決策不變）；分析結果在小型 fixture 上的期望值測試；
  64×48 地圖上一次完整分析的耗時記錄。

### B4 Pending decision responders（IN PROGRESS）

已實作 `src/ai/decisions.ts`：FIRST_PLAYER（最後一回合選後手）、SUPPLY_SOURCE、DEFENDER_LEAD、DEFENDER_TERRAIN、STEP_LOSS／ATTRITION_LOSS／
OVERSTACK_ELIMINATION、OPTION_SPLIT、RETREAT_HEX／DISPLACEMENT_HEX、ADVANCE_HEX、BREAKDOWN_ABSORPTION；每個回答在 trace 寫出 responder 名稱。
Air 與 CARGO_LOSS 仍用第一個選項（TODO `bot-air`）。測試：`tests/ai/heuristic.test.ts`（以假 context 驗證選擇）；尚缺每種 decision 的規則 fixture 測試。

- 依 [評分與規劃](../ai/M9-scoring-and-planning.md) §6 為每種 decision 寫 responder，皆有 random-legal 後備與 `RESPONDER_FALLBACK` Warning。
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
| B5-7 可讀 | 人工檢視 3 局完整 trace（不同 map 風格）並記錄不合理行為；明顯錯誤（攻擊 1:2、把卡車開到敵軍旁）列為修正項 | `docs/reports/M9-bot-behavior-baseline.md` |

空軍（`bot-air`）不在 B5 範圍：開啟空軍時電腦只以隨機合法方式處理空軍行動，見 §3 TODO。

結果（2026-10-06，最終程式碼、全新 seed，詳見 [行為基準報告](../reports/M9-bot-behavior-baseline.md)）：預設地圖 B5-1～B5-6 全部 PASS
（對隨機電腦 38/40 = 95%，雙方座位各 95%；攻擊勝率比中位數 14:1；終局 97% 部隊在補給中）；地中海 10/10；
**東歐 32/40 = 80%，未達 90%**（TODO `bot-eastern-front`）；B5-7 人工檢視已做並修正 11 項。因東歐未達標，B5 維持 IN PROGRESS。

### B6 Logistics-aware（M9.3，PLANNED）

- SP 需求估計、卡車運補、dump 位置安全、extender、炸 dump、fuel 方法選擇、Supply Phase 的 SP 預算。
- 完成證據：與 B5 相比 `HIGH_OOS` 與 `LOGISTICS_EXPOSURE` 明顯下降，且 objective 得分不下降（成對比較）；
  8 回合以上的局不因補給枯竭而崩潰。

### B7 產品 UI 整合（PLANNED，需 M8 gate 通過）

- New Game 每方「玩家／電腦」、電腦 seed；人對電腦不出現交接畫面、守方決策即時回應；
  電腦行動播放（速度、暫停）、「電腦思考中」狀態、history 敘述；電腦卡住的錯誤與「改由我操作此方」；
  電腦對電腦觀戰（選視角）；存讀檔後電腦接續；undo 說明。
- Air 開啟時提示電腦不會主動使用空軍（TODO `bot-air`）。
- 完成證據：§4 的 BOT 驗收列在真實瀏覽器操作通過。

### B8 行為基準報告（PLANNED）

- `docs/reports/M9-bot-behavior-baseline.md`：seed 矩陣、Error／Warning 統計、勝負與 objective 分布、延遲、代表性 trace 摘錄、
  已知弱點與 TODO。

### B9 M9 exit gate（PLANNED）

- `docs/roadmap.md` §13 的 exit gate：多組 generated scenarios 完成；failed action、deadlock、infinite loop、replay mismatch 為零；
  人與電腦 dispatch 相同 action 結果一致；決策確定且 rules RNG 不受影響。
- 加上 §4 BOT 驗收列全部 PASS（記錄於驗收計畫）。任何一項未達成，M9 維持 IN PROGRESS。

## 3. TODO（已知會留下的縮減）

| TODO | 缺少的行為 | 使用者可見影響 | 關閉證據 |
|---|---|---|---|
| `bot-air` | 電腦不主動 refit、派空軍任務、air drop、建 air base；air pending decisions 只用隨機合法後備 | 開啟 Air 時電腦明顯偏弱 | 電腦在開啟 Air 的 generated game 中主動派 barrage／interdiction 並通過驗收列 |
| `bot-rail-cap` | Rail Cap 規則（rail WBS R4）實作後電腦才會用鐵路運兵運補 | 同 rail R4 | rail R4 完成後，電腦在 runner 與 UI 中使用 Rail Cap |
| `bot-difficulty` | 無難度等級 | 只有一種強度 | 需使用者決定是否要做 |
| `bot-eastern-front` | 長距離推進的補給接力（extender、分段卸貨、前線 HQ 轉移）與守住遠方奪下的目標 | 東歐地圖上電腦常打成和局（對隨機電腦 80%） | 東歐風格 20 局（交換座位、未用於調參的 seed）勝率 ≥ 90% |

## 4. 驗收列草案（BOT，待使用者同意後加入驗收計畫）

| 列 | 操作（真實 UI） | 通過條件 |
|---|---|---|
| BOT-01 | New Game：一方選電腦，預覽並開始 | 開局後畫面只顯示人類一方的 view；沒有交接畫面 |
| BOT-02 | 人對電腦，人類完成自己的 player turn（移動、攻擊） | 電腦即時回應守方決策（領頭、地形、損失、退卻），結果在 history 可見 |
| BOT-03 | 電腦的 player turn | 自動完成所有 phase；每個電腦行動在地圖與 history 可見；可暫停、調速；人類看不到電腦的隱藏資訊 |
| BOT-04 | 人對電腦至少完成一整個 Game Turn，再繼續到 Game End | 結果畫面正確；無卡住、無錯誤 |
| BOT-05 | 電腦對電腦觀戰 | 無人操作打到 Game End；可暫停、調速、切換視角 |
| BOT-06 | 電腦回合中存檔、重開、讀檔 | 電腦從同一位置接續；最終 replay hash 相符 |
| BOT-07 | Undo 到電腦行動前 | 局面正確回復；電腦在相同局面做出相同決定 |
| BOT-08 | 製造電腦卡住（測試用 policy） | 出現可見錯誤與「改由我操作此方」，接手後可繼續遊戲 |
| BOT-09 | 延遲 | 預設規模下電腦單一行動 p95 ≤ 300 ms 計算時間，完整 player turn ≤ 20 秒（不含播放動畫） |

## 5. 開放決定（需使用者回答）

1. ~~是否同意在 M8 完成前，先做不碰 UI 的 B0–B4？~~ 已同意（2026-10-06）。
2. 產品優先順序：先做「人對電腦」，還是「電腦對電腦觀戰」也同時列為 M9 必要？
3. 電腦回合在畫面上的呈現：逐步播放每個行動（可調速），或整個 phase 瞬間完成後只給摘要？
4. New Game 預設：雙方都是玩家（目前行為），或預設人類 Allied 對電腦 Axis？
5. §4 驗收列草案是否同意加入驗收計畫？
