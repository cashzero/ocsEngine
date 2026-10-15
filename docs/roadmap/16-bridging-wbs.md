# 工兵架橋 Bridging（OCS 13.8b）

狀態：**IN PROGRESS**。規則、UI 與瀏覽器驗收完成；電腦刻意使用架橋（BR-6）仍是 TODO `bot-bridging`。

需求來源（使用者，2026-10-09）：「實作工兵架橋功能」。

| 列 | 內容 | 結果 |
|---|---|---|
| BR-1 | 規則測試（Minor／Major、模式、敵方不受益、可達範圍、攻擊可／Overrun 不可、補給路徑、投影） | PASS：`tests/rules/bridging.test.ts` |
| BR-2 | `npm run check` | PASS |
| BR-3 | 真實瀏覽器（NG-14）：工兵切戰鬥模式出現橋、經橋過河、完成 Game Turn、切回後橋消失 | PASS：`docs/quality/evidence/bridging-2026-10-10/` |
| BR-4 | 兩岸都有單位時橋仍看得到、不遮 counter 數值 | PASS |
| BR-5 | 沒有 `rivers` 的舊存檔照常載入與重播 | PASS |
| BR-6 | 電腦對手會刻意架橋 | **TODO** `bot-bridging`（`docs/quality/05-todo-inventory.md`） |

現況：規則見 manifest `engineering.bridging`。原始計畫與實作紀錄：`docs/quality/evidence/bridging-plan-2026-10-09/README.md`。
