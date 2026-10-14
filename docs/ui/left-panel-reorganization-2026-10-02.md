# 左側 Command Deck 重整（2026-10-02）

狀態：**IN PROGRESS**。實作、自動化測試與列出的整合操作都已驗證（含超堆疊與 ZOC 停止的 popup），本文件沒有未關閉的 TODO；`docs/ui/11` 已同步改寫，整體 gate 仍待驗收計畫，見「驗收」。
本文件不改變 `docs/quality/03-product-operation-verification-plan.md` 任何列的狀態。

## 要解決的問題

左欄由上到下共 5 塊：階段標題、選取卡、`deck-work`（所有 phase 專屬功能加上決策、草稿、移動預覽）、
My units／Hex／Log 頁籤清單、footer（End phase、Undo、訊息）。只有第 4 塊能切 tab，且內容不隨 phase 改變；
Supply 的 trace／feed、Arrivals、Targets、Air、Refit 全擠在 `deck-work`，靠 `:has()` 在決策與草稿時整塊隱藏清單來騰空間。

## 新結構

- **頂部列**：phase chip 旁放 `Undo` 與 `End phase`（`phaseControlsHtml`）。不能結束的原因以小提示掛在按鈕下方；
  交接中不顯示（交接面板已說明）。「Finish anyway」二次確認保留，按鈕位置不動。
- **左欄**：一行目標說明、窄版選取列（含 `Done`）、**phase 專屬 tab**、單一捲動區、僅在有訊息時出現的狀態列。
- **Tab 由 phase 決定**（`deckTabs`），必辦者在最左並帶數字徽章：

  | 條件 | Tab |
  |---|---|
  | Reinforcement 或有待進場單位 | Arrivals |
  | Supply／Breakout 或有補給步驟 | Supply／Breakout |
  | Aircraft Refit 或有可補給的 Air Base | Refit |
  | Combat／Exploitation／Barrage | Targets |
  | 非 Aircraft Refit | Unit（模式、Release、燃料、卡車、傾倒） |
  | 有可用空中任務 | Air（可選，排在 Unit 之後，不搶走該步驟的主要工作） |
  | 一律 | Log；另有「All units」按鈕開 roster popup |

  預設 tab 為第一個；同一 phase 內手動選擇會保留，換 phase 即重設；選到新單位時切到 Unit，
  但在 Arrivals／Supply／Refit 這類要逐列操作的 tab 中不切換（`syncDeckTab`）。
- **任務模式**：交接、決策、攻擊／空襲草稿、away report 取代整個 tab 區（不再用 `:has()` 隱藏清單）。
  順序為「必須回答的」→ 戰鬥結果卡 → away report，任務區是唯一捲動區（report 不再內嵌捲動）。
- **移動確認改成貼在目的地 hex 的 popup**（`movePopupHtml`、`positionMovePopup`）：
  顯示成本、剩餘 MP、ZOC／超堆疊／第一條規則阻擋；其餘原因在 Unit tab。優先放在目的地之後，其次上下，
  最後才放在路徑側；避開縮放控制、圖例與 hover 資訊；hex 被拖出視窗時貼邊並隱藏箭頭。
  開啟時焦點到 Confirm（Enter 確認）、Esc 取消並把焦點還給該 hex。
  「再點同一格確認」的舊行為保留。
- 攻擊／空襲草稿與決策**不**改成 popup：內容量大，會遮住判斷所需的地圖，並與
  `docs/ui/11` S3「複合行動進完整審閱介面、不得裁切」衝突。
- 移除「Hex」tab（與地圖 stack picker 重複）。

## 證據

環境：內建瀏覽器，`npm run ui:serve`，1680×1050（另測 1920×1080）。自動化：`npm run check` 通過
（typecheck、245 tests、build、smoke）；`tests/ui/command-deck.test.ts` 涵蓋 tab 組合與徽章、換 phase 重設、
選單位切換、End phase 離開 deck、popup 錨點與按鈕，以及規則拒絕時 popup 只顯示第一條原因、停用 Confirm、其餘留在 Unit tab。

**第一輪（預設作戰 32×24）**：真實滑鼠點擊放置增援、End Reinforcement、roster 選單位、預覽移動、點 popup 的 Confirm，
Undo 出現在頂部列。DOM `click()` 腳本（依本 repo 規則不構成 UI 證據，只用來走路）完成 Allied 與 Axis 各一個
Player Turn、交接與隱私畫面、First Player 決策，進入第 2 回合。

**第二輪（接敵案例：New Game 表單設 16×12 / COMPACT / 每方 1 / Fighters, bombers and Air Bases / 4 回合，
seeds 92001–92004，按「Start this operation」啟動）**。以下以**真實滑鼠點擊或按鍵**操作（腳本只用於走過中間階段）：

| 項目 | 結果 |
|---|---|
| Movement 的 Air tab → Fighter Sweep → 選任務 hex → 勾飛機 → Fly | 空襲草稿以任務模式顯示（事實、飛機單選、Cancel／Fly），End 停用並說明原因 |
| 交接給 Axis → 防守空戰決策（Fight with all 3 aircraft） | 決策選項在任務區最上方，不需捲動 |
| Barrage 段：Air Barrage → 選 1607 → 兩架飛機 → Fly；任務方回基地決策（點 Air Base at 0108） | 通過 |
| Combat 階段：Targets tab 的 `Attack 1607` → 攻擊草稿 → Attack → 交接 → Axis 防守決策 | 通過；草稿內容未超出左欄 |
| Supply（第 2 回合 Axis）：Supply tab 的 `Feed from 2T at 0107` | 徽章 3→2，清單更新 |
| 第 2 回合 Aircraft Refit：Refit tab 勾三架 Inactive 飛機 → `Refit 3 for 1T` | 通過；之後 tab 顯示「No Air Base has aircraft to refit.」；phase chip 顯示「Aircraft Refit Phase」 |
| 第 2 回合 Movement · Breakout：Breakout tab 的 `US 597 FA Group: attempt breakout` | 徽章 4→3，訊息「done」 |
| 鍵盤：Enter 開 roster（焦點進搜尋框）→ Tab 至單位 → Enter 選取 → 方向鍵移動 hex 焦點 → Enter 預覽 → 焦點在 Confirm → Esc 取消（焦點回到該 hex）→ Enter、Enter 確認 | 通過 |
| 真實拖曳把目的地推出視窗 | popup 貼在視窗邊緣、隱藏箭頭、仍可按 Confirm；修正前會蓋住縮放控制，修正後滑到控制左側 |
| End phase 最壞寬度（按一次後的 `Finish anyway: 12 units have not moved / Press again to confirm`，旁有 Undo） | 約 301px，右端 672px，離座位標示（1193px）很遠；1680 與 1920 皆無橫向溢出，頁面與左欄無垂直捲動 |
| 1920×1080 | 左欄 400px、tab 區 766px 高，無溢出 |

**過程中發現並已修正**（含第一輪）：
- popup 焦點落在 Cancel；預設放在路徑側蓋住路線；First Player 決策時 phase chip 為空；交接中 End 提示出現無意義的
  「Actor does not own the sequence step.」；空選取卡仍寫「in the list below」。
- Air tab 在 Movement 排第一（optional 搶走主要工作）→ 改排在 Unit 之後。
- 決策選項被 away report 與結果卡擠到第一屏之外，且 report 內嵌捲動 → 任務區改為「決策優先」，report 不再內嵌捲動。
- 開啟 roster 後焦點仍停在按鈕上，鍵盤使用者要穿過整個左欄與地圖 → 開啟時焦點進搜尋框，關閉時回到按鈕。
- popup 在目的地被推出視窗時蓋住縮放控制 → 位置會滑開地圖上的覆蓋元件。
- tab 徽章的無障礙名稱不含數量 → 按鈕 `aria-label` 改為「Air, 2 waiting」。

## 超堆疊與 ZOC 停止（第三輪）

- **超堆疊：已在真實 UI 看到。** Large 規模預設地圖，Turn 1 Movement 把單位逐一疊到同一 hex（0211），
  單位從 roster 選取（地圖上同一堆疊只露出三個棋子，其餘只能從 roster 選）。疊到第 13 個單位時，
  預覽 popup 顯示橘色一行「Ending here makes 10.5 RE in one hex: over 10 RE at the end of the segment, you must eliminate units (4.8a).」，
  Confirm 仍可按（規則允許先疊、階段結束時才消滅），Cancel／Confirm 與路徑都未被遮住，版面無溢出。
  同一局面的無頭重現（`movePopupHtml`）給出同樣的文字。
- **ZOC／「Move ends there」：已在真實 UI 看到。** 先前掃不到任何停止 hex，原因是規則而非缺口：
  只有「戰鬥模式」且有攻擊能力、未 Out of Supply 的單位才發出 ZOC（`src/rules/zoc/zoc.ts:30`），
  接敵案例的敵軍開局都在移動模式。重現步驟（Compact 16×12，seeds 92001–92004）：Allied Turn 1 把步兵推到敵軍旁，
  Axis 回合在 Unit tab 按 `Combat mode` 把前線單位切到戰鬥模式（Mode changed to combat），走完回合到 Allied Turn 2 Movement；
  選 `US 597 QM Truck Co`，可達範圍出現 3 個停止 hex（1605、1507、1508）。
  真實點擊 `Hex 1605, clear` 後，popup 顯示「Move to 1605 · Cost 16 MP · 29 MP left after the move.」與橘色一行
  「The move ends there (enemy ZOC, all-MP terrain, or minimum move).」，Cancel／Confirm 完整可見、在地圖範圍內、
  焦點在 Confirm，hover 資訊同時寫「move ends here」；點 Confirm 後訊息「Moved to 1605.」，單位移到 1605。

## 未關閉

無。本重整的 TODO 皆已以真實操作關閉，但依 `AGENTS.md`，整體 UI／遊戲流程 gate 仍須對照
`docs/quality/03-product-operation-verification-plan.md`，且存檔截圖證據等後續項目列在 `docs/ui/11` 第 6 節，因此狀態維持 IN PROGRESS。

## 觀察（不阻擋，未處理）

- 交接與決策進行中，選取卡仍顯示上一次的「Hex 1607 · No unit of yours here · Done」。
- Targets tab 的空狀態與上方目標說明重複同一句（例如兩處都寫「No barrage targets in range.」）。
- 連續兩次快速 Enter（同一個 `key` 指令內）會讓第二次落在重繪前的元素上；分開按則正常。
- 既有問題（非本次引入）：`scripts/desktop-deck-gate.mjs` 仍使用已不存在的 `#deck-action`、`#execute-action`、
  `.deck-phase h1`，在本次之前就已無法執行；頂部列 `turn-cell` 實際高 68px，超出 64px 列高 4px。

## 驗收

`docs/ui/11-desktop-command-deck-design.md` 第 1–3、5、6 節已改寫為現行結構（2026-10-02）。此重整維持 IN PROGRESS：
該文件第 6 節仍列有存檔截圖、複合行動成本審閱、New Game 排版與 gate 腳本重寫等待辦，
且各產品操作列的狀態依 `docs/quality/03-product-operation-verification-plan.md`，不因本報告改變。
