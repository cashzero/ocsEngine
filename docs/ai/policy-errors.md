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
| E6 | 攻方停在敵前 2–3 格 | `ai-concentration-study.mjs` | 離敵 2–3 格的戰力（118）約等於相鄰的（116）；主攻群 2.5 個單位只有 1.2 個貼近目標 | 待測（v81–v83 的集結改法都較差，見 [heuristic-policy](heuristic-policy.md)） |
| E7 | 目標點空著被敵軍走進 | 重播：失去目標點時格內無守軍 | 0.7–1.7 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：失去時格內無己方戰鬥單位的目標點，幾乎都是同一個玩家回合內守軍被擊毀或撤退後敵軍進入（遭遇戰每局 2.00／2.38、守方 3.38／3.50）；己方移開後被走進的只有遭遇戰 0.38、守方 0.13 |
| E8 | 整局沒移動過的戰鬥單位 | 重播 | 守方 11.5、遭遇戰 6.6、攻方 1.4 | **大多不是錯誤**（[紀錄](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)）：多數是不能移動的駐軍（守方 9.63、遭遇戰 5.56）；能移動卻整局沒動的每局 0.7–1.4 個 |
| E9 | 砲兵多在 Move Mode、砲擊少 | `ai-concentration-study.mjs` | 戰鬥時 Move Mode 406 次、Combat Mode 10 次；每階段砲擊 0.5 次 | 改 Combat Mode 已試過無效（v80），問題在砲擊評分而非模式 |

查過、沒有發現問題：最後回合漏掉的奪點機會 0、保留補給且當下 VP 較高的移動 0、重複指派的奪點任務每局 0.06。

## 已知缺口

- 清單只量了 32 局、兩種地圖、32×24、不開地圖上空軍；E1 以外都還沒做接續測試。
- 已記錄的功能缺口（不會用某項規則）見 [TODO 清單](../quality/05-todo-inventory.md) 的 `bot-*` 項目，不在這份清單重複。

## 驗證

- [錯誤普查紀錄](../quality/evidence/ai-error-census-v79-2026-10-18/README.md)
- [E1 接續測試](../quality/evidence/ai-defender-assault-continuation-2026-10-18/README.md)
- [E2 原因、E3 與 E5 接續測試](../quality/evidence/ai-error-continuations-v85-2026-10-18/README.md)
