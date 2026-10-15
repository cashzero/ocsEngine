# Rail Cap 鐵路運輸與鐵路控制（M13-Rail R4、R5）

狀態：**IN PROGRESS**。RC1–RC4、RC7、RC8 完成；RC5 平衡依使用者決定暫緩（TODO `attack-balance`）；RC6 瀏覽器的「整個師」與 RAIL-15／16 未驗（TODO `rail-cap-browser`）。

需求來源（使用者，2026-10-08）：「OCS的重心是supply 管理。換言之 攻擊方應該處於戰力有余 補給不足的情形。此處不足主因為運力限制」；
「補給應該要可以用鐵路運 查一下這部份規則」；之後「先確認bot正確執行才調整平衡 否則會因為bot bug改爛平衡」。

現況：規則見 manifest `movement.rail-cap`、`supply.rail-front-control`（13.3h 判定的本專案定義寫在其 note）；
預設 Rail Cap 見 `docs/game-flow/deployment.md`「Engagements」；電腦的鐵路使用見 `docs/ai/heuristic-policy.md`；頂部列見 `docs/ui/command-deck.md`。

| # | 內容 | 狀態 |
|---|---|---|
| RC1 | `RAIL_MOVE`、Rail Cap 帳、13.6b 地圖外上車、Trainbusting 加倍、存檔讀回 | DONE（`tests/rules/rail-cap.test.ts`） |
| RC2 | 13.3h 前線控制判定 | DONE |
| RC3 | New Game 每方 Rail Cap 選項、預覽 | DONE |
| RC4 | UI：車站上的部隊與補給、可下車車站、成本、剩餘 Rail Cap；頂部列顯示自己的 Rail Cap | DONE（RAIL-11～14、RAIL-17 PASS） |
| RC5 | 電腦用鐵路、預設 Rail Cap、補給壓力與攻方勝率 | 電腦部分 DONE；平衡暫緩（`attack-balance`） |
| RC6 | 真實瀏覽器：整個師用鐵路運送、RAIL-15、RAIL-16 | **IN PROGRESS**（`rail-cap-browser`） |
| RC7 | 部分卡車改為之後回合到達的增援（現行數量見 OOB 生成） | DONE |
| RC8 | 電腦正確使用鐵路與卡車（後勤檢查） | DONE（`scripts/ai-logistics-study.mjs`） |

原始計畫、量測與實作紀錄：`docs/quality/evidence/rail-cap-plan-2026-10-08/README.md`。
