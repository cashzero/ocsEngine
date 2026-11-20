# AI `heuristic@94` 升級證據（Tier 2 / Tier 3 修正）

## 邊界與聲明

- **邊界**：headless `scripts/ai-match.mjs` 同引擎配對對戰、補給稽核（`scripts/ai-supply-study.mjs`）、`npm run check`。
- **UI 驗收聲明**：不改變 `docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。
- **升級決策**：使用者決定（2026-11-20：「完成剩餘工作」）。本批結果對 `heuristic@93` 為**中性**，升級理由是規則／策略正確性修正，不是強度提升。

## 候選內容（相對 `heuristic@93` / `3dfd4ba`）

- 規則層：`queryHqThrow`（移動後 Move 面、STRAT、水格）、`queryExtenderSite`、`queryFeedCoverage` 自身 HQ 抽取、`plannedAttack` DG／OOS 係數、`COMBINE_TRANSPORT`（同型別、≤5 點）、`COLLAPSE_EXTENDER` 候選、STRAT `legalLimit=1` 多格移動、`UPDATE_AIR_DROP_PLAN` CANCEL、`REDUCE_AIR_BASE`／空運候選 `pieceId` 過濾、`queryProjectedReachableHexes` 保留 `ownBridgeHexId`、Reaction 階段 `PAY_FUEL` 預算與 `recoveryLoweredUnits`、空投單位不需補給、`rebuildFacts` 實際戰力。
- 策略層：theater STRAT 兩步到達改用 Move／Combat、直接補給 `directDumpHexes`（含載貨卡車）、傾倒量耦合、`chooseRebuild` 實際戰力增益與獨立 HQ 優先、`ADVANCE_HEX` 10 RE 上限與已守住即停、`OVERSTACK_ELIMINATION` 整單位價值、`artilleryUnitMode` 無燃料拖曳砲、`feedBudget` 下修、`preservesOtherSupply` 口糧門檻、`stay` 超疊懲罰、`railDraw` 僅在有 Rail Cap 時、`seaStep` 保留卡車取貨量、`planCuts` 排除 DG／OOS、`bestCombat` 白名單、Extender 角色判斷、HQ／砲兵不產生 `threatAt`、Repl 先放置並避開敵 ZOC。
- 嘗試後撤回：敵 STRAT 單位強度改 0（使遭遇戰偏負）、HQ／砲兵基礎強度進隱藏堆疊估計（同上）、Exploitation 階段限制 `planTargets`（攻擊戰 VP −3.30）。

## 觀測結果（對凍結 `heuristic@93`，種子 `9600000–9600309`，已登錄）

參數：`32×24`、每方 6 師（2 裝甲）、8 回合、`--air NONE --air-transport NONE --swap --trace`。40/40 `FINISHED`、`replay=ok`。

| 分組 | 局（對） | W-L-D | VP 差 ± SE | Kill−Loss ± SE | Supply ± SE |
|---|---:|---:|---:|---:|---:|
| attack-western | 10 (5) | 5-5-0 | +2.80 ± 1.20 | +1.60 ± 1.76 | −0.20 ± 0.20 |
| attack-eastern | 10 (5) | 4-6-0 | −2.00 ± 0.89 | −1.40 ± 1.36 | +0.10 ± 0.98 |
| meeting-western | 10 (5) | 5-5-0 | +0.00 ± 0.84 | −1.60 ± 0.73 | +0.30 ± 0.44 |
| meeting-eastern | 10 (5) | 3-2-5 | −0.20 ± 1.50 | +0.50 ± 1.89 | +0.10 ± 0.19 |
| **合計** | **40 (20)** | **17-18-5** | **+0.15 ± 0.65** | **−0.23 ± 0.76 (K/D 0.99)** | **+0.07 ± 0.26** |

未達統計顯著；不主張強度提升。早期迭代批（`9300000`、`9400000`、`9500000` 起）顯示 STRAT 強度與 Exploitation 過濾會傷分，已撤回。

## 品質

- `npm run check`：`typecheck` PASS、`vitest` 131 檔 passed | 4 skipped，857 passed | 7 skipped，0 failed、`build` PASS、`smoke` PASS。
- 補給稽核：見 `artifacts/ai-tier23-v4-40/*/supply-attribution.json`（未提交）。
