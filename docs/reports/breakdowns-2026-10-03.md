# Breakdown 拆分（OCS 20.0）（2026-10-03）

狀態：**IN PROGRESS**。Rule Engine、generator、UI 與自動化測試已完成，並在 built UI 上以玩家操作跑完一個完整 Game Turn（見「操作證據」）；
仍有下列 TODO，且 `docs/quality/03-product-operation-verification-plan.md` 尚未有對應列（新增列需使用者核准，見「提議的驗收列」）。
本文件不改變 03 計畫中任何列的狀態。

## 使用者需求

> 加入拆分 breakdown RE 的功能，因為我們不是 boardgame，naming 可以更 free。
> 原本的 Boardgame 沒有 track parent 這事，但我們加這個功能也不是不行。

## 行為

### 規則（20.0）

- 只有帶 Breakdown pool 的多步 "Other" 單位（generator 產生的單一 XX 步兵、空降師）能拆；Armor/Mech、單步單位、多單位 formation 的團都不能。
- **拆出時機（20.0a）**：在 Movement Segment（Movement／Reaction／Exploitation phase），單位可以移動、尚未花任何 MP、也還沒結束移動時。拆出不花 MP（20.0e），
  也**不**結束其他單位的移動（6.1g），拆完母師與 Breakdown 都還能在本 phase 移動。
- **拆出結果**：母師失去一步（RE 隨步數下降，3.2d/9.11d，跟戰損一樣），同一 hex 出現 1 RE、一步的 Breakdown（20.0f），沿用母師的 mode、face 與 marker（Out of Supply、Low/Exhausted，20.0c）。最後一步永遠不能拆。
- **AR（20.0b）**：拆出的 Breakdown printed AR 不得高於母師；吸收時 Breakdown 的 AR 必須不低於吸收者。
- **強制吸收（20.0d）**：每個 phase 結束時，減員的多步單位必須吸收同 hex、同 pool、同 mode／marker 的 Breakdown，每個回復一步。
  被吸收的 Breakdown 回到 pool（移出遊戲，不進 Eliminated／dead pile）。

### Pool 與 printed 數值（20.0g，BTR counter art）

| Pool | Breakdown（combat / move face） | 使用者 | 來源 |
|---|---|---|---|
| US | 5-4-3 / 3-4-5（gpid 88） | US 步兵師、空降師（AR 4） | `BTR S01 R10 C16F/B.png` |
| US | 5-3-3 / 3-3-5（gpid 80） | AR 3 的 US 師（目前 generator 沒有） | `BTR S01 R09 C15F/B.png` |
| Ge | 3-4-2 / 2-4-4（gpid 709） | AR 4 的德軍師（目前 generator 沒有） | `BTR S04 R01 C01/B.png` |
| Ge | 3-3-2 / 2-3-4（gpid 710） | 德軍步兵師（AR 3） | `BTR S04 R01 C09/B.png` |
| Ge LW | 4-3-2 / 2-3-4（gpid 1207） | Fallschirmjäger（空軍，AR 3） | `BTR S03 R07 C16/B.png` |

每個師拿 pool 中 AR 不超過自己的最強 Breakdown。全部 leg、1 RE、一步、不可 rebuild。

### 超出 boardgame 的部分（使用者要求）

- **命名自由**：每個 Breakdown 以母師的團命名，例如 `16 Inf Regt / 1.Inf`、`506 Abn Regt / 101.Abn`、`13 FJ Rgt / 5.FJ`；
  團名來自該師 naming profile 的營（`1/16 Inf Bn`、`2/16 Inf Bn` → `16 Inf Regt`；戰車營等獨立營不算）。玩家在 Unit tab 的 **Breakdowns** 區每個團一個按鈕，自己選要拆哪個團；
  已拆出（仍在場上）的團不再提供；所有團都拆出後改用 `Brkdwn 1 / 1.Inf` 等編號。沒有 counter-mix 上限。
- 名字是每個 piece 自己的 `status:unit-name`（TEXT），counter 印團號與師（`506` / `101.Abn`），roster、選取列、log 都用這個名字；它印在 counter 上，敵方也看得到。
- **追蹤 parent**：Breakdown 與母師以 `PARENT` relation 連結。吸收時若母師在同 hex 且合格，優先回到母師；否則依 20.0g 由同 pool 其他合格單位吸收（例如 99.Inf 的團可以併入減員的 17.Abn），絕不跨 pool（德軍陸軍團不會併入 FJ）。

### 隱藏資訊（4.9a）

敵方 log 只會顯示「An enemy unit reorganized」，不透露哪個師拆了哪個團（拆出等於母師少一步，而步數損失對敵方是隱藏的）；吸收也只在己方 log 顯示。
Breakdown counter 在地圖上是否看得到，依一般的 stack 頂層規則。

## 實作位置

- Rule Engine：`src/rules/breakdown/breakdown.ts`（`CREATE_BREAKDOWN` 驗證與套用、`availableBreakdownNames`、`absorbBreakdowns`），
  `src/rules/lifecycle/lifecycle.ts`（phase 結束時吸收），candidates／validate／reducer／manifest（`breakdowns`，PARTIAL）、save parsing。
- Generator：`src/generation/oob/breakdowns.ts`、`counter-corpus.ts`（5 個 Breakdown counter）、OOB validation 允許「沒有起始單位的 Breakdown Definition」。
- UI：Unit tab **Breakdowns** 區、`unitLabel`／counter 使用 piece 名稱、log 文字、Undo（`CREATE_BREAKDOWN` 可 undo）。
- 測試：`tests/rules/breakdowns.test.ts`（9 個）、`tests/ui/command-deck.test.ts`（Breakdown 按鈕／拆出／命名／敵方 log／Undo）。

## 操作證據（built UI，Playwright Chromium 1680×1050）

輸入：預設 New Game（`DEFAULT_NEW_GAME_REQUEST`，32×24、COMPACT、每邊 2 formation、8 turns），地圖縮放 69%。
腳本：`tmp/breakdown-ui/evidence.mjs`（未納入版本控制）；完整紀錄：`assets/breakdowns-2026-10-03/run.json`；console errors：無。

| # | 操作 | 預期 | 觀察 | 耗時 |
|---|---|---|---|---|
| A1 | All units → 101.Abn | Unit tab 有 Breakdowns 區，每團一個按鈕 | 501/502/506 Abn Regt、327/401 Gld Regt，各標 `5-4-3, 1 RE` | 249 ms |
| A2 | Detach 506 Abn Regt | 單位數 +1、母師 RE 4→3、506 不再提供 | 10 units；RE 3；按鈕只剩 4 個 | 270 ms |
| A3 | 選 Breakdown、移到 0214 | 名稱 `506 Abn Regt / 101.Abn`、可移動 | 5 MP、53 hexes；移動 1.5 MP 成功 | 108 / 181 / 264 ms |
| A4 | Detach 501 → Undo | 拆出後可 undo，501 再次提供 | 11 → 10 units；501 回到清單 | 280 / 334 ms |
| A5 | Detach 327 留在母師 hex → End Movement Segment（確認） | phase 結束時 327 被吸收 | 11 → 10 units；log「101.Abn absorbed 327 Gld Regt / 101.Abn and regained a step.」 | 197 ms |
| A6 | 交接給 Axis | 敵方 log 不透露拆分 | 「An enemy unit reorganized ×2」，無團名 | 737 ms |
| A7 | Axis 5.FJ 拆 13 FJ Rgt、移到 3113、打完 turn | LW 4-3-2；進入 Turn 2 | 13/14/15 FJ Rgt（4-3-2）；Turn 2 First Player decision | 246 / 397 ms |

全部在互動預算內（選取 ≤1,000 ms、執行 ≤1,500 ms）。截圖：`assets/breakdowns-2026-10-03/01`–`06`。

## 觀察到的問題與 TODO

- **TODO breakdown-advance-retreat**：20.0a 也允許在戰後撤退／推進開始時拆出；目前不支援。
  影響：撤退時無法留下 Breakdown 守 hex、推進時無法拆分佔領。關閉證據：在 UI 中一場會撤退／推進的戰鬥裡，撤退或推進步驟提供拆出並完成一次，含 Rule 測試。
- **TODO breakdown-absorber-choice**：多個同 pool 單位都能吸收、且其中沒有母師時，engine 依 Piece ID 選，而不是讓擁有者選。
  影響：極少數情況下 Breakdown 被併入玩家不想要的師。關閉證據：同 hex 兩個合格吸收者時出現 decision，UI 操作選擇後正確吸收。
- **TODO breakdown-absorb-warning**：強制吸收只在發生後出現在 log；End 按鈕前沒有提示「這些 Breakdown 會被吸收」。
  影響：玩家把 Breakdown 留在母師 hex 結束 phase 時，可能意外失去它。關閉證據：End phase 前列出將被吸收的 Breakdown，UI 截圖。
- 觀察（非阻擋）：拆完後的 deck 訊息沿用通用格式，較長（`Detach 506 Abn Regt (5-4-3, 1 RE; the division loses a step): done.`）。
- 觀察（非阻擋）：US 5-3-3、Ge 3-4-2 已轉錄但目前 generator 不會用到（沒有 AR 3 的 US 師或 AR 4 的德軍師）。

## 提議的驗收列（待使用者核准後才加入 03 計畫）

| ID | Operation | Boundary | Expected |
|---|---|---|---|
| BRK-01 | 在 Movement Segment 選一個步兵／空降師 | built UI，Unit tab | Breakdowns 區列出該師每個尚未拆出的團與 printed 值 |
| BRK-02 | 拆出一個團 | built UI | 母師少一步、同 hex 出現以團命名的 1 RE Breakdown，可在本 phase 移動；Undo 可還原 |
| BRK-03 | 讓 Breakdown 與減員母師同 hex 結束 phase | built UI | Breakdown 被吸收、母師回一步、log 記錄 |
| BRK-04 | 交接後的敵方畫面 | built UI，hot-seat 交接 | 敵方 log 不透露拆分的師與團 |
