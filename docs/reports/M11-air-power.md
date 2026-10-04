# M11-Air 空軍實作紀錄（2026-10-01）

狀態：**IN PROGRESS**。範圍依使用者指示為計畫 [08-air-power-wbs.md](../roadmap/08-air-power-wbs.md) 的 A0–A4、A7、A8、A9；
A5（空運、空降）與 A6（BTR 專屬規則）不在本次範圍。下列瀏覽器操作是探索性證據，**不**提升
`docs/quality/03-product-operation-verification-plan.md` 的任何列（新增的 AIR 列一律 UNVERIFIED）。

## 1. 完成的工作

| 步驟 | 內容 | 證據 |
|---|---|---|
| A0.1 | 空軍六張表與 Barrage vs Facility 轉錄、雜湊、範例交叉檢查 | `docs/rules/ocs-4.3-charts.md` 空軍節；`src/rules/tables/ocs-4.3.ts`；`ocs-air.test.ts` |
| A0.2 | 22 張美德飛機 counter 正反面轉錄（GPID、兩面圖檔 SHA-256），產生器使用其中 16 張 | `docs/oob/M11-air-counter-corpus.md`；`src/generation/oob/air-corpus.ts` |
| A1 | 資料模型：AIR family（兩 step、ACR、砲擊力、航程、括號旗標）、Air Base facility（Level 狀態）、`GameState.air`、`AIR_MISSION` 交易、5 種新決策、4 種新動作、快照解碼、狀態不變量（機場 Active 上限、飛機必須在友方機場） | `src/rules/air/*`、`src/rules/kernel/*` |
| A1 | 存檔 0.3.0；0.2.0 存檔讀取時先比對原雜湊、再升級快照並重算雜湊，最後以重播驗證 | `src/gameplay/migration.ts`；`tests/gameplay/save-migration.test.ts`（含竄改存檔被拒） |
| A2 | Refit（每基地每階段一次、2×Level、1T draw／throw、未抵銷敵 ZOC 不可）、增援無（產生劇本沒有空中增援）、9.14f 機場佔領（Capture Table、2× 航程內轉場或消滅）、15.4 拆除、13.9-4 合併 | `ocs-air.test.ts` Refit、Air Bases 節 |
| A3 | 任務序列 14.2f：空戰（括號評等、自願中止、攻守逐回合選機、身分互換、損失骰）、攔截（敵 PZ、單架 Active Fighter、勝者保持 Active）、Flak（14.4e 修正、Mission Loss Table、W／S 同值時由擁有者選）、返航選機場、Fighter Sweep、Base Transfer | `ocs-air.test.ts`；`air-integration.test.ts` |
| A4 | 空中砲擊（無補給成本、短程右移、Strat Bomber 無觀測者、`[1/2]`→DG、目標方選損失）、Barrage vs Facility 打機場（Level 最低 1、`(#)` 逐架檢查）、Trainbusting（標記、TZ +1 MP、Leg 只限標記格、敵方 Clean Up 移除）、每格每階段一次（被擊落仍計數）、Hip Shoot 規則（以能力旗標，產生劇本無國籍具備） | 同上 |
| A7 | New Game「Air forces」選項（預設 None，保持 NG-07 的 90 單位基準）；空軍使用獨立亂數流；機場與飛機部署 | `ocs-air.test.ts` 產生節 |
| A8 | 飛機與機場 counter、Refit 面板、任務按鈕→點選目標格→勾選飛機→預覽（欄位、移欄、Flak 修正與原因、是否在敵 PZ）→出擊、空中決策使用既有決策面板並顯示任務紀錄、PZ 疊圖開關、Trainbusting 標記、預覽中的空軍區塊、任務結果顯示在通知列與 Log | 瀏覽器實測（第 3 節） |
| A9 | 條文測試 22 項、整局 headless 對戰含空軍並重播雜湊一致、存檔遷移測試；manifest 拆為 `air.bases-and-refit`、`air.missions`（PARTIAL，附 GAP）與 `air.transport-and-drop`（DEFERRED） | `npm run check` |

## 2. 自動驗證

- `npm run check`：typecheck、36 檔／226 測試、build、smoke 全部通過（2026-10-01，air-power 分支）。
- `tests/rules/air-integration.test.ts`：14×10 產生地圖、雙方空軍、3 回合，只用公開 candidate 打到 COMPLETE；出現 Refit、Sweep、Barrage、空戰回合、Flak；重播雜湊一致。
- 規則層效能（18×12）：每步 `getActionFamilies` 0–28 ms、`applyAction` 1–19 ms。

## 3. 瀏覽器操作（探索性，1920×1080，headless 內建瀏覽器，真實點擊）

1. New Game：Air forces 選「Fighters, bombers and Air Bases」、9 月 → 預覽 36 單位，雙方各「3 aircraft, 1 Air Base」，counter 數值與圖檔一致（P-38 5-10／186、A-20 (2)-10、Fw-190a 4-2、Bf.109 4-1、Ju.88 (2)-9）。
2. 開局：盟軍看到己方三架飛機；德軍機場只顯示機場（Level 2）與最上層 Active Fighter（4.9a）。
3. Movement 段 Fighter Sweep 打德軍機場 → 交接 → 德軍選擇不中止、逐回合選機（P-38 對 Fw-190a：8 + 5 − 4 = 9，守方中止）→ 第三架自動應戰 → 交接回盟軍。
4. Barrage 段 Air Barrage：預覽 20 → 17-24、無觀測者 −3 → 5-7、Flak +0（德軍 Fighter 已 Inactive，沒有 PZ）。
5. 德軍 Aircraft Refit Phase：面板列出三架 Inactive，Refit 3 架付 1T，成功。結束階段約 140 ms。
6. 新局：Air Barrage 進入德軍 PZ → 預覽 Flak +2（三架、PZ 有 Fighter，對應 14.11 範例）→ 交接 → 德軍以 Fw-190a 攔截 → 交接 → 盟軍選擇不中止、選 P-38 應戰（8 + 4 − 5 = 7，雙方中止）→ Flak 9 + 1 = 10 無效 → 砲擊 5-7 擲 6 無效；結果顯示在通知列。
7. PZ 疊圖：開啟後雙方 PZ（各約 120 格）以藍／紅著色顯示。
8. Console 錯誤：0。

## 4. 實測發現的問題

| 問題 | 狀態 |
|---|---|
| PZ 開關放在地圖圖例內，圖例被地圖覆蓋無法點擊 | 已修正：移到縮放控制列，實測可用 |
| PZ 疊圖線條太淡，幾乎看不見 | 已修正：改為半透明填色加粗虛線，實測可見 |
| 預覽中的機場 counter 一律顯示 Level 1 | 已修正：預覽帶入狀態值 |
| Sweep 預覽顯示「Barrage strength」與「可能被攔截」（Sweep 不會被攔截） | 已修正：依任務類型顯示 |
| 任務若不需任何決策就結算，玩家看不到結果 | 已修正：結果寫入通知列與 Log（TRANSACTION_RESOLVED 帶完整紀錄） |
| **只要有可出任務的飛機，每個 Movement／Barrage 段都會停下**（Trainbusting 可打射程內任何格），Reaction 段因此常需要交接給對方 | **未解決（可用性）**：符合規則（玩家確有合法選擇），但結束步驟與交接次數明顯增加。需要使用者決定是否加「本階段不出任務」之類的快捷（不可改變規則） |
| 空戰與攔截需要多次交接（本次一次攔截 = 2 次交接） | 依計畫 D3 照規則逐回合交接，未提供捷徑 |

## 5. TODO（未完成，不得標為完成）

- **瀏覽器尚未操作**：Trainbusting 標記與 TZ 移動成本、Base Transfer（COMPACT 只有一座機場）、機場被佔領的轉場決策、打機場（Facility 表）、REDUCE／COMBINE、Mission Loss 的 W／S 選擇、1680×1050 版面、鍵盤操作。關閉證據：依新增 AIR 列逐項在瀏覽器中操作並記錄截圖、延遲與 console。
- **Hip Shoot 在產品中不可達**：14.7d-B 由遊戲規則指定國籍，BTR 規則依使用者決定不加，沒有國籍具備能力。規則已實作並以單元測試涵蓋拒絕路徑；關閉證據同 1.4（BTR 規則）。
- **天候不限制空中任務**（BTR Flight Conditions 未加，見計畫 1.4）。
- ~~A5 空運／空降未實作~~、~~機場建造與 Air Strip~~、~~空中補充與空中增援~~：2026-10-03 已實作，見第 6 節；剩餘缺口列在第 6.3 節。
- **可用性**：第 4 節的「每段都停下」問題需要使用者決定處理方式。
- 規則稽核探針 `scripts/audit/rules-conformance-probe.mjs` 尚未加入空軍檢查（覆蓋改由 `ocs-air.test.ts`）。

## 6. 2026-10-03 增補：空運與空降、機場建造、空中補充與增援

使用者要求：「空運與空降（14.9、14.10）……機場建造與 Air Strip（15.2、15.3）……空中補充與增援（13.5f、13.6）完成這樣功能」，
以及「完成後把全部的驗收做完」。選擇（AskUserQuestion）：Eq 每回合固定配給；允許 Air Strip；運輸機併入 New Game 的 Air forces 選項（子選項預設 None）。

### 6.1 實作

| 功能 | 內容 | 程式與測試 |
|---|---|---|
| 機場建造（13.8d、15.2、15.3） | Engineer-Capable（HQ 或工兵，Combat Mode）在 2 Leg MP 內建造，每相位一處、之後不能移動；Air Strip 1T、Strip 升 Level 1 3T、新建 Level 1 4T、每回合 +1 Level 4T、最高 Level 3；從能 draw 到該格的補給堆付款 | `src/rules/air/construction.ts`；`ocs-air.test.ts`；Unit 分頁的 Construction 區塊 |
| 空中補充（13.5f） | Eq 每個 Reinforcement Phase 抵達（Compact／Standard 1、Large 2），放在入口格或友方 HQ 2 格內；HQ Combat Mode、Eq 不在未抵銷敵 ZOC 時，1 Eq 重建 2 個飛機 step（Dead Pile 的飛機以 Active 抵達選定機場；減損飛機與 Eq 同格則補滿）；Eq 不拆用 | `src/rules/air/replacement.ts`；`ocs-air-support.test.ts`；Rebuild 分頁 |
| 空中增援（13.6） | 增援飛機在其回合出現在 Arrivals，只能放在有 Active 空位的友方機場，以 Active 抵達 | `src/rules/lifecycle/lifecycle.ts`；`ocs-air-support.test.ts` |
| 空運（14.9） | C-47、C-47+Gldr、Ju.52；SP 與 Move Mode、Leg MA ≤10、已用 MA ≤ 一半的單位；Double／Normal（可留下）／Half（容量加倍，可留下）；卸載上限 2T×Level（Strip 2T），留下或內建滑翔機的運輸機不計；載運單位當相位 MA 減半；敵 PZ 內 Flak 減少容量時由擁有者選擇損失的貨物（有利存活取整） | `src/rules/air/transport.ts`；`ocs-air-transport.test.ts`；Air 分頁的 Air Transport 面板 |
| 空降（14.10） | Refit Phase 擬定 Drop Plan（兩回合後；遊戲第一個 Refit Phase 可指定任何回合）、延後、取消、過期；Para 單位跳傘、內建滑翔機運輸機可載任何合格 Leg 單位；補給空投不需計畫；每單位與每 1T 擲 Air Transport Success Table（滑翔機 +1）；降在敵作戰單位上即毀；空降單位當回合免追蹤補給（12.6h）；降在敵機場即佔領（9.14f） | 同上；Refit 分頁的 Drop Plans、Air Drop 面板 |
| 產生器 | 運輸機與每方一個傘兵營（暫存在第一座機場，附 1 SP）；增援飛機；Eq 配給；新機場與 Air Strip 的範本 | `src/generation/oob/air.ts`、`air-corpus.ts`、`generator.ts` |
| 存檔 | 0.4.0；0.2.0／0.3.0 可遷移 | `src/gameplay/persistence.ts`、`migration.ts` |

### 6.2 瀏覽器驗收中發現並修正的問題（2026-10-03）

修正後所有 AIR 列都在同一個最終 build 上重跑；結果見計畫 03 第 F 節與 `docs/quality/evidence/air-2026-10-03/RUNS.md`。

| 問題 | 修正 |
|---|---|
| 滑翔機空降預覽寫「4 以下失敗」，結果寫「擲骰 +1，5 以下失敗」：數學上相同，但兩處數字不一致 | 預覽改為與結果同一寫法（表上數字，另標 +1 glider） |
| Refit 面板沒有寫出未抵銷敵 ZOC 不可 Refit 與 Active 上限；因 ZOC 或補給無法 Refit 的機場直接消失；Air Strip 顯示可 Refit 2 架（應為 1） | 每座機場顯示 Level、可 Refit 架數、Active 數／上限、是否在敵 ZOC；不能 Refit 的機場仍列出並說明原因；架數取自規則層 |
| Trainbusting 標記只畫在地圖上，懸停與鍵盤游標的文字沒有提到 | 懸停列與鍵盤游標描述寫出標記、屬於誰、誰要多付 +1 MP |
| 敵方 Eq 與補給堆的數量是隱藏資訊，卻畫成「0」與「0 SP」 | 隱藏時畫「?」與「? SP」；`tests/ui/counter-hidden-quantity.test.ts` |
| 空降降落在敵機場時，Air Base Capture Table 的擲骰沒有任何地方顯示；飛機的轉場要等玩家結束該段才處理，降落後地圖上敵機仍停在被佔領的機場 | 新事件 `AIR_BASE_CAPTURED`，任務結果與 Log 列出每架飛機的擲骰；任務結束時立即處理轉場（只有一座合格機場時自動轉場，兩座以上由擁有者選）；`ocs-air-transport.test.ts` 新測試 |
| 關掉 Game End 對話框（View final map）後再載入已結束的存檔，不會再顯示 Game End | 載入存檔時重新顯示 Game End |

### 6.3 剩餘缺口（TODO，不得標為完成）

- **Glider Points（14.10f）**：產生劇本不提供獨立的滑翔機點數，只有內建滑翔機的運輸機能做滑翔降落。關閉證據：產生器加入 Glider Points 並在瀏覽器以滑翔機點數降落一個非 Para 單位。
- **Success Table 的 −1 修正**（ETO 1944/8 前、蘇軍）屬遊戲專屬規則，產生劇本不套用。
- **傘兵營 counter 為產生器自訂**（TODO(para-gpid)）；**運輸機輪廓為目測繪製**（TODO(transport-art)）。關閉證據：換成 BTR 語料的真實 counter 與 VASSAL 圖檔，逐張比對。
- **Eq 來源為固定配給**，不是遊戲的增援表；Eq 不是作戰單位（沒有 ZOC、堆疊、損失或補給）。2026-10-04 起 Pax 與 Eq 內建於每一局（不再需要 Air support 選項，該選項已移除，增援飛機改隨 Air forces 產生），地面單位補充（13.5a-e）已實作；剩餘缺口見 `docs/reports/replacements-2026-10-04.md`。
- **機場建造的補給**只從能 draw 到建造格的補給堆支付（對 15.0d 的解讀）；Air Strip 在產生劇本中固定允許。
- **狀態 revision 只在 Game End 顯示**：遊戲中途的證據只能記錄回合、玩家與階段。
- **空戰與攔截的交接次數**、**「每段都停下」**的可用性問題（第 4 節）仍未處理，需要使用者決定。
- **AIR-08 未通過**：同一格第二次砲擊與同一架飛機第二次任務都不可用，但 UI 只是不再列出該格／該機，沒有說明規則（10.0e、14.2e）。關閉證據：任務面板列出不可用的格與飛機並附規則說明，在瀏覽器重跑 AIR-08。
- **AIR-04 的 Mission Loss 未觀察到**：驗收執行中沒有多機砲擊被 Flak 擊中。關閉證據：在瀏覽器中觀察一次 Mission Loss 擲骰與（W／S 時）擁有者選擇。
- **AIR-05 的 Hip Shoot**：產生劇本沒有國籍具備能力，仍為 BLOCKED。
