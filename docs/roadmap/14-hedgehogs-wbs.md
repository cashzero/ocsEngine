# Hedgehog 防禦陣地（OCS 16.0）

狀態：**DONE**（2026-10-08；HG-1～HG-7 全部有證據，見 §3）。

需求來源（使用者，2026-10-08）：「增加hedgehog防禦陣地」。
需求只有一句，以下兩項是我依規則書與現有劇本做的解讀（未另外詢問，記錄於此供使用者確認）：

1. **規則**：OCS v4.3 第 16.0 節 Hedgehog 完整實作（建造、拆除、戰鬥與砲擊效果、佔領），雙方在任何劇本都能使用。
2. **劇本**：攻守戰（0.5.0）守方的駐守單位開局就在 hedgehog 裡：目標 Level 2、關鍵點（補給節點、道路交會）Level 1。
   遭遇戰開局沒有 hedgehog。開局等級是設計值，可依使用者意見調整（`GENERATED_HEDGEHOG_LEVELS`）。

## 1. 規則（`src/rules/hedgehog/hedgehog.ts`）

| 規則 | 實作 |
|---|---|
| 3.3c、16.0a、16.0g | 非戰鬥單位（`facility:hedgehog`），Level 1–4（狀態 `status:hedgehog-level`），一格一個，不能移動、不需補給、不能吸收損失 |
| 16.0b | 移動階段：格內 1 RE 戰鬥模式且本階段未移動的單位（之後不能移動），或 2 格內的 Engineer-Capable 單位（13.8d，一階段一件工程、不能移動），付剛好 2 SP（8T，直接取補或 HQ 拋補到該格）建造或升一級；每格每回合只能升一級（`status:hedgehog-raised-turn`） |
| 16.0c | 同樣的工作把己方 hedgehog 降一級、不花 SP；低於 Level 1 移除；每格每回合只能降一級；敵方不能拆（3.3c） |
| 16.0d、9.8、9.9 | 守方有 hedgehog：戰鬥擲骰減 Level，Surprise 擲骰減 1 |
| 16.0e、9.4e | 格內戰鬥單位有 Heavy AT |
| 10.0a、10.0c | 砲擊（含空中砲擊）往左 1 欄；Level 3 以上時 `[1/2]` 視為 DG |
| 16.0h | 戰鬥與砲擊結果不影響 hedgehog |
| 9.14e | Attack-Capable 單位進入有敵方 hedgehog 的格即佔領（等級不變） |
| 5.7g、16.0f | 有 hedgehog 的格不能進入 Reserve Mode；有己方 Reserve 單位的格不能建 hedgehog |
| 4.8bF、4.9a | 敵方永遠看得到 hedgehog 與其 Level |

選用規則 21.11a（大型 hog 需工兵）與 21.11c（佔領降級）屬 `optional-rules`（DEFERRED），沒有採用。
地圖印刷的 hedgehog（3.3c Important Note）：生成地圖不印 hedgehog，不適用。

## 2. 其他部分

- 生成：每個 OOB 每方一個 hedgehog Definition（BTR VASSAL `Hedgehog` PieceSlot gpid 12），建造與開局 hedgehog 都用它。
  2026-10-08 之前的存檔沒有這個 Definition，在那些對局中不能建 hedgehog（規則回報 `HEDGEHOGS_NOT_AVAILABLE`）。
- UI：
  - 地圖上的 hedgehog 是格子左下角的標記，畫在堆疊上方，不佔三個堆疊位置。
  - 圖樣照 BTR `misc_hog-N.png`：棕色底、灰色齒環、白圓中的 Level。
  - 單位的 Unit 分頁有「Hedgehog」區：挖壕（列出費用、補給堆、工作單位）與拆除。
  - 工兵與 HQ 的 Construction 計畫列出 hedgehog 與價格。
  - 攻擊單列出「Hedgehog Level N: −N combat roll, −1 Surprise, Heavy AT」；預估機率與結算後的 DRM 已扣掉 Level。
  - 格子提示文字寫出 hedgehog。
  - New Game 說明寫出守方的 hedgehog 與等級。
- 電腦（heuristic@10）：
  - 預估攻擊時扣掉 hedgehog Level，算守方步數時不把 hedgehog 當單位。
  - 移動完後，沒移動的單位在敵人 3 格內挖壕：持有的目標到 Level 3，與敵人相鄰的格到 Level 1，付款後補給堆總量須保留 ≥ 12T。
  - 工作單位優先，其次才是工兵。
- 存檔：`BUILD_HEDGEHOG`、`REDUCE_HEDGEHOG` 可存檔與重播；不需要遷移，因為沒有新增狀態欄位，等級等資料都放在單位狀態。

## 3. 驗收

| 列 | 條件 | 結果與證據 |
|---|---|---|
| HG-1 | 規則測試：建造、每回合一級、Level 4 上限、1 RE／戰鬥模式／未移動、費用、階段、工兵 2 格；拆除與移除、敵方不能拆；戰鬥 −Level 與 Surprise −1（以實際擲骰核對）、Heavy AT、砲擊左 1、佔領、Reserve 限制、敵方可見 | PASS：`tests/rules/hedgehogs.test.ts`（13 項） |
| HG-2 | 攻守戰守方每個駐守單位格都有 hedgehog（目標 L2、關鍵點 L1），攻方與遭遇戰沒有 | PASS：`tests/game-flow/engagements.test.ts`「hedgehogs in an attack」 |
| HG-3 | `npm run check` 全部通過 | PASS（2026-10-08） |
| HG-4 | random-legal 互打（Axis 進攻，12 局 5 回合）：新動作出現、0 錯誤、重播相符 | PASS：seed 42900–42911，12/12 FINISHED、replay ok；存檔中 88 次建造、47 次拆除 |
| HG-5 | heuristic@10 互打，兩種攻方各 20 局：0 錯誤、全部打完、重播相符；攻方勝率仍在 30%–70% | PASS：見 §4 |
| HG-6 | 真實瀏覽器（產品驗收 NG-13）：看到開局 hedgehog、挖壕、工兵建造、拆除、攻擊 hedgehog 格、完成 Game Turn | PASS：`docs/quality/evidence/hedgehogs-2026-10-08`（15/15，0 頁面錯誤） |
| HG-7 | 目視：地圖標記與 BTR 圖樣一致、Level 讀得到 | PASS：同上 `02-attacker-sees-hedgehogs.jpg`。第一次執行時 Level 圓是黑色、看不到數字：地圖把單位圖樣轉成點陣圖時只套用部分 CSS。已修正 `map-canvas.ts` 的樣式篩選後重跑 |

## 4. 攻守平衡量測（heuristic@10 互打，溫帶 32×24 預設、每局 8 回合）

| 對局 | seed | 攻方勝 | 每局 hedgehog 建造（守／攻） | 其他 |
|---|---|---|---|---|
| Allied 進攻 | 43000–43019 | 9/20 | Axis 守 4.6、Allied 攻 5.8 | 20/20 FINISHED，replay 全部相符，回合結束 93% 戰鬥單位在補給內 |
| Axis 進攻 | 43500–43519 | 8/20 | Allied 守 5.7、Axis 攻 4.3 | 20/20 FINISHED，replay 全部相符，95% 在補給內 |

- 攻方合計 17/40（42.5%）。加入 hedgehog 之前（地圖外空軍版，seed 40000／40500）是 26/40（65%，接近 70% 上限）。
  兩者 seed 不同，但下降方向符合預期：守方的駐守單位有了 hedgehog，攻擊時 DRM 變差。
- 攻方也會在與敵相鄰的前線格挖壕（Level 1），用來抵擋反擊。
