# M12-Supply：補給與運補 UI/UX 改善計畫（Phase A／Phase B）

狀態：**IN PROGRESS**（2026-10-02 建立；A0 基準與補測完成；A1～A5 已實作；**A6 整合驗收 gate：依使用者縮減範圍（檔案存讀檔移出）通過，詳見 A6**；Phase B 尚未開始）。
本文件是計畫，不是完成宣告；下列每一項在對應證據產生前都是 TODO，所有驗收列皆為 `UNVERIFIED`。

基準版本：已 rebase 到 `73c7cad`（含 #11 編制分組部署、#12 地圖重繪、#13 左欄重整）。#13 改寫了 command deck 的版面
（phase 專屬 tab、任務模式、移動 popup），本文件的 UI 位置與約束已依此更新；詳見
[left-panel-reorganization-2026-10-02.md](../reports/left-panel-reorganization-2026-10-02.md) 與 [docs/ui/11](../ui/11-desktop-command-deck-design.md)。

## 0. 目標與邊界

背景：OCS 補給長期被詬病需要大量人工記帳（逐單位付燃料、裝卸卡車、點算 Token、換算 MP）。
電子化後，這些機械動作不應再由玩家承擔，玩家只需要做有策略意義的決定（補給送到哪裡、囤多少、哪個堆要留）。

| Phase | 範圍 | 性質 |
|---|---|---|
| **A** | 改善「傳統流程」的 UI/UX：玩家仍逐步操作每個規則動作，但操作清楚、可預期、有回饋 | 只動 UI 與唯讀查詢 |
| **B** | 加入 helper：指定數量與目的地由系統自動安排運輸點（TP）；補給試算 | 新增規劃器與試算，展開成現有動作 |

### 設計原則（兩個 Phase 都適用）

1. **規則不變。** 引擎的原子動作（`MOVE_PIECE`、`LOAD_SUPPLY`、`UNLOAD_SUPPLY`、`PAY_FUEL`…）仍是唯一的事實來源。
   Helper 只能展開成這些動作，歷史紀錄、存檔與重播格式不變。
2. **不偷偷執行。** Helper 先給出計畫預覽（花費、結果、風險），玩家確認後才執行。
3. **只用該玩家看得到的資訊。** 試算與規劃使用當前行動玩家的投影（view），不讀對方隱藏資訊。
4. **規則變體不在本計畫內。** 抽象化卡車、取消載運等會改變規則，屬縮減範圍，需使用者明確同意並做成新局可選設定（見 §6 TODO-S1）。
5. **沿用現行 command deck 結構（docs/ui/11）。**
   - 桌面範圍同 `docs/quality/03-…plan.md`：單一左欄，只有 tab 區／任務區一個捲動區，整頁與左欄不垂直捲動。
   - 轉運屬於單位操作，放在 **Unit tab**（現有「Trucks」群組）；不新增 popup。popup 只用於小而即時的確認（移動、roster）。
   - 內容量大或需審閱後果的複合行動（B1 計畫預覽）走**任務模式**，取代 tab 區，完成後回到原 tab；
     依 docs/ui/11 S3 不得裁切或默默擴大捲動區。
   - 新增控件須遵守 docs/ui/11 的焦點與 Escape 順序（roster → 移動 popup → stack picker → …），
     並補上 tab 徽章的無障礙名稱與測試（`tests/ui/command-deck.test.ts` 的做法）。

### 不在本計畫內

- 13.3 鐵路、14.9 空運、18.4／19.0 海運運補（見 §6 TODO-S4）。
- 13.8 工兵建設、AI 對手。
- 跨階段的多趟運補排程（見 §6 TODO-S2）。

## 1. 現況基線（讀程式碼得出，尚未以實機操作驗證）

> 下表是依原始碼推論。A0 已於 2026-10-02 以真實 UI 驗證，逐項結果與新發現（N-01～N-05）見
> [supply-ux-a0-baseline-2026-10-02.md](../reports/supply-ux-a0-baseline-2026-10-02.md)：
> 補測後 S-01～S-10 皆已確認。補測另發現 N-07～N-13，其中 **N-11（卡車裝貨後移動他人會凍結 MP 與貨物，且無警告）
> 與 N-08（合併卡車在 UI 不可用）列為 Phase A blocking 項**，N-12（Undo 為整個 segment）需使用者決定是否處理。

| ID | 觀察 | 來源 |
|---|---|---|
| S-01 | 裝載只提供「最大量」、卸載只提供「全部」；引擎本身支援任意數量 | `src/rules/query/candidates.ts:241-253`、`src/ui/controller.ts:755-763` |
| S-02 | MP 花費只寫「10% of MA」，看不到實際扣多少與剩多少 | `src/ui/controller.ts:757,762`、`transport.ts` `loadCostTicks` |
| S-03 | 不合法的裝卸直接不出現，玩家得不到原因（如本階段卸下的 SP 不能再裝、該格無己方戰鬥單位不能卸） | `candidates.ts` 只回傳合法動作；`transport.ts` 的 violation 訊息未顯示 |
| S-04 | 載貨只在選取卡與 roster 列的小字出現（`load 3/8T`）；地圖 counter 與堆疊清單看不出載貨 | `src/ui/command-deck.ts:60-70`（`supplyDetails`）、`counter.ts` |
| S-05 | 選到補給堆時只有「炸毀」，沒有「用卡車載走」入口 | `controller.ts:751-754` |
| S-06 | 合併／分拆卡車以多顆按鈕呈現（分拆每個點數一顆），玩家需自己管理 counter 組合 | `controller.ts:765-774` |
| S-07 | 卡車一旦開始裝卸即成為「正在移動的單位」（6.1g），UI 沒有提示 | `transport.ts` `spendAsMover` |
| S-08 | 沒有「本階段補給需求／帳目」概覽；玩家要到 Supply Phase 結束才知道誰 Out of Supply | `lifecycle/supply-phase.ts` |
| S-09 | 付費來源與金額只在決策當下出現，事後沒有帳目可回看 | `command-deck.ts` `decisionPanel` |
| S-10 | #13 後轉運動作在 Unit tab 的「Trucks」群組，仍是平鋪按鈕清單（裝、卸、合併、每個點數一顆分拆、延伸器），沒有分層；Supply tab 只處理 trace 與 feed | `command-deck.ts:416` `unitTab` |

## 2. Phase A — 傳統流程 UI/UX

### A0　基準與驗收列

**狀態：基準與補測已完成，唯一未結事項是檔案式存讀檔。** T1 基準 11 次點擊；補測涵蓋 S-05、6.1g、非法卸載、滿載、分拆、
checkpoint 存讀。使用者已於 2026-10-02 核准：(1) SUP 驗收列加入 doc 03（已加入為 §G，全部 `UNVERIFIED`）；
(2) T1 改善目標（見「待使用者決定」，使用者回覆 OK 但未給數字）；(3) 處理 N-12（Undo 只撤銷最後一個動作，見 A4）。
未結：檔案式 Download／Load save 需使用者同意下載後才能測（SUP-A10 的檔案路徑）；它不阻擋 A1，但 A6 gate 前必須完成。

- 在真實瀏覽器走一次現況：New Game → Movement，操作卡車裝載、移動、卸載、付燃料。
- 記錄標準任務 **T1**「把 N T 補給從 A 堆送到前線 B 格，並為一個單位付一次燃料」的操作數與卡點，修正 §1。
- 提出 §4 的 SUP 驗收列；已核准並加入 `docs/quality/03-…plan.md` §G。
- 驗收證據：基準紀錄（輸入、操作步驟與次數、截圖、console 無錯誤）；doc 03 變更。

### A1　引擎端唯讀查詢：轉運選項與不可用原因

**進度（2026-10-02）：** 使用者指示先修 bug，已修正 N-08（合併）、N-11（6.1g 警告）、N-07（counter 點數），
三項皆先寫失敗測試、再修、再以真實 UI 驗證；`npm run check` 通過（255 個測試）。詳見
[報告](../reports/supply-ux-a0-baseline-2026-10-02.md)「Bug 修正」。SUP-A07、A11、A12 仍 `UNVERIFIED`（待 A6 以完整證據執行）。
**A1 程式部分已完成（2026-10-02）：** 轉運選項查詢（`queryTransportOptions`，已接到 `GameSession.getTransportOptions`）、
投影層角色（`ProjectedPiece.role`）、對手看到的卡車點數；`npm run check` 通過（43 檔、262 測試）。
沒有新畫面，所以沒有新的實機驗證，SUP 列狀態不變。詳見報告「A1 完成項」。UI 使用這些資料是 A2。

- **（已完成）** 新增唯讀查詢，回傳指定卡車的轉運選項：同格每個補給堆的「可裝量區間」、卡車可卸量、每項的 MP 花費與裝卸後剩餘 MA，
  以及不可用時的規則條文與人話原因（沿用 `violation` 的 code 與條文編號）。
- 不改任何規則判定，也不改動作格式；`LOAD_SUPPLY`／`UNLOAD_SUPPLY` 照舊帶 `tokens`。
- **修正 N-08（blocking）：** `candidates.ts` 的 `COMBINE_TRANSPORT` 在給定 `pieceId` 時先被過濾成單一卡車，
  永遠湊不出「同格兩台」。改為以選取卡車的格與型別，從全部己方卡車分組，並要求該組包含選取者。
  先寫重現測試（同格兩台、選取其一，應回傳 Combine），再修。
- **（已完成）** 在投影層提供依用途區分的角色（`ProjectedPiece.role`：COMBAT／ARTILLERY／HQ／TRUCK／EXTENDER／DUMP／CARGO／
  AIRCRAFT／AIR_BASE／OTHER），取代 `controller.ts` 的 `isDump` 欄位猜測（TODO-S5 的第一步）。roster、選取卡等其餘顯示尚未改用 `role`，屬 A3。
- 驗收證據：同一份查詢對合法與不合法情境給出與 `validateLoad`／`validateUnload` 一致的結果（支援證據）；
  N-08 重現測試先紅後綠；UI 層驗收見 A2、SUP-A12。

### A2　補給轉運面板

**狀態（2026-10-02）：已實作，並在真實 UI 觀察到；SUP-A01～A04 仍 `UNVERIFIED`（待 A6 以完整證據正式執行）。**
實機觀察：區塊顯示「5 truck points · carrying 0/20T · 45 MP left」與「No friendly supply dump in this hex to load from.」；
到補給堆後顯示「Dump here · 4T (1 SP) · Tokens 1–4 · costs 5 MP, 38 MP left afterwards」；設 3 後按 Load 得「Loaded 3T onto the truck at 0316.」、
載量 3/20T、MP 38；部分卸載 2T 得「Unloaded 2T at 0313.」；同階段再裝被擋並顯示「SP unloaded this phase cannot be loaded again this phase. 12.2a」。

- 選取卡車時，Unit tab 的「Trucks」群組由按鈕清單改為內嵌的轉運區塊（不用 popup，不增加捲動區）：
  上半為本格補給堆（類型、數量、「本階段已卸下 N，不能再裝」），下半為卡車載量／容量。
- 數量步進器，預設為最大可行量（全裝／全卸一鍵完成）；可調整為 1 到最大值。
- 即時預覽：「花費 5 MP，剩餘 45 → 40」。分多次操作時提示每次都收 10% MA。
- 不能操作的按鈕保持顯示並變灰，寫出原因與條文。
- 驗收證據：實機操作 SUP-A01～A04（部分裝載、部分卸載、MP 預覽與實際扣除一致、不合法原因）。

### A3　地圖與堆疊清單

**狀態（2026-10-02）：大部分已實作；有未完成項，見下列 TODO。**

- 已做並在真實 UI 觀察到：補給堆沒有名稱（roster 讀作「Supply dump, 0316」，增援按鈕讀作「Supply dump, off map」）；卡車 counter 有載量標記
  （`load-part`、「3T」）；車上的貨不再列成獨立單位（roster 與「All units」計數排除 CARGO）；counter 顯示目前點數。
  已做並有測試、**尚未在真實 UI 驗證**：從補給堆選「Carry with a truck」、堆疊清單顯示「carries NT」。
- **TODO-A3a 堆疊清單的載量文字未在真實 UI 驗證。** 缺少：實機開啟 stack picker 看到「carries NT」。影響：玩家在同格多單位時看不到卡車載了多少。
  關閉證據：實機操作截圖。（實機嘗試時點擊 counter 沒有開啟 stack picker，開啟手勢尚未釐清。）
- **TODO-A3b 已關閉（2026-10-02）。** 同一格同種補給合併為一個堆（`mergeSupplyAt`，卸載與增援放置都會合併），地圖把堆畫成角落小標記（`dump-marker`），
  不佔三個 counter 名額。實機證據 `A02-rerun-dump-marker.jpg`（SUP-A02 PASS）。載在卡車上的貨與已卸下的堆依規則仍分開。
- **TODO-A3c 堆疊順序與進場格可點範圍**（N-03、N-06）未處理，不在補給核心流程，保留為觀察。
- **TODO-A3d 資料層的名稱停止產生已做**（`names.ts`），但 `docs/oob/` 語料文件仍可能寫著舊名稱，未更新。

- 卡車 counter 加載量標記；空車、半載、滿載外觀可區分。
- **counter 要顯示目前的運輸點數（N-07）：** **已修正**（`counterView` 讀 `status:transport-points`），
  實機看到分拆後兩個 counter 分別印 2、3。驗收見 SUP-A11（仍 `UNVERIFIED`，待 A6）。
- **車上的貨不再列成獨立的「off map」單位（N-10），單位計數不被貨物與分拆棋子灌水（N-09）。** 貨物歸屬在其卡車下顯示。
  驗收見 SUP-A13、A14。
- **補給堆沒有名稱**（使用者決定，2026-10-02：「補給堆不應該有名子」「原本 boardgame 設計就沒有」）。
  原版 counter 的補給堆是沒有名字的通用 counter，只有數量。一律以「Supply dump · 12T (3 SP) at 0113」這類
  「類型＋數量＋位置」呈現，適用於 roster、選取卡、堆疊清單、燃料／裝載選項與帳目。
  - 資料層：OOB 產生器目前為補給堆產出名稱（`src/generation/oob/names.ts:64`，如「Army Supply Dump 255」），
    這偏離原版，應停止產生。
  - UI 層：`src/ui/presenter.ts` 的 `unitLabel` 直接顯示定義名稱；RESOURCE 標籤改為不含名稱。
  - 開工前先確認：存檔、重播、`tests/` 與 OOB 語料（`docs/oob/`）是否依賴該名稱，並列出受影響檔案；
    這是影響範圍檢查，不是延後的理由。
  - 同時檢查卡車等其他通用 counter 是否也有不存在於原版的名稱，只回報，不擅自更動。
  - 驗收：roster、選取卡、燃料選項、堆疊清單、帳目中都看不到補給堆名稱；新局與讀檔後一致。
- 堆疊清單中卡車旁列出貨物；同格多個補給堆以「位置＋剩餘量」區分。
- 選到補給堆時，若同格有己方卡車，提供「用卡車載走…」入口並開啟 A2 面板。
- 驗收證據：實機操作 SUP-A05、A06。

### A4　移動流程與卡車群組

**狀態（2026-10-02）：已實作並在真實 UI 觀察到，有未完成項。**
實機觀察：卡車在 Unit tab 顯示「This truck is mid-move. Finish with it before moving another unit, or it loses its remaining MP and load (6.1g)」；
Undo 按鈕提示「Undo: Loaded 3T onto the truck at 0316.」，按下後訊息「Undid: Loaded 3T…」，下一次提示變成「Undo: Moved to 0316.」，再按卡車回到 0318、Undo 消失。
分拆改為「Points [數字] Split off」，合併仍是一顆按鈕。

- **TODO-A4a 卸貨後「短暫標出新堆位置」未做。** 影響：玩家卸貨後要靠區塊文字與 roster 找新堆（與 TODO-A3b 相關）。關閉證據：卸載後新堆位置在地圖上被標出。
- 卡車的 6.1g 提示放在轉運區塊內，沒有另外放在選取卡上。

- **N-11（blocking）：popup 警告已完成。** 卡車開始行動後，預覽另一個單位的移動時，popup 在確認前警告
  「This ends the move of <卡車>: its N MP left and NT aboard cannot be used again this phase (6.1g)」，
  按鈕改為「Confirm anyway」（實機已看到）。**仍待：** 卡車自己的選取卡顯示「必須先走完」提示。
  A0 實測：未警告就移動別的單位，卡車被凍結（34.5 MP 與 8T 作廢）。驗收見 SUP-A07（仍 `UNVERIFIED`）。
- 卸貨完成後短暫標出新堆位置。
- 合併／分拆改為卡車群組面板：同格同型卡車顯示點數與載量，以數量輸入取代 N 顆按鈕。驗收見 SUP-A08。
- **A4b　Undo 只撤銷最後一個動作（N-12，使用者已核准處理）。** A0 實測 Undo 會退回整個 Movement Segment。
  - 開工前先查：現在的 Undo 如何實作（自動 checkpoint「start of Movement」），引擎是否保留逐動作歷史、
    能否重播到上一個 revision。
  - 設計約束：含擲骰或揭露隱藏資訊的動作（如戰鬥、突圍、炸毀補給堆的擲骰）不能被逐步撤銷來重擲或套取資訊；
    交接後不得撤銷到上一位玩家的動作。這些情況 UI 要說明為何不能撤銷。
    具體語意由使用者在 A4 設計審閱時確認，未確認前 SUP-A15 不執行。
  - 影響：改變 Undo 行為屬於補給以外的 UI 變更，需與 docs/ui/11 的頂部列與焦點規則一併更新。
- 驗收證據：實機操作 SUP-A07、A08、A15。

### A5　付費來源可讀性與補給帳目

**狀態（2026-10-02）：帳目已實作並在真實 UI 觀察到，但範圍縮減，見 TODO；SUP-A09 已於真實 UI 重跑通過（燃料與戰鬥付費）。**
實機觀察：付 1T 燃料後 Ledger 顯示「Supply this step · 1T paid · 3 entries」與
「Fuel 1T for Alanis TF … (this unit) from the 2T dump at 0313 (1T left)」，剩餘量與實際扣除一致。燃料選項本來就以「位置＋數量」標示來源（「…from the 12T dump at 0113」）。

- **TODO-A5a 已關閉（2026-10-02）。** 帳目含戰鬥與砲擊付費（`RESOURCE_CONSUMED`），範圍為「目前這個玩家回合」，標題「Supply this turn」。
  實機一場真實戰鬥後顯示「Combat or barrage supply 2T from the dump at 0107 (13T there now)」，與實際扣除一致（`A09-combat-supply-in-ledger.jpg`、`tests/ui/combat-ledger.test.ts`）。
- **TODO-A5b 已併入 A5a**：帳目的來源改由狀態與紀錄推導（D2），不再依賴頁面記憶，自動付費路徑同樣由紀錄推導。

- 燃料與戰鬥／砲擊付費的選項顯示來源與數量，延續 `ui-flow-review-2026-10-01.md` F-05／F-06 的標示方式。
- 本階段補給帳目（唯讀）：付了什麼、從哪個堆或卡車、剩多少；放在 Log tab 旁可隨時開啟的位置，
  需先決定是新 tab 還是 Log 內的分頁，並確認不違反 deckTabs 的「必辦者在最左」規則。
- 驗收證據：實機操作 SUP-A09。

### A6　Phase A 整合驗收 gate

**驗收結果（2026-10-02，使用者指示「驗收」）：gate 未通過，維持 IN PROGRESS。** 逐列證據在
[evidence/supply-a-2026-10-02/README.md](../quality/evidence/supply-a-2026-10-02/README.md)，狀態已寫入 doc 03 §G：
**PASS** A01、A03、A04、A05、A06、A07、A08、A11、A12、A13；**FAIL** A02（地圖只畫三個 counter，新堆是「+1」徽章，不是 counter）、
A14（分拆本來就多一個 counter，計數會增加）；**BLOCKED** A09（到不了戰鬥，且帳目不含戰鬥付費）；**UNAVAILABLE** A10（檔案讀取步驟需要真的選檔視窗；
下載是真的，checkpoint 路徑通過）；**UNVERIFIED** A15（Undo 語意待使用者確認）。
驗收中找到並修正三個缺陷（各有先失敗的測試）：D1 移動後分拆的卡車不能再合併；D2 帳目來源在新頁面讀檔後變成「a dump」；
D3 **新頁面讀檔後前幾個動作被當成重複請求拒絕**（原本就有的缺陷）。下方各 TODO 以此為準，舊的 TODO-A3a（堆疊清單）、TODO-A6a 的下載部分已關閉。

**使用者回饋後的更新（2026-10-02）：** A02（同格補給合併＋角落標記）與 A09（戰鬥付費入帳）在真實 UI 重跑通過；A15 經使用者確認語意並通過（擲骰等清除情形只有 headless 測試）。
A14 依使用者決定改期望並通過。仍開啟：A10 檔案讀取步驟、整回合真實點擊。**gate 仍為 IN PROGRESS。**

**整回合驗收與範圍決定（2026-10-02）：** 使用者指示「目前可以先驗收 並push　讀檔那些移出scope」。已用真實點擊在 New Game 改地圖 16×12、預覽、啟動後走完遊戲回合 1 的雙方玩家回合
（含增援放置、裝載／卸載、燃料、6.1g 警告、熱座交接與隱私畫面、離開期間報告、First Player 決定），過程與缺陷（合併後的補給堆被列為 eliminated，已修）見證據 README。
**Phase A gate：PASS（範圍依使用者決定縮減）。** 縮減項（使用者明確同意）：檔案式存讀檔不在本 gate。殘留 TODO（不阻擋）：本回合沒有地面戰鬥（戰鬥付費另在 A09 實機戰鬥驗證）；
基準任務點擊數實測 11，目標數字使用者尚未指定；roster 修正只做 headless 驗證。

（以下為驗收前的狀態紀錄，保留作為證據軌跡。）
**狀態（2026-10-02，驗收前）：IN PROGRESS。** A2～A5 已實作，`npm run check` 通過（47 檔、274 測試），
但依 `AGENTS.md`，下列驗收仍未滿足，因此 gate 不能標 DONE／PASS：

已在真實 UI 觀察到的（同一個新局，真實點擊；中間階段推進用腳本，只算「走路」）：
選卡車 → 移到補給堆 → 部分裝載 3T → Undo（只撤銷裝載，再按撤銷移動）→ 重做 → 移到有戰鬥單位的格 → 部分卸載 2T → 同階段再裝被擋並顯示原因 →
為 Alanis TF 付 1T 燃料 → Ledger 列出三筆 → 走完回合 1（含熱座交接、Axis 放置增援與結束各階段）進入回合 2；console 無錯誤。

**未滿足：**

- **TODO-A6a 已由使用者移出 scope（2026-10-02）。** 原文：檔案式存檔／讀檔（SUP-A10）未測。 缺少：Download save 與 Load save 的實機操作。原因：需要下載檔案，須使用者明確同意（檔名、來源、大小）。
  關閉證據：存檔、改變狀態、讀檔後卡車載量、補給堆數量與帳目一致。checkpoint 路徑已在 A0 觀察過，但在新的 Undo 實作之後未重測。
- **TODO-A6b 已關閉：整回合以真實點擊完成（證據 README「Whole-turn run」）。** 原文：回合 1 並非「用真實點擊完成整個回合」。 缺少：Axis 一側與多數階段結束是腳本推進，沒有任何戰鬥或決策；沒有含補給付費的戰鬥。
  關閉證據：以真實點擊完成至少一個含決策與交接的完整回合。
- **TODO-A6c 正式驗收證據。** 缺少：doc 03 要求的截圖存檔、耗時紀錄、各 SUP-A 列的逐列結果。本次觀察不構成逐列 PASS，所有 SUP 列維持 `UNVERIFIED`。
  **2026-10-04 補註（盤點時發現此句已被後續驗收取代）：** 2026-10-02 的驗收已在 [證據 README](../quality/evidence/supply-a-2026-10-02/README.md) 記錄逐列結果與耗時，並寫入 doc 03 §G（SUP-A 列多為 PASS，A10 檔案路徑依使用者決定移出 scope）。截圖只涵蓋 A01–A05、A02 重跑與 A09，其餘列以 README 的文字追蹤為證據（README 說明當時瀏覽器截圖逾時）。上面「所有 SUP 列維持 UNVERIFIED」只適用於驗收前；SUP-B01～B08 仍為 `UNVERIFIED`。
- **TODO-A6d 已關閉：使用者確認 Undo 語意（「OK」）。** 已依計畫實作（只撤銷最後動作；擲骰、揭露資訊、結束步驟、戰鬥等清除 Undo），尚待使用者確認這個語意。
- **TODO-A6e T1 重測。** 基準 11 次點擊；本次沒有以相同的 T1 任務正式重測。新流程的點擊步驟（選卡車 2、移動 2、裝載 1、移動 2、卸載 1、選單位 2、付燃料 1）仍是 11，
  另有可選的數量欄位；暫定目標「不超過 11」依此推估成立，但未量測，且目標數字本來就還沒有使用者確認。
- **TODO-A6f 已關閉（2026-10-02）：** 使用者決定「truck 比較接近 unit」，分拆後的卡車算兩個單位（15→16）；doc 03 的 SUP-A14 期望已改為「每個 counter 算一個，車上的貨不算單位」，原觀察符合。
- 以真實 UI 完成一整個回合：含至少一次部分裝載、移動、部分卸載、燃料付費、一次不合法嘗試的原因確認、存檔與讀檔。
- 記錄所有可用性、正確性、延遲與死路問題。只要仍有 blocking 問題，gate 維持 `IN PROGRESS`。
- 驗收證據：SUP-A01～A15 全部有實機紀錄（含檔案式存讀檔）；基準 T1 重測結果。

## 3. Phase B — Helper

> Phase B 在 Phase A 的 gate 通過後才開始。B1 的預覽與確認介面沿用 A2 面板，B2 的帳目沿用 A5。

### B0　設計驗證

- 確認可在 `GameState` 副本上以現有 reducer 依序模擬整串動作（引擎看來是純函式，但這是設計假設，尚未驗證）。
  通過才採用「先在副本全部模擬合法，再逐步送入 session」的執行方式；否則重新設計。
- 確認一個計畫中途失敗（revision 變動、規則拒絕）時的行為：不得留下半套狀態而不告知；已執行步驟如實留在歷史中並明確報告。
- 驗收證據：模擬與實際執行結果一致的測試（支援證據），以及失敗情境的設計紀錄。

### B1　運補指令（自動安排 TP）

玩家輸入：**數量（T）、來源補給堆、目的地格**（可選：排除的卡車、是否允許經過敵方威脅格）。系統輸出一份計畫：

- 選用哪些 TP（己方、在地圖上、尚未移動或可接續的），必要時自動合併／分拆以符合容量與 counter 組合上限（13.2c）。
- 每台卡車的順序與路線：移動到來源格 → 裝載 → 移動到目的地 → 卸載；依 6.1g 序列化。
- 每一步的 MP 花費與剩餘 MA（含裝卸各 10%）、結果補給堆數量。
- 卸載條件檢查：目的地需有己方戰鬥單位或既有己方補給堆（13.2f），不符時提示可行的替代格。
- 風險與警告：敵方 ZOC、終點在敵方可攻擊範圍內、被擄獲風險。
- 缺口報告：例如「能送 6T／8T，缺 2T，原因 MP 不足」，並提供選項（只送 6T、改送中繼格、加入其他卡車）。
- 計畫預覽以**任務模式**呈現（同攻擊草稿、決策的做法），確認或取消後回到原 tab。
- 玩家確認後展開成現有動作逐步執行；之後仍可在 A2 轉運區塊手動調整。
- 與 docs/ui/11 第 6 節既有 TODO「複合行動的完整成本審閱」相關：B1 的預覽是同類需求，
  兩者共用審閱介面的設計，不各做一套。
- 驗收證據：實機操作 SUP-B01～B04；同一任務的最終局面與手動操作一致。

### B2　補給試算

唯讀、不改變狀態，使用當前玩家可見的資訊。位置：Movement 與 Supply 階段的獨立 tab（例如 `Logistics`），
依 `deckTabs` 規則排在必辦 tab 之後、Unit 之前或之後待 A0 觀察後決定：

- **燃料試算**：選定要移動的單位（或「所有可能移動的單位」），算出本階段燃料需求，比較單位燃料與編制／HQ 燃料何者較省，
  並對照可用補給（範圍內的堆與卡車載貨）。
- **戰鬥／砲擊付費試算**：選定攻擊與砲擊後，估算攻方與守方補給成本與可用來源。
- **Supply Phase 預測**：依當前位置與計畫中的堆與延伸器變更，預測誰在階段結束時會 Out of Supply（12.6／12.8）與 Attrition 風險。
- **缺口導引**：任何缺口都可一鍵帶入 B1，預填目的地與數量。
- 驗收證據：實機操作 SUP-B05～B07；試算結果與之後實際支付／實際 Supply Phase 結果一致。

### B3／B4　候選項（尚未排入，待使用者確認）

| ID | 內容 | 狀態 |
|---|---|---|
| B3 | 付費來源政策：玩家設定偏好（先用卡車載貨、保留量、不動前線堆），付費決策時以此為預設，仍可覆寫 | TODO，待確認 |
| B4 | 定期補給線：每個 Movement 階段自動提出 B1 的建議計畫，一鍵確認 | TODO，待確認 |

### B5　Phase B 整合驗收 gate

- 以真實 UI 完成一整個回合，所有後勤透過 B1 與 B2 完成，期間至少包含一次缺口報告與一次中途改計畫。
- 以 §4 的 T1 重測並與 A0 基準比較。
- 驗收證據：SUP-B01～B08 全部有實機紀錄；存檔、讀檔、重播一致。

## 4. 驗收列（已加入 doc 03 §G，全部 `UNVERIFIED`）

**驗收以 `docs/quality/03-product-operation-verification-plan.md` §G 為準**（使用者於 2026-10-02 核准加入）。
下表是摘要，並已補上 A0 補測發現的 SUP-A11～A15；若與 doc 03 不一致，以 doc 03 為準。
驗收方式沿用 doc 03 的證據規則：從玩家可見的控制項開始，在真實瀏覽器操作；
記錄輸入、預期與實際結果、耗時、console 錯誤、最終 revision／phase 與截圖。

| ID | 優先 | 操作 | 預期結果 | 狀態 |
|---|---|---|---|---|
| SUP-A01 | P0 | 選卡車，從 8T 補給堆裝 3T | 卡車載量 3T，補給堆剩 5T，MP 扣除與預覽一致 | UNVERIFIED |
| SUP-A02 | P0 | 移到有己方戰鬥單位的格，卸 2T | 該格出現 2T 補給堆，卡車剩 1T，地圖標記同步 | UNVERIFIED |
| SUP-A03 | P0 | 在無己方戰鬥單位且無堆的格嘗試卸載 | 按鈕灰色並顯示原因與條文 13.2f | UNVERIFIED |
| SUP-A04 | P0 | 卸下 SP 後同階段嘗試再裝回 | 灰色並顯示「本階段已卸下，不能再裝」 | UNVERIFIED |
| SUP-A05 | P0 | 地圖上檢視空車、半載、滿載卡車 | 三者外觀可區分；堆疊清單列出貨物 | UNVERIFIED |
| SUP-A06 | P1 | 選到補給堆，使用「用卡車載走」入口 | 開啟同一個轉運面板，結果與從卡車開啟相同 | UNVERIFIED |
| SUP-A07 | P1 | 裝載後嘗試移動其他單位 | 狀態列提示卡車必須先走完（6.1g），行為與規則一致 | UNVERIFIED |
| SUP-A08 | P1 | 合併同格兩台卡車、再分拆 | 點數、載量與 counter 組合上限正確 | UNVERIFIED |
| SUP-A09 | P0 | 付一次燃料與一次戰鬥補給後開帳目 | 帳目列出來源、數量與剩餘，與實際扣除一致 | UNVERIFIED |
| SUP-A10 | P0 | 存檔、改變狀態、讀檔（checkpoint 與檔案兩條路徑） | 卡車載量、補給堆數量、帳目與存檔時一致 | UNVERIFIED |
| SUP-A11 | P0 | 分拆、合併卡車後比對地圖 counter 與選取卡 | counter 顯示目前運輸點數，不是印刷的 5 | UNVERIFIED |
| SUP-A12 | P0 | 同格兩台同型卡車時選取其一 | 出現並能執行 Combine（N-08） | UNVERIFIED |
| SUP-A13 | P0 | 在 roster、選取卡、燃料選項、堆疊清單、帳目檢視補給堆 | 補給堆沒有名稱；車上的貨顯示在卡車下，不是獨立的「off map」單位 | UNVERIFIED |
| SUP-A14 | P1 | 分拆、裝載、卸載後讀單位計數 | 計數不被貨物與分拆棋子灌水 | UNVERIFIED |
| SUP-A15 | P0 | 移動、裝載、分拆後按 Undo | 只撤銷最後一個動作，不是整個 segment（語意待確認） | UNVERIFIED |
| SUP-B01 | P0 | 輸入「8T，A 堆 → B 格」 | 產生計畫預覽：TP、路線、MP、結果；確認前狀態不變 | UNVERIFIED |
| SUP-B02 | P0 | 確認計畫 | 執行後 B 格增加 8T，與手動操作的最終局面一致 | UNVERIFIED |
| SUP-B03 | P0 | 輸入超出 MP 能力的任務 | 缺口報告列出能送量與原因，並提供替代選項 | UNVERIFIED |
| SUP-B04 | P1 | 目的地不符 13.2f 卸載條件 | 提示並建議可行替代格 | UNVERIFIED |
| SUP-B05 | P0 | 對選定單位做燃料試算 | 需求與可用來源正確；之後實際支付與試算一致 | UNVERIFIED |
| SUP-B06 | P1 | 試算顯示缺口後帶入 B1 | 目的地與數量預填，可直接產生計畫 | UNVERIFIED |
| SUP-B07 | P1 | 預測 Supply Phase 結果 | 預測的 Out of Supply 名單與階段結束實際結果一致 | UNVERIFIED |
| SUP-B08 | P0 | 全程使用 B1／B2 完成整個回合並存檔重播 | 無死路、console 無錯誤、讀檔與重播一致 | UNVERIFIED |

## 5. 順序與相依

```
A0 → A1 → A2 → A3 → A4 → A5 → A6(gate) → B0 → B1 → B2 → B5(gate)
                                              └→ B3／B4（確認後再排入）
```

- A1 是 A2 與 B1 的共同基礎。
- B1 的預覽走任務模式；其執行後的手動調整沿用 A2，B2 的帳目沿用 A5。
- 任何新 tab、任務模式或焦點行為都要同步更新 docs/ui/11 與 `tests/ui/command-deck.test.ts`。
- `scripts/desktop-deck-gate.mjs` 在 #13 之前就已無法執行（見重整報告）；A6、B5 的整合驗收不能依賴它，
  需先修復或改用實機操作並記錄。
- 任何一步造成既有驗收列失效，必須重跑該列與其下游。

## 6. TODO 與未決事項

依 `AGENTS.md`：下列每項都是刻意不做的縮減，必須在關閉前保留。

- **TODO-S1　規則變體（抽象補給、取消卡車載運）。** 缺少：變體規則本身與新局可選設定。
  使用者可見影響：玩家仍須遵守標準 OCS 的卡車載運。關閉證據：使用者明確核准的規格，加上新局設定與實機驗證。
- **TODO-S2　跨階段、多趟運補排程。** 缺少：B1 只規劃當前 Movement Segment 內可完成的運補。
  使用者可見影響：需要多個階段才能送達的任務要玩家分次下指令。關閉證據：跨階段計畫與實機整局驗收。
- **TODO-S3　試算只使用己方可見資訊。** 缺少：敵方行動的預測。使用者可見影響：風險提示是保守估計，不保證安全。
  關閉證據：明確標示試算範圍的 UI 文字與 SUP-B07 的紀錄。
- **TODO-S4　鐵路、空運、海運運補。** 缺少：13.3、14.9、18.4、19.0 的運補整合。使用者可見影響：B1 只規劃地面卡車。
  關閉證據：各自切片完成並併入 B1 計畫器。

- **TODO-S5　Counter 用途建模（使用者提出，2026-10-02：「所有 counter 都被當成單位，但 boardgame counter 有很多用途」）。**
  已查證據：領域層有 `PIECE_FAMILIES`（GROUND／RESOURCE／AIR／NAVAL／FACILITY／MARKER／DEFERRED），不是全部當單位；
  但 (1) 每個定義都必有 `name`；(2) 卡車大小存在 status 值、延伸器是 face id、補給量是棋子的 `resourceQuantity`，
  貨物以 `CARGO` 關係加衍生 ID 棋子表示（`transport.ts` 的 `#load`／`#split`／`#unload`）；
  (3) UI 以欄位組合猜角色（`controller.ts:751` 的 `isDump`）；(4) `ProjectedPiece` 對所有 counter 一視同仁。
  缺少：依用途區分的型別與標籤規則。使用者可見影響：補給堆有名字、roster 把補給堆當單位列出、選取卡的操作靠猜。
  關閉證據：先完成影響範圍調查報告（哪些模組靠哪種編碼），再由使用者決定改到哪一層；
  至少 A1 要在投影層提供依用途區分的 role，並以 roster／選取卡／燃料選項的實機操作驗證。
  深層重構（補給改為數量池而非棋子實例）不在本計畫範圍，需另案與使用者核准。

### 待使用者決定

已決定（2026-10-02）：

1. **同意**把 SUP 驗收列加入 doc 03，已加入為 §G。
2. **T1 改善目標：使用者回覆 OK，但沒有給具體數字。** 依本計畫原則不由實作者自行訂定，因此下列只是**暫定值，待使用者確認前不作為驗收依據**：
   Phase A 完成後 T1 不超過基準 11 次點擊（同時多了部分數量、原因與警告）；Phase B 完成後 T1 以規劃器完成，
   玩家互動次數明顯少於 Phase A。需要確切數字時再請使用者決定。
3. **同意處理 N-12（Undo 粒度）**，納入 A4b；具體語意（含擲骰與揭露資訊的限制）待 A4 設計審閱確認。

仍待決定：

4. B3、B4 是否排入 Phase B。
5. 檔案式存讀檔測試需要下載檔案，是否同意下載一個存檔檔案（檔名、來源與大小在下載前再向使用者說明）。
