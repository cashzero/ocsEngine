# AI `heuristic@93` 升級證據（Tier 1 高頻缺陷修正與 BARRAGE 效能／正確性修正）

## 邊界與聲明

- **邊界**：headless `scripts/ai-match.mjs` 同引擎配對對戰、重播補給稽核（`scripts/ai-supply-study.mjs`）、前進稽核、最慢 `COMBAT:BARRAGE` 局面延遲重播量測、完整單元／整合測試與建置 smoke（`npm run check`）。
- **UI 驗收聲明**：本紀錄為 headless 對局、效能與規則／策略稽核證據，不改變 `docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。
- **升級決策**：使用者決定（2026-11-20：「先promote目前的fix」）以 40 局配對對戰、延遲基準與完整品質／稽核證據將 Tier 1 + BARRAGE 修正升級為新標準 `heuristic@93`（未另跑 80 局獨立批）。

## 候選內容（相對 `heuristic@92` / `8ac745d`）

凍結建置：`artifacts/ai-promotion/frozen-v93-standard`（`policyVersion: "93"`）。

### 1. Tier 1 高頻缺陷修正（7 項）
1. **戰鬥模式 HQ（`MA = 0`）不再付燃料**（`src/ai/policies/heuristic.ts`）：`wantsToMove` 要求 `(unit.profile?.movement ?? 0) > 0`，避免 `MA = 0` 的 Combat Mode HQ 每回合白燒 4T（1 SP）或 1T 燃料。
2. **`DEFENDER_TERRAIN` 改比 Combat Table 欄位索引**（`src/ai/decisions.ts`）：新增 `terrainColumn` 解析 OCS 9.7a 線型（`open` / `close` / `very close` / `extremely close`）與賠率對應欄位，按最低欄位排序，不再因只比原始賠率或字典序而選 `clear (open)` 白送 1–4 欄。
3. **解除 `STRAT` 距敵 4 格永久死鎖**（`src/ai/policies/heuristic.ts`）：`combatUnitMode` 在單位接近敵軍（`<= stratSafeDistance + 2`）或接近目標（`< stratModeTargetDistance`）時主動由 `STRAT` 切回 `MOVE`。
4. **`OPTION_SPLIT` 守點前確認存活步數**（`src/ai/decisions.ts`）：`holdObjective` 僅在 `retreat === 0` 且 `combat.optionStepsLeft > 0` 時選擇吃損守點，否則退卻保步（不以最後一步自殺）。
5. **落實 12.2a 鐵路／海運新運達 SP 限制與釋放失敗預約**（`src/ai/policies/heuristic.ts`）：`pickupFor` 扣除 `notes.railedTo`、`seaStep` 寫入海運卸貨量至 `notes.railedTo`、`case 'FETCH'` 無法裝貨時呼叫 `release(leg)`。
6. **孤立駐軍救援改為專用卡車指派**（`src/ai/policies/heuristic.ts`）：新增 `assignReliefTrucks` 為每個孤立目標指派最多 1 輛專用救援卡車（已載貨優先，其次最近）在 `order = -1` 執行並略過提前快取 `dryHqs`；其餘非戰區卡車維持 `order = 3` 滿載運補；`case 'RELIEF'` 優先前往可卸貨格（13.2f）並在退回 `DELIVER` 時釋放指派。
7. **`RESOLVING` 期間 `availableTokens` 停止重複扣除戰鬥補給**（`src/rules/supply/supply.ts`）：`reservedFrom` 於 `activeTransaction.step === 'RESOLVING'` 時回傳 `0`，避免 `rollCombat`/`rollBarrage` 已扣款後在 `RETREAT_HEX`、`ADVANCE_HEX` 與 Overrun 投影中重複扣除。

### 2. BARRAGE 與戰鬥候選效能／正確性修正（5 項）
1. **消除 `reserveInto` 造成之 `traceScopeCache` 全面失效與 $O(N^2)$ 重算**（`src/rules/combat/combat.ts`）：以 `reserved: Map<PieceId, number>` 取代逐單位複製 `pieceState`，語意完全等價但保持 100% cache 命中。
2. **`barrageFollowUp` 單目標掃描與快取**（`src/rules/engine.ts`、`src/rules/query/candidates.ts`、`src/ai/policies/heuristic.ts`）：`combatCandidatesFor` 支援單一 `targetHexId`，`barrageFollowUp` 改依 `(actorId, targetHexId)` 快取並只掃描被砲擊格（消除寬戰線 200 候選字典序截斷），`bestBarrage` 並對同一目標格快取 `BEFORE_PAYMENT` 且無相鄰我方戰鬥單位時直接略過 follow-up。
3. **`combatCandidatesFor` 資格過濾與 2 格 Exploitation 相鄰檢查**（`src/rules/query/candidates.ts`、`src/rules/combat/combat.ts`）：預先排除 `usage.attacked`、Exploitation 階段非 Exploit／未釋出預備隊與無法跨越河邊／禁入地形（`canEnterForCombat`）的單位；2 格 Exploitation 子集檢查兩格相鄰（9.13bC）。
4. **`scanBarrages` 與 `forecastBarrage` OCS 10.0c 精確化**（`src/rules/query/candidates.ts`、`src/ai/odds.ts`）：非 blocker 查詢以 `barrageFirerViolations` 過濾無資格砲兵，並在 `groundBarrageGroupsByCost` 查詢中為設施砲擊保留較便宜單砲子集；`forecastBarrage` 依 10.0c 將 `[1/2]` 區分為有正確觀測且非 L3+ 壕溝 `0.5` 步、其餘 `0` 步。
5. **離圖機場空襲預覽修正**（`src/rules/engine.ts`）：`actionFacts(DECLARE_AIR_MISSION)` 改用 `airLaunchHex` 取代 `hexOf`。

## 觀測結果

### 1. Tier 1 40 局配對對戰（對凍結 `heuristic@92`，全新種子 `9200000–9200309`）

參數：`32×24`、每方 6 師（2 裝甲）、8 回合、`--air NONE --air-transport NONE --swap --trace`；種子已登錄於 `artifacts/ai-promotion/played-seeds.tsv`。

| 分組 | 局數（對數） | W-L-D | 平均 VP（Tier 1 vs v92） | VP 差（每對 ± SE） | Kill − Loss（每對 ± SE） | K/D | Supply（每對 ± SE） |
|---|---:|---:|---:|---:|---:|---:|---:|
| `attack-western` | 10 (5) | 5-5-0 | 8.70 vs 6.70 | +2.00 ± 1.79 | +4.60 ± 3.49 | 1.20 | +0.50 ± 0.67 |
| `attack-eastern` | 10 (5) | 6-4-0 | 6.20 vs 5.60 | +0.60 ± 1.81 | +4.40 ± 3.88 | 1.21 | +0.50 ± 0.32 |
| **攻擊戰合計** | **20 (10)** | **11-9-0** | **7.45 vs 6.15** | **+1.30 ± 1.22** | **+4.50 ± 2.46 (t=1.83)** | **1.20** | **+0.50 ± 0.35** |
| `meeting-western` | 10 (5) | 4-5-1 | 14.70 vs 14.90 | −0.20 ± 2.54 | −4.30 ± 3.74 | 0.78 | +0.70 ± 1.04 |
| `meeting-eastern` | 10 (5) | 5-5-0 | 9.40 vs 7.40 | +2.00 ± 1.22 | +3.00 ± 1.25 | 1.16 | −0.60 ± 0.60 |
| **遭遇戰合計** | **20 (10)** | **9-10-1** | **12.05 vs 11.15** | **+0.90 ± 1.38** | **−0.65 ± 2.22** | **0.97** | **+0.05 ± 0.61** |
| **全部合計** | **40 (20)** | **20-19-1** | **9.75 vs 8.65** | **+1.10 ± 0.90 (t=1.23)** | **+1.93 ± 1.72** | **1.09** | **+0.28 ± 0.35** |

同一批 40 局內之 Tier 1 缺陷對照（候選 vs 凍結 `heuristic@92`）：

| 缺陷指標 | 凍結 `heuristic@92` | Tier 1 修正版 | 變化 |
|---|---:|---:|---|
| 戰鬥模式 HQ（`MA = 0`）付燃料次數 | 102 | **0** | **−100%**（總未移動 HQ 燃料 498T → 123T，節省 ~94 SP） |
| `OPTION_SPLIT` 守點最後一步自殺 | 33 | **0** | **−100%** |
| `DEFENDER_TERRAIN` 選錯欄位次數（多送欄數） | 19（22 欄） | **0（0 欄）** | **−100%** |
| 卡車白跑 12.2a 鐵路新運達格 | 51 | **0** | **−100%** |
| 終局仍卡在 `STRAT`（距敵 ≤ 5 格） | 32（23） | **4（3）** | **−87%** |

### 2. 最慢 4 個 `COMBAT:BARRAGE` 局面延遲對照（重播 `ai-bugfix-40-arty-v3` 最慢決策）

| 對局／階段 | 修正前 | 修正後 | 提速倍率 |
|---|---:|---:|---:|
| `9100009` (`4:0:COMBAT:BARRAGE`) | 11,329 ms | **179 ms** | **63.4×** |
| `9100107` (`5:0:COMBAT:BARRAGE`) | 8,260 ms | **42 ms** | **195.4×** |
| `9100007` (`7:0:COMBAT:BARRAGE`) | 6,861 ms | **115 ms** | **59.7×** |
| `9100103` (`8:0:COMBAT:BARRAGE`) | 6,654 ms | **160 ms** | **41.6×** |

## 正確性、稽核與測試

- **對局與重播**：40/40 局打完 8 回合到 `FINISHED`，0 錯誤、0 拒絕、終局重播 state hash 100% 一致。
- **補給稽核（`scripts/ai-supply-study.mjs` 跑完 40 局）**：候選方 `previewMismatches = 0`、`otherUnitTraceBreaks = 0`、`relocationTraceBreaks = 0`、`feedBreaks = 0`、`rationUnpreserved = 0`（0 違例；`attack-eastern 9200106` 的 1 次 `relocationTraceBreaks` 屬對手凍結 `heuristic@92`）。
- **前進稽核（對照 `audit-advances.mjs` 跑完 40 局）**：候選一般戰後前進 222 次（216 次有共同口糧、2 次為攻擊戰攻方 v91 例外、4 次為第 8 回合終局，0 違例）；候選成功 Overrun 14 次（14/14 有共同口糧，0 違例）；預判保守邊界 0 違例。
- **品質檢查（`npm run check`）**：`typecheck` PASS、`vitest run` **131 passed | 4 skipped（135 檔），851 passed | 7 skipped（858 項測試），0 failed**、`build` PASS、`smoke` PASS。
- **凍結建置**：`artifacts/ai-promotion/frozen-v93-standard`（manifest：`artifacts/ai-promotion/frozen-v93-standard-freeze.json`，`policyVersion: "93"`）。
