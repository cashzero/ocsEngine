# 補給 UX A0 基準（2026-10-02）

狀態：**IN PROGRESS**。這是 [09-supply-logistics-ux-wbs.md](../roadmap/09-supply-logistics-ux-wbs.md) 的 A0 實機基準紀錄。
已完成：以真實滑鼠點擊走完標準任務 T1 並記錄現況。補測也已完成（見「補測」）。**未完成**：SUP 驗收列尚未加入 `docs/quality/03-…plan.md`（凍結基準，需使用者核准）；
檔案式存讀檔尚未測（見「未驗證」）。本文件不改變 doc 03 任何列的狀態。

## 環境

- 建置：`npm ci`、`npm run build`；伺服器 `node scripts/serve-ui.mjs`（`http://127.0.0.1:4173`）。
- 版本：`73c7cad`（rebase 後的 `origin/main`）。
- 瀏覽器：內建瀏覽器，視窗 1680×1050。
- 局面：預設 New Game（Allied 第 1 回合，1 Oct Dry，32×24 地圖）；Allied 增援為 US 255 FA Group 與 US Army Supply Dump 255（12T）。
- 操作方式：全部為真實滑鼠點擊。JavaScript 只用來讀取座標、DOM 與量測，沒有用它觸發任何遊戲動作。
  地圖被左欄遮住時，用真實拖曳平移。

## 標準任務 T1

「把補給從 A 堆運到前線 B 格，並為一個編制付一次燃料。」

| # | 操作 | 觀察到的結果 |
|---|---|---|
| 0 | （準備）增援階段：選補給堆與 FA Group，點進場格 0113，按 Finish Reinforcement Phase | 進入 Movement。不計入 T1 |
| 1 | 開 roster（All units） | 彈窗列出 15 個單位；兩個補給堆同名，靠格號區分 |
| 2 | 選 US 255 QM Truck Co（0318） | 選取卡：5 truck points、load 0/20T、45 MP left；Unit tab 的 Trucks 只有「Split off 1～4 truck points」與「Form an Extender」 |
| 3 | 點 0316（有 1 SP 補給堆） | popup：「Move to 0316 · Cost 2 MP · 43 MP left after the move.」 |
| 4 | Confirm | 卡車移到 0316；Trucks 多出「Load 4T from the 4T dump at 0316 (10% of MA)」 |
| 5 | 點 Load | `load 4/20T`；MP 43 → 38（實際扣 5）；補給堆 counter 從地圖消失；卡車 counter 外觀不變，仍是 `5／45` |
| 6 | 點 0313（有戰鬥單位） | popup：「Cost 5 MP · 33 MP left」 |
| 7 | Confirm | 卡車到 0313；Trucks 出現「Unload all 4T here (10% of MA)」；沒有部分卸載選項 |
| 8 | 點 Unload | `load 0/20T`；MP 33 → 28；Load 選項沒有再出現，也沒有說明原因 |
| 9 | 開 roster、選 Alanis TF（0213） | 選取卡寫「Needs fuel before it can move (12.5)」；Fuel 區有 4 個平鋪選項：單位 1T 或整個編制 1 SP，各自從 0113（12T）或 0313（4T）的堆付 |
| 10 | 點「Fuel its whole formation until Clean Up (1 SP) from the 4T dump at 0313」 | 訊息列一行「…: done.」；Alanis TF 顯示 14 MP left；roster 的單位數 15 → 14（0313 的 4T 堆用完消失） |

**T1 基準：11 次真實點擊**（含兩次開 roster）、0 個鍵盤輸入、0 個玩家決策被系統代勞。
其中與補給本身有關的決策只有「從哪個堆付燃料」「單位或編制」；其餘都是機械步驟。
所有互動的 UI 回應都在畫面上出現，console 無錯誤。

## 對 §1 現況表的驗證結果

| ID | 結果 | 實機觀察 |
|---|---|---|
| S-01 只能全裝／全卸 | **已確認** | 裝載只給「Load 4T」（該堆的全部），卸載只給「Unload all 4T」；沒有數量選擇。無法驗證卡車載量上限時的行為，因為 4T 遠小於 20T |
| S-02 MP 花費不具體 | **已確認** | 按鈕只寫「(10% of MA)」，實際扣 5 MP（45 → 4.5 取整）。要看選取卡的「MP left」前後差才知道 |
| S-03 不合法操作沒有原因 | **已確認** | 卡車初始在 0318 沒有 Load，也沒說明（該格沒有補給堆）；卸載後 0313 有 4T 堆，但 Load 不再出現，沒有說明是 12.2a「本階段卸下的 SP 不能再裝」 |
| S-04 地圖看不出載貨 | **已確認** | 載貨後卡車 counter 仍是 `5／45`；載量只出現在選取卡文字（`load 4/20T`）。卸下後新堆在 0313 的堆疊中沒有被畫成獨立 counter（DOM 中該格只有 3 個 counter），玩家要從 roster 才看到它 |
| S-05 補給堆側沒有入口 | **已確認（補測）** | 選取補給堆只顯示「Cannot move in this step」與「This unit has no actions in this step」，沒有任何轉運入口或說明 |
| S-06 合併／分拆按鈕 | **已確認，且發現更嚴重的問題（補測）** | 分拆可用（見補測 B1）；**合併在 UI 中不可能出現**（N-08） |
| S-07 卡車必須先走完（6.1g）無提示 | **已確認，後果嚴重（補測）** | 載貨後移動別的單位沒有任何警告，卡車剩餘 MP 與車上貨物被凍結（見補測 B3） |
| S-08 沒有補給概覽／試算 | **已確認** | 沒有任何本階段需求或預測的畫面；Alanis TF 只在選取後才寫「Needs fuel」 |
| S-09 付費沒有帳目 | **已確認** | 付燃料後只有訊息列一行；來源堆因用完而消失，也沒有剩餘量紀錄 |
| S-10 Trucks 為平鋪清單 | **已確認** | 見 T1 步驟 2 |

## 新發現（計畫原先沒有列到）

| ID | 觀察 | 影響 |
|---|---|---|
| N-01 | 燃料選項是 4 個平鋪按鈕，沒有任何提示說明該選哪個（編制內有多少單位會受益、哪個來源會把堆用光） | 玩家得自己算；這正是 Phase B 試算要解決的資訊缺口 |
| N-02 | 兩個補給堆都叫「US Army Supply Dump 255」，roster 與地圖只靠格號與數量區分 | 玩家要靠位置判斷是哪個堆，與之前 F-06 同類問題。**使用者決定（2026-10-02）：補給堆不應該有名字，原版桌遊本來就沒有**，改以「類型＋數量＋位置」呈現，資料層（OOB 產生器）與 UI 都要處理，已寫入計畫 A3 |
| N-03 | 放置補給堆後，它畫在 0113 堆疊最上層，蓋住下面的戰鬥單位；再放 FA Group 後則 FA Group 在最上層 | 堆疊上下順序似乎取決於放置順序；與 `docs/ui/ui-flow-review-2026-10-01.md` F-04 的「補給堆在最底」設計不一致，需要在 A3 一併檢查 |
| N-04 | 增援補給堆的進場格 0113 被左欄遮住，初始畫面看不到藍色進場格，需要自己拖曳地圖 | 與補給搬運無直接關係，但新手第一步會卡住；列為觀察，不納入 Phase A |
| N-05 | 要選取同格被蓋住的單位或補給堆，只能從 roster（兩次點擊）選 | 增加操作數；A3 的堆疊清單需要涵蓋補給堆與貨物 |

## 補測（2026-10-02，同一版本 `73c7cad`，新開局）

環境同上；全部為真實點擊，JavaScript 只讀 DOM 與座標。局面為預設新局：卡車（5 點、MA 45）在 0318，增援補給堆 12T 放在 0113。

| # | 操作 | 觀察到的結果 |
|---|---|---|
| B0 | 選取 0113 的補給堆 | 見 S-05：沒有任何操作 |
| B1 | 卡車移到 0113（成本 5.5 MP，剩 39.5），按「Split off 3 truck points」 | 選取的卡車變 2 點、容量 8T；「All units」15 → 16；Trucks 清單變成「Load 8T from the 12T dump」與「Split off 1 truck point」；**沒有 Combine**（N-08）；地圖 counter 仍顯示 `5／45`（N-07） |
| B2 | 按「Load 8T」 | `load 8T`（2 點卡車滿載 8/8T）、MP 39.5 → 34.5；「All units」16 → 17；roster 多出一筆「Supply Dump · **off map** · 2 SP」，那是車上的貨（N-10） |
| B3 | 卡車已開始行動後，選 501 Abn Regt（步兵，不需燃料），預覽並確認移到 0412 | popup 只寫「Cost 1 MP · 4 MP left」，**沒有 6.1g 警告**；確認後卡車顯示「Already moved this phase」「This unit has no actions in this step」，剩下的 34.5 MP 與車上 8T 被凍結，卸貨也不能做 |
| B4 | 按頂部「Undo」 | 訊息「Back to the start of Movement · Movement Segment (turn 1)」；整個 segment 被撤銷（卡車回 0318、拆分與裝載全部消失，單位數回到 15），不是只撤銷最後一步（N-12） |
| B5 | 重新開始：卡車到 0113，按「Load 12T」，移到沒有己方單位的 0115（成本 4 MP，剩 30.5） | `load 12/20T`；到 0115 後 Trucks 只剩「Split off 1～4 truck points」，**沒有 Unload，也沒有任何原因**（S-03 再次確認） |
| B6 | 同一輛卡車按「Split off 1 truck point」 | 變 4 點、`load 12/16T`；地圖 counter 仍是 `5` |
| B7 | Session →「Create checkpoint」（Revision 6）；改變狀態（B6）；Session → 點「Revision 6 · R6」 | 還原後顯示「Restored Revision 6. Resume to continue.」並暫停；按 Resume 後卡車 5 點、`load 12/20T`、`30.5 MP left`、「All units (15)」，與存檔時一致。**SUP-A10 以 checkpoint 驗證通過；檔案式的 Download／Load save 未測**（需下載檔案，待你同意） |

Console 全程無錯誤。

### 補測新發現

| ID | 觀察 | 影響 |
|---|---|---|
| N-06 | 進場格 0113 大部分被 counter 蓋住，只有格子下緣一小塊可點；連點三次才放成功 | 放置增援時的操作摩擦 |
| N-07 | 卡車分拆後地圖 counter 仍印 `5／45`（選取卡正確顯示 2 點或 4 點）。DOM 文字確認 | counter 與實際點數不符，違反 counter 忠實度；與 `docs/roadmap/17-counter-fidelity-wbs.md` 同類 |
| N-08 | **合併卡車在 UI 中永遠不會出現。** 同格有兩台同型卡車（合規：13.2c 規定合併不花 MP）時仍無「Combine」。原因：`candidates.ts:124` 的 `owned` 依 `request.pieceId` 過濾，UI 傳入選取的卡車，`COMBINE_TRANSPORT` 只剩一台可分組（`candidates.ts:254-260`） | 分拆後無法合回；可能是缺陷，需在 A1 確認並修正。UI 證據：B1 的 Trucks 清單；原因為讀程式碼得出，未用測試重現 |
| N-09 | 分拆與裝貨會讓「All units」計數增加（15 → 16 → 17） | 玩家看到的「單位數」包含貨物與分拆出的棋子實例；對應 TODO-S5 |
| N-10 | 車上的貨在 roster 以「Supply Dump · off map」獨立一筆列出 | 玩家看不出那是車上的貨；對應 TODO-S5 |
| N-11 | **6.1g 陷阱。** 卡車裝貨後移動別的單位，卡車剩餘 MP 與車上貨物被凍結，沒有任何事前警告 | 高嚴重度：一次誤點就損失整輛卡車本階段的行動，且 Undo 只能退回整個 segment（N-12）。Phase A 的 A4 必須處理，且應視為 blocking |
| N-12 | Undo 的粒度是整個 segment，不是上一個動作 | 補給操作很多，一個誤操作可能撤銷整個 segment 的進度；也使「先試試看」成本很高。是否改為逐動作 Undo 需與使用者決定，不在補給範圍內擅自更動 |
| N-13 | 重新載入頁面會直接回到全新對局，沒有「是否恢復」提示（先前一局的進度消失） | 與 SES-09 相關；列為觀察，不在本計畫範圍 |

## Bug 修正（2026-10-02，使用者指示「bug 先修正」）

三個 bug 都用「先寫失敗測試，再修，再用真實 UI 驗證」的順序處理。`npm run check`（型別檢查、41 個測試檔／255 個測試、建置、smoke）全部通過。
**三項在 doc 03 的對應列（SUP-A07、A11、A12）都維持 `UNVERIFIED`**：下列是修正後的觀察，尚未以 doc 03 要求的完整證據（截圖存檔、耗時）正式執行，留待 A6 gate。

| Bug | 修正 | 實機觀察（重新建置後） |
|---|---|---|
| **N-11** 卡車裝貨後移動別的單位會凍結卡車，無警告 | 引擎：[movement.ts](../../src/rules/movement/movement.ts) 的 `queryMovementPath` 新增 `movement.endsOtherMover.*` 三個事實（卡車 ID、剩餘 MP、車上 T 數）。UI：[command-deck.ts](../../src/ui/command-deck.ts) 的 `movePopupHtml` 顯示警告並把按鈕改為「Confirm anyway」；[command-deck.css](../../web/command-deck.css) 加 `.warning`。範圍只含運輸點，且剩餘 MP 為 0 時不警告 | 卡車 38 MP、車上 4T 時，預覽 501 Abn Regt 移動，popup 出現「This ends the move of US 255 QM Truck Co: its 38 MP left and 4T aboard cannot be used again this phase (6.1g)」與「Confirm anyway」 |
| **N-07** 分拆後 counter 仍印 5 | [counter.ts](../../src/ui/counter.ts) 的 `counterView` 讀 `status:transport-points`，沒有時用印刷值；地圖、roster、堆疊清單、預覽共用此函式 | 卡車分拆 2 點後，地圖上兩個 counter 分別印 `2` 與 `3`，選取卡顯示「3 truck points · load 4/12T」 |
| **N-08** 合併卡車在 UI 不出現 | 見下節 | 見下節 |

新增測試：`tests/rules/ocs-logistics.test.ts` 兩個（Combine 候選、6.1g 事實，含「真的會被凍結」與「MP 用完不警告」）、
`tests/ui/command-deck.test.ts` 一個（popup 警告，走完整個 controller 流程）、`tests/ui/counter-transport.test.ts` 一個（分拆後兩個 counter 的點數）。

**限制與範圍說明：**

- N-11 的警告只涵蓋運輸點被結束的情況；一般單位依 6.1g 被結束的行為沒有變，也沒有警告。卡車自己的選取卡尚未顯示「必須先走完」提示，留在 A4。
- N-07 最初只涵蓋自己的卡車。**更正：** 先前寫「對手看不到你的卡車」不精確。一格沒有戰鬥單位時對手會看到最上面的一個棋子（含孤立的卡車），
  所以 A1 把 `status:transport-points` 也列為印在 counter 上的公開值（`projection.ts` 的 `PUBLIC_VALUE_STATUSES`），對手看到的卡車點數才正確。
- 實機驗證期間內建瀏覽器的視窗模擬多次被重設、截圖偶爾逾時；後半改用元素參照點擊與頁面文字確認，結果都來自真實點擊後的 DOM，不是直接呼叫 controller。

## A1 完成項（2026-10-02，使用者指示「修正完 bug、更新文件完就開始 A1」）

`npm run check` 通過：43 個測試檔、262 個測試、建置、smoke。A1 沒有改任何規則判定或動作格式；A1 的產出是供 A2 使用的資料，目前還沒有新的畫面，
所以**沒有新的實機驗證**，也沒有任何 SUP 驗收列因此改變狀態。

| 項目 | 內容 | 測試 |
|---|---|---|
| 轉運選項查詢 | [transport.ts](../../src/rules/supply/transport.ts) 的 `queryTransportOptions`：對己方運輸點回傳同格每個補給堆的可裝 Token 範圍、卸載範圍、每次花費（MA 的 10%）、做完後剩餘 MA，以及不可用時規則自己給的 code／message／條文。範圍與原因都由 `validateLoad`／`validateUnload` 算出，因此與規則一致。接線：`RuleEngine.queryTransportOptions` → `GameSession.getTransportOptions` | `ocs-logistics.test.ts`「transport options for the UI (A1)」3 個：範圍內每個數量都被規則接受、多一個不行；卸載不可用原因（13.2f）；同階段卸下的不能再裝（12.2a）；非己方／非運輸點被拒。`transport-options-session.test.ts`：session 層與回傳為副本 |
| 投影層角色 | [model.ts](../../src/rules/query/model.ts) 的 `PieceRole`（COMBAT／ARTILLERY／HQ／TRUCK／EXTENDER／DUMP／CARGO／AIRCRAFT／AIR_BASE／OTHER），由 [projection.ts](../../src/rules/query/projection.ts) 的 `roleOf` 依定義與位置決定，`ProjectedPiece.role` 對所有棋子提供。補給在車上為 CARGO、在地圖上為 DUMP | `piece-roles.test.ts` 3 個 |
| 取代欄位猜測 | [controller.ts](../../src/ui/controller.ts) 的 `isDump` 改用 `role`（行為不變） | 既有測試 |
| 對手看到的卡車點數 | 見上方更正 | `piece-roles.test.ts` |

**A1 未做、留給後續：**

- UI 尚未使用 `getTransportOptions`（A2）。
- `role` 目前只被 `isDump` 使用；roster 仍把 CARGO 當成獨立的「off map」單位列出（N-10），單位計數仍包含貨物（N-09），補給堆名稱仍會顯示——這些屬 A3，已在計畫列出。
- 資料層的深層重構（TODO-S5 的補給數量池）不在範圍內。

## Phase A（A2～A5）實作與驗證（2026-10-02，使用者指示「把 A 全部完成後 commit and push」）

`npm run check` 通過：47 個測試檔、274 個測試、建置、smoke。**A6 gate 仍 IN PROGRESS**，所有 SUP 驗收列仍 `UNVERIFIED`；未完成項與原因見
[計畫 A6](../roadmap/09-supply-logistics-ux-wbs.md) 的 TODO-A6a～A6f 與 A3／A4／A5 各自的 TODO。

| 項目 | 實作 | 測試 | 實機觀察 |
|---|---|---|---|
| A2 轉運區塊 | `command-deck.ts` 的 `transportSection`、`controller.transferSupply`／`divideTruck`、`browser.ts` 的事件接線 | `tests/ui/transport-panel.test.ts` 7 個 | 部分裝載 3T、部分卸載 2T、MP 預覽、被擋原因與條文（見計畫 A2） |
| A3 | 補給堆無名稱（`names.ts`、`presenter.ts`）、車上貨物不列為單位、卡車載量標記（`counter.ts`、`projection.ts` 的 `carriedTokens`）、「Carry with a truck」 | 上列測試檔、`random-oob.test.ts` 更新 | roster 讀作「Supply dump, 0316」；counter `load-part`＋「3T」 |
| A4 | 卡車 6.1g 提示；Undo 逐動作（`controller.ts` 的 undo points，`session.ts`／`model.ts` 的 `randomUsed`）；Undo 後保留選取 | `undo-action.test.ts` 2 個、`random-used.test.ts` 1 個 | Undo 兩次依序撤銷裝載與移動 |
| A5 帳目 | `controller.ts` 的 `#ledger`、`command-deck.ts` 的 Ledger tab | `supply-ledger.test.ts` 2 個 | 付燃料後帳目與剩餘量一致 |

測試更新說明：`tests/generation/random-oob.test.ts` 原本要求所有定義名稱唯一；依使用者決定補給堆為通用名稱「Supply Dump」，
改為「補給堆以外的名稱唯一、補給堆一律叫 Supply Dump」。這是已核准決定的結果，不是遷就實作。

## N-08 已修正（2026-10-02）

- **重現測試（先紅後綠）：** `tests/rules/ocs-logistics.test.ts`「offers Combine for the selected truck when another truck of its type shares the Hex (13.2c)」。
  修正前，選取其中一台時 `COMBINE_TRANSPORT` 回傳空陣列；未選取（`pieceId: null`）時正常，與 UI 實測相符。
- **修正：** [candidates.ts](../../src/rules/query/candidates.ts) 的 `COMBINE_TRANSPORT` 改為從全部己方棋子分組，再要求該組包含選取者。
- **自動化結果：** 型別檢查無錯誤；全套 40 個測試檔、252 個測試通過。
- **真實 UI 驗證（重新建置後）：** 新局 → Movement → 選卡車 → 「Split off 1 truck point」 → Unit tab 出現
  「Combine the trucks in this Hex into one counter」（修正前沒有）→ 點擊 → 卡車回到 5 truck points、`load 0/20T`、
  `45 MP left`（沒有花 MP），「All units」16 → 15。
- **狀態：** 這是 SUP-A12 的觀察結果，但依 doc 03 證據規則（螢幕截圖存檔、耗時紀錄）尚未完整，**SUP-A12 維持 `UNVERIFIED`**，
  留待 A6 gate 以完整證據執行。A1 的其他項目（轉運選項查詢、投影層角色）尚未開始。

## 延遲

- 開啟 roster：點擊到 DOM 更新 **約 89 ms**（以 `MutationObserver` 與 `pointerdown` 時間戳量測，連續一次）。
- 其餘動作（移動、裝載、卸載、付燃料）只有「截圖在點擊後立刻抓到舊畫面，等 1～3 秒才更新」的觀察；
  無法分辨延遲來自 App 或截圖管線，**沒有量化**。已知單純 UI 切換很快，需要在 A6 對重運算動作（燃料候選、可達範圍）另做量測。

## 未驗證（A0 沒有做的事）

補測已完成：S-05、6.1g（S-07）、非法卸載、滿載（2 點卡車 8/8T；5 點卡車 12/20T）、分拆、checkpoint 存讀。仍未驗證：

- 檔案式的 Download save／Load save（需下載與選檔；下載屬需使用者明確同意的動作）。
- 合併卡車（UI 無入口，見 N-08）、延伸器、炸毀補給堆。
- 5 點卡車實際裝滿 20T（局面只有 12T 的堆；2 點卡車的滿載已驗證容量上限）。
- 對方玩家視角下的可見資訊（隱私與交接）。
- 重運算動作的延遲量測。

## 下一步

1. 使用者核准後，把計畫 §4 的 SUP 驗收列加入 doc 03（凍結基準的規格變更）。
2. 補測已完成（見上）。仍待使用者同意後再測檔案式存讀檔。
3. 與使用者確認 T1 的操作數改善目標（基準為 11 次點擊），再進入 A1。
4. N-11（6.1g 陷阱）與 N-08（合併不可用）列為 Phase A 的 blocking 項；N-12（Undo 粒度）需使用者決定是否處理。
