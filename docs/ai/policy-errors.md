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
| E6 | 攻方停在敵前 2–3 格 | `ai-concentration-study.mjs` | 離敵 2–3 格的戰力（118）約等於相鄰的（116）；主攻群 2.5 個單位只有 1.2 個貼近目標 | 以各單位自己的目標量（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)，`ai-approach-study.mjs`）：攻方移動中停在目標 2–3 格、但目標旁的格子其實到得了的，assault 9%、hunt 20%、capture（目標有敵軍）18%，扣分主要是 `crowding` 與 `exposure`；其餘多是一回合到不了。是否算錯要看局勢；目標點的局勢指標已可用，但暴露量還不能判斷（`bot-position-exposure`，見[指標是否可用](#指標是否可用)） |
| E7 | 目標點空著被敵軍走進 | 重播：失去目標點時格內無守軍 | 0.7–1.7 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：失去時格內無己方戰鬥單位的目標點，幾乎都是同一個玩家回合內守軍被擊毀或撤退後敵軍進入（遭遇戰每局 2.00／2.38、守方 3.38／3.50）；己方移開後被走進的只有遭遇戰 0.38、守方 0.13 |
| E8 | 整局沒移動過的戰鬥單位 | 重播 | 守方 11.5、遭遇戰 6.6、攻方 1.4 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：多數是不能移動的駐軍（守方 9.63、遭遇戰 5.56）；能移動卻整局沒動的每局 0.7–1.4 個 |
| E9 | 砲兵多在 Move Mode、砲擊少 | `ai-concentration-study.mjs` | 戰鬥時 Move Mode 406 次、Combat Mode 10 次；每階段砲擊 0.5 次 | 改 Combat Mode 已試過無效（v80），問題在砲擊評分而非模式 |

查過、沒有發現問題：最後回合漏掉的奪點機會 0、保留補給且當下 VP 較高的移動 0、重複指派的奪點任務每局 0.06。

## 局勢指標

VP、Kill、Loss、Supply 反映不出局勢（使用者，2026-10-18），所以先加上量測並記錄資料，有了資料再分析。
`scripts/ai-position-metrics.mjs` 的 `nextTurnMetrics` 量「下一回合各方能做什麼」：把局面投影成該方的 Movement Segment
（尚未移動、全部已加油），用規則層的移動範圍得到每個戰鬥單位能到的格子（地形、ZOC），忽略對方在中間的行動；一格的攻擊潛力
是所有能到該格旁的單位一起攻擊、守方挑地形時規則給的欄位，所以是上限（同一個單位會算進多個目標）。

| 指標 | 意義 |
|---|---|
| `objectivesAtRisk`、`objectiveVpAtRisk` | 己方持有的目標點中，對方下回合能以第 6 欄以上攻擊、或格內沒有己方戰鬥單位而對方能走進的 |
| `objectivesInReach`、`objectiveVpInReach` | 反過來：己方未持有的目標點中，己方下回合能以第 6 欄以上攻擊或走進的 |
| `stacksExposed`、`stepsExposed` | 對方下回合能以第 9 欄以上攻擊的己方 stack 數與其中的 step |
| `hqsInReach`、`dumpSpInReach` | 對方下回合能到旁邊的己方 HQ，與己方補給堆（不含駐軍存量）的 SP |
| `unitsWithReach` | 下回合能移動的己方戰鬥單位 |
| `supplyBestCut`、`supplyCuttable` | 現在有 trace 的己方戰鬥單位中，對方一個單位移到一格就會斷補的最多單位數，與某一個這樣的移動會切斷的單位數 |

補給線的切斷是估計值：在投影出的狀態中把對方一個戰鬥單位移到一格，用規則層的 trace（敵軍與未被抵銷的 ZOC 阻擋、HQ throw、
formation 共同路線、補給源）重算，數斷補的己方單位。只試對方到得了、且偏離某個己方補給源或 HQ 到某個有 trace 的己方單位的
直線不超過 1 格的格子；補給源與 HQ 旁的全試，其餘挑到彼此不相鄰（一個單位的 ZOC 蓋住鄰格）。對方兩個單位合力封口的情形不算；
在 24 個局面上與逐格全試比較，最大單一切斷 23 個相同，可切斷數相同或略少，每方每個局面約 0.4 秒。`ai-position-record.mjs`
只為不行動的一方（這個玩家回合可能被切斷的一方）計算。

現況指標（`positionMetrics`：VP、目標點、step、DG、接敵、
斷補、SP、乾 HQ）與這些指標一起由 `ai-continue.mjs` 在每個時間點記錄，`ai-position-record.mjs` 則在既有對局的每個玩家回合
開始時記錄，並附上該玩家回合發生的事（各方損失的 step、取得與失去的目標點）與終局 VP。

### 指標是否可用

`scripts/ai-position-analysis.py` 在 252 局不重複的對局上檢驗（[紀錄](../quality/evidence/ai-position-analysis-2026-10-18/README.md)，
補給線切斷：[紀錄](../quality/evidence/ai-position-supply-cut-2026-10-18/README.md)）。
在玩家 P 的回合開始時，對方 O 的指標描述的正是 P 這回合能做的事，所以應該預測 O 這回合的損失；比較的基準是只看距離的現況指標。
另外檢驗各 Game Turn 開始時的指標，扣掉現在的 VP、step 與斷補之後，能否再預測終局 VP 差（以對局交叉驗證）。

| 指標 | 同一玩家回合 | 終局 | 結論 |
|---|---|---|---|
| `objectivesAtRisk`、`objectiveVpAtRisk`（與對方的 `InReach`） | 為 0 的 1,572 個回合沒有失去任何目標點；失去的目標點全部（遭遇戰 98%）發生在大於 0 的回合；失點機率隨數值上升（1：15%、2–3：28%、4–7：53%）；比相鄰基準多解釋 0.19–0.21 的變異（基準 0.02） | 攻擊戰第 3–6 回合點估計多 0.02–0.07 的交叉驗證 R²，但 95% 區間都含 0 | 可用：近期丟點與奪點的領先指標 |
| `hqsInReach` | 攻方行動時 r 0.45（基準 0.01）；為 0 時沒有失去 HQ | 未單獨檢驗 | 可用於攻方的回合 |
| `stacksExposed`、`stepsExposed` | 飽和：73% 的回合 `stepsExposed` 已達 8 以上；全部回合 r 0.08–0.09，攻方行動時 `stacksExposed` r 0.37 | 加入後沒有增益 | 尚不可用（`bot-position-exposure`） |
| `dumpSpInReach` | r 0.05–0.13；結果用的是地圖上 SP 的減少，含 O 自己的支出，沒有被奪或被毀的 SP 紀錄 | 未單獨檢驗 | 未證實（`bot-position-exposure`） |
| `unitsWithReach` | 沒有對應的結果 | 與 rear 指標一起加入沒有增益 | 未證實 |
| `supplyCuttable`、`supplyBestCut` | 對到 O 下一回合開始時斷補單位的增加：r 0.24（攻方行動時 0.31，基準 0.01），多解釋 0.058 [0.041, 0.083]；斷補增加的 98% 發生在大於 0 的回合；平均增加隨數值上升（0：0.43、1–7：1.23、8–15：2.0、16–23：3.32、24–31：4.51），32 以上持平 | 沒有增益 | 可用：近期斷補的領先指標，比目標點的弱 |

同一份檢驗也回答了 Kill/Loss 與 Supply 是否有用：攻擊戰中，在現在的 VP 之外加上雙方 step 差與斷補差，第 2–6 回合的終局預測
都有增益（第 3 回合交叉驗證 R² 由 −0.02 到 0.23，增益 95% 區間 +0.16～+0.37），大部分來自 step 差；遭遇戰（69 局）沒有。
所以在攻擊戰，Kill−Loss 與斷補是 VP 的領先指標，可以作為升級的主要量測。

## 已知缺口

- 清單只量了 32 局、兩種地圖、32×24、不開地圖上空軍；E1 以外都還沒做接續測試。
- 已記錄的功能缺口（不會用某項規則）見 [TODO 清單](../quality/05-todo-inventory.md) 的 `bot-*` 項目，不在這份清單重複。

## 驗證

- [錯誤普查紀錄](../quality/evidence/ai-error-census-v79-2026-10-18/README.md)
- [E1 接續測試](../quality/evidence/ai-defender-assault-continuation-2026-10-18/README.md)
- [E2 原因、E3 與 E5 接續測試](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)
- [局勢指標的記錄](../quality/evidence/ai-position-record-2026-10-18/README.md)與[檢驗](../quality/evidence/ai-position-analysis-2026-10-18/README.md)
