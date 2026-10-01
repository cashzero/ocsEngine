# 規則與 UI 稽核：已標記完成但未正確實作的項目（2026-09-30）

狀態：**R10 REOPENED**（2026-10-01 已依本報告重建規則層與 UI，見 `ocs-rebuild-2026-10-01.md`；探針 35/35 符合，gate 仍為 IN PROGRESS）。本稽核推翻 `docs/reports/R10-rule-engine-integration.md` 的
「MVP is complete」及 `src/rules/manifest.ts` 中多數 `IMPLEMENTED` 列。依 `AGENTS.md`
delivery-status rule，下列 gate 在對應證據補齊前不得再標為完成。

## 方法

- 建置：`2f4b72d`，`npm run check` 通過（37 檔／177 測試、build、smoke）。測試全過與下列違規並存，
  證明既有測試未覆蓋規則本身。
- 規則探針：`scripts/audit/rules-conformance-probe.mjs`（`npm run build` 後執行）。以 production
  generated scenario 的單位與設定建立最小狀態（地形改為 Clear 以隔離變因），用公開 `ruleEngine`
  API 執行動作，對照 OCS 4.3 條文。結果：**30 項中 28 項 FAIL**。
- 實機 UI：headless Edge 1920×1080，以真實滑鼠事件操作 default（18×12）與接敵案例
  （8×8／COMPACT／每方 1，seeds `92001–92004`）。截圖在 `docs/reports/assets/audit-2026-09-30/`。

## A. 規則：manifest 標 `IMPLEMENTED` 但實測違反條文

| 探針 | 條文 | 規則要求 | 實測結果 | manifest 列 |
|---|---|---|---|---|
| ZOC-tracked／ZOC-leg | 4.5a(A)、6.3b | EZOC 只停止 **Truck** MP；Leg／Track 不受影響 | Leg、Tracked 進 EZOC 即被迫停止 | `zoc.purpose`、`movement.ground` |
| ZOC-negation | 4.5b | 我方戰鬥單位所在格的 EZOC 對移動被抵銷 | 移動用途永不抵銷 | `zoc.purpose` |
| REACTION-eligibility | 7.0a | Reaction 只能用已釋放 Reserve | Move mode 單位全 MA 移動 | `movement.ground` |
| EXPLOIT-eligibility | 11.0、5.9 | Exploitation 只能用 Exploit mode 與已釋放 Reserve | 任何單位可移動 | `movement.ground` |
| MODE-after-move | 5.4 | 模式只能在單位開始移動時改變 | 移動後仍可改模式 | `mode.transition` |
| MOVE-resume | 6.1g | 移動其他單位後不能回頭續動先前單位 | 可續動 | `movement.ground` |
| STRAT-orientation | 5.8 | Strat 必須朝 Move 面 | 保持 Combat 面，MA×2 用錯面 | `mode.transition` |
| RESERVE-release-mode | 5.7b | 釋放即移除 Reserve 標記 | 仍為 `RESERVE`，且下回合永久留在 Reserve | `mode.transition` |
| RESERVE-release-overrun | 5.7b(A) | 已釋放 Reserve 可 overrun／攻擊 | `ATTACKER_NOT_CAPABLE`：釋放後永遠不能攻擊 | `mode.transition`、`overrun.ground` |
| EXPLOIT-combat-segment | 2.2、11.0 | Exploitation 有 Combat Segment | 一般戰鬥只允許 `phase === COMBAT`，該段落永遠無法攻擊 | `combat.ground` |
| EXPLOIT-mode-reachable | 9.13 | 戰鬥結果可給 Exploit mode | 無任何程式路徑設定 `EXPLOITATION`，無 exploit 結果碼；manifest note 卻寫「Exploit/DG outcomes」 | `combat.ground` |
| BARRAGE-reserve／strat | 13.4a | Reserve／Strat 砲兵不能砲擊 | 可砲擊 | `barrage.artillery` |
| BARRAGE-movement-phase | 2.2 | Movement Phase 無砲兵砲擊 | 可砲擊 | `barrage.artillery` |
| COMBAT-terrain | 9.3、9.4 | 防守地形決定戰力修正與表格列 | Clear／Woods／Rough 皆 `14:6`；`terrainDefinitionIds` 算出後未使用 | `combat.ground` |
| DEFEND-STRAT／RESERVE | 5.8、5.7 | Strat 戰力 0；Reserve 防守減半 | 全額 | `combat.ground` |
| COMBAT-partial-defender | 9.1d | 格內所有戰鬥單位合併防守 | 可只攻擊其中一個單位 | `combat.ground` |
| COMBAT-attacker-unsupplied | 9.5A | 無戰鬥補給不能攻擊 | 提供「Proceed without combat supply」 | `transaction.reservation`、`combat.ground` |
| COMBAT-hex-once | 9.1c | 同一格每 Combat Segment 只能被攻擊一次 | 可重複攻擊 | `combat.ground` |
| RETREAT-1hex-DG | 5.10a、9.12a | 退一格且未入 EZOC 不 DG | 一律 DG；且退卻固定一格、不能入 EZOC（規則是入 EZOC 則 DG） | `combat.ground` |
| OVERRUN-no-MP／3MP-cost | 8.1a | overrun 花 3 MP，不足 3 MP 不可 | 0 MP 可 overrun；不扣 MP | `overrun.ground` |
| OVERRUN-DG | 5.10b(C) | DG 不可 overrun | 可 | `overrun.ground` |
| SEQ-first-player | 2.3 | 每回合擲骰決定先後手 | 從不擲骰，固定 scenario 先手 | `sequence.ground-turn` |
| SUPPLY-skip | 12.6、2.3 | Supply Phase 判定所有單位 | 不按 CHECK_SUPPLY 即全體永遠有補給 | `supply.trace-and-dump` |
| SUPPLY-trace-terrain | 12.6、12.3 | 補給路徑依 Truck MP、受地形限制 | 以 6 格直線 BFS 穿越海洋 | `supply.trace-and-dump` |

靜態審查另見（未寫成探針，但程式碼即證據）：

- 戰鬥：AR DRM 被夾在 ±2（`combat.ts`，9.6 無此限制）；無 Surprise（9.8）；賠率未依 4.1／9.7 取整；
  無 option／retreat 選擇（9.10）；多步單位損步後戰力未依 9.11d 減半而是線性遞減
  （`counter-corpus.ts`）；HQ 防守固定 5，Move mode 應為 1（13.1c）。
- 戰鬥表與砲擊表是自創的兩欄表（`game-flow/configuration.ts`），`RULE_TABLE_PROVENANCE`
  卻標 `REVIEWED`。
- 補給：HQ throw range（counter 上 7／9）完全未使用，只用 `supplyTraceRange: 6`；戰鬥補給固定
  1T，不依 RE（9.5b）；戰鬥與砲擊的補給來源以「目標格」6 格內計算，而非參戰單位的 draw／throw。
- Weather（17.0）完全未實作，manifest 也未列 DEFERRED，但 `sequence.ground-turn` 宣稱 2.1–2.3。
- 燃料 12.5、5.7d（受攻擊移除 Reserve）、8.1 overrun 必須由同起點堆疊、成功後必須進入，均缺。

## B. 實機 UI 重現的阻斷問題

1. **我方與敵方同格共存（規則破壞，狀態檢查未擋）。** 接敵案例：Oden TF 移到 5,4，對 6,4
   （2 個敵方單位）overrun。候選清單出現兩個完全相同的「OVERRUN: unit → 6,4」；選第一個只攻擊砲兵，
   結果消滅後仍給「Advance」，推進後 6,4 同時有 Oden TF 與敵方單位（`16-mixed-stack.png`）。
   根因：9.1d 未實作＋advance 不檢查目標格是否已清空＋`validateGameState` 無此不變量。
2. **戰鬥前看不到戰力、賠率、地形、DRM。** 「Review rules & effects」只顯示
   `Action satisfies current preconditions. (engine)`。
3. **決策對話框遮住整張地圖並顯示內部 ID**：`generated-oob:92002:allied:independent-supply-1:unit (4)`、
   `Take one step from generated-oob:…`（`12a-state.png`）。
4. **單選項決策也強制 hot-seat 交接**：一次 overrun 需要兩次完整隱私畫面交接（防守方唯一選項
   「Take one step」也要交接）。
5. **無法多單位聯合攻擊**：`engine.ts` 候選只產生單一攻擊者 × 單一防守者；UI 沒有參戰單位編輯。
6. **無法整疊移動**（6.1、6.1f）：只能逐一移動；點地圖堆疊只選到最上層 counter，要選其他單位
   必須到左側清單找。
7. **動作優先的下拉選單**（Action: Choose an action）取代戰棋常見的「選單位 → 地圖上顯示可移動／
   可攻擊目標 → 點擊」。攻擊目標只以文字清單呈現，且自動預選第一個候選並啟用 Confirm。
8. **地圖為 axial 平行四邊形**（`03-selected.png`），非一般戰棋的矩形 offset 版圖，浪費約三分之一視窗。
9. 每回合約 34 個 phase／segment 需手動 End phase；開局需先按 4 次才進 Movement（Weather、First Player、
   Aircraft Refit、Reinforcement 皆無可用行動）。
10. **敵方資訊洩漏**：DOM `data-piece` 含敵方單位完整 ID（例 `…:axis:f1-artillery-1:unit`），aria-label 含
    模式；同時又違反 4.9a（對手應可見最上層戰鬥單位），兩頭都錯。
11. Counter 梯隊與名稱矛盾：`1/501 Abn Bn` 顯示 III、`US 255 Engr Combat Bn` 顯示 X、師級 HQ 顯示 XXX
    （`counter-corpus.ts` 梯隊與 `name-catalog` 名稱各自產生）。

## C. 需重新開啟的狀態

- `docs/reports/R10-rule-engine-integration.md`：REOPENED（本報告 A 節）。
- `src/rules/manifest.ts`：`sequence.ground-turn`、`mode.transition`、`zoc.purpose`、`movement.ground`、
  `transaction.reservation`、`supply.trace-and-dump`、`combat.ground`、`overrun.ground`、
  `barrage.artillery` 的 `IMPLEMENTED` 不成立；`RULE_TABLE_PROVENANCE` 兩張 `REVIEWED` 表不成立。
  TODO：manifest 型別需要能表達「部分實作」或降為 DEFERRED，改動牽涉 `requireImplementedRuleFeature`
  與 manifest 測試，待重建範圍決定後一併處理。影響：manifest 目前對外宣稱錯誤。關閉證據：
  `rules-conformance-probe.mjs` 全數 ok，且每列有正反測試。
- `stacking.ground` 僅在 overrun 推進路徑被破壞（B-1）；探針未測其他違規。
- U10／M8 本來就是 IN PROGRESS；B 節全部列入其 open issue。

## D. 建議（供決定是否整體重建）

保留：`core/hex`、`domain`、`serialization`（Foundation）、Gameplay session／save／replay 外殼、
地圖與 OOB 產生器的管線（需改為矩形版圖與梯隊一致）。

重建：

1. **規則層**：以條文為單位重寫 mode／ZOC／movement／combat／supply，先寫條文對照測試
   （可直接由本探針擴充）再實作；戰鬥結果改為 OCS 的 loss／option／exploit 結構，
   並補 Surprise、地形列、戰鬥補給雙方支付、整格防守、多單位攻擊。
2. **UI 互動模型**：改為一般戰棋流程——點堆疊展開、可多選整疊移動；選中單位時地圖同時標示
   可移動格與可攻擊敵格；點敵格開啟戰鬥面板（參戰單位勾選、雙方戰力、地形、賠率、DRM、補給），
   決策在地圖上就地進行，不遮圖、不顯示內部 ID；無行動的 phase 自動跳過；只在需要對手做「真正的選擇」時交接。
