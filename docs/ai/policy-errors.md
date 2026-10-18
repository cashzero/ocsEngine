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

VP、Kill、Loss、Supply 反映不出局勢（使用者，2026-10-18），所以先加上量測並記錄資料，有了資料再分析。工作順序見 [局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md)。
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

終局預測（[重驗](../quality/evidence/ai-position-metrics-p6-2026-10-19/README.md)，正確對局識別與種子分組）：攻擊戰中，step 差與斷補差在 VP 之外預測終局 VP 差，到 Game Turn 5 的 R² 增益區間都不含 0（Game Turn 3 為 +0.289）；雙方的 `objectiveReachColumn` 與 `objectiveVpAtRisk` 再往上加，Game Turn 3～7 的 MAE 每局少 0.35～0.95 VP，區間都不含 0，R² 增益在 Game Turn 5、6 通過。分配後暴露與 `hqsInReach` 對終局沒有增益。遭遇戰（69 條軌跡）沒有任何增益通過。前瞻確認中，攻擊戰 96 局新對局的目標點類增益在 Game Turn 3～7 都通過（MAE 每局少 0.55～1.34 VP），step 與斷補勝過只看 VP 只在 Game Turn 4、5 通過。遭遇戰沒有登記；新對局的 64 局遭遇戰中，step 與斷補在 Game Turn 3～7、目標點類在 6～7 的 R² 增益區間不含 0，屬未登記的觀察（`bot-position-final-validation`）。

負對照：獨立隨機特徵在舊的樣本內方法下也得到區間排除 0 的新增 R²，但樣本外 R² 下降（[對照](../quality/evidence/ai-position-validation-2026-10-18/negative-control.json)），所以只採用樣本外的比較。

`dumpSpInReach` 與補給堆損失的先前描述性結果見 [量測證據](../quality/evidence/ai-position-exposure-2026-10-18/README.md)。[溫帶 16 局的擴充指標探索](../quality/evidence/ai-position-metrics-temperate-2026-10-18/README.md) 則使用 208 個玩家回合，全部屬樣本內比較。按目前 recorder 拆出 attrition 後，`stacksExposedAllocated` 對其餘損失事件的 r 為 0.25，遭遇戰的 `maxSingleStackExpectedLoss` 為 0.37；可支付目標數對當回合丟點的 r 由幾何指標的 0.34 升為 0.44。這些數字是代理量的描述性關係，不證明支付可行、損失分類正確或預測改善。原批 raw 紀錄目前未能取得，不能用另一批存檔宣稱重現原結果。

### 擴充指標的直接比較

[量測契約與分組比較證據](../quality/evidence/ai-position-metric-audit-2026-10-19/README.md) 使用另一批既有溫帶存檔，沒有新增對戰。16 份存檔以完整軌跡去重後為 12 局、8 組地圖種子、156 個窗口；全部最終 hash 相符。每次留出一組地圖種子，模型只使用其他種子的結果。窗口、對手損失定義與前述近期檢驗相同；新增行動方的局部兵力比與最高欄位來預測非行動方的目標 VP 損失。攻擊戰紀錄含空軍任務，這批不能稱為純地面資料。這批由行動方修正前（`df5a0cb`）的記錄器產生，先攻順序改變的 Game Turn 第一列行動方錯置，數值要以修正後的紀錄重算才可與上節比較。可支付目標風險在這批 8 組種子沒有勝過幾何指標；在前瞻確認的 160 局新對局中，攻方行動時則勝過幾何指標。

分桶在比較前固定為 `0`、`(0,1]`、`(1,3]`、`(3,7]`、`>7`，將舊整數分桶延伸到小數；負哨兵值另列。結果如下，MAE 越小越好，各列結果單位不同，不可跨列比較大小。

| 結果與指標 | 零事件 MAE | 舊指標分桶 MAE | 候選分桶 MAE | 判斷 |
|---|---:|---:|---:|---|
| 丟點數，`payableObjectivesAtRisk` 對 `objectivesAtRisk` | 0.2244 | 0.2179 | 0.2308 | 沒有勝過幾何指標 |
| 丟點 VP，`payableObjectiveVpAtRisk` 對 `objectiveVpAtRisk` | 0.6795 | 0.6795 | 0.6923 | 沒有勝過幾何指標或零事件 |
| 非 attrition 損失事件，`maxSingleStackExpectedLoss` 對 `stacksExposedAllocated` | 1.1474 | 1.1891 | 1.1955 | 沒有勝過分配後暴露量 |
| attrition 事件，`outOfTrace` 對 `contact` | 0.1090 | 0.1090 | 0.1090 | 全部仍猜零，只有 6 個非零窗口 |
| trace 斷線正淨增加，`supplyCuttable` 對 `contact` | 2.2949 | 2.3205 | 2.2949 | 只與零事件持平 |
| 補給堆 SP 損失，`dumpSpInReach` 對 `contact` | 0.4551 | 0.4551 | 0.4583 | 沒有較準 |
| 丟點 VP，行動方 `bestObjectiveEffectiveColumn` 對 `objectiveVpAtRisk` | 0.6795 | 0.6795 | 0.6923 | 沒有較準 |
| 丟點 VP，行動方 `localForceRatioAt2Hex` 對 `objectiveVpAtRisk` | 0.6795 | 0.6795 | 0.4968 | 這批最值得保留的候選 |

局部兵力比分桶相對零事件與幾何 VP 分桶的 MAE 增益均為 0.1827，固定樣本外誤差的種子群組 bootstrap 區間為 [0.0801, 0.2832]。攻方行動時 MAE 為 0.8091（零事件 1.0545），遭遇戰 0.7019（零事件 0.8462），守方行動時與零事件同為 0.0816。兩個有增益的角色各只有四組種子，各自對零事件的區間下界都為零；不能把合併結果當作每個角色都已確認。線性加入兵力比的 MAE 增益區間仍含零，這個正向訊號限於固定分桶的中位數模型。

重播核對焦點目標後，兵力比 `>7` 的 13 個窗口來自 6 組種子，全部焦點都由對方控制。其中 8 個焦點沒有守軍，7 個連 2 格內敵軍都沒有；另外 5 個焦點有守軍。無守軍組的 6 個窗口、有守軍組的全部 5 個窗口，隨後發生對手目標 VP 損失。但結果仍是整個窗口的 VP 損失，未對應到焦點目標本身。下一層應把「有守軍的突破機會」與「空目標的奪取機會」分開，在同一目標連結兵力、合法到位、共同支付、控制取得及後續保有。不能把提高原始兵力比直接當成策略目標；完整目標連結與策略干預仍由 `bot-vp-predictive-metrics` 追蹤。

可支付目標數的線性樣本外 R² 雖由 0.102 升至 0.173，MAE 卻由 0.3145 變差為 0.3306，再次說明新增解釋力與典型事件預測是不同判準。這批只有 8 組種子、同一來源與少量非零事件，且比較多個指標、角色和模型而未校正多重比較。局部兵力比是待驗證的候選，不是已選定的策略評分或終局 VP 指標。

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
- [局勢指標的記錄](../quality/evidence/ai-position-record-2026-10-18/README.md)、[檢驗](../quality/evidence/ai-position-analysis-2026-10-18/README.md)、[分配後暴露量與補給堆損失](../quality/evidence/ai-position-exposure-2026-10-18/README.md)與[溫帶 16 局擴充指標與損失拆分檢驗](../quality/evidence/ai-position-metrics-temperate-2026-10-18/README.md)
