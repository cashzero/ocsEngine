# 戰區補給配置

狀態：**指標已前瞻確認（近期奪點）；終局預測未通過；策略上層已實作（權重預設關閉），西歐觀測未確立幫助**。量測工具全部在 `scripts/`，不被 bot 讀取。工作項目見 [局勢指標研究 WBS 的 P11](../roadmap/18-position-metrics-wbs.md)。

## 範圍

使用者描述人類玩家的作戰規劃（2026-10-20）：依鐵路與道路劃定戰區，分配 HQ 與 SP，再配置兵力，在這個前提下最大化相對於 VP 的戰力配置。這一層在原有的指標與策略中都不存在：

- 局勢指標（[定義](policy-errors.md#局勢指標)）只看下回合的移動範圍或目標 2 格內，對每個目標取最大欄位；可支付版本把全前線的剩餘 SP 合成一個池（`bot-position-payability`）。
- heuristic 的目標分配（[目標分配](heuristic-policy.md#目標分配movement-segment-建立存在當步驟的-botphasememory)）是扁平的：守備、主攻（`MainEffort`）與奪點逐單位指派，卡車與鐵路把 SP 送往主攻 lead 或部隊重心，沒有戰區與戰區預算。

用途依序為：（1）局勢指標：局面在補給約束下本回合可取得的期望 VP，以及實際實現了多少；（2）策略上層：指標通過驗證後實作並觀測。研究範圍依 [VP 指標研究的範圍](vp-metrics.md)，只限西歐（`WESTERN_EUROPE`）的攻擊戰。

## 現行行為

### 戰區

`scripts/ai-theater-supply.mjs` 的 `theaters` 為每個玩家劃分戰區：從該玩家地圖邊緣補給源（`MAP_EDGE`）1 格內的鐵路格出發，沿鐵路網建立廣度優先樹（相鄰格依 hex ID 排序以固定平手）；每個目標錨定到最近的鐵路格；兩個目標的樹路徑在較近目標之前不到 6 個鐵路格就分岔時歸同一戰區。劃分只依地圖與玩家，整局固定。`theaterZones` 把離戰區目標 3 格內的格子歸給該戰區（多個目標時取最近者）。

[地圖普查](../quality/evidence/ai-theater-survey-2026-10-21/README.md)（P7 的 48 局西歐攻擊戰）：每張圖只有一個鐵路網，全部目標都在鐵路上；攻方約 60% 的地圖只有一個戰區，約 40% 有兩個以上。分岔門檻在 4 至 8 格之間，攻方的戰區數幾乎不變，守方則明顯改變。因此戰區只在少於一半的地圖上分開目標，配置搜尋跨全部目標進行，戰區只作分組與運量的範圍。

### 補給在何處成為限制

- **Combat 階段的戰鬥補給不是限制。** `bestPayableAttack` 在 Combat 局面中找出規則接受、補給可共同支付（`validateAction` 結算全部攻擊者的宣告補給）、欄位最高的攻擊。[Combat 階段核對](../quality/evidence/ai-theater-attack-check-2026-10-21/README.md)：828 次實際攻擊中，最佳欄位沒有一次低於實際欄位；相鄰單位被排除的原因沒有一次是補給；每次進入 Combat 時檢查全部有守軍的未持有目標，因補給而無法攻擊的是 0 次，未被攻擊的目標欄位幾乎都在第 0～4 欄。
- **Movement 階段的燃料是限制。** [燃料核對](../quality/evidence/ai-theater-fuel-check-2026-10-21/README.md)：無法支付燃料的單位佔能到達未持有目標的兵力，攻方 5～9%，守方從 Game Turn 3 起 14～24%（逐單位判斷，是下限）。

### 現行量測與付款時序

[付款時序稽核](../quality/evidence/ai-theater-supply-audit-2026-10-20/README.md)（`progressObjective` 的 15 個分岔、兩個首步、兩條骰流，共 60 條歷史）確認普通 Combat 入口的庫存已反映本回合實際支付的燃料與口糧；遊戲順序是移動、補給、反應、戰鬥，再扣一次會製造假的缺口，付款帳本不構成獨立指標。這不保證下一回合口糧、未來守點補給或多個目標能共同支付。

### 1 回合窗口的運入上限

`inflowBound` 在行動方進入 Movement 時，估計到進入 Combat 前運輸最多能送進各戰區區域的 token：區域外存量，與「鐵路剩餘 Rail Cap 的兩倍（多軌路線半價，規則 4.7b）加上移動範圍碰到區域的卡車載運量（現有貨物加上 MA 付得起的每次裝卸各一車）」兩者取小。[運入核對](../quality/evidence/ai-theater-inflow-check-2026-10-21/README.md)：1,083 個戰區窗口的實際運入都不超過上限；有運入的窗口實際量中位數為上限的 36%，運輸能力只在 72 個窗口成為限制。上限是各戰區分開計算，不能相加。目前配置搜尋不使用運入上限：窗口結束於 Combat，而 Combat 的戰鬥補給不是限制，燃料又在移動時從現有補給堆支付。

### 奪點機率

[奪點機率模型](../quality/evidence/ai-theater-capture-model-2026-10-21/README.md)只用 P5 西歐攻擊戰擬合：對一個目標在一個玩家回合最強的實際攻擊，以規則的戰鬥條件（欄位、DRM、守方能否付補給、hedgehog、線型）的 logistic 預測回合結束時攻方是否持有。線型只有 CLOSE 與 OPEN 兩個指示變數，VERY_CLOSE 與 EXTREMELY_CLOSE 共用基準：模型腳本另外兩個指示變數用了不存在的線型名稱而恆為 0（P5 有 171 列 EXTREMELY_CLOSE 併入基準）；凍結模型與其驗證即依此編碼，該證據中「VERY_OPEN 與 EXTREMELY_OPEN 沒有出現」的說法應理解為這兩個名稱不存在。分組十折的 Brier 比常數低 0.125 [0.099, 0.149]，比只用欄位低 0.028，校準良好，P7 回溯一致。凍結模型存於該證據的 `model.json`。未經攻擊而取得的目標在回合結束時全部仍由取得方持有（P5 118 例、P7 49 例），所以可走進的空目標視為取得。

### 配置搜尋

`scripts/ai-theater-allocation.mjs` 把局面投影到該玩家的 Movement 開始（尚未移動、清除本階段燃料）。可配置單位是有戰力、非戰略模式、不站在己方目標上的戰鬥單位。燃料狀態取自引擎的燃料選項；無法支付燃料的單位只能留在原地，其餘以已付燃料的規則移動範圍為可達範圍。單位可派去走進空目標，或派到目標旁非敵佔、且能單獨付戰鬥補給的格子攻擊。

有守軍的目標，價值為點數乘以凍結模型的奪點機率：把派去的單位放在各自最強的相鄰格，以規則的戰力計算取得欄位、AR 最高者領隊的 DRM、守方能否付補給、hedgehog 與線型。需要移動與燃料的單位必須能一起付清燃料（先買涵蓋兩個以上單位的 HQ 或編隊選項，再每單位 1T）；最終配置的每個攻擊組共同結算戰鬥補給，付不起的以 0 計。`allocate` 先依邊際期望 VP 貪婪指派，再嘗試兩個單位一起改派、單一改派與撤出。

[配置核對](../quality/evidence/ai-theater-allocation-check-2026-10-21/README.md)：576 個玩家回合的 7 單位子問題中，84% 達到窮舉最佳，期望 VP 合計少 1.4%；最終攻擊組共同付不起的是 0 個；完整搜尋中位數 51 ms、最慢 0.78 秒。

### 輸出與記錄

`theaterMetrics` 對一方輸出：`potential`（該方下一個 Movement 的配置期望 VP）、`allocatableSteps`、`unusedSteps`、`strandedSteps`（無法支付燃料）、`idleTokens`（取用不到任何已配置攻擊位置的補給堆 token）、`gapObjectives` 與 `gapVp`（配置後奪點機率低於一半的未持有目標）。`ai-position-record.mjs --theater <model.json>` 在每一列加入雙方的這些輸出，並加入 `theaterRealized`：行動方在本回合進入 Combat 時，從該列起已取得的目標點數加上單位原地不動時的配置期望 VP。不加旗標時輸出不變（[記錄紀錄](../quality/evidence/ai-theater-record-2026-10-21/README.md)）。這些輸出只依局面計算，同一局面不會因策略權重而改變。

## 結果

| 問題 | 回溯（P5 擬合，P7 評分） | 前瞻（P5 與 P7 擬合，80 局新對局） |
|---|---|---|
| 攻方行動時，行動方 `potential` 預測本回合取得的目標 VP，勝過 `objectiveReachColumn` 與 `payableObjectiveVpInReach` | 通過：MAE 1.21 對 1.43、1.44，增益 +0.22 [0.12, 0.32]、+0.23 [0.14, 0.32] | **確認**：MAE 1.30 對 1.51、1.55，增益 +0.21 [0.13, 0.29]、+0.25 [0.17, 0.33]；R² 增益亦不含 0 |
| 在 M2 加入雙方 `potential`，Game Turn 4 的終局 margin | 不通過：MAE 增益 +0.02 [−0.13, +0.18]；Game Turn 3、5 也沒有一致增益 | 未登記確認；觀察到 +0.22 [0.01, 0.48]，Game Turn 3、5 含 0 |

兩次都在分析前登記：[回溯比較](../quality/evidence/ai-theater-validation-2026-10-21/README.md)、[前瞻確認](../quality/evidence/ai-theater-confirmation-2026-10-21/README.md)。`theaterRealized` 與實際取得的目標 VP 接近。攻方在 Game Turn 1～3 只實現潛力的 13～50%（前瞻 21～41%），Game Turn 4 起為 60～80%。這段落差來自策略，或來自潛力的高估（配置不計堆疊上限與友軍移動造成的 ZOC），目前資料無法區分。

## 策略上層

目標是 Game Turn 1～3 潛力與實現量的落差。實作在 `src/ai/policies/theater.ts`，由權重 `theaterAllocation` 開關（預設 0，標準 heuristic@85 不變；行為見 [heuristic 策略](heuristic-policy.md#尚未升級的候選)）：

- 開啟時，攻擊戰的攻方在每個 Movement 步驟做一次配置，以 bot 看得到的資訊估計奪點機率：可達範圍、`attackStrength` 查詢的規則戰力與地形線型（守方取欄位最低者）、估計的敵軍戰力、雙方最高 AR（看不到的守方以 2 計）、hedgehog，守方一律假設付得起補給。凍結模型的係數放在策略中。
- 有守軍的組依期望 VP 依序成為主攻，領頭格是目標本身（HQ 與卡車跟隨）；空目標的單位目標設為 CAPTURE；奪點機率低於 0.25 的組不用，其單位沿用原本分配；剩下的主攻名額沿用多回合主攻。守點單位不參與。

[觀測](../quality/evidence/ai-theater-allocation-games-2026-10-21/README.md)在 80 局新的西歐攻擊戰（事先登記，開啟對標準，交換座位 40 對）：VP 每對 +1.10 [−0.23, +2.43]，Kill − Loss +0.48 [−1.47, +2.42]，Supply +0.23 [−0.14, +0.59]，是否有幫助未確立。Game Turn 1～3 的實現比例（0.31 對 0.33）與取得的目標 VP 沒有改變，目標中的機制沒有出現；略正的 VP 來自 Game Turn 4～8。這批的檢定力對每對 +2 VP 約 0.65。

使用者決定（2026-10-21）：P11 只做實作與觀測，不走升級流程，研究只限西歐。先前誤走升級流程的開發批與中途停止的獨立批只作觀測，東歐的對局不採用。

## 決策

- **戰區切法：鐵路分岔樹。** 使用者確認（2026-10-21）。依目標位置分群不採用，因為目標全在同一鐵路網上；人工標註不採用，因為生成地圖每局不同。
- **時間窗口：1 回合。** 使用者確認。2 回合須在 1 回合版本通過後再加；目前未加。
- **目標函數：校準後的奪點機率乘 VP。** 使用者確認。機率只用開發資料擬合並凍結，不直接把 CRT 欄位當機率；「各戰區戰力與 VP 成比例」未採用為輸出。
- **配置時只檢查單一單位的戰鬥補給，最終組再共同結算。** Combat 階段核對中，單獨付得起的單位共同攻擊時從未因補給必須剔除；逐組共同結算使搜尋第 90 百分位時間為 20 秒，改後為 0.37 秒，結果相同。
- 不把輸出加權成總分，依 [VP 指標研究的決策](vp-metrics.md#決策)。近似最佳化的差值只能當診斷，不能當成因果損失。

## 已知缺口

- `bot-theater-allocation`：配置不考慮堆疊上限與友軍移動造成的 ZOC，只看 1 回合；完整問題（約 20 個單位）的近似差距未驗證；奪點模型只描述 bot 選擇發動的攻擊；守方的戰區劃分對門檻敏感。
- 既有可支付目標代理的合法見證缺口仍由 `bot-position-payability` 維護。

## 驗證

[地圖普查](../quality/evidence/ai-theater-survey-2026-10-21/README.md)、[Combat 階段核對](../quality/evidence/ai-theater-attack-check-2026-10-21/README.md)、[燃料核對](../quality/evidence/ai-theater-fuel-check-2026-10-21/README.md)、[運入核對](../quality/evidence/ai-theater-inflow-check-2026-10-21/README.md)、[奪點機率模型](../quality/evidence/ai-theater-capture-model-2026-10-21/README.md)、[配置核對](../quality/evidence/ai-theater-allocation-check-2026-10-21/README.md)、[記錄紀錄](../quality/evidence/ai-theater-record-2026-10-21/README.md)、[回溯比較](../quality/evidence/ai-theater-validation-2026-10-21/README.md)、[前瞻確認](../quality/evidence/ai-theater-confirmation-2026-10-21/README.md)、[策略上層觀測](../quality/evidence/ai-theater-allocation-games-2026-10-21/README.md)、[付款時序稽核](../quality/evidence/ai-theater-supply-audit-2026-10-20/README.md)。這些都不改變 `docs/quality/03-product-operation-verification-plan.md` 的任何列。
