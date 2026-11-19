# AI `heuristic@92` 升級證據（結構性缺陷修正、期望值砲擊與零後悔砲兵模式）

## 邊界與聲明

- **邊界**：headless `scripts/ai-match.mjs` 同引擎配對對戰、重播補給稽核（`scripts/ai-supply-study.mjs`）、前進稽核、完整單元／整合測試與建置 smoke（`npm run check`）。
- **UI 驗收聲明**：本紀錄為 headless 對局與規則／策略稽核證據，不改變 `docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。
- **升級決策**：使用者決定（2026-11-19：「Promote arty-v3」）以 40 局配對對戰與 72 局消融證據將 `arty-v3` 升級為新標準 `heuristic@92`（未另跑 80 局獨立批）。

## 候選內容（相對 `heuristic@91`）

基底 commit：`c58d748eb7c141e7e55494dedd1fe9ee1d0b2a41`（加上工作樹中整合的 `barrage-groups` 實作與全部 `heuristic@92` 修改）；凍結建置：`artifacts/ai-promotion/frozen-v92-standard`（`policyVersion: "92"`）。

1. **10 項 AI／查詢結構性缺陷修正**：
   - `src/ai/odds.ts`：`forecastCombat` 解析納入 OCS 9.8 Surprise（Regular 10+／5−、Overrun 9+／6−、Hedgehog −1 Surprise DRM、1d6 欄位偏移分布）。
   - `src/ai/analysis.ts`：敵方有效戰力與 `threatAt` 套用 DG（×0.5）、Strat Mode（×0.5）、`status:out-of-supply`（×0.5）折損；MA 0 固定單位威脅半徑限 1 格、DG 威脅半徑減半。
   - `src/rules/query/model.ts`、`src/rules/query/candidates.ts`、`src/rules/engine.ts`、`src/ai/model.ts`、`src/ai/access.ts`：新增 `CandidateRequest.combatSubsets`（預設關閉以隔離凍結對手），提供全相鄰單位外之僅可付費、去孤立守軍、依效率排序前綴（1–4 個）與保留 Exploitation 資格的 1–2 格攻擊群組。
   - `src/ai/policies/theater.ts`：在分配 HQ、卡車、集結者與接力橋前先濾除 `chance < minProbability` 的低機率組。
   - `src/ai/policies/heuristic.ts`：移除 `incomingRe` 重複計算並修正 `reOf` 預設為 `0`；保護戰區目標與集結者不被 `RESUPPLY` 覆寫；新增 `segmentMainEffort` 對齊 `BARRAGE`／`COMBAT` 與戰區配置主攻；修正 `pickupFor` 使用實際卡車容量 `truckCapacityTokens`；`planCuts` 同格保留較強單位；提高 `moveBudget`（1,500）與 `railStep`（1,000）候選預算；全合法階段啟用 `bestAirBarrage` 並跳過已 DG 格；`bestCombat` 加入 `columnIndex < 3` 防呆。
   - `src/ai/decisions.ts`：`ADVANCE_HEX` 的 `reinforce-vp` 允許在 `turnsLeft <= 0`、`advanceMoverHasTrace` 或 `advanceFunded` 時前進補強。
2. **期望值地面砲擊（`barrageGroupsByCost: 1` 設為預設）**：
   - 按每個可支付的砲擊價位提供最佳欄位合法砲組（`src/rules/query/barrage-groups.ts`），跳過可見地面守軍全已 DG 的格。
   - 以 `barrageCombatGain` 取代舊版固定加分：`P(DG) × combatGain + E[steps] × 10 − costT × 2.5`（門檻 2），僅在 DG 前偏硬（無可行攻擊、命中率 ≤ 75% 或攻方硬損 ≥ 0.5 step）且 DG 後命中率提高 ≥ 0.15 或硬損降低 ≥ 0.45 step 時計入 `combatGain`。
3. **零後悔砲兵 Combat／Move 模式控制（`artilleryUnitMode`）**：
   - 比較 `projectedReach(..., 'COMBAT')` 與 `projectedReach(..., 'MOVE')` 的最佳目的地評分：僅當 Combat 面最佳格不輸 Move 面超過 2 分且位於安全護衛射界內時轉／維持 `COMBAT`，否則轉／維持 `MOVE`；安全護衛射界另計 `support-effort (+4)`／`support-attack (+2)`；已在目標射界內原地展開的砲兵略過不必要的燃料支出。

## 輸入設定

- **對手**：凍結的現行標準 `heuristic@91`（`artifacts/ai-promotion/frozen-v91-standard/dist`）。
- **對局參數**：`32×24`、每方 6 師（2 裝甲）、8 回合、`--air NONE --air-transport NONE --swap --trace`。
- **40 局種子（20 對，已登錄於 `artifacts/ai-promotion/played-seeds.tsv`）**：
  - `attack-western`（`WESTERN_EUROPE` / `AXIS_ATTACKS`）：`9100000–9100009`（5 對）
  - `attack-eastern`（`EASTERN_EUROPE` / `AXIS_ATTACKS`）：`9100100–9100109`（5 對）
  - `meeting-western`（`WESTERN_EUROPE` / `MEETING`）：`9100200–9100209`（5 對）
  - `meeting-eastern`（`EASTERN_EUROPE` / `MEETING`）：`9100300–9100309`（5 對）

## 觀測結果

### 1. 三階段演進（同 40 局／20 對，對凍結 `heuristic@91`）

`Kill − Loss` 採 `scripts/ai-paired-measures.mjs` 定義（候選每局 `stepsKilled − stepsLost` 依交換座位對平均）。

| 版本（本機資料夾） | W-L-D | VP（每對 ± SE） | Kill − Loss（每對 ± SE） | K/D（殺／損） | Supply（每對 ± SE） | 候選地面砲擊 |
|---|---:|---:|---:|---:|---:|---:|
| `bugfix-40`（舊 `hardTarget`、無砲兵模式） | 20-13-7 | +1.95 ± 1.42 (t=1.38) | +2.92 ± 2.23 (t=1.31) | 1.14 (23.7 / 20.8) | −0.30 ± 0.32 | 0.15/局 (0.6T) |
| `bugfix-40-barrage-ev`（期望值 `barrageCombatGain`） | 21-12-7 | +1.90 ± 1.34 (t=1.41) | +3.55 ± 2.42 (t=1.47) | 1.17 (24.0 / 20.4) | −0.25 ± 0.37 | 0.23/局 (0.9T) |
| **`arty-v3`（升級為 `heuristic@92`）** | **19-15-6** | **+1.45 ± 0.99 (t=1.46)** | **+4.55 ± 2.02 (t=2.25)** | **1.23 (23.9 / 19.4)** | **+0.03 ± 0.28** | **0.28/局 (1.3T)** |

`arty-v3` 相較 `heuristic@91`（砲擊 1.88/局、8.0T；砲兵燃料 336）大幅減少無效砲擊與燃料消耗（砲兵燃料 309，模式切換 `COMBAT=200 / MOVE=163`），K/D 由 1.14 穩步提升至 1.23，VP 標準誤由 1.42 降至 0.99，且四個分組全部為正。

### 2. `arty-v3`（`heuristic@92`）分組明細（40 局／20 對）

| 分組 | 局數（對數） | W-L-D | 平均 VP（候選 vs v91） | VP 差（每對 ± SE） | Kill − Loss（每對 ± SE） | K/D（殺／損） | Supply（每對 ± SE） |
|---|---:|---:|---:|---:|---:|---:|---:|
| `attack-western` | 10 (5) | 6-4-0 | 7.90 vs 6.10 | +1.80 ± 1.80 | +2.30 ± 3.87 | 1.10 (24.3 / 22.0) | −0.60 ± 0.37 |
| `attack-eastern` | 10 (5) | 6-3-1 | 6.50 vs 3.50 | +3.00 ± 1.41 | +5.70 ± 4.42 | 1.25 (28.6 / 22.9) | +0.10 ± 0.48 |
| **攻擊戰合計** | **20 (10)** | **12-7-1** | **7.20 vs 4.80** | **+2.40 ± 1.10 (t=2.19)** | **+4.00 ± 2.83** | **1.18** | **−0.25 ± 0.31** |
| `meeting-western` | 10 (5) | 5-5-0 | 21.90 vs 21.30 | +0.60 ± 3.39 | +6.00 ± 1.54 | 1.36 (22.6 / 16.6) | +0.70 ± 0.56 |
| `meeting-eastern` | 10 (5) | 2-3-5 | 6.40 vs 6.00 | +0.40 ± 0.98 | +4.20 ± 6.23 | 1.26 (20.2 / 16.0) | −0.10 ± 0.76 |
| **遭遇戰合計** | **20 (10)** | **7-8-5** | **14.15 vs 13.65** | **+0.50 ± 1.66 (t=0.30)** | **+5.10 ± 3.04** | **1.31** | **+0.30 ± 0.47** |
| **全部合計** | **40 (20)** | **19-15-6** | **10.68 vs 9.22** | **+1.45 ± 0.99 (t=1.46)** | **+4.55 ± 2.02 (t=2.25)** | **1.23 (23.9 / 19.4)** | **+0.03 ± 0.28** |

- 攻擊戰 10 對全部為正或平手（`+/0/− = 5/5/0`，2.1×SE 區間 `[+0.10, +4.70]`）；全部 20 對 `Kill − Loss` 2.1×SE 區間 `[+0.30, +8.80]`（`+/0/− = 13/1/6`）；VP 2.1×SE 區間 `[−0.64, +3.54]`（`+/0/− = 9/8/3`）。

### 3. 修復缺陷後重測 v81–v82 策略（72 局消融，不採用並移除）

在 `arty-v3` 基底上針對同種子子集（各 24 局／12 對，四格各 3 對，全部 `FINISHED` 且 `replay=ok`）單獨重測過去放棄的三項策略：

| 變體 | 局數（對數） | VP 差（對 v91） | 相對 `arty-v3` 基線 VP 差 | K/D | 判定 |
|---|---:|---:|---:|---:|---|
| `arty-v3` 基線（同 24 局子集） | 24 (12) | +1.92 ± 1.38 | 0.00 | 1.36 | 採用 |
| A：`combatSupplyPrice`（放寬戰鬥補給定價） | 24 (12) | +1.67 ± 1.39 | −0.25 ± 0.18 | 1.17 | 淘汰並移除 |
| B：`terrainEffort`（依地形加碼主攻） | 24 (12) | +1.25 ± 0.99 | −0.67 ± 1.32 | 1.18 | 淘汰並移除 |
| C：`assaultStacking`（解除主攻擁擠扣分） | 24 (12) | +1.08 ± 1.02 | −0.83 ± 1.13 | 1.23 | 淘汰並移除 |

## 正確性、稽核與測試

- **對局與重播**：40/40 局（以及 72 局消融）全數打完 8 回合到 `FINISHED`，0 錯誤、0 拒絕、終局重播 state hash 100% 一致。
- **補給稽核（`scripts/ai-supply-study.mjs` 跑完 40 局）**：`previewMismatches = 0`、`otherUnitTraceBreaks = 0`、`relocationTraceBreaks = 0`、`feedBreaks = 0`、`rationUnpreserved = 0`（總違例 0）。
- **前進稽核（對照 `audit-advances.mjs` 規則跑完 40 局）**：候選一般戰後前進 195 次（190 次有共同口糧、4 次為攻擊戰攻方進駐剛打空敵目標之 v91 核准例外、1 次為第 8 回合終局前進，0 違例）；候選成功 Overrun 26 次（26/26 有共同口糧，0 違例）；預判保守邊界 0 違例。
- **品質檢查（`npm run check`）**：
  - `npm run typecheck`：PASS
  - `npm test`：131 passed、4 skipped（135 檔）；845 passed、7 skipped（852 項測試），0 failed（含 `tests/ai/bugfixes-audit.test.ts`、`tests/ai/barrage-groups.test.ts`、`tests/ai/facility-barrage.test.ts`）
  - `npm run build`：PASS
  - `npm run smoke`（`node tests/dist-smoke.mjs`）：PASS
- **凍結建置**：`artifacts/ai-promotion/frozen-v92-standard`（manifest：`artifacts/ai-promotion/frozen-v92-standard-freeze.json`，`policyVersion: "92"`）。
