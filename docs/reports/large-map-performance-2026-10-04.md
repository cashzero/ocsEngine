# 大地圖效能量測與瓶頸預測 — 2026-10-04

狀態：**DONE**（2026-10-05）。§1～§9 是修正前的量測（未改程式時的原貌，保留作為證據）；§10 是 PERF-1（Trace Supply）與
PERF-5（增援候選）的修正，§11 是 PERF-2（地圖產生）、PERF-3（建立 session）、PERF-6（每次動作的存檔成本）、PERF-4（End step）的修正。
PERF-1～6 都依 §8 的驗收條件關閉；唯一例外是 PERF-1 中「遊戲第一次放置增援」單次 218 ms，使用者 2026-10-05 決定不追究（§11.5）。
仍開放的只有放寬地圖上限時才會出現的 PERF-7（§11.6）。

## 1. 使用者要求

> 64x48 map size的時候 效能很差 包含trace supply, 放置reinforcement，請進一步量測 效能差的項目

> 不單單只是就現在64x48分析 進一步也要分析未來效能bottleneck 預測map size放大 那個點會成為bottleneck

所以本報告回答兩件事：(1) 64x48 時哪些操作慢、慢在哪一行；(2) 地圖（與兵力）再放大時，各元件成長得多快、
哪一個會先成為瓶頸、在多大的地圖撞牆。

## 2. 方法

量測對象是 `main` @ `e161575`（本機，含尚未 push 的鐵路繪製 commit）的 build；種子用 New Game 預設值（`DEFAULT_NEW_GAME_REQUEST`），
只改地圖大小與師數。Windows 10、Node 24.11.1、Chromium headless shell（Playwright 1217）。所有腳本在 `scripts/perf/`：

| 腳本 | 量什麼 | 邊界 |
|---|---|---|
| `measure-scale.mjs` | 用真正的 UI controller（瀏覽器驅動的同一物件）玩完 Game Turn 1：開 Trace Supply、每個 arrival 選取→放置、End step、hot-seat 交接；每個 controller 操作內，所有 session 與 rule engine 呼叫都包了計時 | Node，引擎＋controller，不含繪圖 |
| `browser-scale.mjs` | 在 Chromium 中從可見控制項操作（New Game 表單設定大小→Generate→Start→Trace Supply→Arrivals 分頁選單位→鍵盤游標 Enter 放置→End phase／交接），每次點擊量到主執行緒連續 5 frame 空閒為止，並記錄 long task 與 CPU profile | 瀏覽器，含 lit-html 與 canvas 繪圖 |
| `scaling-curve.mjs` | 每個元件單獨計時（冷快取：state 淺拷貝讓以 state 為 key 的 WeakMap 快取失效，等同 UI 每個動作後付出的成本），8 種地圖大小 × 3 種師數，再無頭玩 Turn 1 計每個 applyAction | Node，元件層 |
| `fit-scaling.mjs` | 對 `scaling-curve` 結果做 log-log 擬合：ms ∝ hexes^k 與 ms ∝ units^k，推算各元件到 100 ms／1 s／5 s 的地圖大小 | 分析 |
| `profile-stage.mjs`、`summarize-cpuprofile.mjs`、`callers-cpuprofile.mjs` | 單一階段的 V8 CPU profile、自身／含子呼叫時間、熱點函式的呼叫者 | 熱點定位 |

64x48 以上的量測使用**只供量測的 dist 複本**（`tmp/unlimited/`，不提交）：把 `generator.ts` 的寬 64／高 48 檢查與
`NEW_GAME_MAP_LIMITS` 放寬到 256×192，其餘程式不變。產品目前仍限制在 64x48。

## 3. 64x48 現況：玩家感受到的延遲（瀏覽器）

每列是一次點擊到畫面可再操作的時間（中位數或平均／最大），單位 ms。整個 Turn 1 每次慢點擊都是**單一個 long task**，
也就是畫面在這段時間完全凍結。

| 操作 | 32x24，Trace 開 | 64x48，Trace 開 | 64x48，Trace 關 |
|---|---|---|---|
| 開啟 Trace Supply | 226 | **1,406** | — |
| 選取一個 arrival（Arrivals 分頁） | 140（最大 225） | **1,007（最大 1,532）** | 39 |
| 放置 arrival（地圖上 Enter） | 263（最大 311） | **1,741（最大 1,997）** | 245（最大 382） |
| End step | 282（最大 464） | **1,803（最大 3,725）** | 398（最大 740） |
| 交接完成（I am …） | 462 | **3,471** | 398 |
| New Game：Generate preview | 770 | 1,805 | 1,819 |
| New Game：Start | 952 | 2,915 | 2,954 |
| 地圖拖曳 300 px／縮放 | 414／165 | 247／124 | 254／114 |

結論：Trace Supply 開著時，64x48 每放一個增援要兩次點擊共 **約 3～3.5 秒**凍結（選取＋放置），一回合 8 個增援就是
約 25 秒；關掉 Trace Supply 後同樣操作約 0.3 秒。地圖繪製本身不是問題（整個回合 canvas 繪圖合計 0.5～0.9 s，
見 §4.5）。

## 4. 64x48 慢在哪裡（引擎層，`measure-scale.mjs` 與 CPU profile）

### 4.1 Trace Supply 覆蓋圖（最大宗）

- 單次 `queryTraceCoverage` 在 64x48 需 **1.3～2.6 s**（32x24 為 0.10～0.20 s；格數 ×4，時間 ×13）。
- Trace 開啟時，UI 在**每一次** revision 改變後重算（`controller.ts:685` 的快取以 revision 為範圍），而且放置後被放下的單位仍是選取狀態，
  所以先算「該單位」的覆蓋，選下一個 arrival 時再算一次「任何單位」的覆蓋 —— 每個增援付 2 次全圖計算。
- Trace 開啟的整個 Turn 1，CPU 有 **86%** 在 `queryTraceCoverage → routesFrom`。
- 原因（`src/rules/supply/supply.ts:377-379`）：對**每一格**，逐一對**每個 Supply Source** 呼叫 `routesFrom`，而 `routesFrom`
  每次都 (a) 用字串拼接查 `supplyPathCosts` 快取、(b) `throwingHqs` 把全部棋子重新 filter 一次找 HQ（`isHq → definitionOf → catalog.get`）、
  (c) `reaches` 對字串 hex id 重新 parse 求鄰格。64x48 的呼叫量：

| | 格數 | Supply Source | 每次覆蓋的 `routesFrom` 次數（格 × 來源） |
|---|---|---|---|
| 32x24 Allied／Axis | 768 | 16／20 | 12,288／15,360 |
| 64x48 Allied／Axis | 3,072 | 56／73 | **172,032／224,256** |

  來源數也隨地圖成長（鐵路上可下車的村鎮都是來源，13.3c），所以成本約為 格數 × 來源數 × 棋子數。
  而每個來源 5 MP 內實際只到得了約 108～156 格：從來源往外展開（每個來源一次 Dijkstra，取聯集再外擴一格）只需處理約 6 千格，而非 17～22 萬次查詢。
- 次要：Dijkstra 每次 pop 都對整個 frontier 排序（`supply.ts` `supplyPathCosts`，`frontier.sort`），但範圍被 5 MP 限制，不隨地圖成長。

### 4.2 放置增援（Trace 關閉時仍有約 215 ms 引擎時間）

| 子項（每次放置平均） | ms |
|---|---|
| `getActionCandidates(PLACE_REINFORCEMENT)`（UI 每次放置呼叫 1～2 次，每次 50～165 ms） | 91 |
| `session.serializeSave`（每次 dispatch 都把初始與目前的完整 state，含整張地圖定義，序列化一次） | 40 |
| `getView`（每次點擊被呼叫 52 次，每次 projection＋深拷貝） | 31 |
| `hashGameState`（SHA-256 整個 state） | ~20 |
| Undo checkpoint（`createCheckpoint`） | 17 |
| 規則本身 `applyAction` | 7 |

候選產生的成本來自 `candidates.ts:123` 的 `add()`：每個候選格都跑一次完整 `validateGameAction`，而
`validateReinforcementPlacement`（`lifecycle.ts:273`）又重算 `arrivingReinforcements` 與整個 `reinforcementHexes`；
Pax／Eq 的 `reinforcementHexes`（`lifecycle.ts:238-241`）掃描全地圖每一格 × 每個 HQ 的距離，再對每格掃一次全部棋子找敵軍。
所以是 候選數 × 全圖掃描。

### 4.3 End step（Trace 關閉時 0.4～0.7 s）

`ADVANCE_SEQUENCE` 會自動跳過無事可做的步驟，每跳一步都用 `hasOptionalActions`（`candidates.ts:462`）對所有動作種類試產生候選；
進入 Supply Phase 時 `determineSupply` 對每個單位呼叫 `pieceHasTrace`，而多單位編隊的成員每次都重算**整個編隊**所有成員的 trace route
（`formationRoute → formationRouteOptions → traceRoutesFor`），等於 成員數² 次 trace；`breakoutCandidates`／`breakoutStatus`
（`supply-phase.ts:113-117`）對每個單位再把其他所有單位的 `pieceHasTrace` 算一次。

### 4.4 New Game（64x48 約 3 s）

- `validateScenarioDefinition`（`src/domain/scenario/validation.ts:61`）的 `validateLocationReference` **每個棋子都重建一次整張地圖的索引**
  （`createMapDefinitionIndex` 對全部格做 `stableSort` + `compareHexIds`，每次比較都 parse 字串）。而一次 New Game 會在
  `validateGeneratedScenarioPackage`、`parseScenarioDefinition`、`createSession`、`parseGameState` 各驗證一次以上。
- 地圖產生 1.2 s，幾乎全在道路網（§5.3）。

### 4.5 繪圖不是瓶頸

瀏覽器 CPU profile（Trace 開，整個 Turn 1）：`getSnapshot` 33.3 s、其中 `queryTraceCoverage` 32.1 s；canvas `#render` 合計 0.86 s、
`#drawTraceCoverage` 0.51 s、lit-html `render` 0.11 s。Trace 關：`#render` 0.46 s。canvas 地圖是分塊（tile）快取繪製，
繪圖量隨視窗而非地圖大小成長。

## 5. 放大後的瓶頸預測（`scaling-curve.mjs` + `fit-scaling.mjs`）

### 5.1 各元件實測（ms；預設 6 師／方，最後三欄改變師數）

| 元件 | 32x24 | 48x36 | 64x48 | 80x60 | 96x72 | 128x96 | 64x48 12 師 | 64x48 20 師 | 128x96 20 師 |
|---|---|---|---|---|---|---|---|---|---|
| New Game：地圖產生 | 102 | 312 | 1,161 | 2,716 | 4,594 | **21,969** | 787 | 795 | **27,572** |
| New Game：建立 session | 379 | 892 | 1,443 | 2,292 | 3,466 | 5,639 | 2,242 | 3,702 | **26,621** |
| New Game：package 驗證 | 140 | 376 | 616 | 969 | 1,140 | 1,981 | 756 | 1,204 | 10,290 |
| New Game：部署 | 42 | 62 | 84 | 137 | 114 | 172 | 73 | 80 | 627 |
| Trace 覆蓋（任何單位） | 147 | 537 | 1,908 | 2,723 | 4,340 | **13,024** | 3,313 | 5,205 | **56,582** |
| Trace 覆蓋（單一單位） | 144 | 615 | 1,689 | 2,569 | 4,410 | 14,021 | 3,362 | 4,665 | 54,836 |
| 增援候選（全部） | 28 | 97 | 155 | 274 | 349 | 744 | 366 | 858 | 1,630 |
| Turn 1 最慢的一次 End step（applyAction） | 159 | 451 | 678 | 912 | 1,231 | 2,429 | 810 | 1,290 | **4,688** |
| Turn 1 全部 applyAction | 418 | 1,032 | 1,928 | 2,193 | 2,831 | 5,528 | 2,007 | 3,194 | 11,639 |
| 每次 dispatch 的存檔序列化 | 13 | 24 | 45 | 50 | 68 | 120 | 39 | 45 | 166 |
| 每次 dispatch 的 state hash | 8 | 12 | 24 | 33 | 39 | 79 | 26 | 27 | 127 |
| Undo checkpoint | 6 | 10 | 20 | 25 | 32 | 54 | 17 | 21 | 103 |
| New Game 預覽 SVG 字串 | 52 | 115 | 222 | 430 | 635 | 1,318 | 230 | 264 | 2,327 |
| 地圖 theater model | 9 | 27 | 72 | 166 | 182 | 406 | 85 | 74 | 760 |
| 移動範圍（Strat Mode，含逐格 trace 檢查） | 52 | 103 | 208 | 205 | 269 | 449 | 215 | 186 | 782 |
| 移動範圍（一般） | 1 | 2 | 2 | 2 | 1 | 1 | 2 | 1 | 3 |
| `getView`、`getActionFamilies`、OOB 產生 | <2 | <2 | <2 | <2 | <2 | <2 | <4 | <4 | <5 |

其他事實：存檔大小 64x48 1.29 MB → 128x96 3.99 MB（20 師 4.48 MB）；預覽 SVG 1.19 MB → 4.67 MB；
Supply Source 數 56 → 132；棋子數 51（6 師）、85（12 師）、131（20 師）。

### 5.2 成長率與撞牆點

k 為 ms ∝ hexes^k 的擬合指數（6 師，32x24～128x96）；「末段 k」只用 96x72→128x96 兩點；「兵力 k」為固定 64x48、棋子 51→131 時的 ms ∝ units^k。
撞牆點是擬合曲線到達該時間時的地圖格數（以 4:3 換算尺寸），以 6 師推算 —— 兵力增加會讓有兵力指數的項目更早撞牆。

| 元件 | k（格數） | 末段 k | 兵力 k | 到 1 s | 到 5 s |
|---|---|---|---|---|---|
| 地圖產生 | 1.93 | **2.72（加速中）** | ~0 | 61x46 | 93x70 |
| Trace 覆蓋 | 1.59 | 1.91～2.01 | 1.1 | **57x43** | 95x72 |
| 建立 session | 0.98 | 0.85 | 1.0 | 52x39 | 119x89 |
| Turn 1 全部 applyAction | 0.88 | 1.16 | 0.5 | 49x37 | 123x92 |
| 單次 End step | 0.93 | 1.18 | 0.7 | 81x61 | 193x145 |
| package 驗證 | 0.94 | 0.96 | 0.7 | 86x64 | 203x152 |
| 預覽 SVG 字串 | 1.18 | 1.27 | 0.2 | 116x87 | 229x172 |
| 增援候選 | 1.14 | 1.32 | **1.8** | 145x109 | 295x221 |
| Strat 移動範圍 | 0.75 | 0.89 | ~0 | 218x163 | 638x478 |
| 存檔序列化／hash／checkpoint | 0.8 | 0.9～1.2 | ~0 | 500x375 以上 | — |
| 一般移動範圍、`getView`、OOB 產生 | ~0 | — | — | 不會 | 不會 |

### 5.3 預測：放大時誰先成為瓶頸

1. **現在（≤64x48）就是瓶頸：Trace 覆蓋。** 約 57x43 起單次超過 1 秒，64x48 正好落在這裡，而且 UI 每個動作重算 1～2 次。
   成本 ≈ 格數 × Supply Source 數 × 棋子數，三者都隨地圖與兵力變大，所以指數 1.6～2.0（格）再乘 1.1（兵力）：
   128x96 6 師 13 s，128x96 20 師 **57 s**。同一組函式（`traceRoutesFor`／`routesFrom`）也是 End step、Strat 移動與
   Breakout 判定的成本來源，所以它是放大後最核心、牽涉最廣的瓶頸。

2. **New Game 的地圖產生會最先「爆掉」。** 64x48 1.2 s，96x72 4.6 s，128x96 22 s，且指數一路上升（1.9 → 2.7）。
   原因在 `src/generation/map/roads.ts:333-345`：主幹道的最小生成樹用最直接的 Prim 寫法，每加入一個中心點都重新掃描
   「所有未接入 × 所有已接入」的中心點並重新 parse 兩個字串座標 —— 中心點數（城鎮＋入口）與面積成正比，所以這段是
   **格數³**。128x96 的 profile：`generateRoadNetwork` 佔 91%，其中 67% 只是在 `coordinateFor → parseHexCoordinateId`。
   其次是 `fillCoverageGaps`（`roads.ts:252`），每補一個空隙就重跑一次全圖 BFS（空隙數 × 格數，約格數²），以及
   `densify` 的所有點對（點數²）。這是第一個會讓更大地圖「無法使用」（數十秒到分鐘）的元件。

3. **兵力變多時：建立 session 與 package 驗證。** 成本 ≈ 棋子數 × 格數 × log 格數（每個棋子重建並排序整張地圖索引，§4.4，
   且一次 New Game 驗證 3～4 次）。6 師時 128x96 為 5.6 s，20 師時 **26.6 s**（驗證另有 10.3 s）。讀檔也走同一條驗證路徑。

4. **回合推進（End step）。** 約與格數線性、與兵力 ^0.7，但絕對值已大：128x96 20 師單次 End step 4.7 s。主要是 §4.3 的
   `pieceHasTrace` 重複計算（編隊成員²）與 `hasOptionalActions` 的試算 —— 修好 §1 的 trace 計算會一併大幅降低。

5. **增援候選隨兵力平方成長（兵力 k 1.8）。** 地圖放大時只是線性，但兵力加倍會讓每次放置的候選時間約 ×3.5。
   128x96 20 師 1.6 s／次，UI 每次放置呼叫 1～2 次。

6. **以上都修好後的「地板」：每次點擊固定成本。** 每個 dispatch 都完整序列化存檔（含初始 state 與整張地圖定義）、SHA-256 整個 state、
   Undo checkpoint 再存一次 —— 皆與格數線性。64x48 約 80 ms，128x96 約 250 ms，128x96 20 師約 400 ms。它不會先爆掉，
   但會是上面幾項修好之後，大地圖每個點擊都要付的下限。地圖定義是靜態的，卻每個動作重新序列化／hash，這是可以拿掉的部分。

7. **不是瓶頸：** 一般移動範圍（受 MA 限制，與地圖大小無關）、`getView`、`getActionFamilies`、OOB 產生、canvas 地圖繪製（分塊快取）。

## 6. 大地圖的瀏覽器量測

放寬上限的 dist 複本，在 Chromium 中以相同流程操作（`PERF_TRACE=once`：Trace Supply 只量開／關一次，回合其餘操作不開，
否則每次點擊數秒到十數秒）。單位 ms。

| 操作 | 64x48 | 96x72 | 128x96 |
|---|---|---|---|
| New Game：Generate preview | 2,166 | 5,990 | **18,871** |
| New Game：Start | 3,073 | 8,878 | **22,982** |
| 開啟 Trace Supply | 1,393 | 3,690 | **10,517** |
| 放置 arrival（Trace 關）平均／最大 | 232／301 | 425／554 | 779／1,091 |
| End step（Trace 關）平均／最大 | 407／826 | 689／1,542 | 1,170／2,822 |
| 交接完成 | 384 | 611 | 1,267 |
| 選取 arrival（Trace 關） | 39 | 43 | 54 |
| 地圖拖曳 300 px（Trace 關／開） | 270／390 | 260／387 | 287／380 |
| 縮放 | 116 | 124 | 142 |

瀏覽器結果與 §5 的引擎預測一致：最先失控的是 New Game（地圖產生＋建立 session）與 Trace Supply；放置與 End step
隨地圖約線性變慢；地圖拖曳與縮放在 128x96 仍與 64x48 相同（分塊繪製），選取單位也維持數十 ms。

## 7. 改善方向（建議，未實作）

| 瓶頸 | 方向 | 預期效果 |
|---|---|---|
| Trace 覆蓋 | 由來源往外算：每個 Supply Source 一次 truck Dijkstra（已有快取），取聯集並外擴一格得 DRAW 覆蓋；每個可 throw 的 HQ 只在「HQ 格被 DRAW 覆蓋」時加入它的 throw 範圍。`throwingHqs`、`friendlySourceHexes` 每次查詢算一次而非每格每來源一次；hex 鄰格用預先建好的數字索引而非字串 parse | 從 格×來源×棋子 降到 來源×可達範圍，64x48 預估由秒級降到數十 ms 級 |
| Trace 在 UI 的重算 | 以 piece／map state 而非 revision 作為覆蓋快取的 key；放置後不保留已放置單位的單位覆蓋 | 每個增援由 2 次全圖計算降到 0～1 次 |
| 地圖產生 | Prim 改用每個未接入點維護「到樹的最短距離」（O(n²)，或用空間格網 O(n log n)）；座標預先存在 cell 上不重 parse；`fillCoverageGaps` 改為增量更新距離 | 道路網由 格數³ 降到 格數 log 格數～格數²，128x96 由 22 s 降到秒級以下 |
| 情境驗證 | `validateScenarioDefinition` 只建一次 map index；同一份情境在一次 New Game 內不重複驗證；`compareHexIds` 不重 parse | 建立 session 由 棋子×格數 降到 格數 |
| End step | 每次 `determineSupply`／`breakoutCandidates` 先算一次「編隊 → 共同 route」與「每單位 trace」表再使用 | 編隊成員² → 成員數 |
| 增援候選 | 在候選產生時直接用已算好的 `reinforcementHexes`，不再經 `validateGameAction` 重算；Pax／Eq 的 HQ 2 格範圍用 HQ 周圍展開而非掃全圖 | 候選 ∝ 候選數，不再 × 全圖 |
| 每次點擊固定成本 | 存檔與 hash 不重複包含靜態情境（只存情境 hash 或分開序列化一次）；`getView` 在同一 revision 內快取 | 每次點擊固定成本降一半以上 |

## 8. 開放 TODO（依 AGENTS.md：缺少行為、使用者可見影響、關閉證據）

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 |
|---|---|---|---|
| PERF-1 Trace 覆蓋（**DONE**，§10、§11.5：第一次放置單次 218 ms 由使用者決定不追究） | 覆蓋圖成本與 格×來源×棋子 成正比，且 UI 每次 revision 重算 1～2 次 | 64x48 開 Trace Supply 時每次點擊凍結 1～2 s，每個增援約 3 s | `browser-scale.mjs` 64x48 Trace 開：選取 arrival、放置、End step 每次 < 200 ms；`scaling-curve.mjs` 128x96 20 師覆蓋 < 1 s；trace 規則測試不變 |
| PERF-2 地圖產生（**DONE**，§11：128x96 22 s → 1.2 s，輸出逐 byte 相同） | 道路網主幹 Prim 為 中心點³，補空隙為 格² | 64x48 Generate 約 1.2 s；放寬地圖上限後 96x72 4.6 s、128x96 22 s | `scaling-curve.mjs` 128x96 `newgame.map` < 2 s，且同種子產生的地圖與現在逐格相同（generator seed-sweep 測試） |
| PERF-3 情境驗證／建立 session（**DONE**，§11：128x96 20 師 26.6 s → 0.47 s） | 每個棋子重建並排序整張 map index；一次 New Game 重複驗證 3～4 次 | 64x48 Start 約 3 s；20 師 128x96 達 27 s；讀檔同樣慢 | `scaling-curve.mjs` 128x96 20 師 `newgame.session` < 2 s；驗證錯誤訊息與 path 不變 |
| PERF-4 End step（**DONE**，§11：瀏覽器 64x48 最大 125 ms） | 補給階段與 Breakout 判定重複計算編隊 trace（成員²），自動跳步試算全部動作種類 | 64x48 End step 0.4～0.7 s（Trace 關），128x96 20 師 4.7 s | 64x48 每次 End step < 200 ms（瀏覽器量測），補給／Breakout 規則測試不變 |
| PERF-5 增援候選（**DONE**，§10：128x96 20 師 1.1 ms） | 每個候選格重跑完整驗證，Pax／Eq 掃全地圖 | 64x48 每次放置約 90 ms，隨兵力平方成長（20 師 128x96 1.6 s） | `scaling-curve.mjs` `reinf.candidates(all)` 在 128x96 20 師 < 100 ms |
| PERF-6 每次點擊固定成本（**DONE**，§11：Trace 關時放置最大 71 ms） | 每個 dispatch 序列化整個存檔（含靜態地圖兩份）、hash 整個 state、checkpoint 再存一次；`getView` 每次點擊 52 次深拷貝 | 64x48 約 80 ms／點擊（另加 getView 約 30 ms），128x96 約 250～400 ms | 64x48 Trace 關時放置一個增援 < 100 ms（瀏覽器量測）；存檔／讀檔／重播驗證測試不變 |

地圖上限目前是 64x48（`NEW_GAME_MAP_LIMITS`）。在 PERF-1～3 關閉前放寬上限，New Game 與 Trace Supply 會在 96x72 左右進入 5 秒級。

## 9. 證據

`docs/quality/evidence/perf-2026-10-04/`：

- `measure-scale-32x24.json`、`measure-scale-64x48-trace-on.json`、`measure-scale-64x48-trace-off.json`：UI controller 每個操作的時間與其中每個呼叫。
- `browser-*.json`：瀏覽器每次點擊的延遲與 long task。
- `scaling-curve.json`、`scaling.log`、`fit-scaling.txt`：§5 的原始資料與擬合。
- `profile-summaries.txt`：§4、§5 引用的 CPU profile 摘要（.cpuprofile 原檔太大，不提交；用 `profile-stage.mjs` 可重現）。

重現：`npm run build`，然後 `node scripts/perf/measure-scale.mjs tmp/perf 32x24 64x48`；瀏覽器 `OCS_UI_PORT=4190 node scripts/serve-ui.mjs` 後
`node scripts/perf/browser-scale.mjs tmp/browser 64x48`（`PERF_TRACE=0` 關 Trace）；放大預測需先依 §2 建立放寬上限的 dist 複本，
再 `PERF_DIST=<複本>/dist node scripts/perf/scaling-curve.mjs tmp/scaling` 與 `node scripts/perf/fit-scaling.mjs tmp/scaling/scaling-curve.json`。

## 10. 修正：Trace Supply（PERF-1）與增援候選（PERF-5）— 2026-10-04

> 產生地圖 可以慢一點 未來再改善， 但Trace Supply要先修好

依此決定，PERF-2（地圖產生）延後；先修 Trace Supply。放置增援在使用者最初的抱怨中，而它剩下的成本主要是 PERF-5，
修正方式同屬「每個 state 只算一次」，風險低，所以一併修正。規則沒有任何改變。

### 10.1 改動

| 檔案 | 改動 |
|---|---|
| `src/rules/supply/supply.ts` | 新的 trace index（每個 state、每位玩家算一次）：DRAW 覆蓋＝每個 Supply Source 的 truck draw 範圍取聯集再外擴一格（12.3c）；每個可 throw 的 HQ 記下「是否能從某來源 draw 到它所在的格」（12.3b）、throw 範圍外擴一格、以及 HQ 自己 trace 時用的 draw 範圍（延遲計算）。`traceRoutesFor`、`traceSupplyAvailableAt`、`queryTraceCoverage` 都改查這個 index，不再逐格 × 逐來源 × 逐 HQ 呼叫 `routesFrom`。`supplyPathCosts` 的 frontier 由每步整個排序改為 binary heap；敵方戰鬥單位所在格與 ZOC 判定改為每個 state、每位玩家共用一份 |
| `src/rules/terrain.ts` | `movementCostModel` 對每一步（from, to）的 TEC 計算結果做記憶；model 本身已依地圖、TEC、mobility、地面狀況快取，這些在一局中都不變 |
| `src/rules/pieces.ts` | `adjacentHexIds` 記憶每個 Hex ID 的鄰格（回傳凍結陣列） |
| `src/rules/lifecycle/lifecycle.ts` | `arrivingReinforcements`、`reinforcementHexes` 每個 state 只算一次（候選產生對每個 arrival × 格驗證時不再重算整份清單）；Pax／Eq 的「HQ 2 格內」改由每個 HQ 往外走兩圈，而非對全地圖每格量距離 |

### 10.2 規則不變的證據

- `tests/rules/trace-coverage-equivalence.test.ts`：保留舊的逐格演算法（含舊的排序式 Dijkstra）當參照，在 3 個產生的開局與 8 個「全部單位隨機散佈、每第三個 HQ 改為 Strat Mode」的局面上，
  逐一比較：每個來源 × truck／leg／tracked 的路徑成本、每個 HQ 的 throw 路徑成本、每格的 trace route、雙方「任何單位」與每個 HQ 及抽樣單位的覆蓋與 direct 覆蓋、`traceSupplyAvailableAt`。
  並斷言比較中確實出現 HQ route、無法 draw 的 HQ、未覆蓋的格，避免在過於簡單的局面上通過。第一版的「外擴一格」有漏格錯誤，就是被這個測試抓到並修正。
- `tests/rules/reinforcement-hexes-equivalence.test.ts`：Pax／Eq 的格與舊的距離掃描比較（含兩個 HQ 相鄰、靠地圖邊、旁邊有敵軍），並確認放置候選＝每個 arrival × 其可放置格。
  第一版「往外走兩圈」在兩個 HQ 相鄰時漏格，也是被這個測試抓到並修正。
- 全部測試 68 個檔案、418 個測試通過；`npm run typecheck`、`npm run smoke` 通過。

### 10.3 引擎量測（`scaling-curve.mjs`，冷快取，ms）

| 元件 | 64x48 前 → 後 | 128x96 前 → 後 | 128x96 20 師 前 → 後 |
|---|---|---|---|
| Trace 覆蓋（任何單位） | 1,908 → **16** | 13,024 → **44** | 56,582 → **54** |
| Trace 覆蓋（單一單位） | 1,689 → **14** | 14,021 → **39** | 54,836 → **52** |
| 增援候選（全部） | 155 → **0.6** | 744 → **1.3** | 1,630 → **1.1** |
| Strat 移動範圍 | 208 → **19** | 449 → **39** | 782 → **55** |
| Turn 1 最慢的一次 End step | 678 → **62** | 2,429 → **202** | 4,688 → **321** |
| Turn 1 全部 applyAction | 1,928 → **220** | 5,528 → **710** | 11,639 → **976** |

Trace 覆蓋的成長指數由 hexes^1.59 降到 hexes^0.69，兵力指數由 1.1 降到 0.4；擬合到 100 ms 的地圖約 252x189。
（修正後的原始資料與擬合：`docs/quality/evidence/perf-2026-10-04/after-fix/`。同一輪中 128x96 20 師的建立 session 由 26.6 s 量到 12.8 s，
開局會自動推進步驟並查詢 trace 與候選，可能因此一併下降；原因未另外分析，僅記錄。）

### 10.4 瀏覽器（64x48，Chromium，從可見控制項操作完整 Turn 1）

| 操作 | 修正前 Trace 開 | 修正後 Trace 開（平均／最大） | 修正後 Trace 關（平均／最大） |
|---|---|---|---|
| 放置 arrival | 1,741／1,997 | **186／203** | 149／157 |
| 選取 arrival | 1,007／1,532 | **44／89** | 42／67 |
| End step | 1,803／3,725 | **156／231** | 172／261 |
| 交接完成 | 3,471 | **183** | 153 |
| 開啟 Trace Supply | 1,406 | **136** | — |
| 地圖拖曳 300 px | 247 | 370（Trace 開）／254 | 256 |

頁面錯誤 0。覆蓋圖畫面：`after-fix/trace-overlay-64x48.jpg`（綠色 Trace from source 與 RAIL 來源標記照常繪製）。

PERF-1 驗收對照：

| 驗收條件 | 結果 |
|---|---|
| 128x96 20 師覆蓋 < 1 s | 54 ms，達標 |
| trace 規則測試不變 | 原有測試全過，另加上逐格等價測試，達標 |
| 64x48 Trace 開：選取 arrival、放置、End step 每次 < 200 ms | 平均 44／186／156 ms 達標；單次最大 89 ms 達標、**203 ms 與 231 ms 未達標** |

超出的單次最大值不是 Trace 造成的：Trace 關閉時 End step 最大 261 ms，Trace 開與關的差距只有約 40 ms。剩下的是每次點擊的固定成本
（PERF-6：存檔序列化 33 ms、state hash 17 ms、Undo checkpoint 15 ms、`getView` 多次深拷貝）與 End step 的步驟推進（PERF-4）。
依「不得在任何驗收條件未滿足時標為完成」，PERF-1 當時維持 **IN PROGRESS**。關閉方式二擇一：修 PERF-6 讓單次最大值降到 200 ms 以下，
或由使用者決定把 PERF-1 的標準改成只衡量 Trace 本身（例如 Trace 開與關的差距 < 50 ms）；在使用者決定前不改標準。
（後續：使用者選擇修 PERF-6，見 §11；PERF-1 的關閉見 §11.5。）

註：本節 §10.3 的大地圖量測與 §10.4 的瀏覽器量測，使用的 build 早於 Pax／Eq「兩個 HQ 相鄰時漏格」的修正（commit 前由
`reinforcement-hexes-equivalence.test.ts` 抓到並修正，見 §10.2）。該修正只在兩個 HQ 相距 3 格內時多出少數可放置格，不改變任何計算量，
所以不影響本節數字；§11 的量測都使用含此修正的 build。

PERF-5 驗收（`reinf.candidates(all)` 在 128x96 20 師 < 100 ms）：1.1 ms，達標。

### 10.5 修正後的瓶頸預測（取代 §5.3 的排序）

1. **Trace Supply 不再是瓶頸**：64x48 16 ms，128x96 20 師 54 ms，約線性成長。End step、Strat 移動、Breakout 判定共用同一個 index，也隨之下降約 10 倍。
2. **New Game 地圖產生仍會最先失控**（使用者已決定延後，PERF-2）：64x48 0.9 s，96x72 4.4 s，128x96 19 s，指數仍在上升（末段 2.6）。
3. **建立 session／情境驗證**（PERF-3）：64x48 1.3 s，128x96 5.3 s，128x96 20 師 12.8 s；與 棋子 × 格數 成正比。
4. **每次點擊的固定成本**（PERF-6）成為 64x48 一般操作的主要成本：存檔、hash、checkpoint 合計約 65 ms，128x96 約 240 ms；也是 §10.4 單次最大值超過 200 ms 的原因。
5. 增援候選、移動範圍、`getView`、OOB 產生、地圖繪製：都不是瓶頸。

## 11. 修正：地圖產生（PERF-2）、建立 session（PERF-3）、每次動作的存檔成本（PERF-6）、End step（PERF-4）— 2026-10-05

> 修正地圖產生跟session

> 修每次動作的存檔成本

> 修正 End step

> 第一次放置偶爾 218 ms 的原因還沒確認 -> 這個不用管了

### 11.1 改動

| 檔案 | 改動 |
|---|---|
| `src/generation/map/internal.ts` | `coordinateFor`（Hex ID → 座標）與 `hexsideBetween`（兩格之間的 Hexside ID）記憶結果 |
| `src/generation/map/roads.ts` | 主幹道樹（Prim）改為每個未接入中心點記住「最近的已接入點」，每加入一點只更新一次：中心點³ → 中心點²，平手時的取捨規則不變（比較 `node\|anchor` 字串）。補道路空隙時，新道路只從新加入的道路格往外降低距離，而不是每補一次就重算全圖距離 |
| `src/generation/map/validation.ts` | 道路空隙量測改為從所有道路格同時往外走（在無邊界的六角格上一步正好是一格距離），取代「每格 × 每個道路格」的距離計算 |
| `src/domain/map/map-index.ts` | 排序後的 Hex／Hexside 清單改為需要時才排序，且每個 Hex ID 只 parse 一次（排序結果相同） |
| `src/domain/scenario/validation.ts` | 棋子位置檢查共用同一個 map index，不再每個棋子重建一次 |
| `src/rules/kernel/snapshot.ts` | `serializeGameState` 對同一個（不可變的）state 只序列化一次；每個動作的 hash、自動存檔、下一個 Undo checkpoint 共用 |
| `src/gameplay/persistence.ts` | 存檔文字：先把各 snapshot 換成唯一的佔位字串再編碼信封，再把快取的 snapshot JSON 放回原位；結果與 `canonicalJson(envelope)` 逐字相同，任何佔位字串不是恰好出現一次就退回原本的編碼。快取最近 64 份 snapshot JSON |
| `src/ui/controller.ts` | 玩家視角（`getView`：projection＋深拷貝）在同一 revision、lifecycle、座位、交接狀態內只算一次（原本一次點擊 50～80 次） |
| `src/rules/supply/supply.ts` | 補給路徑、Supply Source、trace index、單位 trace route、編隊 route 選項的快取，改以它們實際讀取的部分（棋子、map state、天氣、scenario、configuration）為鍵，而不是整個 state：一次 End step 會經過好幾個只改變 sequence 的 state，原本每個都從頭算 |

規則、存檔格式、state hash、產生器輸出都沒有改變。

### 11.2 結果不變的證據

- `scripts/perf/compare-generation.mjs`：同一個請求在修正前（commit `8cb7d52` 的 build）與修正後產生的整個 New Game 內容
  （地圖、OOB、部署、scenario）取 SHA-256 比較：16x12～64x48 與 24x40，三種地圖風格，每種 2 個種子，**42/42 相同**；
  80x60、96x72、128x96 三種風格（放寬上限的量測複本）**9/9 相同**（`after-gen-save-endstep/compare-generation-*.log`）。
- `tests/gameplay/save-serialization.test.ts`：存檔快速路徑的文字與 `canonicalJson(envelope)` 逐字相同（含 checkpoint 標籤帶引號、
  反斜線、`\u0000`、以及長得像佔位字串的文字），且能讀回。
- 全部測試 69 個檔案、419 個測試通過（包含 §10 的 trace 與增援等價測試）；`npm run typecheck`、`npm run smoke` 通過。

### 11.3 引擎量測（`scaling-curve.mjs`；「冷」＝新的 state 與新的棋子集合，正如每個動作之後）

`scaling-curve.mjs` 的冷快取複製在此一併修正：原本只淺拷貝 state，而 trace 快取現在以棋子集合為鍵，淺拷貝會誤命中快取；
現在也複製棋子集合，並新增「冷序列化」與「冷 hash」兩列。

| 元件 | 64x48 前 → 後 | 128x96 前 → 後 | 128x96 20 師 前 → 後 |
|---|---|---|---|
| New Game：地圖產生 | 1,161 → **219** | 21,969 → **1,218** | 27,572 → **1,399** |
| New Game：建立 session | 1,443 → **119** | 5,639 → **373** | 26,621 → **465** |
| New Game：package 驗證 | 616 → **8** | 1,981 → **30** | 10,290 → **43** |
| Turn 1 最慢的一次 End step（applyAction） | 678 → **35** | 2,429 → **148** | 4,688 → **192** |
| Turn 1 全部 applyAction | 1,928 → **90** | 5,528 → **259** | 11,639 → **464** |
| 每個動作的存檔：hash＋存檔＋Undo checkpoint | 24＋45＋20 → **13**＋0.1＋0 | 79＋120＋54 → **56**＋0.1＋0 | 127＋166＋103 → **64**＋0.1＋0 |

（「前」為 §5.1 的修正前量測。每個動作後只剩一次冷序列化加 SHA-256，存檔與 checkpoint 重用同一份文字。）

存檔原本隨 Undo 堆疊變大：64x48 存檔在 0／30 個 checkpoint 時 33／77 ms、1.3／20.7 MB，每個動作都要重寫一次；修正後每次約 0.1 ms
（`measure-save-before.txt`／`measure-save-after.txt`；修正後的數字是同一 state 重複呼叫，實際每個動作的成本見下面的 controller 量測）。

UI controller 實際流程（`measure-scale.mjs`，64x48，Trace 開，`PERF_MOVES=20` 讓玩家移動單位、Undo 堆疊增長）：
移動確認 140～205 ms → **平均 64、最大 82 ms**；放置增援平均 45、最大 57 ms；End step 平均 51、最大 58 ms；每個動作的存檔約 2 ms
（`measure-scale-64x48-moves.json`）。

### 11.4 瀏覽器（Chromium，從可見控制項操作 New Game 與完整 Turn 1）

64x48（產品 build），單位 ms：

| 操作 | 本報告開始時（Trace 開） | 修正後 Trace 開（平均／最大） | 修正後 Trace 關（平均／最大） |
|---|---|---|---|
| New Game：Generate preview | 1,805 | **1,083** | 1,097 |
| New Game：Start | 2,915 | **1,074** | 1,102 |
| 放置增援 | 1,741 | **86／218** | 29／71 |
| 選取增援 | 1,007 | **27／30** | 29／48 |
| End step | 1,803 | **83／125** | 93／138 |
| 交接完成 | 3,471 | **186** | 136 |
| 開啟 Trace Supply | 1,406 | **103** | — |

頁面錯誤 0。128x96（放寬上限的量測複本，PERF-2／3 修正後、PERF-6／4 修正前的 build）：Generate preview 18,871 → **4,053**、
Start 22,982 → **4,549**、頁面錯誤 0（`browser-128x96-trace-once.json`）。

### 11.5 驗收對照（§8）

| TODO | 驗收條件 | 結果 |
|---|---|---|
| PERF-2 | 128x96 `newgame.map` < 2 s；同種子產生的地圖相同 | 1.2 s；整個 New Game 內容 51/51 相同。**DONE** |
| PERF-3 | 128x96 20 師 `newgame.session` < 2 s；驗證錯誤訊息與 path 不變 | 0.47 s；只改為共用同一個 map index，驗證測試全過。**DONE** |
| PERF-4 | 64x48 每次 End step < 200 ms（瀏覽器）；補給／Breakout 規則測試不變 | 最大 125 ms（Trace 開）／138 ms（Trace 關）；規則測試全過。**DONE** |
| PERF-6 | 64x48 Trace 關時放置一個增援 < 100 ms（瀏覽器）；存檔／讀檔／重播驗證測試不變 | 最大 71 ms；測試全過，存檔文字逐字相同。**DONE** |
| PERF-1 | 64x48 Trace 開：選取、放置、End step 每次 < 200 ms；128x96 20 師覆蓋 < 1 s；trace 規則不變 | 選取最大 30、End step 最大 125；覆蓋 59 ms；等價測試通過。放置 8 次中 7 次 ≤ 82 ms，**遊戲第一次放置 218 ms**（其中主執行緒 long task 只有 56 ms）。這個值出現在量測腳本於放置前先截圖（`PERF_SHOT=1`）的執行中；不截圖重跑時同一次放置為 80 ms（`browser-64x48-trace-on-no-screenshot.json`），原因未確認。使用者 2026-10-05：「這個不用管了」。依使用者決定 **DONE** |

### 11.6 全部修正後的瓶頸預測（`after-gen-save-endstep/fit-scaling.txt`）

- 引擎各項在約 120x91 以前都不到 1 秒：Trace 覆蓋到 100 ms 約在 253x190，每個動作的冷 hash 到 100 ms 約在 214x160，
  End step 到 1 s 約在 448x336。
- **下一個限制在 New Game 畫面**：預覽 SVG 字串 64x48 237 ms、128x96 1.5 s（成長指數 1.2～1.6，另加瀏覽器建立 DOM），
  地圖產生 128x96 1.2 s（約 122x91 到 1 s），theater model 128x96 0.4 s。瀏覽器實測 128x96 Generate 4.1 s、Start 4.5 s。
- 產品目前上限 64x48，New Game 的 Generate 與 Start 各約 1.1 s，不是阻擋問題。

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 |
|---|---|---|---|
| PERF-7 New Game 預覽與開始（**TODO**，僅在放寬地圖上限時需要） | 預覽 SVG 以整張地圖字串建立，地圖產生與 theater model 隨地圖約線性以上成長 | 64x48 各約 1.1 s；若放寬到 128x96，Generate 約 4 s、Start 約 4.5 s | 放寬上限前：`browser-scale.mjs` 128x96 Generate preview 與 Start 各 < 2 s，且 `compare-generation.mjs` 輸出不變 |

本節證據：`docs/quality/evidence/perf-2026-10-04/after-gen-save-endstep/`。
