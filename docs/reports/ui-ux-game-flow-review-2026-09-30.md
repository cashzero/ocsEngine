# UI/UX 與 Game Flow 審查紀錄（2026-09-30）

狀態：**IN PROGRESS／發現阻斷問題**。本紀錄是探索性審查，不改變
`docs/quality/03-product-operation-verification-plan.md` 任何列的狀態；未依該計畫
格式逐列記錄的操作維持 `UNVERIFIED`。

## 方法與環境

- 建置版本：`c079927`，`npm run build` 後以 `scripts/serve-ui.mjs` 服務。
- 瀏覽器：Playwright 1.56 驅動的 headless Chromium（雲端容器），從玩家可見控制項
  開始操作（點擊、選單、鍵盤），未直接呼叫 controller／Rule API。
- 延遲為此容器上量測值，可能慢於開發機；仍依計畫的預算判定。
- 案例：
  - 預設 `18×12 / TEMPERATE_INLAND / COMPACT / 每方 2 formations`。
  - Large `MEDITERRANEAN_COAST / 18×12 / LARGE / 每方 4`，seeds `91001–91004`，3 回合，
    1680×1050。
  - 接敵 `8×8 / COMPACT / 每方 1`，seeds `92001–92004`，4 回合與 1 回合（Game End）。

## 已觀察到正常運作（不構成 PASS）

- 開機無錯誤；New Game 開關不影響進行中遊戲；設定變更使預覽失效並停用 Start；
  HTML 欄位驗證顯示欄位錯誤；Randomize 改變全部四個 seed。
- Large 預覽與掛載一致：90 units、8 formations、28 deployed hexes，預覽與地圖地形逐 Hex 相同。
- 預設與 Large 皆完成第 1 回合進入第 2 回合（5 次交接）；接敵案例進入第 4 回合，
  含增援、模式變更、移動、補給、overrun、barrage、commit、16 次決策、27 次交接。
- 暫停禁止推進；checkpoint 回復 revision；同一場景存檔／讀檔後 revision 與棋子位置一致；
  回合上限 1 的遊戲出現一次 Game End（平手、TURN LIMIT），最終存檔與 replay 可下載且可解析。
- 1680×1050 與 1920×1080 無頁面溢出、左欄不整體捲動，最小文字 13 px；console 錯誤 0。

## 阻斷問題：規則／Game Flow 正確性

1. **Reaction 與 Exploitation 允許所有單位行動。** OCS 4.3 規則 7.0a 限定 Reaction 只能使用
   已釋放的 Reserve；11.0a 限定 Exploitation 只能使用 Exploit mode 與已釋放 Reserve。
   `src/rules/movement/movement.ts` 只阻擋「未釋放的 Reserve」，Move／Combat mode 單位以全 MA
   移動並可 overrun（`src/rules/engine.ts` 的 DECLARE_COMBAT 亦未檢查）。實測：預設案例
   Axis `I/8 Mot Inf Bn`（MOVE mode）於 Reaction 移動；接敵案例 `KG Bremer` 於 Reaction
   overrun；HQ 於 Exploitation 移動。manifest 將 `movement.ground`、`mode.transition`
   標為 IMPLEMENTED。RELEASE_RESERVE 因此失去意義，每回合兩次 Reaction 交接多半無意義。
2. **補給階段可被略過。** 缺補給狀態只在玩家自願對單一單位執行 CHECK_SUPPLY 時寫入
   （`src/rules/kernel/reducer.ts`）；直接 End phase 就不追蹤、不付費，單位永遠不會 Out of Supply。
3. **First Player Determination 未實作。** 規則 2.3：雙方擲 2d6，高者選擇先後手。
   `src/rules/sequence/sequence.ts` 直接跳過，每回合固定由 scenario 的 firstPlayerId 先手；
   未記錄為 TODO／DEFERRED。

## 阻斷問題：UI/UX

4. **移動目的地清單誤導。** 候選依字串排序（`0,0, 0,1, 0,10, 0,11, 0,2…`）且上限 24；
   地圖只高亮這 24 格（集中在最西兩欄）。Recon 單位實際可達 168 格，需按 6 次
   「Load more」（每次約 2 秒）才完整顯示。選擇 Move 後自動選中第一個候選（地圖角落 0,0）
   且 Confirm 已可按。點擊未列出的合法 Hex 會取消單位選取並切到 Stack 清單。
5. **互動延遲超出預算。** Large 地圖：選擇 Move 1.4–2.0 s、執行 Move 1.5–2.2 s、
   選單位最多 1.6 s；預設地圖執行最多 3.0 s。純重繪約 65 ms，但換選另一個候選也要約 0.8 s：
   `UiController.getSnapshot()` 每次 emit 都重算 `getActionCandidates` 與 `validateDraft`，
   且點選棋子會連續 `selectHex` + `selectPiece` 兩次 emit。
6. **決策與戰鬥缺乏情境且顯示內部 ID。** 決策對話框移除地圖，只顯示種類（例如
   RESOURCE SOURCE）與選項，不說明是哪場戰鬥、哪些單位；撤退以座標選擇但地圖不可見。
   選項直接顯示內部 ID：`Advance generated-oob:92002:axis:f1-recon:unit`、
   `Take one step from generated-oob:…`、`generated-oob:…:independent-supply-1:unit (4)`
   （來源 `src/rules/combat/combat.ts`、`src/rules/transaction/transaction.ts`）。候選清單的
   `suffix()` 把所有單位顯示為 `unit`：`OVERRUN: unit → 0,0`、`unit supply trace`；
   Commit 顯示 `Resolve 52`。
7. **重新整理會默默丟失遊戲，存檔又只能讀回目前場景。** 重新整理後直接產生新的預設遊戲，
   無 beforeunload 提示或復原（SES-09）。讀取其他 generated game 的存檔會被拒絕
   （「This UI currently accepts saves for the loaded scenario only.」），玩家須先手動以相同設定
   與四個 seed 重建同一場景才能讀檔。讀檔成功／失敗訊息只出現在 Session 對話框後方的左欄底部。

## 追加：移動規則與移動 UI（2026-09-30 使用者回饋後追查）

使用者指出「不應該有移動目的地清單」且「reachable hex 顯然是錯的」。追查結果：

8. **Reachable 計算違反 OCS 移動規則。** 以 Large 案例（seeds `91001–91004`）的 Movement
   階段查詢完整候選：
   - 6.2c／6.1c：水域只是 400 ticks 的高成本，不是禁止地形；最低移動（minimum move）
     不檢查禁止地形，因此每個沿岸單位都能移入海洋 Hex（例如 `2,4 → 1,4`、`2,5 → 1,6`）。
   - 6.2a：沿連續道路移動應只付道路成本並忽略 Hex 地形與 hexside；目前道路 hexside
     只加 0，仍付目的 Hex 的完整地形成本，河流也照加，道路完全沒有效果。
   - 6.2：成本應依 Leg／Truck／Tracked 區分；棋子資料已有 `mobilityClassDefinitionId`，
     但 `stepCost()` 忽略它，所有單位共用一張成本表。
   - 6.1d：未檢查 A→B 需與 B→A 同樣合法。
   - 12.5 燃料（Truck／Tracked 移動需付費）未實作，也未記錄為 DEFERRED。
   `docs/study/02-units-modes-zoc-movement.md` 已把上述列為必要行為並註明 TEC 待審，
   但 manifest 將 `movement.ground` 標為 IMPLEMENTED；repo 內沒有經審核的 TEC 數值。
9. **移動 UI 決定（使用者指示）：** 移動不使用目的地清單。選取單位後地圖顯示完整合法範圍，
   點地圖目的地顯示路徑與成本，再確認。這推翻 `docs/ui/11-desktop-command-deck-design.md`
   S2 的「合法目的地清單」設計，須同步修改該文件。完整範圍查詢目前約 0.8–1.1 秒
   （Node，Large），UI 每次 emit 重算，需要快取與加速。

關閉證據：以經使用者核准來源的 TEC 實作 6.1c／6.1d／6.2a–c 與 mobility class，
規則測試涵蓋禁止地形、最低移動、道路覆寫、hexside 疊加與雙向合法；實際 UI 中以 Large
案例示範沿岸單位無法入海、道路延伸範圍、Leg 與 Truck 範圍不同，並記錄延遲。

## 修正紀錄：BTR TEC 移動規則與地圖移動（2026-09-30）

使用者指定以 Beyond the Rhine TEC 為成本來源，並決定移動不使用目的地清單。

已實作：

- `src/game-flow/movement-tec.ts`：BTR TEC「通常」欄轉為 Leg／Truck／Tracked 成本；
  轉錄與對應見 `docs/rules/btr-movement-tec.md`。
- `src/rules/movement/movement.ts`：6.1c、6.1d、6.2a–d 與 `All`；路徑驗證與 reachable 搜尋共用同一步驟
  評估；reachable 改為單次 Dijkstra，並快取 Hex 層級檢查。
- `src/game-flow/deployment.ts`：部署不再把單位放在其 mobility 禁止的地形，並在選位時遵守 10 RE 堆疊。
  60 組設定掃描：修正前 9 組因堆疊失敗、7 個單位位於禁止地形；修正後 60 組全部成功、0 個。
- UI：選取可移動單位即進入移動；地圖顯示完整範圍（無上限、範圍外變暗），不自動選目的地；點合法 Hex
  顯示實線路徑、成本與剩餘 MP；點非法 Hex 保留單位並提示；Choices 不再列目的地。controller 依 revision
  快取規則查詢。設計文件 S2 已依使用者決定改寫。

實際瀏覽器證據（Playwright／Chromium，本容器）：

| 項目 | 修正前 | 修正後 |
|---|---|---|
| Large 沿岸單位可達海洋 Hex | 是（如 `2,4 → 1,4`） | 0 |
| 地圖顯示的合法範圍 | 字串排序前 24 格 | 完整範圍（113–163 格，依單位） |
| 選擇 Move（Large） | 1.4–2.0 s | 37–93 ms |
| 選取單位（Large） | 1.4–1.6 s | 76–351 ms |
| 選目的地 | 換候選約 0.8 s | 48–81 ms |
| 執行 Move | 1.5–3.0 s | 101–301 ms |
| Node 完整範圍查詢（Large） | 0.8–1.1 s | 60–120 ms |

預設、Large（1920×1080 與 1680×1050）、接敵案例皆以地圖點選完成移動並進入下一回合；
接敵案例到第 4 回合，含 18 次地圖移動、戰鬥、砲擊、19 次決策與 25 次交接。console 錯誤 0。
`npm run check` 通過（37 個測試檔、177 項測試、build、smoke）。

此修正只關閉第 4 項與第 8 項中的禁止地形、道路、mobility、6.1d；以下仍為 TODO，gate 維持 `IN PROGRESS`。

> **2026-10-01 更新**（依 `ocs-rebuild-2026-10-01.md` 與程式核對；皆為「程式已處理，待實機驗證」，非關閉）：
> Reaction／Exploitation 資格、燃料、泥濘／雪、增援禁止地形（`lifecycle.ts` `reinforcementHexes`）、
> overrun 8.1b／8.1c 已處理。仍開啟：航空阻止道路註記（空權 DEFERRED）、鍵盤移動實操、
> 以及次要問題中重建紀錄未提及的四項：New Game RE 超限錯誤未指出欄位、預覽失效時步驟列仍全顯示完成、
> 預覽地圖不顯示部署位置、單位列按鈕可讀名稱混入 counter SVG 文字。
> 次要問題中的 Escape、縮放錨點、矩形地圖、Game End 可關閉、圖例、空階段自動通過，重建紀錄稱已修，同樣待實機驗證。

原始清單（2026-09-30）：

- 第 1 項 Reaction／Exploitation 行動資格仍錯；實測 Axis 一般單位在 Reaction 以 14 MP 橫越地圖。
- 燃料（12.5）、泥濘／雪、航空阻止道路註記未實作（見 `docs/rules/btr-movement-tec.md`）。
- 增援放置未檢查地形禁止（200 張地圖的 400 個進入 Hex 中有 3 個為山地／沼澤；皆在道路網上，可沿路離開）。
  關閉證據：放置規則依 6.2c 檢查並測試。
- Overrun 的 8.1b（成本 3 MP 以下、`All` 不可 overrun）與 8.1c（不可用道路）尚未對照新成本模型審查。
  關閉證據：overrun 以相同步驟評估計算成本並加規則測試。
- 規則設定的移動成本結構已變更，修正前下載的存檔會被 `SAVE_INVALID` 拒絕；未提供遷移。
  影響：舊存檔無法讀取。關閉證據：若需保留舊存檔，提供版本遷移並以舊存檔實際讀取驗證。
- 鍵盤操作地圖移動（Enter 選目的地）走相同點擊路徑，但未在本輪以鍵盤實際操作驗證。

## 次要問題

- 預設案例一個遊戲回合共 34 個階段／段，其中 19 個沒有任何可用行動（Weather、First Player、
  Aircraft Refit、無砲兵的 Barrage、無接敵的 Combat、Clean Up、Turn End），仍需逐一手動 End phase；End phase 無確認也無自動 checkpoint，誤按即放棄整個 Movement。
- New Game：UI 允許的設定（8×8、Large、每方 6）以 `Initial stack 0,2 uses 48/40 RE ticks`
  失敗，未說明應調整哪個欄位；預覽失效時步驟列仍全部顯示完成；預覽地圖不顯示部署位置。
- Game End 對話框只能開 New Game，無法關閉以檢視最終盤面；從 Game End 開 New Game 再關閉會回到 Game End。
- 鍵盤：Escape 不關閉任何對話框；地圖在 Tab 順序中排在整份單位清單之後；地圖 counter
  `tabindex=-1` 無法聚焦；單位列按鈕的可讀名稱混入 counter SVG 文字（`IIreconF2 3416 …`）。
- 地圖以斜平行四邊形（axial）排列，浪費約三分之一視窗；滾輪與 +/− 以左上角為縮放原點，
  而非游標或視窗中心。
- 階段切換後仍停在 Choices 分頁；移動後選取的 Hex 停在舊位置；圖例缺 Clear 地形、城鎮、目標與進入區。
- 暫停時 Action 選單未停用（End phase 有停用）。

## 關閉證據要求

第 1–3 項需補規則實作與測試，並在實際 UI 中證明：Reaction 僅釋放的 Reserve 可移動／overrun；
Exploitation 僅 Exploit mode 與已釋放 Reserve 可行動；Supply 階段結束時所有單位完成追蹤；
First Player 由擲骰與選擇決定。第 4–7 項需在 Large 案例以實際 UI 重跑 ACT-02、ACT-07～ACT-11、
SES-05、SES-09，記錄延遲與截圖。修正後依計畫重跑受影響列與下游列。
