# Pax／Eq 內建與地面單位重建（13.5a-e）— 2026-10-04

狀態：**IN PROGRESS**。程式、規則測試與瀏覽器驗收（計畫 03 第 I 節 REPL-01～06）已完成，但下方「剩餘缺口」都是 TODO，
其中「從全新 New Game 經由正常對戰損失單位再重建」還沒有在瀏覽器中走過，所以本項不標為完成。

## 1. 使用者要求

> 目前 PAX/EQ的 設計為何還需要option來打開　應該是內建的吧

原因說明後（Eq 只實作了 13.5f 飛機重建，掛在 New Game 的 Air support 選項下、預設 None；Pax 與地面重建 13.5a-e 完全未實作），
使用者選擇 **B**：補上 13.5a-e，讓 Pax／Eq 對所有遊戲內建，並移除 Air support 選項。

## 2. 設計決定（無需使用者決定的部分，依既有方針預設）

| 項目 | 決定 | 理由 |
|---|---|---|
| Repl 來源 | 產生器固定配給（Compact 1 Pax/1 Eq、Standard 2/1、Large 3/2），不擲 Variable Replacement Table | 沿用使用者 2026-10-03 對 Eq 的選擇（每回合固定配給）；Eq 數量與原本相同 |
| Rebuild Table | 由 counter 推得：Armor／Mech 類（3.2a）與砲兵每步 1 Eq，其他每步 1 Pax；黃點（`rebuildable: false`）、Breakdown、Transport Point 不能以單位身分重建 | 產生的遊戲沒有印刷的 Rebuild Table；規則 21.7 的「每步 1 Repl、履帶類用 Eq」是系列規則內的對應做法 |
| Repl 的形態 | 沿用既有的合併計數器（每格每種一個，記數量），不做成 1/4 RE 的作戰單位 | 既有 Eq 的模型；做成作戰單位牽涉堆疊、ZOC、損失分配、補給、燃料與移動，列為 TODO |
| 卡車重建（13.5e） | GameState 新增 `replacements.lostTrucks` 帳：卡車被俘或位移無處可去而消滅時記到原擁有者；1 Eq 重建 1 點，成為 Eq 所在格的新卡車 | 被俘的卡車換了擁有者，無法靠 piece 本身標記；帳讓「玩家拿回的卡車不超過失去的」可驗證 |
| 存檔 | Gameplay save 0.5.0；0.4.0 列為舊版。遷移時重播動作紀錄推得卡車帳 | 舊局若已有卡車被俘，重播會算出非空帳，必須讓升級後的快照一致，否則讀檔會被拒 |

## 3. 實作

| 範圍 | 內容 | 程式與測試 |
|---|---|---|
| 產生器 | 每方永遠有 Pax 與 Eq 的 Definition（與 Air forces 無關）；`airSupport` 從 OOB 選項、NewGameRequest、New Game 表單與 air 驗收 harness 移除；增援飛機改隨 Air forces；舊請求帶 `airSupport` 時接受並丟棄 | `src/generation/oob/replacements.ts`、`air.ts`、`generator.ts`；`ocs-replacements.test.ts`、`ocs-air.test.ts` |
| 抵達與放置 | 每個 Reinforcement Phase 各產生一個 Pax 與 Eq 計數器（Eq 保留舊 id，舊重播仍對得上）；可放在入口格或 HQ 2 格內；同格同種合併 | `src/rules/replacement/replacement.ts`、`lifecycle.ts` |
| `REBUILD_UNITS` | 一格 Repl、2 格內有 Combat Mode（或朝 Combat 的 DG）HQ、不在未抵銷敵 ZOC；任意步數（13.5b）；Dead Pile 單位在 Repl 格以所選自願模式出現，清除補給／內部存量／非自願模式／Breakout 標記；減損單位須與 Repl 同格且保留模式；成本依 Rebuild Table；卡車點 1 Eq 一點 | 同上；`kernel/model.ts`、`validate.ts`、`reducer.ts`、`candidates.ts`、`projection.ts`、`persistence.ts` |
| 卡車帳 | 被俘（`captureAt`）與位移無處可去（`applyDisplacement`）記帳；新事件 `TRANSPORT_CAPTURED` 讓雙方看到俘獲擲骰與點數（原本卡車被俘完全沒有 Log） | `src/rules/replacement/ledger.ts`、`src/rules/supply/transport.ts` |
| 飛機重建 | `rules/air/replacement.ts` 只保留 13.5f，HQ／ZOC／扣除等共用部分移到 `rules/replacement` | `ocs-air-support.test.ts` |
| UI | Rebuild 分頁：每個 Repl 格一張卡（單位、步數欄、Dead Pile 單位的放置模式、卡車點欄、Pax／Eq 花費與規則說明），飛機重建在其下；計數器印「Pax」或「Eq」；Log 與動作摘要描述 Pax 抵達、單位與卡車重建、卡車被俘；Arrivals 提示改寫 | `src/ui/command-deck.ts`、`controller.ts`、`counter.ts`、`narrative.ts`、`presenter.ts`、`browser.ts`、`web/styles.css` |
| 存檔 | 0.5.0；`replacements` 快照欄位；舊快照補空帳；遷移重播推帳 | `src/rules/kernel/snapshot.ts`、`src/gameplay/migration.ts` |

規則測試：`tests/rules/ocs-replacements.test.ts` 19 項（產生器、抵達與合併、Rebuild Table 成本、HQ／距離／ZOC／同格條件、步數、
放置模式、黃點、卡車被俘與位移記帳、卡車重建、候選動作與停步、視角限制、快照與舊快照升級）。其他規則測試的夾具預設不帶 Repl
（`{ replacements: true }` 才帶），避免每個測試都要放置 Repl；整局自動對局測試會放置並重建，並改為只朝敵方地面單位前進。
`npm run check`（typecheck、全部 399 個測試、build、dist smoke）通過。dist smoke 原本寫死 29 個 action family，main 上已是 33，
改為對照 `ALL_ACTION_KINDS`。

## 4. 瀏覽器驗收（計畫 03 第 I 節）

Chromium（Playwright，1920×1080），對 build 後的應用只操作可見控制項。紀錄：`docs/quality/evidence/replacements-2026-10-04/RUNS.md`。

| 列 | 起點 | 結果 |
|---|---|---|
| REPL-01 | New Game 表單 | PASS：沒有 Air support 選項；說明「Each side receives Pax and Eq replacements every turn.」 |
| REPL-02 | New Game（Air forces None，Standard，seeds 6101-6104） | PASS：雙方 Arrivals 列出 Pax 2 與 Eq 1，計數器印「Pax」「Eq」，放置後同格兩個計數器；完成第 1 回合 |
| REPL-03 | 測試局面（Menu → Load save） | PASS：三個 Allied 師攻擊 2508，一步的 Axis 裝甲營被消滅；Axis Reinforcement 把 Pax／Eq 放進 HQ 格後出現 Rebuild 分頁，列出「Dead Pile · 1 step missing · 1 Eq a step」與放置模式（預設 Combat Mode）；多選 1 個卡車點時顯示「This rebuild takes 2 Eq; the hex holds 1.」且按鈕停用；重建 434 ms，單位回到 2708 |
| REPL-04 | 同上 | PASS：79.VG「reduced here · 3 steps missing · 1 Pax a step」，補 1 步 |
| REPL-05 | 同上 | PASS：完成第 1、2 回合（含交接），存檔再讀檔，回合、階段與 HQ 格一致；console 0 錯誤 |
| REPL-06 | 同上 | PASS：17.Abn 開進 2912，Log「captured 3 of 5 transport points at 2912 (roll 4); the rest must displace.」；第 2 回合以 1 Eq 重建 1 點卡車 |

AIR-11／AIR-12（飛機重建與增援）因程式重構與表單改變，在新 build 重跑，結果見 RUNS.md。

## 5. 驗收中觀察到的問題

| 問題 | 處理 |
|---|---|
| 卡車被俘沒有任何事件或 Log，玩家不知道自己失去卡車（13.5e 需要這個資訊） | 已修：`TRANSPORT_CAPTURED` 事件與 Log 文字 |
| Arrivals 提示仍寫「Eq at an entry hex or beside an HQ」 | 已修：「Pax and Eq at an entry hex or within 2 hexes of an HQ, where they rebuild units」 |
| **讀檔只比對 scenarioId**：在 18×12 的局中讀入同種子但 32×24 的存檔會被接受，地圖仍畫成 18×12，鍵盤游標與單位名稱（顯示「Unit」）都錯亂 | **未修**（既有問題，與本次無關）：TODO(load-scenario-mismatch)，見下 |
| 用空中砲擊 8 回合都沒有造成地面步數損失 | 驗收改用測試局面；「正常對戰中損失再重建」列為 TODO |

## 6. 剩餘缺口（TODO，不得標為完成）

每項寫明缺少的行為、使用者可見的影響、關閉所需證據。

- **TODO(repl-variable-table)**：Repl 是固定配給，不擲 Variable Replacement Table。影響：每回合 Repl 數量可預期，沒有遊戲的起伏。
  關閉證據：產生器產出 Variable Replacement Table，Reinforcement Phase 擲骰並在 Log 顯示，規則測試與瀏覽器各一次。
- **TODO(repl-combat-units)**：Repl 不是作戰單位（無 1/4 RE 堆疊、ZOC、可吸收戰鬥／砲擊損失、補給與燃料、不得 Combat Mode），
  放置後也不能移動，所以減損單位必須走到 Repl 所在格。影響：Repl 不會被打掉也不能前送；「training detachment」以外的用法受限。
  關閉證據：Repl 在規則中作為 1/4 RE 的 Attack-Capable 單位運作（測試涵蓋堆疊、損失、補給、移動），瀏覽器移動 Repl 到減損單位旁重建。
- **TODO(repl-rebuild-table)**：Rebuild Table 是一條通用規則（Armor／Mech／砲兵用 Eq，其他用 Pax，每步 1），不是遊戲印刷的表；
  13.5d 的「兩個小單位一個 Repl」因此永遠不適用。影響：重建成本比多數 OCS 遊戲便宜且一致。關閉證據：產生器輸出每類單位的 Rebuild Table
  （含 13.5d 小單位），規則與 UI 依表計價，UI 顯示該表。
- **TODO(repl-natural-loss-ui)**：瀏覽器驗收的地面重建從測試局面開始；從全新 New Game 經正常對戰損失單位、再重建，尚未在瀏覽器走過。
  關閉證據：從 New Game 開始的瀏覽器紀錄，包含一次地面損失與其重建，並完成該回合。
- **TODO(load-scenario-mismatch)**（既有問題）：讀檔只比對 scenarioId，不同地圖大小但同種子的存檔會被接受且地圖不重建。
  影響：載入後地圖、游標與單位名稱錯亂。關閉證據：讀檔比對 scenario hash 或依存檔重建地圖，瀏覽器在不同大小的局中讀檔一次。
- **Unit Consolidation（13.9）** 仍未實作。
