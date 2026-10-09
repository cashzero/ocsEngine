# 工兵架橋 Bridging（OCS 13.8b）

狀態：**IN PROGRESS**。規則、UI 與瀏覽器驗收（BR-1～BR-5）已完成；電腦對手刻意使用架橋（BR-6）仍是 TODO，見 §4。

需求來源（使用者，2026-10-09）：「實作工兵架橋功能」。需求只有一句，以下是我依規則書做的解讀（未另外詢問，記錄於此供使用者確認）。

## 1. 規則（`src/rules/movement/bridging.ts`）

| 規則 | 實作 |
|---|---|
| 13.8a、5.10e | Engineer-Capable：HQ 或 Engineer，戰鬥模式，或 DG 且朝向戰鬥模式（`isEngineerCapable`，移到 `rules/pieces.ts`） |
| 13.8b | Engineer-Capable 單位所在格的河流 hexside：Major River 改按 Minor River 計費（Track／Truck 由禁止變可過，Leg 由 All 變 +1），Minor River 不加費；不花 SP；各種地面狀況都依當下的 Minor River 欄（含結冰河） |
| 13.8b | 只有進入或離開該格的己方單位受益；敵方單位不受益 |
| 13.8b | 單位一不再 Engineer-Capable，橋立刻消失；例外：換模式後該單位仍可用自己的橋離開該格（`usage.ownBridgeHexId`，只在本階段有效） |
| 8.1c、13.8b | Overrun 不能用架橋（不論 Major 或 Minor） |
| 9.1f、13.8b | 一般攻擊可因架橋而成立（例如 Track 單位隔 Major River 攻擊）；戰鬥地形修正不變 |
| 12.3d | 補給路徑（trace、draw、HQ throw）「如同移動」計算，也使用己方的橋（規則書 12.3「Maximum Stretch of HQs」範例提到 HQ-bridge） |
| 9.12、12.8e | 撤退路徑與 Breakout 路徑也使用己方的橋 |

專案的解讀（規則書沒有明寫）：

- 補給路徑使用己方的橋（見上表 12.3d）。
- 橋位於檢查移動當下 Engineer-Capable 單位所在的格：移動中的 Engineer-Capable 單位只在離開自己起始格的那一步受益，不會沿路每條河都架橋。生成的 OOB 中工兵與 HQ 在戰鬥模式 MA 為 0，所以這條在生成的對局中不會發生。
- 資料：`RuleConfiguration.rivers` 列出 Minor／Major River 的 hexside feature。生成的對局是 `edge:river`／`edge:major-river`。
  沒有這個欄位的舊存檔沒有架橋，因此重播結果不變。

## 2. UI

- 地圖：檢視者自己的每座橋是一塊木板，橫跨河流 hexside，從工兵所在格指向對岸；Major River 上的較寬。
  木板畫在 counter 上方，以免兩岸都有單位時被遮住。
- 格子提示文字：「your engineer bridges N river hexsides here (Minor River: no extra MP; Major River: Minor River cost) for your units moving in or out; not for overruns」。
- 工兵或 HQ 的 Unit status：顯示 `BRIDGE` 標記，tooltip 說明效果與規則 13.8b。
- 移動範圍、路徑費用、補給範圍直接使用規則引擎的結果，UI 不另外計算。
- 投影：`RuleProjection.bridges`，只列檢視者自己的橋（不洩漏敵方單位模式）。

## 3. 驗收

| 列 | 條件 | 結果與證據 |
|---|---|---|
| BR-1 | 規則測試：Minor／Major、單位在格內或對岸、旁邊的 hexside 不受益、Move 模式不架橋、DG 朝向戰鬥模式會架橋、敵方不受益、可達範圍、換模式的例外、攻擊可、Overrun 不可、補給路徑、投影只給己方、沒有河流設定時無效果、設定驗證 | PASS：`tests/rules/bridging.test.ts`（12 項） |
| BR-2 | `npm run check` 全部通過 | PASS（2026-10-10，rebase 到 main `f026815` 之後） |
| BR-3 | 真實瀏覽器（產品驗收 NG-14）：工兵從 Move 切到戰鬥模式後出現橋、提示文字、狀態標記；原本到不了的對岸變得可達，單位經橋過河；完成 Game Turn；切回 Move 模式後橋消失 | PASS：`docs/quality/evidence/bridging-2026-10-10`（11/11，0 頁面錯誤） |
| BR-4 | 目視：兩岸都有單位時橋仍看得到，且不遮住 counter 的數值 | PASS：`close-bridges.jpg`、`close-tank-across.jpg`。第一次執行時木板畫在 counter 下方，幾乎看不到，已改畫在上方並縮小後重跑；上方兩塊木板壓在工兵 counter 的上緣角落，不遮數值，不阻擋 |
| BR-5 | 舊存檔（沒有 `rivers`）照常載入與重播 | PASS：既有存檔與重播測試全部通過，`rivers` 與 `ownBridgeHexId` 都是選填欄位 |
| BR-6 | 電腦對手會刻意使用架橋 | **TODO**，見 §4 |

## 4. TODO

- **電腦對手不會刻意架橋。**
  - 現況：heuristic bot 透過同一套合法移動與補給查詢，所以橋存在時它的移動與補給計算都會用到，但它不會為了架橋而把工兵或 HQ 放到河邊並切換成戰鬥模式。
  - 對玩家的影響：電腦在河流防線前的進攻比人類弱。
  - 結案證據：bot 規則在進攻路線被河流擋住時，把工兵或 HQ 以戰鬥模式放在河邊；bot 互打的存檔中出現經工兵橋過河的移動，且 0 錯誤、重播相符。
- 依記憶中的原則（bot 先正確使用機制，再調整平衡），架橋加入後的攻守勝率尚未重新量測。
