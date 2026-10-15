# Hedgehog 防禦陣地（OCS 16.0）

狀態：**DONE**。HG-1～HG-7 全部有證據。

需求來源（使用者，2026-10-08）：「增加hedgehog防禦陣地」。解讀（記錄供使用者確認）：完整實作 16.0，雙方任何劇本都能用；
攻守戰守方的駐守單位開局在 hedgehog 裡（目標 Level 2、關鍵點 Level 1）。

| 列 | 內容 | 結果 |
|---|---|---|
| HG-1 | 規則測試（建造、拆除、戰鬥與砲擊效果、佔領、可見性） | PASS：`tests/rules/hedgehogs.test.ts` |
| HG-2 | 攻守戰守方駐守格都有 hedgehog，攻方與遭遇戰沒有 | PASS：`tests/game-flow/engagements.test.ts` |
| HG-3 | `npm run check` | PASS |
| HG-4 | random-legal 互打：新動作出現、0 錯誤、重播相符 | PASS |
| HG-5 | heuristic 互打：0 錯誤、重播相符、攻方勝率 30%–70% | PASS（42.5%） |
| HG-6 | 真實瀏覽器（NG-13） | PASS：`docs/quality/evidence/hedgehogs-2026-10-08/` |
| HG-7 | 地圖標記與 BTR 圖樣一致、Level 讀得到 | PASS |

現況：規則見 manifest `hedgehogs`；開局配置見 `docs/game-flow/deployment.md`；電腦的挖壕見 `docs/ai/heuristic-policy.md`。
原始計畫、平衡量測與實作紀錄：`docs/quality/evidence/hedgehogs-plan-2026-10-08/README.md`。
