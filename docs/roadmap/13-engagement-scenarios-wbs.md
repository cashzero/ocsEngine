# 劇本 0.5.0：遭遇戰拉近、攻守劇本、地圖外空軍

狀態：**IN PROGRESS**。S1–S7 完成；SCN-R3 有一個 seed 未達標（TODO `scn-start-trace`）；攻守平衡依使用者原則待電腦行為確認後再調（TODO `attack-balance`）。

需求來源（使用者，2026-10-07）：「目前的劇本是遭遇戰 但我覺得初始距離過遠 請拉近。並且加入一方進攻一方防守的不對稱劇本配置」；
「進攻方兵力要比較多吧」；「但進攻的劇本 防守方開場要佔據更多土地」；「可以加入off map 空軍」（使用者決定：只給進攻方）；
「進攻方應該就不需要garrison unit 反之防守方可以多一點」、「Garrison 也可以適度配置在非vp關鍵點」。

現行設計：`docs/game-flow/deployment.md`「Engagements」。

| # | 內容 | 狀態 |
|---|---|---|
| S1 | New Game request 加入劇本類型（缺省為遭遇戰） | DONE |
| S2 | 部署：分界、縱深、攻守目標與駐守、守方戰鬥模式、攻方先手、攻方 1.5 倍兵力、攻方勝利條件 | DONE（SCN-R3 除外） |
| S3 | `ai-match --engagement` 與攻守分組研究工具 | DONE |
| S4 | 西歐地圖電腦互打與平衡 | DONE（之後的鐵路、卡車、hedgehog、架橋改動未重新量測，見 `attack-balance`） |
| S5 | UI：New Game 劇本選單、預覽與遊戲中顯示攻守與勝利條件 | DONE |
| S6 | 真實瀏覽器（NG-11） | DONE（NG-11 之後因 VP 配置修改重開，見 `03`） |
| S7 | 攻方地圖外空軍（規則、生成、UI、電腦、瀏覽器 NG-12） | DONE（NG-12 因 AEP 修改重開，見 `03`） |

| 列 | 結果 |
|---|---|
| SCN-R1 遭遇戰起始距離中位數 ≤ 12 格、無相鄰 | PASS |
| SCN-R2 三種劇本 × 三種規模 seed sweep 無失敗 | PASS |
| SCN-R3 開局每方 ≥ 95% 戰鬥單位在 trace 內 | **IN PROGRESS**：599／600 方達標 |
| SCN-R4 攻守戰目標、駐守、先手、兵力、勝利條件 | PASS |
| SCN-R5 heuristic 互打攻方勝率 30%–70% | PASS（當時 45%） |
| SCN-R6 對 random-legal ≥ 90% | PASS |
| SCN-R7 真實瀏覽器 | PASS（當時） |
| AIR-OM1～5 地圖外空軍 | PASS |

原始計畫、量測與實作紀錄：`docs/quality/evidence/engagements-plan-2026-10-07/README.md`。
