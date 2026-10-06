# TODO 盤點（2026-10-04）

狀態：**盤點紀錄**。本文件只彙整並指向各處既有的 TODO，不新增、不關閉任何 TODO，也不提升任何
`docs/quality/03-product-operation-verification-plan.md` 列的狀態。每項 TODO 的缺少行為、使用者可見影響與關閉證據
以其原始文件為準。基準：`main` @ `6745ecd`；2026-10-04 rebase 到 `ca555b4`（#56 鐵路、#57 Pax/Eq 補充）後更新數字與已關閉項；
2026-10-05 再同步到 `f0d453b`（#59 鐵路沿道路偏移、#60 道路／鐵路畫出地圖邊、#61 Eastern Europe 主題、#62 第 1 回合不到達、
#63 目標點改放城鎮）。

## 1. 產品驗收矩陣（doc 03）

2026-10-04 依使用者指示在瀏覽器實際操作 §A、§B、§B1、§C（紀錄見 doc 03「Execution record 2026-10-04」，證據在
`docs/quality/evidence/product-2026-10-04/`）。更新後：

| 狀態 | 列數 | 列 |
|---|---|---|
| PASS | 63 | AIR 與 SUP-A 大部分列；2026-10-04 新增 BOOT-01、NG-01~06、NG-08、NG-09、MAP-01、MAP-02、MAP-05、CTR-01~04、CTR-07、ACT-01~04、ACT-07~10、ACT-13~15；main 同日新增的 RAIL-01~04、REPL-01、REPL-03~06（REPL-03~06 在測試局面上通過） |
| FAIL | 5 | NG-07（部署 40 格，凍結期望 38）、NG-10（產生中三個階段同時 active）、MAP-03（鍵盤啟動疊堆不開堆疊清單）、MAP-04（64 units 與名冊 28+28 差 8 個補給堆，畫面無說明）、AIR-08 |
| BLOCKED | 2 | ACT-11、ACT-12（COMMIT／CANCEL_TRANSACTION 沒有玩家可操作的控制項） |
| 部分 | 3 | AIR-04（Mission Loss 未觀察到）、AIR-05（Hip Shoot BLOCKED）、SUP-A10（檔案路徑依使用者決定移出 scope） |
| IN PROGRESS | 1 | ACT-05a（#62 新增：第 1 回合開在 Movement 已在瀏覽器觀察；第 2 回合的到達尚未在瀏覽器操作） |
| UNVERIFIED | 35 | CTR-05、CTR-06、CTR-08（證據不完整）、ACT-06（未到達需要 CHECK_SUPPLY 的狀態）、SES-01~09、UI-01~05（尚未執行）、SUP-B01~08（Phase B 未實作）、RAIL-05~10（只有自動測試）；#62 重開的 ACT-05、REPL-02、MAP-06（先前 PASS 證據放置的是第 1 回合的到達，現在第 1 回合不再有到達，需在第 2 回合重跑） |

因此 M8 Generated game flow 與 U10 Operable UI 維持 `IN PROGRESS`（`01-delivery-status-and-todo-policy.md`）。

## 2. 規則 manifest（`src/rules/manifest.ts`）

25 列（rebase 到 main `ca555b4` 後；到 `f0d453b` 無變動）：9 `IMPLEMENTED`、11 `PARTIAL`、4 `DEFERRED`、1 `GAME_SPECIFIC`。

- PARTIAL：`sequence.ground-turn`、`lifecycle.ground`（沒有 Variable Reinforcement Table）、
  `movement.ground`（整疊移動 6.1f，使用者暫緩）、`barrage.artillery`（刺蝟、港口）、`supply.trace-and-draw`、
  `supply.rail-trace`（TODO rail-front-control；單一軌距，無 Railhead／換軌／修復；無港口）、
  `replacements-rebuilds`（Pax／Eq 為固定配給，Rebuild Table 為通用規則）、
  `air.bases-and-refit`、`air.missions`、`air.transport-and-drop`（Glider Points 14.10f）、`air.replacements-and-reinforcements`。
- DEFERRED：`hedgehogs-engineering`、`movement.rail-sea-air`、`naval-shipping`、`optional-rules`。
- GAME_SPECIFIC：`victory.game-table`。
- 規則落差分析仍開啟：TODO-R1（逐條登記 §1–21）、R9（整疊移動／連續 overrun）、R11（MA 不捨入）、R14（未實作系統）；
  其餘 R 項程式已實作、待實機驗證（`docs/study/09-rules-vs-plan-gap-analysis.md` §4）。

## 3. 各子計畫的開放 TODO

| 範圍 | 文件 | 開放項 |
|---|---|---|
| 補給 | `docs/roadmap/09-supply-logistics-ux-wbs.md` | Phase A PASS（縮減範圍）；Phase B 未開始；TODO-S1～S5；B3、B4 待確認；A3c、A3d、A4a、A6e |
| 空軍 | `docs/reports/M11-air-power.md` §5、§6.3；`docs/roadmap/08-air-power-wbs.md` §1.4 | AIR-08 FAIL；Mission Loss 未觀察；「每段都停下」與空戰交接次數待使用者決定；revision 只在 Game End 顯示；稽核探針無空軍檢查；BTR 專屬規則不實作；Glider Points；Eq 固定配給 |
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
4. 整疊移動（6.1f）是否解除暫緩（影響 R9、D3、`movement.ground`）。
5. NG-07 的凍結期望（38 deployed Hexes）是否改為產品現在的 40，或修正產生器（doc 03 O-2）。
6. ACT-11／ACT-12 是否改寫為「最後一個決策只結算一次交易」等可操作的敘述（O-7）；SES-01 Pause 在產品中已移除，是否改寫該列（O-8）。

7. 東歐主題的入口格數，或入口格不在鐵路上時的補給源規則（決定後才能讓預設東歐圖的鐵路降到 Temperate 的一半以下）。

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
- 觀察（非阻擋）：New Game 預覽的目標仍是舊的金星、不顯示持有者；60% 縮放時十字標記偏小；
  己方鐵路綠帶疊在淺綠補給範圍上對比較弱。

## 6. 本次盤點同步修正的文件

- `docs/roadmap.md`：M11-Air 由 `PLANNED` 改為 `IN PROGRESS`（與 WBS 一致）。
- `docs/roadmap/09-supply-logistics-ux-wbs.md`：TODO-A6c 補註已被 2026-10-02 驗收證據取代的部分。
- `docs/reports/ocs-rebuild-2026-10-01.md`：存讀檔 TODO 補註 AIR-09 已驗證的範圍與仍開啟的缺口。
- `docs/reports/M11-air-power.md` §5：標出已於瀏覽器通過的項目。
- `docs/study/09-rules-vs-plan-gap-analysis.md` §4：補 2026-10-04 manifest 分布與 R14 現況。
