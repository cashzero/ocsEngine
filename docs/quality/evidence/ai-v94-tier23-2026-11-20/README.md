# AI `heuristic@94` 升級證據（Tier 2 / Tier 3 修正）

## 邊界與聲明

- **邊界**：headless `scripts/ai-match.mjs` 同引擎配對對戰、補給稽核（`scripts/ai-supply-study.mjs`）、`npm run check`。
- **UI 驗收聲明**：不改變 `docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。
- **升級決策**：使用者決定（2026-11-20：「完成剩餘工作」）。本批結果對 `heuristic@93` 為**中性**，升級理由是規則／策略正確性修正，不是強度提升。

## 候選內容（相對 `heuristic@93` / `3dfd4ba`）

- 規則層：`queryHqThrow`（移動後 Move 面、STRAT、水格）、`queryExtenderSite`、`queryFeedCoverage` 自身 HQ 抽取、`plannedAttack` DG／OOS 係數、`COMBINE_TRANSPORT`（同型別、≤5 點）、`COLLAPSE_EXTENDER` 候選、STRAT `legalLimit=1` 多格移動、`UPDATE_AIR_DROP_PLAN` CANCEL、`REDUCE_AIR_BASE`／空運候選 `pieceId` 過濾、`queryProjectedReachableHexes` 保留 `ownBridgeHexId`、Reaction 階段 `PAY_FUEL` 預算與 `recoveryLoweredUnits`、空投單位不需補給、`rebuildFacts` 實際戰力。
- 策略層：theater STRAT 兩步到達改用 Move／Combat（集結點距敵 > 5 格）、直接補給 `directDumpHexes`（含載貨卡車與本步驟 `notes.truckPlan` 規劃卸貨點）、傾倒量耦合、`chooseRebuild` 實際戰力增益、`ADVANCE_HEX` 10 RE 上限、`OVERSTACK_ELIMINATION` 整單位價值、`artilleryUnitMode` 無燃料拖曳砲、`feedBudget` 下修、`preservesOtherSupply` 口糧門檻、`stay` 超疊懲罰、`railDraw` 僅在有 Rail Cap 時、`seaStep` 保留卡車取貨量、`planCuts` 排除 DG／OOS、`bestCombat` 白名單、Extender 角色判斷、HQ／砲兵不產生 `threatAt`、Repl 放置避開敵 ZOC。
- 嘗試後撤回：敵 STRAT 單位強度改 0（使遭遇戰偏負）、HQ／砲兵基礎強度進隱藏堆疊估計（同上）、Exploitation 階段限制 `planTargets`（攻擊戰 VP −3.30）、`reinforcementStep` 只找當下 `COMBAT` 模式 HQ 與 `needsPartnerRepl` 順序對調（在第 2 回合把 Repl 導向後方未移動 HQ，造成東歐攻擊 −2.00 VP）。

## 觀測結果（對凍結 `heuristic@93`，種子 `9700000–9700309`，已登錄）

參數：`32×24`、每方 6 師（2 裝甲）、8 回合、`--air NONE --air-transport NONE --swap --trace`。40/40 `FINISHED`、`replay=ok`。

| 分組 | 局（對） | W-L-D | VP 差 ± SE（正/平/負） | Kill−Loss ± SE | K/D | Supply ± SE |
|---|---:|---:|---:|---:|---:|---:|
| attack-western | 10 (5) | 5-5-0 | +0.80 ± 0.80 (1/4/0) | +0.90 ± 2.05 | 1.04 | +0.00 ± 0.42 |
| attack-eastern | 10 (5) | 5-5-0 | +0.60 ± 0.60 (1/4/0) | +5.70 ± 3.76 | 1.23 | −1.40 ± 1.02 |
| **攻擊戰合計** | **20 (10)** | **10-10-0** | **+0.70 ± 0.47 (2/8/0, t=+1.48)** | **+3.30 ± 2.17** | **1.13** | **−0.70 ± 0.57** |
| meeting-western | 10 (5) | 4-4-2 | −0.20 ± 0.20 (0/4/1) | −1.10 ± 1.65 | 0.92 | −0.50 ± 0.39 |
| meeting-eastern | 10 (5) | 4-5-1 | −0.20 ± 0.20 (0/4/1) | +0.30 ± 1.64 | 1.02 | +0.90 ± 0.62 |
| **遭遇戰合計** | **20 (10)** | **8-9-3** | **−0.20 ± 0.13 (0/8/2)** | **−0.40 ± 1.12** | **0.98** | **+0.20 ± 0.42** |
| **全部合計** | **40 (20)** | **18-19-3** | **+0.25 ± 0.26 (2/16/2, t=+0.96)** | **+1.45 ± 1.26** | **1.07** | **−0.25 ± 0.36** |

攻擊戰 10 對中 **0 負對（2 勝 8 平 0 負，VP +0.70 ± 0.47，Kill − Loss +3.30 ± 2.17，K/D 1.13）**；全 40 局 20 對中 16 對持平（因 Tier 2/3 為低頻邊界與規則查詢修正），整體 VP +0.25 ± 0.26、Kill − Loss +1.45 ± 1.26（K/D 1.07）。早期迭代批（`9300000`、`9400000`、`9500000`、`9600000` 起）已登錄於 `played-seeds.tsv`。

## 品質

- `npm run check`：`typecheck` PASS、`vitest` 131 檔 passed | 4 skipped，857 passed | 7 skipped，0 failed、`build` PASS、`smoke` PASS。
- 補給稽核：見 `artifacts/ai-tier23-v4-40/*/supply-attribution.json`（未提交）。
