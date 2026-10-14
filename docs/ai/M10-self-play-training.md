# M10 自我對戰訓練（heuristic 權重）

日期：2026-10-06 起。計畫與驗收：[M9 AI Bot WBS](../roadmap/11-ai-bot-wbs.md) §6（T1–T5）。
狀態：**暫停**（2026-10-06，使用者決定改以對局紀錄研究改進策略，見 [M9 對局紀錄研究](M9-replay-study.md)）。

## 1. 方法

- 起點：heuristic@1 的預設權重（`DEFAULT_HEURISTIC_WEIGHTS`，B5 驗收版本）。
- 每代：隨機改 1–3 個權重（實數 × e^(0.5·N(0,1))；計數 ±1），挑戰者對冠軍，每批 6 組 seed、每組交換座位，溫帶與東歐地圖輪替。
- 判定：至少 12 組後，若挑戰者勝場 > 負場且符號檢定 p < 0.05（和局不計）→ 關卡；勝場 ≤ 負場或得分 < 45% → 淘汰；30 組未定 → 放棄。
- 關卡：挑戰者對 random-legal 10 組（20 局，含存檔重播），零錯誤且勝率 ≥ 90% 才升為冠軍。
- seed 從未重複使用：訓練 200000 起、關卡 600000 起、最終評估 900000 起。
- 紀錄：`tmp/ai-train/main/log.jsonl`（每代的權重變化、比分、p 值、判定、seed）、`state.json`（可續跑）、`champion-g*.json`。

## 2. 訓練紀錄

以 heuristic@1 權重為冠軍跑了 4 代，沒有任何挑戰者顯著勝出：

| 代 | 改動 | 對冠軍（勝-負-和） | p | 判定 |
|---|---|---|---|---|
| g1 | artilleryBeyondRange 4→6.12、truckTowardGoal 5→4.03 | 24-21-15 | 0.38 | 未定 |
| g2 | barrageDisruptBeforeAttack 10→12.91、artilleryInRange 20→25.67 | 9-10-5 | 0.68 | 無改善 |
| g3 | vacateOptionShare 0.7→0.59、stratModeEnemyDistance 10→11、attackThreshold 4→9.15 | 30-24-6 | 0.25 | 未定 |
| g4 | barrageSupply 1.2→2.14、progressFront 6→7.20、artilleryInRange 20→26.43 | 24-25-11 | 0.61 | 無改善 |

觀察：權重的小幅變化造成的勝率差異落在雜訊內（每代 24–60 局），而對局紀錄顯示輸的原因是策略結構（空目標、補給），不是數值。

## 3. 驗收

T1（預設權重與重構前行為相同）PASS；T2–T5 隨訓練暫停而未進行。
