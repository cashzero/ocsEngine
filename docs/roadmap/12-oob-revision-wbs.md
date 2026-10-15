# OOB 改版 0.4.0：獨立裝甲、反坦克、駐守單位、戰力平衡、補給

狀態：**IN PROGRESS**。O1–O6 完成；O7 真實瀏覽器檢視新計數器與駐守單位仍 `UNVERIFIED`（TODO `oob-revision-ui`）。

需求來源（使用者，2026-10-07）：「目前的oob似乎不理想」；「應該要有更多獨立單位 包含裝甲 反坦克 而不是只有獨立炮兵」；
「是否有一些garrison unit會比較好？ 極低戰力 但避免對方可以免費站點」；「按你建議調整oob」。

| # | 內容 | 狀態 |
|---|---|---|
| O1 | 新計數器（ANTI_TANK、ASSAULT_GUN、TIGER 符號；BTR 轉錄） | DONE（`tests/generation/oob-revision.test.ts`） |
| O2 | 9.4e：有反坦克符號的單位為重反坦克 | DONE |
| O3 | 生成器：獨立裝甲／反坦克／砲兵數量、以實際戰力平衡、補給量、駐守定義 | DONE（1,000 seed 掃描） |
| O4 | 部署：每個己方目標 1 個駐守單位 | DONE |
| O5 | 驗證、seed sweep、既有測試更新 | DONE |
| O6 | 電腦在新 OOB 上重跑 B5 與對局研究 | DONE（電腦改為優先拔除擋補給的駐守單位，`docs/ai/heuristic-policy.md`） |
| O7 | 真實 UI：新計數器、駐守單位、New Game 預覽數字（OOB-R8） | **UNVERIFIED** |

現況：OOB 生成見 `docs/oob/` 與 `docs/generator/`；駐守與部署見 `docs/game-flow/deployment.md`。
原始計畫、平衡決定與對局研究：`docs/quality/evidence/oob-revision-plan-2026-10-07/README.md`。
