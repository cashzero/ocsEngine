# TODO 盤點（2026-10-04）

狀態：**盤點紀錄**。本文件只彙整並指向各處既有的 TODO，不新增、不關閉任何 TODO，也不提升任何
`docs/quality/03-product-operation-verification-plan.md` 列的狀態。每項 TODO 的缺少行為、使用者可見影響與關閉證據
以其原始文件為準。基準：`main` @ `6745ecd`；2026-10-04 rebase 到 `ca555b4`（#56 鐵路、#57 Pax/Eq 補充）後更新數字與已關閉項；
2026-10-05 再同步到 `f0d453b`（#59 鐵路沿道路偏移、#60 道路／鐵路畫出地圖邊、#61 Eastern Europe 主題、#62 第 1 回合不到達、
#63 目標點改放城鎮）。2026-10-14 再同步到 `origin/main` `e56a681`（整疊移動／overrun、Variable Replacement／Rebuild Table 與單位合併、
海域側翼＋各方 Sea Cap、VP 配置修正、AI VP 啟發式升級）；本次同步的變動集中在 §7。

## 1. 產品驗收矩陣（doc 03）

2026-10-14 重算（腳本逐列讀 doc 03 的狀態欄，共 134 列；以列首狀態字為準，狀態欄內的但書另列）：

| 狀態 | 列數 | 列 |
|---|---|---|
| PASS | 84 | BOOT-01、NG-01~06、NG-08、NG-09、NG-13、NG-14、MAP-01、MAP-02、MAP-05、CTR-01~04、CTR-07、ACT-01~04、ACT-07~17、AIR-01~03、AIR-06~15（AIR-04、AIR-05 除外）、SUP-A01~09、SUP-A11~15、RAIL-01~04、RAIL-11~14、RAIL-17、REPL-01、REPL-03~12、AEP-01~03。其中 REPL-03、04、06、08、10、11 只在載入的測試／訓練局面通過，從新局自然損失到重建仍 UNVERIFIED；AIR-08、ACT-11、ACT-12 是 2026-10-14 依使用者決定改寫驗收敘述後，以 2026-10-03／04 既有證據判 PASS |
| FAIL | 1 | NG-10（程式碼看起來已被兩頁式 New Game 修好，待瀏覽器重跑） |
| BLOCKED | 0 | ACT-11、ACT-12 已改寫為現行行為並 PASS |
| 部分 | 3 | AIR-04（Mission Loss 未觀察到）、AIR-05（Hip Shoot BLOCKED）、SUP-A10（檔案路徑依使用者決定移出 scope） |
| IN PROGRESS | 7 | NG-11（2026-10-14 重開）、MAP-03（2026-10-14 鍵盤選疊堆已改為開堆疊清單，待瀏覽器重跑；run-map.mjs 仍預期第 1 回合到達，需先更新）、MAP-04（2026-10-14 依使用者決定補給堆不算單位，單位數已排除補給堆，單元測試通過，待瀏覽器重跑）、MAP-07、MAP-08、MAP-09（海域新形式重開）、ACT-05a（第 2 回合到達尚未在瀏覽器操作） |
| UNVERIFIED | 39 | NG-07（2026-10-14 改寫：去掉凍結的部署格數，改用現有風格，待瀏覽器重跑）、NG-12（AEP 重開）、MAP-06、CTR-05、CTR-06、CTR-08、ACT-05、ACT-06、SES-01~09、UI-01~05、SUP-B01~08（Phase B 未實作）、RAIL-05~10、RAIL-15、RAIL-16、REPL-02 |

合計 84 + 1 + 0 + 3 + 7 + 39 = 134。2026-10-04 的舊數字（63／5／2／3／1／35）已被取代。

因此 M8 Generated game flow 與 U10 Operable UI 維持 `IN PROGRESS`（`01-delivery-status-and-todo-policy.md`）。

## 2. 規則 manifest（`src/rules/manifest.ts`）

28 列（2026-10-09 依 main `84d9fea` 重新核對；2026-10-10 依 main `1b4e4d7` 再核對：`engineering.bridging` 已實作，港口與海運把 `movement.sea` 改為 PARTIAL；同日依 `137e42e` 重新盤點，修正下面過時的缺口文字）：11 `IMPLEMENTED`、14 `PARTIAL`、2 `DEFERRED`、1 `GAME_SPECIFIC`。
各列缺口以 manifest 的 `GAP:` 文字為準，下面只列摘要。

- DEFERRED（完全未實作，呼叫回 `UNSUPPORTED_RULE_FEATURE`）：
  - `naval-shipping`（18.0）：艦艇、登陸艇、兩棲登陸與灘頭突擊。
  - `optional-rules`（21.1–21.12）：含 Big Hogs 與刺蝟佔領降級（21.11a/c）。
- PARTIAL（可用，但有已知缺口）：
  - `sequence.ground-turn`、`lifecycle.ground`、`replacements-rebuilds`、`air.replacements-and-reinforcements`：
    沒有 Variable Reinforcement Table。2026-10-14 起 Pax／Eq 由產生器的 Variable Replacement Table 擲骰、依產生器的 Rebuild Table 計價
    （含 13.5d 成對重建），地面 Unit Consolidation（13.9-1～3）已實作；兩張表都不是印刷版（TODO(repl-tables-generated)），
    機器人不會合併單位（TODO(consolidation-bot)），合併與計價只在測試局面上走過瀏覽器（TODO(repl-natural-loss-ui)）：
    `docs/reports/replacement-tables-2026-10-14.md` §6。Repl 自 2026-10-13 起為戰鬥單位（`replacement-movement-2026-10-13.md`）。
  - `movement.ground`：整疊移動（6.1f）與整疊 overrun 已實作（2026-10-14，doc 03 ACT-16／ACT-17）。TODO：AI 仍逐一移動與 overrun（缺：bot 不會整疊行動；影響：bot 的 overrun 戰力偏弱；驗收：bot 對局中出現 companionIds 的 MOVE_PIECE 與多單位 overrun）。TODO：overrun 結果顯示後選取被放開，玩家須再點堆疊才能續動（驗收：結果後仍選取存活的移動堆疊並可直接點目的地）。
  - `movement.sea`（19.0、9.14h）：港口容量、損壞／自毀／修復、佔領、Supply Source 與 Sea Cap 海運已實作；命中後容量依圖表第 4 頁 Port Damage 表為 80／60／40／20%（2026-10-10 轉錄並修正，原本每次扣 1/4）；砲兵仍不能轟擊港口（Facility Table 砲兵成本已轉錄，但 DECLARE_BARRAGE 沒有設施目標）。
  - `supply.trace-and-draw`：12.6f 編制追蹤由引擎挑涵蓋最多成員的路線，玩家不能選。
  - `supply.rail-trace`：單一軌距，無 Railhead／Wrong Gauge／改軌／Rail Repair（13.3d、13.3f、13.3g）。（產生的港口一律位於 village／town／city，在鐵路上時即以該聚落成為可下車格，13.3c，不是缺口。）
  - `movement.rail-cap`：卡車先花 MP 載運的 SP 仍可再上火車（12.2a 每批 SP 只能用一種運輸）。
  - `supply.rail-front-control`：13.3h「明確位於敵方前線後方」沒有印出的演算法，現行判定為專案自訂
    （`docs/roadmap/15-rail-cap-wbs.md` §1）；目標點仍只在進入時易手；無 Rail Cap 的遊戲維持只在進入時易手。
  - `barrage.artillery`：地面砲兵不會用 Barrage vs Facility Table（該表的砲兵補給成本已轉錄，但 DECLARE_BARRAGE 沒有設施目標，港口與 Air Base 只由飛機轟炸；刺蝟不可被砲擊）。
  - `air.bases-and-refit`：Air Strip 固定允許；建造補給只能來自補給範圍到得了的 dump（15.0d 的解讀）；BTR 泥濘／雪地 refit 減半未套用。
  - `air.missions`：Flight Conditions 不擲，天氣不限制任務；沒有空軍可 Hip Shoot；沒有艦艇 Flak（以上為使用者指示不做的遊戲專屬規則或海軍範圍）。
  - `air.transport-and-drop`：沒有獨立 Glider Points（14.10f）；空投成功表的 ETO 8/44 前與蘇軍 -1 修正未套用；TODO para-gpid、transport-art。
- IMPLEMENTED：`weather`（但 Flight Conditions 見 `air.missions`）、`mode.transition`、`stacking.ground`、`zoc.purpose`、`supply.fuel`、
  `transport.trucks`、`combat.ground`、`overrun.ground`、`breakdowns`、`hedgehogs`（2026-10-08，`docs/roadmap/14-hedgehogs-wbs.md`）、
  `engineering.bridging`（2026-10-10，`docs/roadmap/16-bridging-wbs.md`，NG-14 PASS）。
- GAME_SPECIFIC：`victory.game-table`（通用回合／目標點計分，劇本 VP 表為資料）。
- 自 2026-10-04 盤點後的變動：`movement.rail-sea-air` 拆為 `movement.rail-cap`（PARTIAL）與 `movement.sea`（DEFERRED）；
  新增 `supply.rail-front-control`（PARTIAL）、`hedgehogs`（IMPLEMENTED）；`hedgehogs-engineering` 改為只剩 `engineering.bridging`。
  2026-10-10：`engineering.bridging` 改為 IMPLEMENTED；`movement.sea` 改為 PARTIAL（港口與 Sea Cap）；`naval-shipping` 縮為 18.0。
  港口與海運的 UI 驗收 MAP-07、MAP-08、MAP-09 仍 IN PROGRESS（doc 03）；2026-10-13 起 New Game 海域改為側翼海＋各方 Sea Cap 與 inland entry，登陸方的平衡為 TODO（§5 第 8 項）。
- 規則落差分析仍開啟：TODO-R1（逐條登記 §1–21，未登記的規則可能存在）、R9（整疊移動／連續 overrun：規則與 UI 已實作並於瀏覽器驗收 ACT-16／ACT-17，2026-10-14；尚餘 AI 不會整疊行動）、
  R11（程式已保留分數 MA，`src/rules/pieces.ts` 6.1h，但沒有關閉證據要求的分數 MA 測試）、R14（未實作系統）；
  其餘 R 項程式已實作、待實機驗證（`docs/study/09-rules-vs-plan-gap-analysis.md` §4）。
- 程式內與規則相關的 TODO：bot 的空中決策一律選第一個合法選項（`src/ai/decisions.ts`，bot-air）。

## 3. 各子計畫的開放 TODO

| 範圍 | 文件 | 開放項 |
|---|---|---|
| 補給 | `docs/roadmap/09-supply-logistics-ux-wbs.md` | Phase A PASS（縮減範圍）；Phase B 未開始；TODO-S1～S5；B3、B4 待確認；A3c、A3d、A4a、A6e |
| 空軍 | `docs/reports/M11-air-power.md` §5、§6.3；`docs/roadmap/08-air-power-wbs.md` §1.4 | AIR-08 FAIL；Mission Loss 未觀察；「每段都停下」與空戰交接次數待使用者決定；revision 只在 Game End 顯示；稽核探針無空軍檢查；BTR 專屬規則不實作；Glider Points |
| 存檔／生命週期 | `docs/reports/ocs-rebuild-2026-10-01.md` §7 | 重新整理失去遊戲（SES-09）；只能讀回同一劇本 |
| UI | `docs/reports/canvas-map-rewrite-2026-10-02.md`、`docs/ui/11-desktop-command-deck-design.md` §6、`docs/reports/ui-flow-review-2026-10-01.md`、`docs/reports/desktop-command-deck-verification.md`、`docs/reports/counter-lod-verification.md` | TODO-CM1（`scripts/counter-lod-gate.mjs` 與 `scripts/desktop-deck-gate.mjs` 無法在現行 UI 執行）；TODO-CM2 報讀器；D4 守方單一表單；D6 敵 ZOC 標示；參戰單位編輯器；鍵盤／報讀器稽核；LOD 三級整合驗證；S0–S5 截圖 |
| Counter | `docs/quality/04-counter-fidelity-correction-plan.md`、`docs/ui/04-counter-and-stack-inspection.md` | counter 視覺驗收 IN PROGRESS |
| 地圖 | `docs/ui/12-map-appearance.md`、`docs/generator/10-btr-scale-density.md` | 鐵路已於 #56 完成（Rail Cap 運輸仍缺）；Autobahn、地名僅裝飾、一格一地形、並行道路、覆蓋填補耗時、新外觀未重跑整合驗收；#60 新增：地圖資料不記錄產生器的道路出口，出口格另有道路經過時不畫出地圖邊（24 張 32×24 圖中 189 個出口有 13 個） |
| 地圖主題 | `docs/generator/11-eastern-europe-theme.md` §Not in scope / TODO | #61 新增：預設 32×24 東歐圖鐵路只比 BtR 少約三分之一（每個入口格都必須是鐵路格；需使用者決定入口數或入口補給規則）；Case Blue 地形與天氣（Hills、輕／重林、乾湖、草原、Volga 級河流、泥濘／冰凍）仍用 BtR 規則，需另立需求 |
| 目標點 | `docs/game-flow/03-deployment-generator.md` 步驟 7 | #63 新增：最小的 16×12 東歐圖雙方起始 VP 可能不相等（預覽顯示 "Objectives are unbalanced"）；關閉證據為 seeds 1、0x0c500001、777 的 16×12 東歐預覽皆等 VP 且無警告 |
| 到達時程 | `docs/quality/evidence/turn1-arrivals-2026-10-04/README.md` | #62 新增：第 2 回合的到達（延後單位、SP、Pax/Eq）未在瀏覽器操作，綁 ACT-05a、ACT-05、REPL-02、MAP-06 |
| OOB 命名 | `docs/reports/random-oob-naming.md` | UI 驗收 UNVERIFIED |
| Breakdowns | `docs/reports/breakdowns-2026-10-03.md` | 無開放 TODO；提議的驗收列待使用者核准 |
| 效能（大地圖） | `docs/reports/large-map-performance-2026-10-04.md` §8、§10、§11 | PERF-1～6 皆 DONE（2026-10-05；PERF-1 的遊戲第一次放置單次 218 ms 由使用者決定不追究）。開放：PERF-7 New Game 預覽與開始，僅在放寬 64x48 地圖上限時需要（128x96 Generate 約 4 s、Start 約 4.5 s） |

## 4. 程式碼內的 TODO

- `src/generation/oob/catalog.ts` TODO(airborne-gpid)：空降師使用佔位 GPID 900001–900005。
- `src/generation/oob/counter-corpus.ts` TODO(para-gpid)：傘兵營 counter 為產生器自訂。
- `src/ui/counter.ts` TODO(transport-art)：運輸機輪廓為目測繪製。
- `scripts/import-oob-names.mjs`：重新匯入後需補回手寫的 Fallschirmjäger 與美軍第 13 空降師 profile。

## 5. 待使用者決定

1. 空中任務「每段都停下」與空戰交接次數。
2. 補給 B3（付費來源偏好）、B4（定期補給線）。
3. Breakdowns 提議的 doc 03 驗收列。
4. ~~整疊移動（6.1f）是否解除暫緩~~：使用者於 2026-10-14 要求實作，已解除。
5. ~~NG-07 的凍結期望~~：使用者於 2026-10-14 指出部署格數不該是驗收項，已改寫（doc 03 NG-07）。
6. ~~ACT-11／ACT-12 是否改寫為現行行為~~：使用者於 2026-10-14 同意，已改寫並 PASS（O-7）；SES-01 Pause 在產品中已移除，是否改寫該列（O-8）仍待決定。

7. 東歐主題的入口格數，或入口格不在鐵路上時的補給源規則（決定後才能讓預設東歐圖的鐵路降到 Temperate 的一半以下）。

8. 海上登陸平衡（2026-10-14 使用者改列 TODO）：沒有 inland entry 的一方只有一個 2 SP 港口時（實測只能上岸 8T／相位，補給表收入約 36T），敵方兵力要調降，或部分師改為援軍從 Turn 2 經其 inland entry 進場；比例固定（一半）或依上岸容量縮放、是否對稱適用、是否在設定中顯示可覆寫，待決定。細節與結案證據見 `docs/generator/03-coast-and-hydrology.md` TODO (sea-landing balance)。

## 5a. 2026-10-04 驗收發現的未關閉問題

見 doc 03「Execution record 2026-10-04」O-1～O-8：NG-10 階段同時 active、MAP-03 鍵盤無堆疊清單、MAP-04 單位數不一致、
頂部列「X to act」與左欄交接對象相反、戰後提示「vacant」但仍有敵方 Truck，以及上面三項待決定事項。
剩餘未執行：SES-01~09、UI-01~05、CTR-08 的 1680×1050 重跑、CTR-05／CTR-06 的補證、ACT-06；#62 之後再加上
第 2 回合到達的重跑（ACT-05a、ACT-05、REPL-02、MAP-06 的到達部分）。

## 5b. 有限制但尚未登記為 TODO（2026-10-05 盤點發現）

- 已解決（2026-10-05）：`docs/quality/evidence/objectives-2026-10-04/RUN.md` 記錄的「滑鼠停在目標格只顯示 VP、
  不顯示由誰控制」。現在目標格一律顯示持有者標記與 VP，滑鼠提示寫出持有者，頂部列顯示雙方目前 VP
  （參考 bcsEngine；證據見 §5c）。一般格子（非鐵路、非目標）的控制權仍不在地圖上標示。

## 5c. 2026-10-05 控制權與 VP 顯示（使用者要求）

- 已實作並在瀏覽器驗證（`docs/quality/evidence/control-2026-10-05/RUN.md`，CTL-1～5 PASS，0 console error）：
  只有戰鬥單位改變控制權（13.3h）；產生劇本依兩軍前線設定初始控制，中間為中立格（鐵路、目標點一併）；
  目標點開局控制跟隨同一規則（使用者選 A，開局 VP 可不相等）；Trace Supply 開啟時鐵路格依控制權著色；
  目標格標記持有者（白星／黑十字／金菱形）與 VP，頂部列即時 VP。
- CTL-1～5 是 agent 定義的檢查，尚未列入 doc 03；是否新增為 doc 03 驗收列待使用者核准。
- 同一次執行在瀏覽器放置了 Game Turn 2 的 4 個到達單位，但沒有逐一核對是延後單位、SP 與 Pax/Eq，
  ACT-05a 仍維持 IN PROGRESS。
- 仍開啟：TODO rail-front-control（13.3h「明確」位於敵方前線後方的控制變化未自動判定）。
  2026-10-09 補註：已由 `supply.rail-front-control`（PARTIAL）實作專案自訂的判定，僅限有 Rail Cap 的遊戲；缺口見 §2。
- 觀察（非阻擋）：New Game 預覽的目標仍是舊的金星、不顯示持有者；60% 縮放時十字標記偏小；
  己方鐵路綠帶疊在淺綠補給範圍上對比較弱。

## 6. 本次盤點同步修正的文件

- `docs/roadmap.md`：M11-Air 由 `PLANNED` 改為 `IN PROGRESS`（與 WBS 一致）。
- `docs/roadmap/09-supply-logistics-ux-wbs.md`：TODO-A6c 補註已被 2026-10-02 驗收證據取代的部分。
- `docs/reports/ocs-rebuild-2026-10-01.md`：存讀檔 TODO 補註 AIR-09 已驗證的範圍與仍開啟的缺口。
- `docs/reports/M11-air-power.md` §5：標出已於瀏覽器通過的項目。
- `docs/study/09-rules-vs-plan-gap-analysis.md` §4：補 2026-10-04 manifest 分布與 R14 現況。

## 7. 2026-10-14 同步（`e56a681`）

盤點方式：讀 doc 03 的列、`src/`／`scripts/` 的 TODO 註解、各報告的 TODO 段落與 `git log f0d453b..e56a681`。

### 7.1 doc 03 自 2026-10-05 起的狀態變動（逐列引用，未重新統計 §1 的總數）

- PASS：ACT-16、ACT-17（整疊移動／overrun，2026-10-14）；NG-13（hedgehog）、NG-14（架橋）；RAIL-11～14、RAIL-17；
  REPL-07（新局第 2 回合 Pax 移動）、REPL-09、REPL-12；REPL-08、REPL-10、REPL-11 只在載入的訓練局面通過。
- IN PROGRESS：NG-11（2026-10-14 重開：VP 配置、攻方初始佔領、勝利門檻已改；只有 Allied attack 28×20 重跑，Meeting Engagement 與
  Axis Attack 尚未重跑）；MAP-07、MAP-08、MAP-09（海域改為側翼海＋各方 Sea Cap／inland entry 後重開，缺：另兩種情境、佔港、港口修復、
  空襲港口、Turn 2 走完）。
- UNVERIFIED：NG-12（AEP 發射限制改變出擊流程）；MAP-06、REPL-02（第 2 回合到達）；RAIL-10、RAIL-15、RAIL-16。
- 總數：§1 已於 2026-10-14 重算並依使用者決定（MAP-04、AIR-08、ACT-11、ACT-12）更新（134 列：PASS 84、FAIL 1、BLOCKED 0、部分 3、IN PROGRESS 7、UNVERIFIED 39，相加 134）。

### 7.2 規則 manifest

2026-10-14 逐列重算：共 28 列（`entry` 25、`deferred` 2、`GAME_SPECIFIC` 1）；`IMPLEMENTED` 11、`PARTIAL` 14、`DEFERRED` 2、`GAME_SPECIFIC` 1，
與 §2 相同，列數沒有變動。內容變動已寫進 §2：`movement.ground` 整疊移動／overrun 已實作、
`replacements-rebuilds` 的 Variable Replacement／Rebuild Table 與單位合併已實作但表非印刷版。

### 7.3 新增或確認仍開啟的 TODO

| TODO | 缺少的行為 | 使用者可見影響 | 關閉證據 | 來源 |
|---|---|---|---|---|
| `repl-tables-generated` | 兩張表是產生器自訂，不是印刷版 | 補充與重建成本與原版遊戲不同 | 轉錄印刷表並以測試與瀏覽器核對 | `docs/reports/replacement-tables-2026-10-14.md` §6 |
| `consolidation-bot` | bot 不會合併單位 | bot 方留著兩個減員的相同師 | bot 對局中出現合併動作 | 同上 |
| `repl-natural-loss-ui` | 重建與合併只在載入的訓練局面走過 | 新局自然損失後的流程未驗證 | 新局、自然戰損、移動補充、重建／合併並走完該回合 | 同上；`replacement-movement-2026-10-13.md` |
| `repl-legacy-unit-migration` | 舊存檔的 REPLACEMENT 沒有 faces，維持舊的數量 counter | 舊存檔的補充單位不能移動，需開新局 | 保留歷史動作的存檔遷移，並實際讀舊檔、移動、重建、存檔、重播 | `replacement-movement-2026-10-13.md` |
| `pax-counter-art` | Pax counter 圖樣未完成 | counter 外觀不是最終版 | 見 `replacement-tables-2026-10-14.md` §6 | 同上 |
| `bot-stack-move` | AI 逐一移動與 overrun，不整疊行動（`candidates.ts` TODO(AI)） | bot 的 overrun 戰力偏弱 | bot 對局出現 companionIds 的 MOVE_PIECE 與多單位 overrun | `src/rules/query/candidates.ts`、manifest `movement.ground` |
| `overrun-selection-release` | overrun 結果顯示後選取被放開 | 玩家須再點堆疊才能續動 | 結果後仍選取存活的移動堆疊並可直接點目的地 | doc 03 ACT-17 |
| `bot-ration-search` | 配給有界搜尋可能漏掉可行的低優先消耗者 | bot 偶發不必要的餓死 | 見 `src/rules/supply/ration-budget.ts:89` 的關閉條件 | `src/rules/supply/ration-budget.ts` |
| `bot-air` | 空中決策一律選第一個合法選項 | 開啟空軍時 bot 不會主動用空軍 | bot 對局中出現合理的任務與 refit | `src/ai/decisions.ts`、`11-ai-bot-wbs.md` §3 |
| `GS-AI` | 完整對局的可救援餓死尚未逐一消除或解釋 | 阻擋 AI 驗收 | 逐一解釋或修正並重跑對局 | `docs/reports/garrison-supply-2026-10-13.md` |
| AI VP 計畫 TODO | 後方重建啟用時機只用剩餘回合門檻；動作後 trace 修正只看前 12 個候選；advance 預估不含首次進入有敵方 transport；Overrun 評分不估計強制進駐後的供補風險 | 全體 AI／logistics 不宣告完成 | 各項見 `docs/reports/ai-vp-promotion-2026-10-13.md` 內的 TODO 段 | 同左 |
| `bot-eastern-front`、`bot-offensive-axis` | 東歐 32/40 = 80%（目標 90%）；攻堅缺補給支撐的主攻方向 | B5 維持 IN PROGRESS | `docs/roadmap/11-ai-bot-wbs.md` §3 | 同左 |
| 登陸港初始視角 | 海域局開局地圖置中，登陸港在畫面外 | 玩家要自己找港口 | 開 ports-only 遊戲並直接經可見的地圖／導覽找到港口 | `evidence/vp-allocation-2026-10-14/README.md` |
| 小地圖視覺驗收 | 小地圖的視覺驗收仍未做 | NG-11 無法升級 | 見 `docs/game-flow/03-deployment-generator.md` | 同左 |
| 砲兵打港口 | `DECLARE_BARRAGE` 沒有設施目標 | 只有飛機與持有者自己的單位能損壞港口 | 給設施目標並付表列成本，實際打一次港口 | `docs/generator/03-coast-and-hydrology.md` |
| 海上登陸平衡 | 無 inland entry 的一方受登陸容量限制，敵方兵力不調整 | 登陸方缺補給，遊戲失衡 | 見 §5 第 8 項 | 同左 |
| 艦艇（18.0） | 無艦艇、登陸艇、兩棲登陸 | 只能在已持有的港口登陸 | 18.0 實作並實際對局 | 同左；manifest `naval-shipping` |
| `unit-status-reserve` | Unit Status 沒有「released」與「barraged」列（投影未提供引擎使用狀態） | 這兩種狀態看不到 | 投影暴露後加列並在瀏覽器驗證 | `src/ui/unit-status.ts:48` |

### 7.4 本次盤點沒有發現可關閉的 TODO

沒有任何 TODO 在本次同步中被關閉；§5 第 4 項（整疊移動）早已解除，ACT-16／ACT-17 的 PASS 只涵蓋玩家端，AI 端仍開。
