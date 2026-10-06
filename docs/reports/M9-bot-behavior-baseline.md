# M9 電腦行為基準（heuristic@1）

日期：2026-10-06。計畫：[M9 AI Bot WBS](../roadmap/11-ai-bot-wbs.md) §B5；設計與實作差異：[評分與規劃](../ai/M9-scoring-and-planning.md) §9。
狀態：**IN PROGRESS**：預設地圖的 B5 驗收列全部通過，但東歐風格地圖勝率不足（見 §4），B5 不得標為完成。

## 1. 方法

- 對局：`scripts/ai-match.mjs`（Node headless，4 worker），預設 New Game（32×24、每方 6 師、8 回合），每組 seed 交換座位成對（`--swap`）。
- 驗收指標：`scripts/ai-acceptance.mjs <對隨機電腦的輸出> <電腦互打的輸出>`。
- 調參與驗收分開：調參或診斷用過 seed 0–39、1000–1039、2000–2019、3000–3039、4000–4019、5000–5001、6000–6039、7000–7019、8000–8039、9000–9019、9500–9609；
  每次改行為後都換一組沒看過的 seed 重跑驗收。下表 §2 是最終程式碼在全新 seed（10000–10039、11000–11019）上的結果；§3 另列各風格。

## 2. 驗收結果（最終程式碼）

| row | item | measured | pass |
|---|---|---|---|
| B5-1 | vs random-legal: FINISHED, no errors, replay hash matches | 40/40 | PASS |
| B5-1 | heuristic vs heuristic: FINISHED, no errors, replay hash matches | 20/20 | PASS |
| B5-2 | wins against random-legal (≥ 90%) | 38/40 = 95% | PASS |
| B5-2 | wins as allied (≥ 80%) | 19/20 = 95% | PASS |
| B5-2 | wins as axis (≥ 80%) | 19/20 = 95% | PASS |
| B5-3 | games ending with an objective taken from the other side or nobody (≥ 80%) | 39/40 = 98% | PASS |
| B5-4 | games with contact where the heuristic attacked (≥ 90%) | 40/40 = 100% | PASS |
| B5-4 | median odds of declared regular attacks (≥ 3:1) | 14.0:1 over 228 attacks; below 2:1: 0% | PASS |
| B5-4 | games with at least one barrage (≥ 50%) | 32/40 = 80% | PASS |
| B5-5 | games where fuel was paid | 40/40 | PASS |
| B5-5 | games where trucks brought SP to the army (unloaded beside it, or spent from their cargo) | 40/40 (unloads in 31, cargo spent in 39) | PASS |
| B5-5 | games with a rebuild | 26/40 | info |
| B5-5 | combat units in supply at the end (≥ 80%) | 97% | PASS |
| B5-6 | pending decisions answered by a named responder, not the first-option fallback | supply-source 531, defender-terrain 135, first-player 131, combat-option 231, safest-hex 150, defender-lead 89, advance 176, cheapest-loss 45 | PASS |

另：電腦互打 20 局（seed 11000–11019）Allied 12 勝、Axis 7 勝、1 和；B5-5「有重建」只記錄不判定，因為 policy 在有重建選項時一律先重建。

## 3. 各地圖風格

| 地圖風格 | seed | 局數 | 勝 | 和 | 負 | 勝率 |
|---|---|---|---|---|---|---|
| 溫帶內陸（預設） | 10000–10039 | 40 | 38 | – | – | 95% |
| 地中海沿岸 | 11600–11609 | 10 | 10 | 0 | 0 | 100% |
| 東歐（調參時看過的 seed） | 9500–9509 | 10 | 6 | 3 | 1 | 60% |
| 東歐 | 11500–11509 | 10 | 10 | 0 | 0 | 100% |
| 東歐 | 12000–12019 | 20 | 16 | 2 | 2 | 80% |
| **東歐合計** | | 40 | 32 | 5 | 3 | **80%（未看過的 30 局為 26/30 = 87%）：未達 90%** |

東歐地圖只有 4 個目標、道路少、補給追蹤範圍約為溫帶地圖的一半，奪下的遠方目標容易斷補或被對方取回；輸局與和局多為 2:4、4:4、6:6。

## 4. 人工檢視（B5-7）與修正紀錄

檢視方式：`scripts/ai-narrate.mjs` 逐回合摘要（每步行動種類、攻擊勝率比、決策理由、移動目標），加上 objective 控制、補給範圍與
step 損失原因的時間線（診斷腳本未納入版本庫）。檢視 6 局（三種地圖風格各一組交換座位）與調參過程中 8 場輸局或和局。發現並已修正：

| # | 觀察 | 影響 | 修正 |
|---|---|---|---|
| 1 | HQ、砲兵沒有被指派目標，從不付燃料，整局停在後方 | 前線拿不到 HQ 投送的補給，無法重建 | 非戰鬥單位一律付燃料跟上部隊 |
| 2 | 6 個單位擠進同一個目標格 | 一次砲擊就打亂整群 | 同格擁擠扣分 |
| 3 | 部隊衝出補給範圍、HQ 跟到前線被切斷 | 一局因消耗損失 18 個 step，HQ 全滅 | 離開 trace −60、HQ 先移動、只靠 HQ 投送的格子扣分 |
| 4 | 已佔目標沒有守軍，對方隨機單位經過就拿走 | 領先 12:0 最後輸掉 | 已佔目標一律留守軍；最後兩回合奪下的目標要停在格上 |
| 5 | 敵軍滲透到後方切斷補給 | 整條戰線斷補 | 我方補給區內、目標或 HQ 附近的敵軍列為獵殺目標 |
| 6 | 卡車把補給載到前線後，同一階段不能卸貨 | 卡車無法回頭載下一批 | 抵達部隊旁當場卸貨 |
| 7 | 砲兵追逐地圖角落最近的敵人 | 不支援主攻 | 砲兵留在部隊附近、射程內 |
| 8 | 最後一回合仍選先手 | 對方最後行動，順手拿走空目標 | 最後一回合選後手 |
| 9 | 為搶目標發動 1:2 攻擊 | 預估守方 step 數用單位數，太樂觀 | 用印刷 step 數估算；除最後一回合搶目標外不打 1:1 以下 |
| 10 | 守方選領頭單位時讀不到「DRM −1」 | 規則標籤用 U+2212 負號，被讀成 0 | 解析 −、-、+ 三種符號（回歸測試已加） |
| 11 | 東歐地圖補給範圍小，部隊停在範圍邊緣不前進 | 多為 3:3、4:4 和局 | 目的地 3 格內有我方補給堆或載貨卡車時，超出 trace 的扣分降為 −10 |

仍存在、尚未修正（列為 TODO）：

- **東歐風格勝率不足**（`bot-eastern-front`）：見 §3。缺少的行為是長距離推進時的補給接力（extender、分段卸貨、前線 HQ 轉移），
  與守住遠方奪下目標的能力。使用者可見影響：在東歐地圖上電腦常打成和局。關閉證據：東歐風格 20 局（交換座位）勝率 ≥ 90%。
- 不使用 Reserve、Reaction 反擊、Extender、Breakout；空軍只用隨機合法方式回應決策（`bot-air`）。
- 攻擊勝率模型不含 Surprise（9.8）。

## 5. 隨機電腦補跑（規則壓力測試）

| 批次 | 局數 | 結果 |
|---|---|---|
| 開啟空軍與空運（`--air STANDARD --air-transport STANDARD`），seed 200–219 | 20 | 全部 FINISHED、replay 相符；空軍任務 940 次、補機 269 次、建 Air Base 144 次、空降計畫 90 次 |
| 大地圖（64×48、LARGE），seed 300–307 | 8 | 全部 FINISHED、replay 相符；每局約 50 秒 |

兩批都沒有發現新的規則錯誤。
