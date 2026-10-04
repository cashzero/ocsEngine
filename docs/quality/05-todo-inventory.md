# TODO 盤點（2026-10-04）

狀態：**盤點紀錄**。本文件只彙整並指向各處既有的 TODO，不新增、不關閉任何 TODO，也不提升任何
`docs/quality/03-product-operation-verification-plan.md` 列的狀態。每項 TODO 的缺少行為、使用者可見影響與關閉證據
以其原始文件為準。基準：`main` @ `6745ecd`。

## 1. 產品驗收矩陣（doc 03）

| 狀態 | 列數 | 列 |
|---|---|---|
| UNVERIFIED | 61 | §A–E 全部 53 列（BOOT-01、NG-01~10、MAP-01~05、CTR-01~08、ACT-01~15、SES-01~09、UI-01~05）；§G SUP-B01~08 |
| PASS | 26 | AIR 與 SUP-A 大部分列 |
| 部分 | 3 | AIR-04（Mission Loss 未觀察到）、AIR-05（Hip Shoot BLOCKED）、SUP-A10（檔案路徑依使用者決定移出 scope） |
| FAIL | 1 | AIR-08（不可用的格／飛機沒有規則說明，10.0e、14.2e） |

因此 M8 Generated game flow 與 U10 Operable UI 維持 `IN PROGRESS`（`01-delivery-status-and-todo-policy.md`）。

## 2. 規則 manifest（`src/rules/manifest.ts`）

24 列：9 `IMPLEMENTED`、9 `PARTIAL`、5 `DEFERRED`、1 `GAME_SPECIFIC`。

- PARTIAL：`sequence.ground-turn`、`lifecycle.ground`（Variable Reinforcement Table、13.5a-e 地面補充／重建）、
  `movement.ground`（整疊移動 6.1f，使用者暫緩）、`barrage.artillery`（刺蝟、港口）、`supply.trace-and-draw`、
  `air.bases-and-refit`、`air.missions`、`air.transport-and-drop`（Glider Points 14.10f）、`air.replacements-and-reinforcements`（Eq 為固定配給）。
- DEFERRED：`replacements-rebuilds`、`hedgehogs-engineering`、`movement.rail-sea-air`、`naval-shipping`、`optional-rules`。
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
| 地圖 | `docs/ui/12-map-appearance.md`、`docs/generator/10-btr-scale-density.md` | 鐵路、Autobahn、地名僅裝飾、一格一地形、並行道路、覆蓋填補耗時、新外觀未重跑整合驗收 |
| OOB 命名 | `docs/reports/random-oob-naming.md` | UI 驗收 UNVERIFIED |
| Breakdowns | `docs/reports/breakdowns-2026-10-03.md` | 無開放 TODO；提議的驗收列待使用者核准 |

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

## 6. 本次盤點同步修正的文件

- `docs/roadmap.md`：M11-Air 由 `PLANNED` 改為 `IN PROGRESS`（與 WBS 一致）。
- `docs/roadmap/09-supply-logistics-ux-wbs.md`：TODO-A6c 補註已被 2026-10-02 驗收證據取代的部分。
- `docs/reports/ocs-rebuild-2026-10-01.md`：存讀檔 TODO 補註 AIR-09 已驗證的範圍與仍開啟的缺口。
- `docs/reports/M11-air-power.md` §5：標出已於瀏覽器通過的項目。
- `docs/study/09-rules-vs-plan-gap-analysis.md` §4：補 2026-10-04 manifest 分布與 R14 現況。
