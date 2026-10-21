# 電腦策略的錯誤清單

## 範圍

標準策略在對局中看起來不正確的決策（清單量測時的標準是 `heuristic@79`；E1 的權宜修正已在 `heuristic@85` 採用），每一項的偵測方式、出現頻率與目前狀態。這份清單是「先修錯，再談強」的
工作底稿（使用者決定，2026-10-18）：先把錯誤列出來、逐項用局面接續測試量修正的影響，再從多項修正的結果找出可用的指標。
清單上的頻率是候選，不是已證明的錯誤；一項錯誤要經接續測試才算確認。

## 方法

1. **觀察**：用重播與 trace 工具（[評估工具](evaluation.md#工具皆需先-npm-run-build)）在標準策略的對局中找出看起來不正確的
   決策，寫出偵測方式並計算每局次數。`scripts/ai-error-census.mjs` 計算其中幾項。
2. **局面接續測試**：從偵測到的局面分岔（`ai-find-branches.mjs`），重設 Rules RNG，修正版與原策略在同一組骰子下對固定對手
   接著下（`ai-continue.mjs`），比較 VP、Kill、Loss、Supply 與局勢指標在 +1、+2 回合與終局的成對差（`ai-continue-compare.py`）。
   不以 VP 單獨判斷：VP 太粗，第一項測試中 Loss 比 VP 清楚得多。
3. **指標**：同一個指標要在多項不同的修正中都能反映結果，才算可用；只有一項修正無法判斷。
   這部分與 [VP 指標研究](vp-metrics.md) 共用資料。

## 目前的清單

量測：32 局 heuristic@79 自我對戰（`heuristic@84` 對凍結 v79，逐局與 v79 相同），遭遇戰與攻擊戰各 16 局，開發種子
1300000–1300307；[紀錄](../quality/evidence/ai-error-census-v79-2026-10-18/README.md)。數字是每一方每局。

| # | 看起來不正確的決策 | 偵測 | 頻率 | 狀態 |
|---|---|---|---|---|
| E1 | 攻擊戰守方不分有無優勢都反攻，奪不回目標點 | trace 的 `assault` 任務 | 守方每局約 8–10 次主攻移動 | 接續測試確認：拿掉反攻，守方損失 −2.5 ± 0.7 step、VP 差 +1.9 ± 0.9，但攻方斷補單位變少（[證據](../quality/evidence/ai-defender-assault-continuation-2026-10-18/README.md)）。**v85 採用權宜修正（守方不反攻），已升級為標準**；正確做法是只在有優勢時反攻（`bot-defender-counterattack`） |
| E2 | 單位因斷補 attrition 損失 | 重播的 step 損失原因；斷補普查 | attrition 每局 3–11 step，常多於戰鬥損失；一組遭遇戰的斷補單位中 20%（36／176）3 格內沒有敵軍 | 原因已拆解（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：233 次 attrition 中 trace 多由敵軍移動切斷（175），只有 15 次（6%）損失時有取用得到的 SP；己方造成口糧不足的 136 次中 83 次是付燃料用掉斷補單位的口糧，其中 82 次是**別的單位**在斷補之後付燃料。原因是規則層的口糧承諾檢查漏掉靠強制恢復內部存量的斷補單位（它不在口糧計畫中），已修正（`supply.recoveryLoweredUnits`，[紀錄](../quality/evidence/ai-ration-recovery-fix-2026-10-18/README.md)）：同 32 局，同方付燃料造成的 attrition 每局 4.53 → 2.00，其餘是 SP 不足時口糧計畫依優先序只餵部分單位 |
| E3 | 戰鬥勝利後不前進 | trace 的 `advance: no supplied advance` | 攻方不前進 5.5、前進 7.25；守方不前進 3.6、前進 0.13；遭遇戰 2.6 對 2.8 | 接續測試（30 個局面 × 4）：不管威脅都前進，終局己方損失 +1.39 ± 0.66、擊殺 +1.06 ± 0.55，Kill − Loss −0.33 ± 0.82、VP −0.22 ± 0.47：用損失換擊殺，**威脅上限不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）。補給不足而不前進的情況未測 |
| E4 | 賠率分配不當 | 每次攻擊的 Combat Table 欄位 | 35–55% 的攻擊在第 10 欄以上（多在最高欄）；對目標點的攻擊平均只有第 5.4–6.1 欄，約一半守軍留在原地 | **戰鬥段內分配大致正確**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)，`ai-attack-allocation-study.mjs`）：高賠率攻擊中多出的單位，攻方每局 5.38 個裡 4.75 個旁邊沒有別的敵軍；能改打另一個未被攻擊的相鄰敵格的每局約 0.6 個；低賠率攻擊目標點時旁邊有閒置己方單位的每局 0.4 次。兵力分配在移動段就決定了，併入 E6 |
| E5 | 有好賠率卻不攻擊 | Combat Segment 開始時有第 6 欄以上的合法攻擊、卻沒有宣告 | 攻方 0.88、守方 1.5、遭遇戰 0.5（每局約 6.8 個 segment） | 接續測試（27 個局面 × 4）：補給項降為 0.5 或門檻降為 2，攻擊增加（+0.98、+0.37），當回合擊殺增加，終局 Kill − Loss（+0.66 ± 0.82、+0.48 ± 0.35）與 VP（−0.04、0.00）沒有差別：**未證明是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)） |
| E6 | 攻方停在敵前 2–3 格 | `ai-concentration-study.mjs` | 離敵 2–3 格的戰力（118）約等於相鄰的（116）；主攻群 2.5 個單位只有 1.2 個貼近目標 | 以各單位自己的目標量（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)，`ai-approach-study.mjs`）：攻方移動中停在目標 2–3 格、但目標旁的格子其實到得了的，assault 9%、hunt 20%、capture（目標有敵軍）18%，扣分主要是 `crowding` 與 `exposure`；其餘多是一回合到不了。是否算錯要看局勢；目標點、斷補與分配後的暴露量（`stacksExposedAllocated`）都已可量（見[指標是否可用](#指標是否可用)），判斷還需要比較停在 2–3 格與貼近兩種走法的接續測試 |
| E7 | 目標點空著被敵軍走進 | 重播：失去目標點時格內無守軍 | 0.7–1.7 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：失去時格內無己方戰鬥單位的目標點，幾乎都是同一個玩家回合內守軍被擊毀或撤退後敵軍進入（遭遇戰每局 2.00／2.38、守方 3.38／3.50）；己方移開後被走進的只有遭遇戰 0.38、守方 0.13 |
| E8 | 整局沒移動過的戰鬥單位 | 重播 | 守方 11.5、遭遇戰 6.6、攻方 1.4 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：多數是不能移動的駐軍（守方 9.63、遭遇戰 5.56）；能移動卻整局沒動的每局 0.7–1.4 個 |
| E9 | 砲兵多在 Move Mode、砲擊少 | `ai-concentration-study.mjs` | 戰鬥時 Move Mode 406 次、Combat Mode 10 次；每階段砲擊 0.5 次 | 改 Combat Mode 已試過無效（v80），問題在砲擊評分而非模式 |

查過、沒有發現問題：最後回合漏掉的奪點機會 0、保留補給且當下 VP 較高的移動 0、重複指派的奪點任務每局 0.06。

## 局勢指標

VP、Kill、Loss、Supply 反映不出局勢（使用者，2026-10-18），所以先加上量測並記錄資料，有了資料再分析。工作順序見 [局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md)。依戰區分配補給與兵力的配置指標（`theater.potential` 等）的定義、驗證與策略上層規劃見 [戰區補給配置](theater-supply-plan.md)。
`scripts/ai-position-metrics.mjs` 的 `nextTurnMetrics` 量假設下回合的可達範圍與戰力潛力：把局面投影成該方的 Movement Segment
（尚未移動、全部已加油），用規則層的移動範圍得到每個戰鬥單位能到的格子（地形、ZOC），忽略對方在中間的行動；一格的攻擊潛力
是所有能到該格旁的單位一起攻擊、守方挑地形時規則給的欄位，所以是上限（同一個單位會算進多個目標）。

| 指標 | 意義 |
|---|---|
| `objectivesAtRisk`、`objectiveVpAtRisk` | 己方持有的目標點中，對方下回合能以第 6 欄以上攻擊、或格內沒有己方戰鬥單位而對方能走進的 |
| `objectivesInReach`、`objectiveVpInReach` | 反過來：己方未持有的目標點中，己方下回合能以第 6 欄以上攻擊或走進的 |
| `payableObjectivesAtRisk`、`payableObjectiveVpAtRisk`、`payableObjectivesInReach`、`payableObjectiveVpInReach` | 幾何可達目標的共同 SP 預算近似。按 VP 高低貪婪縮減到維持第 6 欄的攻擊組，只有原局面內部存量 EXHAUSTED 的單位扣戰鬥 SP；有守軍的目標不重用單位，空目標仍可能重用。SP 彙總自能供應目前任一前線單位的來源，未驗證進攻位置的來源可達性，也未扣燃料。因此不是合法支付方案，且強制恢復後的內部存量未同步，可能高估或低估（`bot-position-payability`） |
| `stacksExposed`、`stepsExposed` | 對方下回合能以第 9 欄以上攻擊的己方 stack 數與其中的 step（上限：對方每個單位都算進每個到得了旁邊的格子） |
| `stacksExposedAllocated`、`stepsExposedAllocated` | 同上，但對方每個單位只攻擊一格：貪婪分配，先挑未分配單位能以第 9 欄以上攻擊、step 最多的格子，只留維持第 9 欄所需的單位（先拿掉印刷戰力最弱的），再挑下一格 |
| `maxSingleStackExpectedLoss` | 對各己方 stack 聚合幾何可達的敵軍，以目前位置與模式計算 odds，枚舉戰鬥 2d6 後取各 stack 期望值的最大值。攻方領隊傳 null，規則層因此用 AR 0；未枚舉 Surprise。持有目標點假設 option 全轉損失，其餘假設 option 不造成損失。這是固定假設下的單格 CRT 代理量，不是完整最佳合法攻擊的期望損失，也不是整回合損失總量（`bot-position-crt-expectation`） |
| `hqsInReach`、`dumpSpInReach` | 對方下回合能到旁邊的己方 HQ，與己方補給堆（不含駐軍存量）的 SP |
| `unitsWithReach` | 下回合能移動的己方戰鬥單位 |
| `supplyBestCut`、`supplyCuttable` | 現在有 trace 的己方戰鬥單位中，對方一個單位移到一格就會斷補的最多單位數，與某一個這樣的移動會切斷的單位數 |
| `expectedLossAllocated` | 對方每個單位只攻擊一格：每輪挑期望損失最高的己方 stack，留下不降低該期望損失的單位（先拿掉印刷戰力最弱的），期望損失依 2d6 與 Combat Table（持有目標點時 option 算損失），加總 |
| `objectiveReachColumn` | 己方未持有的目標點中，己方下回合能到旁邊的全部單位一起攻擊時的最高欄位（能走進的空目標點記 12，無法攻擊記 −1） |
| `hqDependentUnitsInReach` | 有 trace 的己方非 HQ 戰鬥單位中，每條 trace 路線都是 HQ throw、且這些 HQ 都在對方下回合能到旁邊的單位數 |
| `rearHexesInReach` | 對方下回合能到達、離己方戰鬥單位 2 格以上、且在己方 trace 範圍內的格數 |

補給線的切斷是估計值：在投影出的狀態中把對方一個戰鬥單位移到一格，用規則層的 trace（敵軍與未被抵銷的 ZOC 阻擋、HQ throw、
formation 共同路線、補給源）重算，數斷補的己方單位。只試對方到得了、且偏離某個己方補給源或 HQ 到某個有 trace 的己方單位的
直線不超過 1 格的格子；補給源與 HQ 旁的全試，其餘挑到彼此不相鄰（一個單位的 ZOC 蓋住鄰格）。對方兩個單位合力封口的情形不算；
在 24 個局面上與逐格全試比較，最大單一切斷 23 個相同，可切斷數相同或略少，每方每個局面約 0.4 秒。`ai-position-record.mjs`
只為不行動的一方（這個玩家回合可能被切斷的一方）計算。

現況指標（`positionMetrics`）包含 VP、目標點、step、DG、接敵、斷補、SP、乾 HQ 與以下四項。

- `surplusCombatSp` 扣除強制恢復與口糧承諾，再彙總能供應目前任一前線單位的補給堆 SP。它是來源彙總量，未分配給具體進攻位置。
- `bestObjectiveEffectiveColumn` 將未持有目標 2 格內的己方單位直接投影到鄰格、切到 combat 面後，取最高靜態 odds 欄位。空目標用 12 作哨兵值，沒有機會用 −1。地形與部分戰力修正會進入 odds，但未驗證移動、燃料、堆疊與攻擊資格；AR、hedgehog 的骰點修正及 Surprise 不反映在欄位中。
- `localForceRatioAt2Hex` 選擇 2 格內己方未標記斷補的印刷戰力最多的未持有目標，平手取 VP 高者，再除以該目標 2 格內敵軍印刷戰力（分母至少 1）。己方排除 HQ、STRAT 與斷補標記，敵方沒有對稱排除。它未計 DG、地形與實際戰鬥補給；其焦點目標不一定是最高欄位的目標。因此兩項指標的平均值不能當成同一場戰鬥由兵力比換算為欄位的證據。
- `outOfTraceUnfed` 數斷 trace 且所在格沒有任何己方補給堆（含存量大於 0 的駐軍存量）取用範圍涵蓋的戰鬥單位。取用範圍來自規則層的 `queryFeedCoverage`，不分單位，因此不檢查師屬 HQ 限制。

這些指標由 `ai-continue.mjs` 在各時間點記錄；`ai-position-record.mjs` 在既有對局每個玩家回合開始時記錄，並附上該窗口的損失事件、目標控制權改變與終局 VP。`stepsLost` 是 `STEP_LOST` 事件數；`combatStepsLost` 是未被標成 attrition 的事件數，仍包含過度堆疊消滅等非戰鬥來源，不能稱為純戰鬥或實際 step 數。Recorder 逐事件分類：跟在 `ATTRITION_ROLLED` 之後或回應 `ATTRITION_LOSS` 決策的損失算 attrition，損失歸屬事件發生時所在的玩家回合；過度堆疊與其他消滅仍併入 `combatStepsLost`（`bot-position-loss-attribution`）。`spCapturedOrDestroyed` 含被奪、被炸及己方主動炸掉補給堆的 SP，不單指敵軍取得的資源。

### 指標是否可用

`scripts/ai-position-validate.py` 對既有紀錄做回顧性的樣本外檢驗（[第三次驗證：P4 新候選](../quality/evidence/ai-position-metrics-p5-2026-10-19/README.md)）：255 條不重複的對局軌跡（以初始 hash、終局 hash 與完整 accepted actions 識別）、96 組地圖種子、3,315 個玩家回合窗口，沒有新增對戰。同一種子的全部回合、策略與交換座位局留在同一折（十折）。另做排除整個來源批次及其種子的敏感度比較；測試批次會共享別名與種子，不能當作獨立重複。[第二次驗證](../quality/evidence/ai-position-metrics-p2-2026-10-19/README.md)、[第一次驗證、對局識別與負對照](../quality/evidence/ai-position-validation-2026-10-18/README.md)

每個窗口在玩家 P 行動前，取非行動方 O 的指標預測 O 在這回合的損失，取 P 的指標（`mover.` 前綴）預測 P 的奪點與 O 的戰鬥損失；補給縱深類另以 O 下一個己方回合的耗損為結果。比較的模型有全猜 0、訓練中位數、距離基準（目標點用 `objectivesThreatened`，其他用 `contact`）的線性與分桶模型、基準加指標的線性模型，以及指標的固定分桶（0、1、2–3、4–7、8+）與訓練五分位分桶中位數。通過門檻在看結果前寫於 [局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md#1-指標的標準)：至少一個角色子組中，指標的分桶模型在 MAE 上勝過全猜 0、訓練中位數與基準分桶，或基準加指標的樣本外 R² 勝過基準，且種子群組重抽的 95% 區間不含 0。區間不含模型重擬合、指標挑選與多重比較的不確定性。

第一次驗證的紀錄中，每個 Game Turn 的第一列在天氣與先攻擲骰之前就建立，行動方仍是上一回合的；先攻順序改變的 682／2,944 個 Game Turn，該列的行動方錯置，O 的指標配到的是另一方的損失。記錄器改為擲骰後才建立該列，損失依事件發生時的回合歸屬，耗損逐事件判斷；修正後耗損全部落在擁有者自己的回合（Supply Phase 在己方 Movement 之後）。第一次驗證的數值因此作廢，以下是修正後的結果。

| 指標 | 結果 | 通過的角色與依據 | 判定 |
|---|---|---|---|
| `objectivesAtRisk`、`objectiveVpAtRisk`（行動方的 `objectiveVpInReach` 為鏡像） | O 失去的目標點與 VP | 三個角色的樣本外 R² 都通過（攻方行動時 VP +0.213，遭遇戰 +0.103，守方行動時 +0.067）；攻方行動時目標數的 MAE 也勝過基準 | 可用 |
| `payableObjectiveVpAtRisk` | O 失去的目標 VP | 攻方行動時在 `objectiveVpAtRisk` 之上再加 R² +0.089 [0.028, 0.145]，分桶 MAE 0.884 對全猜 0 的 0.960；守方行動與遭遇戰沒有增益 | 攻方行動時優於原版 |
| `mover.bestObjectiveEffectiveColumn` | P 奪得的目標點 | R² 攻方行動時 +0.325 [0.256, 0.384]、遭遇戰 +0.205、守方行動時 +0.138；攻方行動與遭遇戰的分桶 MAE 勝過基準（攻方 0.253 對 0.365） | 可用，最強 |
| `mover.localForceRatioAt2Hex` | P 奪得的目標點 | 攻方行動時 R² +0.098、分桶 MAE 勝過基準；守方行動時 R² +0.089 但區間 [0.004, 0.223] 很寬；遭遇戰不通過 | 弱，未比較是否超過有效欄位 |
| `stacksExposedAllocated` | O 的戰鬥 step 損失 | 攻方行動時 MAE 1.353 對全猜 0 的 1.967，R² +0.146；遭遇戰五分位 MAE 勝過基準與 `stacksExposed`；攻方行動時不勝過 `stacksExposed`（R² +0.013 [−0.008, 0.033]） | 可用；攻方行動時與未分配版相當 |
| `maxSingleStackExpectedLoss` | O 的戰鬥 step 損失 | 對距離基準有小增益，在 `stacksExposedAllocated` 之上沒有增益（遭遇戰為負） | 不採用 |
| `supplyCuttable`、`supplyBestCut` | O 斷 trace 的單位增加 | 攻方行動時 R² +0.092、遭遇戰 +0.093，攻方行動時分桶 MAE 勝過基準；守方行動時區間含 0 | 可用於攻方行動與遭遇戰 |
| `supplyCuttable` | O 下一個己方回合的耗損 | 在現在的 `outOfTrace`（R² 0.14–0.28）之上沒有增益 | 預測切斷，不預測耗損 |
| `hqsInReach` | O 失去的 HQ | 三個角色的 R² 都通過（攻方行動時 +0.198）；MAE 都沒有勝過全猜 0 | 風險條件 |
| `dumpSpInReach` | O 的補給堆被奪、被毀或自炸的 SP | 任何角色都不通過 | 不採用 |
| `mover.surplusCombatSp` | O 的戰鬥 step 損失 | 任何角色都不通過 | 不採用 |
| `mover.unitsWithReach` | O 的戰鬥 step 損失 | 合併角色時 R² +0.133，分角色只剩攻方行動時的五分位 MAE；合併的增益來自角色混雜 | 不採用 |
| `mover.objectiveReachColumn` | P 奪得的目標點 | 在 `bestObjectiveEffectiveColumn` 之上再加 R²：攻方行動時 +0.030 [0.010, 0.053]、遭遇戰 +0.036 [0.012, 0.063]；守方行動時沒有增益。對距離基準 R² +0.108～+0.211 | 可用，取代 2 格內的有效欄位 |
| `expectedLossAllocated` | O 的戰鬥 step 損失 | 對距離基準攻方行動時 R² +0.134、MAE 勝出；在 `stacksExposedAllocated` 之上沒有 R² 增益，只有遭遇戰的固定分桶 MAE 勝出 | 與分配後暴露相當，不取代 |
| `rearHexesInReach` | O 斷 trace 的單位增加；O 失去的 HQ | 攻方行動時 R² +0.061 與 +0.073；守方行動與遭遇戰不通過；只比過距離基準 | 攻方行動時可用，未和 `supplyCuttable`、`hqsInReach` 比較 |
| `hqDependentUnitsInReach` | O 斷 trace 的單位增加；O 下一個己方回合的耗損 | 守方行動時斷補增加 R² +0.054 [0.002, 0.098]；對耗損沒有增益 | 弱 |
| `outOfTraceUnfed` | O 下一個己方回合的耗損 | 合併角色時勝過 `outOfTrace`，但各角色內都不勝過 `outOfTrace` 的分桶；合併的增益來自各角色斷補程度不同 | 不採用 |

上表是在已看過的資料上的探索結果。[前瞻確認](../quality/evidence/ai-position-confirmation-2026-10-19/README.md)在事先登記後，以既有對局擬合模型，在 160 局新對局（標準策略自戰、全新種子）上判定 27 格假設，20 格通過。確認成立的有：目標 VP 風險（攻方行動、遭遇戰）、攻方行動時付得起的目標風險優於原版、以移動範圍為準的目標欄位及其優於 2 格有效欄位（攻方行動、遭遇戰）、分配後暴露（攻方行動、遭遇戰）、`hqsInReach`（三個角色）、攻方行動時 `rearHexesInReach` 對斷補增加。未確認的有：`supplyCuttable` 對斷補增加、`rearHexesInReach` 對 HQ 損失，以及守方行動時的目標點指標。近期預測不代表推高指標的策略能提高終局 VP。

戰區配置的 `potential`（[戰區補給配置](theater-supply-plan.md#結果)）在 80 局新的西歐攻擊戰中確認：攻方行動時預測本回合取得的目標 VP，勝過 `objectiveReachColumn` 與 `payableObjectiveVpInReach`；終局 margin 在 M2 之上的增益未通過登記的回溯檢驗。

終局預測（[重驗](../quality/evidence/ai-position-metrics-p6-2026-10-19/README.md)，正確對局識別與種子分組）：攻擊戰中，step 差與斷補差在 VP 之外預測終局 VP 差，到 Game Turn 5 的 R² 增益區間都不含 0（Game Turn 3 為 +0.289）；雙方的 `objectiveReachColumn` 與 `objectiveVpAtRisk` 再往上加，Game Turn 3～7 的 MAE 每局少 0.35～0.95 VP，區間都不含 0，R² 增益在 Game Turn 5、6 通過。分配後暴露與 `hqsInReach` 對終局沒有增益。遭遇戰（69 條軌跡）沒有任何增益通過。前瞻確認中，攻擊戰 96 局新對局的目標點類增益在 Game Turn 3～7 都通過（MAE 每局少 0.55～1.34 VP），step 與斷補勝過只看 VP 只在 Game Turn 4、5 通過。遭遇戰沒有登記；新對局的 64 局遭遇戰中，step 與斷補在 Game Turn 3～7、目標點類在 6～7 的 R² 增益區間不含 0，屬未登記的觀察（`bot-position-final-validation`）。

改版層級的同批關聯（[P8 試驗層級替代性](../quality/evidence/ai-position-surrogacy-2026-10-19/README.md)，事先登記）：12 個權重各減半與加倍的 24 個變體，各與標準策略在攻擊戰交換座位打 8 對。Game Turn 4 的 M2 預測差與同批終局效果相關，試驗層級 R² 0.517 [0.188, 0.763]；step 與斷補的 M1 已達 0.485。M2 相對當下 VP 的 R² 增益區間含零。這些是同一批對戰的效果均值，不能直接解讀為能預測另一批種子上的 VP 改善。P8 登記問題的判定保留，對改版效果轉移的資格由下列 P8a 另外檢查。單項局勢指標不能因單局內預測有效就當 reward。

### 改版效果能否轉移到另一批種子

[P8a 跨種子與改動方向驗證](../quality/evidence/ai-surrogate-transfer-2026-10-19/README.md) 沿用 P8 的 384 份對戰來源、24 個改版、12 個權重家族、8 組交換座位種子。實際只有 230 條不同軌跡，因為部分改動不影響玩法。這是已檢視資料的探索，不是新增對戰或獨立前瞻確認。

每種地圖各取 2 組種子產生第 4 回合代理值，預測另 2 組種子的終局 VP 效果，枚舉 36 個有方向的平衡切分。主要比較直接使用歷史 P6 模型的 M2 與 M0，不在 P8 上重擬合；次要的一元校準每次排除同權重的兩個方向。完整方法見[改版效果預測的資料隔離](vp-metrics.md#改版效果預測的資料隔離)。

| 方法 | VP 效果 MSE | VP 效果 MAE |
|---|---:|---:|
| 猜零增益 | 3.3273 | 1.3397 |
| 其他改版的開發終局平均 | 3.4524 | 1.3961 |
| 該改版已完成開發局的終局效果 | 4.9549 | 1.7384 |
| 直接使用第 4 回合 VP 效果 | 3.3728 | 1.3438 |
| 歷史 M0，只用 VP | 3.2529 | 1.3294 |
| 歷史 M1，VP 加 step 與斷補 | 3.0255 | 1.2799 |
| 歷史 M2，M1 加目標可達與風險 | 3.1499 | 1.3116 |

事前指定的 M0 減 M2 平方誤差增益為 0.1030 VP²，描述性家族重抽區間 [−0.5757, 0.8646]。36 個切分只有 17 個改善；東歐為 −0.4916，西歐為 +0.6976。刪除某一權重家族後的固定預測平均增益範圍為 [−0.1752, 0.2951]，方向不穩定。不能由原本 0.517 的同批 R² 認定 M2 已能選出更好的新改版。

M1 點估計最好，但不是事前主要比較。它相對猜零的 MSE 增益 0.3017，描述性區間 [−0.3960, 1.0338]，仍只列候選。用每次切分中預測最高的改版作探索性選擇，M2 在另一批種子的平均效果為 +0.229 VP，全部改版平均 +0.188；M1 為 +0.965。這 36 次選擇互相重疊，不能當作獨立成功案例，也不構成策略升級證據。

本批再校準的 M0、M1、M2 以及六個單項指標，其 MSE 全部高於猜零。加入更多本批擬合沒有補上轉移缺口。所有方法、權重家族、地圖與切分都保留在證據中，沒有只挑 M1 或西歐的好數字。

共同噪音負對照中，同批早期與終局值完全相同、相關為 1，跨種子卻比猜零多錯 0.2541 VP²。真正的正向、負向訊號與家族方向不同的控制均通過，包含刻意洩漏家族結果的對照。實際 M2 的同批共變異 0.9268 中，分解出的同種子項約 0.2467；其餘有限面板的跨種子共變異仍為正。不能把全部關聯說成假象，也不能把分解後的量直接當成已識別的真實 R²；step 的修正變異甚至為負。方法只報有符號的量，不裁成零或生成潛在 R²。

結論限於這批攻擊戰、兩種地圖與單一權重擾動。預測誤差同時受改版差異小、每方向只有 8 組種子及共同來源影響。家族重抽只描述固定預測與這些地圖，沒有包含重擬合、地圖母體或挑選的不確定性。下一步需用規則與決策條件拆解「機會存在但沒有轉成保有 VP」的案例，再以未參與選擇的資料檢查候選，不能直接把任一單項局勢指標當 reward。

負對照：獨立隨機特徵在舊的樣本內方法下也得到區間排除 0 的新增 R²，但樣本外 R² 下降（[對照](../quality/evidence/ai-position-validation-2026-10-18/negative-control.json)），所以只採用樣本外的比較。

`dumpSpInReach` 與補給堆損失的先前描述性結果見 [量測證據](../quality/evidence/ai-position-exposure-2026-10-18/README.md)。[西歐 16 局的擴充指標探索](../quality/evidence/ai-position-metrics-temperate-2026-10-18/README.md) 則使用 208 個玩家回合，全部屬樣本內比較。按目前 recorder 拆出 attrition 後，`stacksExposedAllocated` 對其餘損失事件的 r 為 0.25，遭遇戰的 `maxSingleStackExpectedLoss` 為 0.37；可支付目標數對當回合丟點的 r 由幾何指標的 0.34 升為 0.44。這些數字是代理量的描述性關係，不證明支付可行、損失分類正確或預測改善。原批 raw 紀錄目前未能取得，不能用另一批存檔宣稱重現原結果。

### 移動決策的實際阻擋

[移動觀測研究](../quality/evidence/ai-movement-observation-2026-10-19/README.md) 重用兩回合驗證局與一份歷史快照的 30 步續跑，取得 69 組單位目的地評估及 13,737 個已評分候選。觀測開關與凍結版本的行動、查詢、記憶、亂數及狀態一致。這些資料用於驗證觀測與形成候選指標，沒有新增策略強度結論。

| 已觀測評分組的結局 | 組數 |
|---|---:|
| 選到移動 | 58 |
| 目前保留分數中沒有候選優於原地 | 10 |
| 所有較高分候選都未通過友軍補給保持檢查 | 1 |

39 次最終補給拒絕發生於 6 組，其中 5 組仍找到替代移動。補給修正另有 896 個符合目前篩選的候選，實查 356 個，其中 27 個修正了分數，540 個因預算未查。這 540 個的真實修正結果未知。補給修正上限沒有套到最終保持檢查；實際有一組檢查 13 個候選。

角色組成也影響總量。52 組戰鬥單位有 7,333 個已評分候選；4 組 HQ 與 13 組砲兵合計有 6,404 個。總體的分數項敏感度會受到支援單位大量目的地影響，須按角色及指派目標分開檢視。分數門檻、條件耗盡與比例的定義見[移動候選指標](vp-metrics.md#移動候選的描述性指標)。

### 移動選項與實際 VP 的連結

兩份樣本的 159 個派送已透過 session 重播，事件、違規、每步 hash 與接受歷史均對上。69 組中只有 29 組指派 VP 目標；唯一補給選項耗盡組的目標是非 VP 的 HUNT，且其候選路徑沒有涉及 VP 目標。因此這批不能估計目標補給選項耗盡與 VP 失敗的關係。[結果與來源](../quality/evidence/ai-movement-objectives-2026-10-19/README.md)

完整生成樣本有 50 組、44 筆相關目標列，包含 22 組指派 VP 目標，沒有目標易手。44 筆都觀測到己方回合結束，37 筆另有後續對手回合；其餘 7 筆因遊戲結束而沒有該期限。去重後分別只有 16 與 9 個玩家／目標／結果回合窗口。這些是相依的描述記錄，不能把目標列數當成試驗數。

歷史快照的 30 步續跑有 19 組、29 筆相關目標列，其中 7 組指派 VP 目標。唯一奪點發生在第 2 個派送，HQ 移動進入 `15,4`，把 4 VP 從軸心轉為盟軍，雙方 margin 改變 8 VP。該組沒有指派目標，若只量測指派目標完成率，就會漏掉這次實際得分。候選路徑與接受行動的目標身分必須保留。

這份續跑停在己方 Movement，29 筆都缺少己方回合結束及下一個對手回合結果；目前已奪得目標不能當成已保有。後續指標比較要同時保留規劃意圖、路徑涉及的目標、實際取得及觀測期限，並蒐集有正負取得與保有結果的跨策略樣本。現有連結驗證不提供相關性、因果增益或可升級策略的證據。

目前可把「拒絕頻率」與「組別是否耗盡替代選擇」分開，並在觀測期限完整時連到同一目標的取得及對手回合後控制。沒有選到移動可能是合理的原地防守，不能直接視為失誤。下一個驗證問題是這些組別結局及分數敏感度能否在跨策略資料預測目標轉換，並由合法替代行動續跑確認終局 VP 效果。

### 擴充指標的直接比較

[舊量測契約稽核](../quality/evidence/ai-position-metric-audit-2026-10-19/README.md) 的 16 份存檔去重後為 12 條軌跡、8 組地圖種子、156 個窗口。這批使用行動方修正前的 recorder，25 個窗口的原始選擇者與實際行動方不同；舊局部兵力比分桶的 MAE 增益及角色結論不再作為有效預測證據。原 evidence 保持原樣。攻擊戰存檔含空軍任務，不能稱為純地面資料。

新的[同目標研究](objective-metrics.md) 在先後手決定後取樣，連結每個目標的兵力條件、全部控制事件與結束持有者，以固定 Bernoulli 模型比較距離、兵力比及實際相鄰組的規則條件。其探索結果不取代上節 P5、P7 的局勢指標比較，也不表示已找到能推高終局 VP 的策略。

本研究核對 P5 對應存檔的 208 個含別名窗口，實際行動方與雙方目標取得／失去次數及 VP 均一致。main 的 recorder 已排除 WEATHER、FIRST_PLAYER 後才開列，P2～P7 使用修正後資料；不能把舊輸入的缺陷套回新的證據。兩批契約與差異見[對帳紀錄](../quality/evidence/ai-objective-methods-2026-10-19/main-alignment.json)。

### 量測修正順序

規則引擎反例已重現三類契約缺陷，見同份證據的 [探針輸出](../quality/evidence/ai-position-metric-audit-2026-10-19/semantics-probe.json)。先修正這些量測，再比較策略，避免最佳化錯誤的數字。

1. `bot-position-loss-attribution`。損失已逐事件判斷 attrition，並歸屬事件發生時的玩家回合；仍須保留 phase、segment、transaction 與原因，分開直接戰鬥、砲擊、過度堆疊及其他消滅，核對實際 step 變化。現有 2-step 單位因過度堆疊消滅，只記一個 `combatStepsLost` 事件。
2. `bot-position-crt-expectation`。指定合法領隊並枚舉 Surprise；明示 option 的撤退／承損假設。AR 4 對 AR 3 的反例中，現有值是 0，正確領隊的戰鬥骰期望為 0.2778，加上 Surprise 為 0.3987。整回合 Kill／Loss 的候選應另量共同可行攻擊分配的期望總和；單格最大值不能替代總量，後者仍是待驗證設計。
3. `bot-position-payability`。讓恢復後內部存量、口糧、燃料、來源可達性與單位指派使用同一份支付見證。已重現強制恢復後可合法用內部存量攻擊、指標卻報不可支付的低估，以及一個 1 MP 單位同時計入兩個不能同回合兼顧的空目標的高估。

終局重驗與前瞻確認的結果見[指標是否可用](#指標是否可用)。近期與終局預測都不代表推高指標的新策略能提高 VP；跨策略改善的驗證仍開放（`bot-vp-predictive-metrics`）。

## 已知缺口

- 清單只量了 32 局、兩種地圖、32×24、不開地圖上空軍。E1、E3、E5 已做接續測試；E2 的口糧恢復修正已有同種子重跑。E4 的兵力配置與 E6 的貼近走法仍待接續測試。
- 終局預測的重新驗證見 `bot-position-final-validation`；跨策略改善的驗證見 `bot-vp-predictive-metrics`。量測契約缺陷見 `bot-position-payability`、`bot-position-crt-expectation`、`bot-position-loss-attribution`。
- 已記錄的功能缺口（不會用某項規則）見 [TODO 清單](../quality/05-todo-inventory.md) 的 `bot-*` 項目，不在這份清單重複。

## 驗證

- [錯誤普查紀錄](../quality/evidence/ai-error-census-v79-2026-10-18/README.md)
- [E1 接續測試](../quality/evidence/ai-defender-assault-continuation-2026-10-18/README.md)
- [E2 原因、E3 與 E5 接續測試](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)
- [擴充指標的量測契約與分組比較](../quality/evidence/ai-position-metric-audit-2026-10-19/README.md)
- [局勢指標的分組樣本外驗證](../quality/evidence/ai-position-validation-2026-10-18/README.md)
- [局勢指標的記錄](../quality/evidence/ai-position-record-2026-10-18/README.md)、[檢驗](../quality/evidence/ai-position-analysis-2026-10-18/README.md)、[分配後暴露量與補給堆損失](../quality/evidence/ai-position-exposure-2026-10-18/README.md)與[西歐 16 局擴充指標與損失拆分檢驗](../quality/evidence/ai-position-metrics-temperate-2026-10-18/README.md)
