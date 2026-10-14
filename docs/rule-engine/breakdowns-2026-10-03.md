# Breakdown 拆分（OCS 20.0）（2026-10-03）

狀態：**IN PROGRESS（只差驗收列核准）**。20.0 全部規則、generator、UI 與自動化測試已完成，先前的三個 TODO 都已實作並在 built UI 上驗證（見「操作證據」），
本文件沒有未關閉的 TODO。`docs/quality/03-product-operation-verification-plan.md` 尚未有對應列（新增列需使用者核准，見「提議的驗收列」），
本文件不改變 03 計畫中任何列的狀態。

## 使用者需求

> 加入拆分 breakdown RE 的功能，因為我們不是 boardgame，naming 可以更 free。
> 原本的 Boardgame 沒有 track parent 這事，但我們加這個功能也不是不行。
> 名比 boardgame 自由，太複雜了，我的意思只是 `1/101.Abn` 這樣而已。

第一版用各師的團名（`506 Abn Regt / 101.Abn`）並讓玩家選團；使用者認為太複雜，已改成單純編號 `1/101.Abn`。

## 行為

### 規則（20.0）

- 只有帶 Breakdown pool 的多步 "Other" 單位（generator 產生的單一 XX 步兵、空降師）能拆；Armor/Mech、單步單位、多單位 formation 的團都不能。
- **拆出時機（20.0a）**：在 Movement Segment（Movement／Reaction／Exploitation phase），單位可以移動、尚未花任何 MP、也還沒結束移動時。拆出不花 MP（20.0e），
  也**不**結束其他單位的移動（6.1g），拆完母師與 Breakdown 都還能在本 phase 移動。
- **拆出結果**：母師失去一步（RE 隨步數下降，3.2d/9.11d，跟戰損一樣），同一 hex 出現 1 RE、一步的 Breakdown（20.0f），沿用母師的 mode、face 與 marker（Out of Supply、Low/Exhausted，20.0c）。最後一步永遠不能拆。
- **AR（20.0b）**：拆出的 Breakdown printed AR 不得高於母師；吸收時 Breakdown 的 AR 必須不低於吸收者。
- **戰後撤退／推進時拆出（20.0a）**：撤退的 decision 多一個「Detach a Breakdown from X first (it retreats too)」選項；選了之後 Breakdown 加入撤退，
  再問一次撤退（此時可選「Retreat the units separately」分開撤）。推進的 decision 多一個「Detach a Breakdown from X (it may advance on its own)」選項；
  Breakdown 成為可推進的攻擊方單位，可以只讓它推進、母師留在原地。
- **強制吸收（20.0d）**：每個 phase 結束時，減員的多步單位必須吸收同 hex、同 pool、同 mode／marker 的 Breakdown，每個回復一步。
  被吸收的 Breakdown 回到 pool（移出遊戲，不進 Eliminated／dead pile）。
- **誰吸收（20.0d/20.0g）**：母師在同 hex 且合格時由母師吸收；只有一個合格單位時由它吸收；有兩個以上合格單位且都不是母師時，phase 結束前由擁有者選
  （`BREAKDOWN_ABSORPTION` decision，例如「90.Inf absorbs 1/101.Abn / 13.Abn absorbs 1/101.Abn」）。
- **事前提示**：End 按鈕下方列出這個 phase 結束時會被吸收的己方 Breakdown，例如「When this phase ends: 2/101.Abn rejoins 101.Abn」或
  「1/101.Abn is absorbed by 90.Inf or 13.Abn (you choose)」。

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

- **命名**：Breakdown 以「編號/母師」命名：`1/101.Abn`、`2/101.Abn`、`1/5.FJ`。編號取該師目前場上沒在用的最小號（被吸收或 Undo 後號碼釋出）。
  Unit tab 的 **Breakdowns** 區只有一個「Detach a Breakdown (5-4-3, 1 RE; the division loses a step)」按鈕。沒有 counter-mix 上限。
- 名字是每個 piece 自己的 `status:unit-name`（TEXT），counter 印編號與師（`1` / `101.Abn`），roster、選取列、log 都用這個名字；它印在 counter 上，敵方也看得到。
- **追蹤 parent**：Breakdown 與母師以 `PARENT` relation 連結。吸收時若母師在同 hex 且合格，優先回到母師；否則依 20.0g 由同 pool 其他合格單位吸收（例如 99.Inf 的 Breakdown 可以併入減員的 17.Abn），絕不跨 pool（德軍陸軍的不會併入 FJ）。

### 隱藏資訊（4.9a）

敵方 log 只會顯示「An enemy unit reorganized」，不透露哪個師拆了 Breakdown（拆出等於母師少一步，而步數損失對敵方是隱藏的）；吸收也只在己方 log 顯示。
Breakdown counter 在地圖上是否看得到，依一般的 stack 頂層規則。

## 實作位置

- Rule Engine：`src/rules/breakdown/breakdown.ts`（`CREATE_BREAKDOWN { pieceId }` 驗證與套用、`nextBreakdownName`、`absorbBreakdowns`、
  `absorptionDecision`、`pendingAbsorptions`），`src/rules/lifecycle/lifecycle.ts`（phase 結束時吸收）、`src/rules/kernel/reducer.ts`（phase 結束前的
  `BREAKDOWN_ABSORPTION` decision）、`src/rules/combat/combat.ts`（撤退／推進 decision 的拆出選項），candidates／validate／manifest（`breakdowns`，IMPLEMENTED）、save parsing。
- Projection：`breakdownAbsorptions`（只給擁有者）。
- Generator：`src/generation/oob/breakdowns.ts`、`counter-corpus.ts`（5 個 Breakdown counter）、OOB validation 允許「沒有起始單位的 Breakdown Definition」。
- UI：Unit tab **Breakdowns** 區、End 按鈕下的吸收提示、`unitLabel`／counter 使用 piece 名稱、log 文字、Undo（`CREATE_BREAKDOWN` 可 undo）；撤退／推進／吸收的選擇用既有的 decision 按鈕。
- 測試：`tests/rules/breakdowns.test.ts`（14 個，含吸收者選擇、撤退與推進拆出）、`tests/ui/command-deck.test.ts`（Detach 按鈕／編號 1、2／吸收提示／敵方 log／Undo）。
- 證據腳本：`scripts/breakdown-ui-gate.mjs`、`scripts/breakdown-make-saves.mjs`、`scripts/breakdown-positions-gate.mjs`。

## 操作證據（built UI，Playwright Chromium 1680×1050）

### 一、預設 New Game

輸入：預設 New Game（`DEFAULT_NEW_GAME_REQUEST`，32×24、COMPACT、每邊 2 formation、8 turns），地圖縮放 69%。
腳本：`scripts/breakdown-ui-gate.mjs`；完整紀錄：`docs/quality/evidence/breakdowns-2026-10-03/run.json`；console errors：無。

| # | 操作 | 預期 | 觀察 | 耗時 |
|---|---|---|---|---|
| A1 | All units → 101.Abn | Unit tab 有一個 Detach 按鈕 | 「Detach a Breakdown (5-4-3, 1 RE; the division loses a step)」 | 306 ms |
| A2 | Detach | 單位數 +1、出現 `1/101.Abn` | 10 units；roster 有 `1/101.Abn, 0113` | 217 ms |
| A3 | 選 `1/101.Abn`、移到 0214 | 可在本 phase 移動 | 5 MP、53 hexes；移動成功 | 32 / 158 / 201 ms |
| A4 | Detach（`2/101.Abn`）→ Undo | 拆出後可 undo | 11 → 10 units | 272 / 249 ms |
| A5 | 再 Detach（號碼 2 已釋出）留在母師 hex → End Movement Segment（確認） | End 前提示；phase 結束時被吸收 | End 下方「When this phase ends: 2/101.Abn rejoins 101.Abn 20.0d」；roster 有 `2/101.Abn, 0113`；11 → 10 units；log「101.Abn absorbed 2/101.Abn and regained a step.」 | 228 / 169 ms |
| A6 | 交接給 Axis | 敵方 log 不透露拆分 | 「An enemy unit reorganized ×2」 | 620 ms |
| A7 | Axis 5.FJ Detach、移到 3113、打完 turn | LW 4-3-2、`1/5.FJ`；進入 Turn 2 | 「Detach a Breakdown (4-3-2, …)」；roster `1/5.FJ`；Turn 2 First Player decision | 152 / 216 / 278 ms |

全部在互動預算內（選取 ≤1,000 ms、執行 ≤1,500 ms）。截圖：`docs/quality/evidence/breakdowns-2026-10-03/01`–`06`、`03a-absorb-warning`。

### 二、測試局面（吸收者選擇、撤退與推進拆出）

這兩個情境需要三個同 pool 的師和一場會撤退／推進的戰鬥，預設 New Game 開局到不了，所以用測試局面：
UI 先從 New Game 對話框開一局「每邊 5 formation」（其餘為預設值；有 101.Abn、90.Inf、13.Abn 三個 US 師），
再由 Menu → Load save… 載入 `scripts/breakdown-make-saves.mjs` 產生的存檔。存檔只改了開局狀態（幾個單位的位置、mode、
246.VG 剩 2 步、骰子種子），會經過 save 的 hash 與 replay 驗證；之後的每一步都是在 UI 上點擊。
存檔 B 的骰子種子是事先 headless 搜尋的（seed 6，結果 AL1/Do1），讓這場戰鬥一定出現防守方撤退與攻擊方推進。
腳本：`scripts/breakdown-positions-gate.mjs`；完整紀錄：`docs/quality/evidence/breakdowns-2026-10-03/positions/run.json`；console errors：無。

| # | 操作 | 預期 | 觀察 | 耗時 |
|---|---|---|---|---|
| B1 | 存檔 A（Allied Movement）：90.Inf、13.Abn 各拆一個並移開；101.Abn 拆 `1/101.Abn` 移進 90.Inf／13.Abn 所在的 1612 | End 前提示兩個可吸收者 | 「When this phase ends: 1/101.Abn is absorbed by 90.Inf or 13.Abn (you choose) 20.0d」 | 拆 244–261 ms；移動 396–439 ms |
| B2 | End Movement Segment（確認） | 出現吸收者選擇 | 「The phase ends: 1/101.Abn must be absorbed by a reduced unit in its hex (20.0d). Choose which one.」選項「90.Inf absorbs 1/101.Abn」「13.Abn absorbs 1/101.Abn」 | — |
| B3 | 選 13.Abn | 13.Abn 回一步、Breakdown 回 pool | 23 → 22 units；log「13.Abn absorbed 1/101.Abn and regained a step.」 | — |
| B4 | 存檔 B（Allied Combat）：90.Inf、13.Abn、101.Abn 攻擊 1712 的 246.VG；Axis 選「Retreat 1 hex」 | 撤退選項有拆出 | 撤退選項含「Detach a Breakdown from 246.VG first (it retreats too)」 | — |
| B5 | Axis 選拆出 → 「Retreat the units separately」→ 兩者各自撤退 | Breakdown 一起撤退 | 「All 2 units retreat to …」與「Retreat the units separately」；246.VG 與 `1/246.VG` 各自撤到 1813 | — |
| B6 | Allied 推進：選「Detach a Breakdown from 90.Inf (it may advance on its own)」→「Advance 1/90.Inf」→「Stop advancing」 | 只有 Breakdown 推進 | log「90.Inf detached 1/90.Inf.」「1/90.Inf advanced into 1712.」；roster `1/90.Inf, 1712`、`90.Inf, 1612` | — |

decision 按鈕的耗時沒有以可見結果為終點量測，表中以「—」表示（腳本紀錄中的數字只是點擊被接受的時間）。截圖：`docs/quality/evidence/breakdowns-2026-10-03/positions/A1`–`B6`。

## 已關閉的 TODO

- **breakdown-advance-retreat**（20.0a 戰後撤退／推進時拆出）：已實作；Rule 測試 3 個；UI 證據 B4–B6。
- **breakdown-absorber-choice**（多個合格吸收者時由擁有者選）：已實作；Rule 測試 2 個；UI 證據 B1–B3。
- **breakdown-absorb-warning**（End 前提示將被吸收的 Breakdown）：已實作；deck 測試；UI 證據 A5、B1。

## 觀察（非阻擋）

- 拆完後的 deck 訊息沿用通用格式（`Detach a Breakdown (5-4-3, 1 RE; the division loses a step): done.`），沒有說出新編號；編號在 log 與 roster 中。
- US 5-3-3、Ge 3-4-2 已轉錄但目前 generator 不會用到（沒有 AR 3 的 US 師或 AR 4 的德軍師）。
- 戰鬥 decision 面板的標題在整場戰鬥中都寫「DEFEND 1712」（攻擊方推進時也一樣），這是既有的面板標題，不是本次改動造成的。

## 提議的驗收列（待使用者核准後才加入 03 計畫）

| ID | Operation | Boundary | Expected |
|---|---|---|---|
| BRK-01 | 在 Movement Segment 選一個步兵／空降師 | built UI，Unit tab | Breakdowns 區有 Detach 按鈕，顯示 printed 值 |
| BRK-02 | 拆出 Breakdown | built UI | 母師少一步、同 hex 出現 `N/<師>` 的 1 RE Breakdown，可在本 phase 移動；Undo 可還原 |
| BRK-03 | 讓 Breakdown 與減員母師同 hex 結束 phase | built UI | End 前提示；Breakdown 被吸收、母師回一步、log 記錄 |
| BRK-04 | 交接後的敵方畫面 | built UI，hot-seat 交接 | 敵方 log 不透露拆分的師 |
| BRK-05 | Breakdown 與兩個以上合格吸收者（都不是母師）同 hex 結束 phase | built UI | End 前提示「(you choose)」；phase 結束前出現選擇，選中的單位吸收 |
| BRK-06 | 多步師在戰後撤退 | built UI，hot-seat 交接 | 撤退選項可先拆出 Breakdown，之後可一起或分開撤退 |
| BRK-07 | 多步師在戰後推進 | built UI | 推進選項可拆出 Breakdown，Breakdown 可單獨推進 |
