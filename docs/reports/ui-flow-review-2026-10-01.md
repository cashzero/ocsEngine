# UI Flow 重新審查（2026-10-01）

狀態：**IN PROGRESS／設計問題待決**。本紀錄是探索性審查，不改變
`docs/quality/03-product-operation-verification-plan.md` 任何列的狀態。

## 方法與限制

- 建置：`157fb8e`，`npm run ui:serve`，Claude 桌面 App 內建瀏覽器（Chromium），1920×1080。
- 案例：
  - 開機預設遊戲 `18×12 / TEMPERATE_INLAND / COMPACT / 每方 2 / 2 回合`：Allied 第 1 回合增援、加油、移動、補給，交接到 Axis。
  - 接敵 `8×8 / COMPACT / 每方 1 / 4 回合`，seeds `92001–92004`（經 New Game 介面建立）：Allied 移動＋overrun、
    Axis 增援、移動、Reaction 交接、Combat 攻擊，含雙方決策與 4 次交接。
- 前段以真實滑鼠點擊；中段 App 視窗被遮住導致截圖逾時，之後改以頁面內 DOM `click()` 操作可見控制項並讀取文字。
  另因頁面不繪製時 `requestAnimationFrame` 不觸發（見 F-14），以 `setTimeout` 暫代 rAF 繼續探索。
  **依驗收計畫，DOM 腳本點擊不構成 UI 證據**；本紀錄只用於找出設計問題。
- 未重測：存讀檔、重新整理、Escape、縮放錨點、Game End、1680×1050。

## 總結

規則層已能跑完整局，但 UI 仍是「規則引擎的操作面板」，不是「玩家的回合流程」。核心問題有四個：

1. **結果不可見**：戰鬥結果在交接中被吞掉，攻守雙方都沒有看到結果；Log 是引擎事件碼。
2. **回合結構不可見**：自動略過的階段、下一步是什麼、為什麼把螢幕交給對方，玩家都看不到。
3. **地圖上的堆疊無法操作**：補給堆／卡車會壓在戰鬥單位上面；點堆疊選到的是補給堆。
4. **戰鬥決策過度拆分**：一場攻擊需要攻方 2 步＋守方最多 4 步＋2～4 次交接，每步只看到一個問題。

## 觀察到的問題

依嚴重度排序。P0 = 阻斷理解或操作；P1 = 明顯摩擦；P2 = 打磨。

### P0

**F-01 戰鬥結果沒有呈現給任何一方。**
- Allied overrun 0704（2:1）→ 守方完成 4 個決策 → 交接回 Allied，指揮欄只顯示「Your turn to act.」。
  Oden TF 已被消滅，玩家只能從地圖上少了一個 counter 推斷。
- Axis 攻擊 0105（1:5）→ 守方選完 AR 單位後結果立即結算並交接回 Axis；守方也沒有看到結果。KG Bremer 被消滅，
  在「My units」顯示為 `off map · Move mode`（與尚未進場的增援同樣標示）。
- 原因：`controller.respondToDecision` 會產生 `Combat resolved (…)` notice，但 `beginHandoff`／`completeHandoff`
  隨即把 notice 覆寫為 `Privacy screen locked…`／`Your turn to act.`（`src/ui/controller.ts:618,626`）。
- 決策面板中顯示的結果是原始戰鬥表代碼（`AL1o1/Do1`），且結果後的摘要變成 `0 : 3 · 0:1`，看似攻方戰力歸零。

**F-02 Log 不可讀，自動略過的階段不可見。**
- Log 每列是引擎事件碼：`ADVANCE_SEQUENCE: SEQUENCE_ADVANCED ×9, CLEANUP_COMPLETED, SEQUENCE_ADVANCED, SUPPLY_ARRIVED`。
- Allied 按「End Supply Phase」後一次略過 Reaction、Combat、Exploitation、Clean Up 等 9 步並交接給 Axis，
  畫面只顯示「Step ended.」。玩家不知道自己的戰鬥階段被略過、也不知道補給階段誰變成 Out of Supply。
- Overrun 在 Log 中記成「Attack」；決策都記成「Decision」，看不出是誰、決定了什麼。

**F-03 交接沒有說明對象與原因。**
- 每次交接要兩次點擊：指揮欄「Hand off to Axis commander」→ 全畫面「Pass the screen / I am the next player」。
  全畫面不寫下一位是誰、要做什麼（防守 0105？Reaction？）。
- Axis 回合的 Reaction 階段把螢幕交給 Allied，Allied 看到的是通用提示「Select a unit, or end this step when you are done.」，
  沒有說明此階段能做什麼（只限已釋放 Reserve、砲擊），因此這次交接對玩家看起來是空轉。

**F-04 地圖堆疊壓住戰鬥單位，選不到想要的單位。**
- 增援的補給堆放在入口 0105 後畫在堆疊最上層；點該堆疊選到的是 `US Army Supply Dump 597`，戰車被蓋在下面（+3）。
  必須切到「Hex」分頁從清單選。
- 入口 Hex 的藍色放置框、敵格紅框都畫在地形層，被 counter 蓋住（`renderMap` 把標示畫在 `hex-map-layer`，counter 在其上）。
  實測入口 0107 被三個 counter 完全覆蓋，只能靠記得「入口在那裡」。
- 這與使用者暫緩的 6.1f「點堆疊展開與整疊移動」相關，但**選取**與**移動整疊**可分開：本項只要求能選到堆疊中的任一單位。

### P1

**F-05 戰鬥決策拆成太多獨立步驟。** 一場 overrun 的實際順序：

| # | 誰 | 問題 |
|---|---|---|
| 1 | 攻 | 攻擊面板（已顯示「Your supply cost 1T」）→ 按 Overrun |
| 2 | 攻 | 再問一次「1T 從哪裡付」（兩個選項文字完全相同） |
| 3 | — | 交接（2 次點擊） |
| 4 | 守 | 戰鬥補給從哪裡付／不付（Axis 攻擊時有 5 個選項，其中 4 個為同名補給堆的 1T／2T 組合） |
| 5 | 守 | 選 AR 領導單位（選後 DRM 由 −1 變 +1，選項本身沒有預告此影響） |
| 6 | 守 | 選地形（此步才顯示各選項的賠率） |
| 7 | 守 | Option 結果：損 step／撤退 |
| 8 | — | 交接回攻方（2 次點擊），無結果（F-01） |

守方的補給、AR、地形三個選擇彼此影響賠率與 DRM，卻被拆成三個看不到彼此影響的畫面。

**F-06 選項無法區分。** 同一 Hex 有兩個同名補給堆（`US Army Supply Dump 255`，4T 與 8T）時，燃料按鈕、
戰鬥補給選項都出現逐字相同的兩列（`Fuel this unit for this phase (1T) from the dump at 0107` ×2）。

**F-07 提示不隨階段變化。** 選取卡在任何階段都寫「Click one of your units on the map. Its legal moves light up, and enemy
stacks you can attack get a red ring.」，包括增援與補給階段。增援單位選取後顯示「Cannot move now」，而它此時應被放置。
暫停時也只顯示「Cannot move now」，沒有暫停狀態橫幅（notice 為小寫 `session paused`）。

**F-08 補給階段資訊不足。** 選項「Trace the formation through HQ / US 4th Armored Division」不寫是哪個編組（兩個師共用同一組按鈕），
也沒有每個編組／單位目前是否在補給中的總覽；結束後誰變成 Out of Supply 沒有回報。

**F-09 可達範圍在小地圖上失去意義。** 8×8 地圖上單位可達 60／60 格，整張地圖同樣反白，等於沒有資訊；
18×12 也有 149 格。反白只是淡色外框，看不出剩餘 MP、進入敵 ZOC 會停下、或哪些格要走道路。

**F-10 單位清單會跳動，沒有回合內狀態。** 移動後被移動的單位跳到清單第一列；清單不標示「已移動／已攻擊／需燃料／已消滅」，
被消滅的單位仍列在「My units」並標成 `off map`。

**F-11 End 按鈕太容易誤按。** End 永遠是金色主按鈕，標籤是**目前**步驟（`End Movement · Movement Segment`），不是下一步；
有未行動單位時沒有提示或確認，也沒有自動 checkpoint（與 2026-09-30 審查相同，仍開啟）。

**F-12 版面浪費。** 回合／階段／天候在頂列與指揮欄標頭重複顯示（標頭 66 px）。沒有決策時，情境區佔 403 px 只放一行提示，
單位清單被壓到 302 px（約 4 列）。

### P2

**F-13 New Game 流程。**
- 預覽建置實測 129 ms、開局 114 ms；「Build operation preview → Start」的兩段式只增加一次點擊，可改為設定變更後自動預覽。
- 步驟列 `1 Configure / 2 Map / 3 OOB / 4 Deployment / 5 Gameplay` 外觀像精靈步驟但不可點，Map／OOB／Deployment 是同時產生的；
  預覽失效後仍顯示 ✓（2026-09-30 已記錄，確認仍開啟）。
- 預覽地圖不顯示部署位置（仍開啟）；每個編組在摘要列與展開清單各列一次。
- 預設遊戲雙方相距約 15 格、回合上限 2，新玩家第一局很可能完全沒有接戰。

**F-14 動作在頁面不繪製時會卡住。** `runUi` 先停用按鈕再 `await afterPaint()`（`requestAnimationFrame`），
背景分頁或被遮住的視窗中 rAF 不觸發：按鈕停用、沒有「Working…」，動作直到頁面重新繪製才執行。
實測 End Movement 卡住超過 2 秒。

**F-15 殘留狀態。** 右下角 hover 資訊在換局後仍顯示上一局的 `Hex 0806 · clear`；放置增援後選取框留在先前點過的空格。

## 建議的流程設計

以下為設計提案，需使用者決定後才實作。

### D1 回合軌（解決 F-02、F-11、F-12）

頂列改為一條 OCS 回合軌，取代重複的階段標頭：

```text
Turn 1/4 · 1 Oct · Dry   [Allied]  Reinf ✓ › Move ● › Supply › React(Axis) › Combat › Exploit › Clean Up
                                                         ↑ 略過的階段顯示為灰色「無可行動作」
```

- End 按鈕寫下一步：「Finish Movement → Supply」。有未行動單位時按鈕次要化並顯示「3 units have not moved」，需再按一次確認。
- 每個階段開始自動建立 checkpoint，提供「Undo this phase」。

### D2 結果卡與可讀 Log（解決 F-01、F-02、F-03）

- 每場戰鬥結算產生一張結果卡：雙方戰力、賠率、DRM、骰值、戰鬥表列與結果的白話解讀
  （「AL1o1/Do1：攻方損 1 step、可選 1 項；守方可選 1 項」），以及實際後果（誰損失、誰撤退到哪）。
- 交接畫面寫明對象與原因：「Pass to **Axis commander** — defend 0105 (supply, AR unit, terrain)」。
  交接回來時，先顯示「While you were away」：對方期間的結果卡與自動略過的階段。
- Log 以玩家語言記錄（「Allied: Oden TF overran 0704 at 2:1 — eliminated」），引擎事件碼移到可展開的技術詳情。

### D3 堆疊選取（解決 F-04）

- 點堆疊在地圖上展開成一排 counter（或於游標旁的小面板），點任一個選取；這只處理選取，不含 6.1f 的整疊移動。
- 堆疊繪製順序固定：戰鬥單位在上，HQ、砲兵其次，卡車與補給堆在底；補給堆以 Hex 角落的小標記表示。
- 所有目標標示（可達、攻擊、砲擊、放置、撤退）畫在 counter 之上的獨立 overlay 層，用外框而不是填色。

### D4 戰鬥表單（解決 F-05、F-06）

- 攻方在攻擊面板直接選補給來源（預設自動選最近／最多者，可改），宣告後不再追問。
- 守方的補給、AR 單位、地形合併為一個表單，每次變更即時更新賠率與 DRM，一次送出。只有一個合法選項的欄位不顯示。
- 同名補給堆以 Hex＋剩餘量＋序號區分；同一來源的 1T／2T 組合改為數量選擇。

### D5 階段化指揮欄（解決 F-07、F-08、F-10）

指揮欄的情境區依階段給「待辦清單」，取代通用提示：

| 階段 | 情境區內容 |
|---|---|
| Reinforcement | 待放置單位與入口；全部放好前 End 停用並說明 |
| Movement | 可移動／需燃料／已移動 三組計數，可篩選清單 |
| Supply | 每個編組的補給路徑與在補給／缺補給單位數；結束後列出新的 Out of Supply |
| Reaction / Combat | 可攻擊或砲擊的目標清單（點擊同地圖紅框） |

單位清單順序固定，以徽章標示已移動、已攻擊、需燃料、缺補給；被消滅的單位移到「Eliminated」分組。

### D6 地圖可達範圍（解決 F-09）

依剩餘 MP 分兩到三階明暗，或只畫可達範圍的外緣；敵 ZOC 格以斜線標示「進入即停止」；滑過可達格即時顯示路徑與成本。

### D7 New Game（解決 F-13）

設定變更後 debounce 自動重建預覽；移除假步驟列，改為單一狀態列（Ready／Building／Error）；預覽地圖畫出雙方部署；
編組只列一次。另建議預設遊戲讓雙方在第 1 回合即可接觸。

### D8 穩定性（解決 F-14、F-15）

`afterPaint` 改用不依賴 rAF 的讓出方式（例如 `setTimeout` 或 `MessageChannel`），或加 rAF 逾時後備；換局時清除 hover 與選取殘留。

## 建議順序

1. D2 結果卡＋交接說明＋可讀 Log（F-01～F-03，影響每一場戰鬥）。
2. D3 堆疊選取與 overlay 層（F-04）。
3. D1 回合軌與 End 防誤按（F-02、F-11、F-12）。
4. D4 戰鬥表單（F-05、F-06）。
5. D5、D6、D7、D8。

## 待使用者決定

- D3 是否在 6.1f 暫緩期間先做「只選取、不整疊移動」的堆疊展開。
- D4 是否接受守方決策合併為單一表單（目前引擎是逐一 pending decision，需在 UI 端彙整或調整決策協調器）。
- D7 是否取消「先預覽再開始」的兩段式，或保留按鈕但自動預覽。

## 關閉證據

每個 D 項實作後，以真實滑鼠在 1920×1080 與 1680×1050 重跑接敵案例（seeds `92001–92004`）至少一整個回合：
雙方都能在不查 Log 的情況下說出每場戰鬥的結果；能從地圖直接選到堆疊中任一單位；每次交接畫面寫明對象與原因；
附截圖與延遲紀錄，並依驗收計畫重跑受影響列。

## 修正紀錄（2026-10-01，使用者指示「全部修正」）

狀態仍為 **IN PROGRESS**。以下為程式與自動測試層級的修正，以及探索性實機操作；驗收計畫各列狀態不變。
使用者指示「全部修正」，本次對三個待決事項採用：D3 先做「只選取」的堆疊展開；D4 以 UI 彙整守方決策（不改決策協調器）；
D7 保留「Rebuild」按鈕但改為自動預覽。

| 項目 | 處理 | 主要位置 |
|---|---|---|
| F-01 戰鬥結果 | 戰鬥報告（宣告時賠率、骰值、結果代碼白話解讀、損失／撤退／推進）；自己行動導致結算時顯示結果卡；交接回來先顯示「While you were away」含對方期間的戰鬥卡 | `src/ui/narrative.ts`、`controller.ts` |
| F-02 Log／略過階段 | Log 改為玩家語句（技術摘要移到 tooltip）；自動略過的階段在紀錄與交接報告中列出；同樣內容的連續紀錄合併為 ×N | `narrative.ts` `describeRecord` |
| F-03 交接 | 交接面板與隱私畫面寫明下一位與原因（防守哪一格、處理戰果、Reaction 等），按鈕為「I am <玩家>」 | `controller.ts` `#handoffReason` |
| F-04 堆疊 | 點多單位堆疊開啟地圖上的堆疊清單，可選任一己方單位；堆疊繪製順序：補給堆、卡車、HQ、砲兵在下，戰鬥單位在上；放置／攻擊／砲擊／撤退／目標框改畫在 counter 之上 | `browser.ts` `stackPickerHtml`、`stackOrder`、`.target-overlay` |
| F-05/F-06 戰鬥決策 | 決策面板顯示戰鬥步驟進度與本方已作答案；「Pay automatically」由最大補給堆付費；守方 AR 單位選項顯示選後 DRM；相同文字的選項加編號；燃料等選項寫出補給堆數量 | `command-deck.ts` `decisionPanel`、`combat.ts` |
| F-07 提示 | 標頭依階段寫出本步驟目標；增援單位顯示「Arriving: click a blue entry hex」；暫停時顯示暫停橫幅並停用動作 | `command-deck.ts` `stepObjective` |
| F-08 補給 | 追蹤路徑選項寫出師名；補給階段顯示缺補給單位數；階段結束的 Out of Supply 寫入紀錄 | `controller.ts` `#stepActions` |
| F-09 可達範圍 | 新增 `getMovementRange`（含每格成本與「進入即停止」）；範圍依剩餘 MP 分兩階、停止格以虛線標示；滑過顯示成本與剩餘 MP | `rules/movement`、`gameplay/session.ts` |
| F-10 單位清單 | 依編組與名稱固定排序；Moved／Attacked／Out of supply／DG 徽章；Movement 階段可篩選已移動／未移動；地圖外與已消滅分組 | `command-deck.ts` `unitList` |
| F-11 End | 標籤為「Finish <目前步驟>」並寫出下一階段；Movement 有未移動單位時需再按一次確認；每步開始自動建立一個滾動 checkpoint，未擲骰前可「Undo back to the start of …」 | `controller.ts` `#afterChange`、`undoStep` |
| F-12 版面 | 頂列改為回合軌（已完成／自動略過／目前／未到，Reaction 標示行動方）；左欄改為 flex，單一可捲動工作區 | `browser.ts`、`web/command-deck.css` |
| F-13 New Game | 設定變更後 350 ms 自動重建預覽（實測約 0.1 s）；步驟列依實際狀態顯示，失效時不再顯示 ✓，失敗階段標紅；預覽地圖畫出雙方起始堆疊與單位數；編組只列一次；錯誤附上應調整的欄位並標示 | `browser.ts` `buildPreview` |
| F-14 卡住 | `afterPaint` 加 50 ms 計時後備，背景或被遮住的頁面不再卡住 | `browser.ts` |
| F-15 殘留 | 換局清除 hover 與堆疊清單；放置增援後選取格移到放置位置 | `browser.ts`、`controller.ts` |

### 追加發現：Reaction 空轉交接的原因

規則 12.11a 允許在己方 Movement、Reaction、Exploitation 的 Movement Segment 炸毀補給堆，因此只要有補給堆，
規則層就認為該步驟「有可行動作」而不會自動通過，造成每回合兩次 Reaction 交接。處理：新增設定（預設開啟，Session 對話框可關閉）——
當**對方**某步驟唯一可做的事是炸補給堆時，不交接直接結束該步驟，紀錄寫明
「… passed: only dump blowing was possible」。關閉設定即恢復每步交接。

### 驗證

- `npm run check` 的組成步驟：typecheck、34 檔／210 測試（新增 `tests/ui/flow.test.ts` 8 項）、build 均通過。
- 實機（Claude App 內建瀏覽器，1920×1080 與 1680×1050）：接敵案例 92001–92004 完成 Allied overrun 與 Axis 一般攻擊，
  含雙方決策、4 次交接、結果卡與「While you were away」；Large 案例 91001–91004 預覽 28 個部署標記、開局 406 ms，
  選取／預覽／移動／結束步驟／交接 10–408 ms；兩種尺寸頁面無水平溢出、無 13 px 以下文字、回合軌不溢出。
- 限制：App 視窗被遮住時截圖逾時或只截到左上角，多數操作以頁面內 DOM `click()` 驅動並讀取 DOM。依驗收計畫，這不是 UI 證據。

### 使用者決定

- 2026-10-01：使用者接受存檔帶一個自動 checkpoint（Large 案例約 +310 KB）以支援「Undo back to the start of …」。
  讀檔時舊的自動 checkpoint 會被移除，存檔中最多只有一個。
- 2026-10-01：使用者同意「只能炸補給堆時不交接」設定預設開啟。
- 2026-10-01：使用者指示預設地圖太小、提高最小尺寸，且 2 回合太少。處理：
  - 預設 New Game 改為 `32×24 / TEMPERATE_INLAND / COMPACT / 每方 2 / 8 回合`（`DEFAULT_NEW_GAME_REQUEST`）。
    雙方起始距離 25–30 格（6 組種子），預計第 2–3 回合接觸，之後仍有數回合作戰。
  - 玩家可選地圖改為寬 16–64、高 12–48（`NEW_GAME_MAP_LIMITS`，由 New Game orchestrator 與表單檢查，錯誤指出欄位）。
    地圖產生器仍接受 8×8，只供規則測試的接觸 fixture 使用。
  - 規則測試與一致性探針改用固定的 `RULE_FIXTURE_NEW_GAME_REQUEST`（原 18×12／2 回合），預設變更不再移動規則基準。
  - 驗收計畫 NG-06 依使用者指示改寫為新預設；NG-07 的 18×12 Large 案例仍在範圍內。
  - 實測（內建瀏覽器，1920×1080）：開機到地圖可操作 0.86 s（建立 311 ms、首次繪製 189 ms）；768 格地圖上選取 47 ms、
    預覽 131 ms、移動 340 ms、放置 470 ms、結束增援 348 ms。產生時間 32×24：COMPACT 108 ms、LARGE 280 ms。
    無頭 autoplay 跑完一回合約 4.3 s，相關測試逾時改為 60 s。

### 仍為 TODO（不得標為完成）

- **D4 守方單一表單**：守方的補給、AR 單位、地形仍是規則層的三個連續決策，UI 只是放在同一面板並顯示進度；
  AR 選項顯示 DRM、地形選項顯示賠率，但改變補給選擇時不會即時預覽後續賠率。影響：守方仍需三次點擊且無法回頭修改。
  關閉證據：決策協調器支援一次提交多項選擇（或可撤回），並在實機中由守方一次送出。
- **D3 整疊移動（6.1f）**：仍依使用者指示暫緩；堆疊清單只負責選取。鍵盤使用者需經「Hex」分頁選取堆疊中的單位。
- **D6 敵 ZOC 標示**：只標示「進入即停止」的可達格（含 Truck 進入敵 ZOC），未在整張地圖標出敵 ZOC。
- 實機驗收：以上各項需依 `03-product-operation-verification-plan.md` 以真實滑鼠逐列操作並截圖後，才可改變任何列的狀態；
  2026-09-30 審查的 SES-09（重新整理失去遊戲）等既有 TODO 不變。
