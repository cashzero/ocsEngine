# Study 9：OCS 4.3 規則與 Rule Engine 計畫落差分析

狀態：**研究完成／據此重開 R10 gate**。本文件是研究證據，不把任何規則、gate 或
`docs/quality/03-product-operation-verification-plan.md` 列提升為 `PASS`。

- 日期：2026-09-30
- 基準版本：`2f4b72d`（main）
- 規則來源：`docs/rules/ocs-series-rules-v4.3.md`
  （SHA-256 `5a0809f4…4679057f`，與 `RULE_TABLE_PROVENANCE` 記載一致）

## 1. 範圍與方法

### 1.1 比對對象

| 類別 | 文件／程式 |
|---|---|
| 規則（權威） | OCS Series Rules v4.3 §1.0–13.9、§16、§17、§20（地面／後勤 MVP 相關部分） |
| 計畫（GPT 撰寫） | `docs/roadmap/02-rule-engine-wbs.md`、`docs/study/08-crosswalk-and-implementation-roadmap.md` |
| 切片規格 | `docs/rule-engine/00-*.md`–`09-*.md`（每份 7–13 行） |
| 完成宣告 | `docs/reports/R10-rule-engine-integration.md`、`src/rules/manifest.ts` |
| 抽查實作 | `src/rules/**`、`src/game-flow/configuration.ts` |

§14–15（航空）、§18–19（海軍、港口與航運）、§21（選用規則）在計畫中已明確列為
`DEFERRED`。本研究只在它們影響地面 MVP 時才提及。

### 1.2 方法

1. 逐節閱讀規則，把每一條可觀察的要求整理出來。
2. 對照 WBS 的要求、切片規格的承諾，以及 manifest 的狀態。
3. 用程式碼抽查關鍵差異，並附上檔案與行號。
4. 以「是否改變對局結果」定出嚴重度：
   - **P0**：每場戰鬥或每次移動都會算錯，或是完成宣告不實；
   - **P1**：特定情境下規則錯誤，或缺少玩家決策；
   - **P2**：功能缺席，但已有或應有明確的延後登記。

### 1.3 結論摘要

計畫的架構層（reducer、transaction、pending decision、replay、viewer projection）
與規則相容。落差集中在**規則內容**：WBS 列出的要求在切片規格中被大量縮減或延後，
manifest 卻仍把相關章節標為 `IMPLEMENTED`，R10 也宣告完成。依 `AGENTS.md` 的
Delivery-status rule，**R10 gate 必須重開**（見 §3）。

最嚴重的四項如下：

1. 戰鬥表（CRT）與砲擊表是自編的 2 欄資料，provenance 卻標為 `REVIEWED`（G-A2）。
2. 戰鬥缺少 Surprise、地形列與 AT、賠率捨入、AR 選擇，以及 option/exploit 結果結構（§2.5）。
3. 燃料（§12.5）和內部存量（§12.10）完全沒有，manifest 也沒有列出（G-D8、G-G6）。
4. ZOC 沒有依 Truck MP 區分，抵銷規則與規則相反（G-C1、G-C2）。

## 2. 落差清單

欄位說明：**計畫立場**是指 WBS 與切片規格怎麼寫；**證據**是程式碼的抽查結果。

### 2.1 A — 治理與完成宣告

| ID | 規則／計畫要求 | 實際狀況 | 證據 | 嚴重度 |
|---|---|---|---|---|
| G-A1 | WBS R0：OCS 1.0–21.12 每一條都要登記支援狀態 | manifest 只有 17 列粗項。§2.3 天氣與先手、§2.4、§4.7、§4.9、§5.4a、§9.14、§12.2、§12.5、§12.9–12.11、§13.1–13.5、§13.7–13.9、§16、§17、§20 都沒有列入，既非 `IMPLEMENTED` 也非 `DEFERRED` | `src/rules/manifest.ts:38-56` | P0 |
| G-A2 | WBS R0 gate：缺表的功能不可標為 implemented；Study 8 M0：規則表必須有來源並經過核對 | `table:ocs-4.3-ground-combat-mvp` 與砲擊表都標 `REVIEWED`，locator 指向 §9.7–9.10 與 §10.0–10.1，但規則書正文**不含**這些表（它們在 player aid 上）。實際資料是自編的 2 欄表，結果只有 5 種代碼 | `manifest.ts:59-71`；`src/game-flow/configuration.ts:35-72` | P0 |
| G-A3 | manifest 標示的範圍應與規格一致 | `combat.ground` 標 §9.1–9.13，但 R8 規格自己把 Surprise、AT、地形選擇列為延後。`movement.ground` 標 §6.1–6.3，但 R5 規格延後了疊堆移動與 drop-off。`mode.transition` 標 §5.1–5.10，但缺漏見 §2.3 | `docs/rule-engine/05-*.md`、`08-*.md` | P0 |
| G-A4 | WBS R10：至少要跑一次 Overrun、Exploitation，每個 pending 邊界都要 save/reload | R10 實跑的序列沒有 Overrun，也沒有 Exploitation 戰鬥；整合測試中的 `overrun` 只出現在文件名稱字串裡。報告卻寫「complete」 | `tests/rules/rule-engine-integration.test.ts:230`；R10 報告 | P0 |
| G-A5 | Study 8 M0 停止條件：第一個情境與所需規則表確定之前，不得開始 runtime 開發 | 直接以 synthetic fixture 開工。規則表至今只有移動 TEC 補上了核准來源（`docs/rules/btr-movement-tec.md`） | Study 8 §M0 | P1 |
| G-A6 | WBS 各 slice 的 Definition of Done：縮減必須記錄為 TODO 並寫明關閉條件 | R5、R7、R8 的切片規格把 WBS 的 10 項要求砍掉約一半，但沒有對應的 TODO 或 manifest 列 | 比對 WBS §4 與 `docs/rule-engine/*` | P1 |

### 2.2 B — 回合序列（§2）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-B1 | §2.3 天氣：由一方擲骰，結果影響整個回合 | WBS R2 列出了天氣，但沒有規格 | 天氣階段直接跳過（`src/rules/sequence/sequence.ts:47`） | P1 |
| G-B2 | §2.3 先手：雙方各擲 2d6，高者選擇先手或後手，平手重擲 | 沒有規格 | 固定由 scenario 的 `firstPlayerId` 先手（已記錄於 UI/UX 審查第 3 項） | P1 |
| G-B3 | §2.3 增援階段：擲 Supply Table 與 Variable Repl Table，執行 Rebuild 與 Consolidation | R9 只做了「放置」 | 沒有這些擲骰與動作 | P1 |
| G-B4 | §2.2 移動階段第一個 segment 是 Breakout | 沒有 | 沒有這個 segment | P2 |
| G-B5 | §2.3 補給階段：**先強制**補回 Low/Exhausted，**再**檢查所有戰鬥單位的 trace | R7 沒有前者 | 目前可以直接結束階段、不做追蹤（UI/UX 審查第 2 項） | P0 |
| G-B6 | §2.3、§5.10 Clean Up：只移除 phasing 方的 DG 與 Exploit 標記；移除 Fuel 標記 | R9 做了 DG 與 Exploit，但沒有 Fuel（因為燃料根本不存在） | — | P2 |
| G-B7 | §2.4 Simulcast 回合 | 沒有 | manifest 沒有列入 | P2 |

### 2.3 C — 模式、ZOC、疊放、迷霧（§4–5）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-C1 | §4.5a(A)(B)：ZOC **只**擋用 Truck MP 的移動和補給路徑；Leg 與 Track 不受影響 | R4 沒有提到機動類型 | 移動時不論機動類型一律擋下（`src/rules/movement/movement.ts:231-234`） | P0 |
| G-C2 | §4.5b 抵銷：格內有友軍**戰鬥**單位，且它本階段之後不再花 MP；**移動可以抵銷** | R4 寫「Movement/Reserve/Strat 不用抵銷」，與規則相反 | 只有 SUPPLY/COMBAT 用途才抵銷，而且任何友軍地面棋子（包含補給點）都算抵銷者（`src/rules/zoc/zoc.ts:40-45`） | P0 |
| G-C3 | §4.5a(A)：階段開始時就在敵 ZOC 內的單位可以自由離開 | 沒有 | 沒有區分 | P1 |
| G-C4 | §5.9c：Exploit 單位只保留取得標記**之前**就有的 ZOC | R4 寫成 Exploitation 單位都有 ZOC | `zoc.ts:20` 對所有 EXPLOITATION 單位給予 ZOC | P1 |
| G-C5 | §4.8a：疊放只在 segment/phase 結束時檢查；移動途中可暫時超疊（Overrun 除外）；增援階段**不**檢查；超疊時由擁有者選單位消滅 | R5 寫中途也檢查；R9 寫增援要通過疊放檢查 | 每一步都檢查（`movement.ts:231`）；增援也檢查（`src/rules/lifecycle/lifecycle.ts:114`）；沒有超疊消滅流程 | P1 |
| G-C6 | §4.8：每 hex 最多一個港口、一個機場、一個刺蝟 | 沒有 | — | P2 |
| G-C7 | §4.9a：對手可見的是刺蝟、最上面的 **Combat 模式可攻擊單位**（沒有的話就是最上面的戰鬥單位）、最上面的飛機，並可得知它是否 Strat、DG、OOS；隱藏的只有步數與內部存量 | R3：只給「頂部棋子」，並遮蔽狀態 | 可見的棋子選錯；狀態遮過頭 | P1 |
| G-C8 | §4.9b：戰鬥時雙方公開 AR、AT 效果、總戰力 | 沒有 | — | P2 |
| G-C9 | §4.4c、§4.8c：進入只有敵方非戰鬥單位的格子，屬於 §9.14 特殊戰鬥，不是 overrun | R5 把所有敵佔格都導向 Overrun | `movement.ts:230` | P1 |
| G-C10 | §5.7：Reserve 防守時戰力減半；§5.7c 在敵 ZOC 內不能轉 Reserve；§5.7d 受到任何戰鬥結果就解除；§5.7g 不可在刺蝟格結束移動 segment；§5.4a Reserve 標記有數量上限 | R4 只做了 release | 戰力計算沒有 Reserve 減半（`src/rules/combat/combat.ts:68-79`） | P1 |
| G-C11 | §5.7b：release 就是移除 Reserve 標記，單位回到 Combat 或 Move 模式 | 建模成「仍是 RESERVE，另加 released 旗標」 | `movement.ts:45-47`、`:199-200`。語意偏差，連帶影響 ZOC 與攻擊資格 | P1 |
| G-C12 | §5.8：Strat 單位戰力與 AR 歸零；撤退進 ZOC 就消滅；不能吃地圖補給；必須結束在可 trace 的位置 | R4 只做了「不得進入 ZOC」 | 其他各項都沒有 | P1 |
| G-C13 | §5.10a/b：DG 讓戰鬥、砲擊、移動減半，AR −1，不能 overrun、不能獲得 exploit；觸發條件包括撤退第 2 格、撤入敵 ZOC，而且同格所有戰鬥單位一起變 DG | R8 只有 DG 結果碼 | 撤退觸發和全格 DG 都沒有 | P1 |
| G-C14 | §6.1h：減半或四分之一後的 MA **不得捨入** | R5 寫「exact fractional MP」 | 程式碼用 `Math.floor`（`movement.ts:46-49`） | P0 |

### 2.4 D — 移動、Overrun、Reaction 與 Exploitation（§6–8、§11、§12.5）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-D1 | §6.1e–g：以疊堆移動、中途放下（drop-off）、放下的單位不可再動；用放下的單位「鋪地毯」抵銷 ZOC | WBS R5 有要求；R5 規格延後了 | 沒有，manifest 卻標 §6.1 已實作 | P0 |
| G-D2 | §7.0a：Reaction 階段只能用已 release 的 Reserve | WBS M3 有要求 | 所有單位都能動（UI/UX 審查第 1 項） | P0 |
| G-D3 | §11.0a/b：Exploitation 階段只能用 Exploit 模式（MA 減半）和已 release 的 Reserve（全 MA） | 同上 | 同上 | P0 |
| G-D4 | §8.1、§8.1a/b/c：每次 overrun 花 3 MP，剩不到 3 MP 就不能 overrun；目標格成本必須 ≤3 MP，而且不能靠道路或橋 | R8 只寫「限移動 segment、持有 mover lock」 | 非 COMBAT 階段的宣告一律視為 overrun，沒有 MP 檢查（`src/rules/engine.ts:125`） | P0 |
| G-D5 | §8.1：只有階段開始時就同疊的可攻擊單位能一起 overrun；必須是 Combat、Move 或 Exploit 模式；DG 不行（§5.10b） | 沒有 | 沒有「開始時同疊」的快照 | P1 |
| G-D6 | §8.0、§8.1f：攻方沒撤退就能**繼續移動**並再次 overrun；攻方選擇撤退就結束移動；守方撤離或全滅時攻方**必須**進入該格 | R5 把移動設計成整條路徑一次原子執行 | 與「移動中途 overrun 後繼續」的流程結構性衝突；必須推進的規則也沒有 | P0 |
| G-D7 | §4.8a：overrun 時攻方與出發格其他友軍合計不得超過 10 RE | 沒有 | — | P2 |
| G-D8 | §12.5：Truck/Track 單位不付燃料就不能花任何 MP；三種付費法（formation 1 SP、HQ 1 SP、單位 1T）各有不同持續時間；overrun 也要付燃料 | WBS R7 第 7 項有列；R7 規格沒提；manifest 沒有列 | 完全沒有，機械化單位等於免費移動（`movement.ground` 的 note 自己承認 12.5 未做） | P0 |

### 2.5 E — 地面戰鬥（§9）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-E1 | §4.1、§4.2、§9.7：攻守總戰力都除以兩者中較小的值，再各自四捨五入（.5 進位）。例：15:6 → 2.5:1 → 3:1；9.75:2 → 5:1 | 沒有提到捨入 | 用原始比值，再往下取欄位，所以 2.5:1 落在 2:1（`combat.ts:134`、`:138`） | P0 |
| G-E2 | §9.6：雙方各**選定一個**實際參戰的單位作為 AR 單位；DRM = 攻方 AR − 守方 AR，不設上下限，並同時用於 Surprise 與戰鬥擲骰 | R8 寫「Action Rating modifier」 | 取全體最大 AR，並夾在 ±2；玩家無從選擇（`combat.ts:135-137`） | P0 |
| G-E3 | §9.8 Surprise：每場戰鬥都擲 2d6+DRM（有刺蝟再 −1），查 Surprise 表，成立就擲 1d6 決定移動幾欄；overrun 與一般戰鬥用不同門檻 | R8 延後 | 沒有 | P0 |
| G-E4 | §9.3、§9.4b/c：地形分 Open/Close/Very Close/Extremely Close 四類，決定 CRT 列；守方為每個攻擊疊選 hex 或 hexside 地形，並另選防守地形 | 沒有 | CRT 沒有地形列，也沒有地形倍率；只把地形 ID 當作 fact 輸出 | P0 |
| G-E5 | §9.4d/e：方括號修正只對攻方有效；AT 效果（Heavy/Light/None）會把 ×2 降為 ×1.5 | R8 延後 | 沒有 | P0 |
| G-E6 | §9.10：結果由 L（硬損失）、o（option）、e（exploit）、DG 組成；option 可任意拆成損失與撤退格數；攻方先執行；§9.10c 守方可忽略 option；§9.10d 攻方要拿 exploit 必須把 option 全部取為損失 | R8 只有 loss、retreat、advance 決策 | 只有 5 種結果碼，沒有攻方 option、沒有 exploit 結果（`src/rules/kernel/model.ts`、`configuration.ts:35-52`） | P0 |
| G-E7 | §9.1d：一格內所有戰鬥單位一起防守，守方不能保留；§9.1c：可從多格聯合攻擊；一個 segment 內同一格只能被攻擊一次 | 沒有 | 候選動作只產生「單一攻擊者對單一守方棋子」（`engine.ts:124-142`）；沒有「同格只能被攻擊一次」的限制 | P0 |
| G-E8 | §12.4、§9.5：攻方每個攻擊步數 1T，守方每場 2T（≤1 RE 則 1T）；攻方先付，付不起就取消；守方可以不付，改以半數戰力防守 | R6/R8 只有「資源保留」 | 固定 1T，而且只保留一筆（`reducer.ts:282`、`configuration.ts:34`）；守方補給沒有模型 | P0 |
| G-E9 | §9.11c：AR 單位先承受第一個損失；多個損失必須先平均分攤；§9.11d：多步單位缺步時攻擊減半，缺一半以上時防守也減半，RE 隨之減少 | R8 只寫「step loss」 | 戰力計算不考慮缺步（`combat.ts:68-79`） | P1 |
| G-E10 | §9.12：撤退必須達到直線全距離；經過敵佔格或禁止地形就消滅；撤退第 2 格觸發 DG；撤入敵 ZOC 造成 DG，已是 DG 的再扣一步（不能抵銷）；§9.12d tagalong；§9.12f 戰鬥開始時有敵戰鬥單位的格子不能穿越 | R8 寫了「避開敵 ZOC」 | 規則是**可以**撤入敵 ZOC，只是要付代價；計畫寫成禁止，方向錯了 | P1 |
| G-E11 | §9.12g：只有付了戰鬥補給的單位能推進；overrun 成功後**必須**推進 | R8 寫「推進可選」 | overrun 缺少必須推進 | P1 |
| G-E12 | §9.13b：DG 攻方、overrun、Exploitation 階段的攻擊、兩個不相鄰的攻擊疊，都不能獲得 exploit | 沒有 | 沒有 exploit 結果，所以也無從檢查 | P1 |
| G-E13 | §9.14：零戰力單位的欄位規則；進入補給點或卡車格要查 Capture Table；刺蝟、機場、港口會被奪取；Extender 會崩解 | 延後，但 manifest 沒有列 | 沒有 | P1 |
| G-E14 | §9.9、§16.0d/e：刺蝟給戰鬥 DRM −等級、Surprise −1，並提供 Heavy AT | 沒有 | 沒有，manifest 也沒有列 §16 | P1 |
| G-E15 | §9.1g、§9.7b：超出表格的賠率用最後一欄，欄位位移從該欄起算；§9.14a 零戰力從最左或最右欄開始 | 沒有 | 只有 2 欄，無從套用 | P1 |

### 2.6 F — 砲擊（§10）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-F1 | §10.0、§10.1a/b：依總砲擊力選欄；補給成本依**初始欄位**而定；修正包括密度（一個師最多算 3 RE）、沒有正確觀測者左移 3 欄、由目標方選地形、刺蝟 | R8 只做了「射程、補給保留」 | 2 欄表、固定 1T（`configuration.ts:54-72`） | P0 |
| G-F2 | §10.0a：[1/2] 結果要補擲 1 骰決定是否損失；由目標方選哪個單位承受損失 | 沒有 | 結果只有 NO_EFFECT、DG、STEP_LOSS_AND_DG | P1 |
| G-F3 | §10.0e：同一格每階段只能被砲擊一次；每個單位每階段只能射一次；不得拆分砲擊力 | R8 只有「unused firing state」 | 沒有「每格一次」的限制 | P1 |
| G-F4 | §10.1b(A)(C)：多單位砲擊的補給必須來自同一 HQ 或同一 dump；不能用內部存量 | 沒有 | — | P2 |
| G-F5 | §10.0e(E)、§5.7b、§7.0a：Reaction 與 Exploitation 階段也可以砲擊（Reaction 限已 release 的 Reserve 砲兵）；§13.4a Reserve 與 Strat 砲兵不能射 | R2 列出了 Barrage segment | 資格檢查與 G-D2/D3 同一缺陷 | P1 |

### 2.7 G — 補給（§12）

| ID | 規則 | 計畫立場 | 實際狀況／證據 | 嚴重度 |
|---|---|---|---|---|
| G-G1 | §12.3a、§12.3c、§12.3d：直接 draw 的範圍是沿 **Truck MP 路徑 5 MP 以內，或相鄰格**；可以從多個 dump 湊齊；路徑套用 §6.1 的移動規則與晴天地形成本；只有敵**戰鬥**單位會阻擋 | R7：BFS 加設定範圍 | 用 hex 直線距離 ≤ `supplyTraceRange`（6），並要求單一 dump 就足量（`src/rules/supply/supply.ts:79-83`） | P0 |
| G-G2 | §12.3b：HQ throw 的範圍以 MP 計、依機動類型；Strat 模式的 HQ 不能 throw；不能「再轉 throw」；§13.1d 師屬 HQ 只能補給本師 | R7 寫「non-Strat HQ relay」 | 沒有 MP 範圍，也沒有師屬限制 | P1 |
| G-G3 | WBS R7：「必須列出所有合法的補給來源，不得替玩家默默挑選」 | R7 規格改成依距離和 ID 自動排序，與 WBS 矛盾 | 計畫內部自相矛盾 | P1 |
| G-G4 | §12.6a/b：補給源包括地圖邊的鐵路增援進入格、可下車格（detrainable）、連得上的 Extender；補給源格內有未抵銷的敵 ZOC 就失效 | R7 只有抽象的 Source | 可下車格需要 §13.3c 與 §13.8c，已延後 | P1 |
| G-G5 | §12.8：OOS 單位每個補給階段都要擲 Attrition；§12.8e Breakout | 延後 | 延後之後，OOS 的懲罰只剩戰力減半，遠比規則輕 | P1 |
| G-G6 | §12.10：內部存量 Low/Exhausted 只在沒有 SP 可取時才能用於戰鬥補給；補給階段強制補回（Low 2T/單位，Exhausted 加倍）；§12.10g/h 同一單位不能混用 | WBS R7 第 8 項有列；R7 規格延後；manifest 沒有列 | 沒有 SP 就完全不能攻擊，改變了 §9.5 的可行性 | P0 |
| G-G7 | §12.6f、§13.7a：同一 formation 應該從同一 HQ 或同一 dump trace，否則部分單位要吃補給或變 OOS | 沒有 | — | P2 |
| G-G8 | §12.2a 跳板限制；§13.2f 裝卸各花 MA 的 10%，且只能在特定格子卸貨；§12.11a 炸毀 dump | 延後 | manifest 只寫了「load/unload/capture」 | P2 |
| G-G9 | §12.0：只有戰鬥單位需要補給 | 沒有寫明 | — | P2 |

### 2.8 H — 特殊單位與其他（§13、§16、§17、§20）

| ID | 規則 | 實際狀況 | 嚴重度 |
|---|---|---|---|
| G-H1 | §13.1c：HQ 的 AR 是 0；防守戰力 Combat 模式 (5)、Move 模式 (1)；被迫撤退時要轉成 Move 模式 | 不論模式固定為 5（`combat.ts:75`） | P1 |
| G-H2 | §13.4b：砲兵防守戰力 (1)；§13.4a Reserve 與 Strat 砲兵不能射 | 防守 1 已實作；射擊資格見 G-F5 | P2 |
| G-H3 | §13.6：增援**不可延後**入場；可以超疊；可以放在敵 ZOC 內；進入格被擋時改放最近的地圖邊格；§12.5f 抵達回合沒有免費燃料 | 增援會檢查疊放（G-C5）；其他各項都沒有 | P1 |
| G-H4 | §13.8b 架橋：Engineer-Capable 單位把大河降為小河成本、小河降為無額外成本 | 沒有，會影響移動成本 | P2 |
| G-H5 | §16 刺蝟：建造、降級、戰鬥 DRM、AT；每格最多一個 | 完全沒有，manifest 也沒有列 | P1 |
| G-H6 | §17 天氣：依遊戲天氣表擲骰；補給路徑忽略惡劣天氣造成的成本增加 | 沒有，manifest 也沒有列 | P1 |
| G-H7 | §20 Breakdown：只有「Other」類多步單位可以在開始移動或撤退、推進時拆出，並在階段結束時強制吸收 | 沒有，manifest 也沒有列 | P2 |
| G-H8 | §13.5 Repl 重建、§13.9 Consolidation、§13.7 Formation 標記 | 沒有，manifest 也沒有列 | P2 |

## 3. 對既有完成宣告的影響

依 `AGENTS.md` 的 Delivery-status rule：「If later evidence disproves an earlier
completion claim, reopen the gate immediately」。

| 宣告 | 應改成 | 理由 |
|---|---|---|
| R10 Rule Engine Integration「complete」 | `IN PROGRESS` | G-A1–A4 與所有 P0 項目 |
| manifest `combat.ground`（§9.1–9.13）`IMPLEMENTED` | 拆成細列；Surprise、地形、AT、option/exploit、補給成本分別標 `DEFERRED`（附 TODO） | G-A3、§2.5 |
| manifest `movement.ground`（§6.1–6.3） | 拆出疊堆移動與 drop-off（`DEFERRED`）；補上燃料（§12.5）一列 | G-D1、G-D8 |
| manifest `mode.transition`（§5.1–5.10） | 拆出 Reserve、Strat、DG 各子規則 | G-C10–C13 |
| manifest `barrage.artillery`、`overrun.ground` | 依 §2.4、§2.6 拆列 | G-D4–D7、G-F1–F5 |
| `RULE_TABLE_PROVENANCE` 兩張 MVP 表 `REVIEWED` | 改為 `DEFERRED`／`SYNTHETIC`，並標明「非 OCS 表格」 | G-A2 |

本研究只重開 R10 報告的狀態（見該報告的「狀態更正」段）。manifest 程式碼的拆列屬於
後續工作，列為下面的 TODO-R1。

## 4. TODO 與關閉證據

> **2026-10-01 狀態更新**：本節以 2026-09-30 的程式為基準。規則層已於 2026-10-01 重建
> （`docs/reports/ocs-rebuild-2026-10-01.md`）。多數項目的程式與條文測試已完成，但**皆未經實機 UI 驗證**，
> 故不得視為關閉。對照（依重建紀錄與 `src/rules/manifest.ts` 判讀）：
> R2、R3、R4、R5、R6、R7、R8、R10、R12、R13＝程式已實作，待實機驗證；
> R1＝manifest 仍為粗分類，**仍開啟**；R9＝整疊移動（6.1f）使用者暫緩，**仍開啟**；
> R11（MA 不捨入）未確認，**仍開啟**；R14＝已登記為 DEFERRED，各系統待實作。
>
> **2026-10-04 補註（TODO 盤點，依 main `ca555b4`）**：manifest 現有 25 列（9 IMPLEMENTED、11 PARTIAL、4 DEFERRED、1 GAME_SPECIFIC）。
> R14 中的 Breakdown（20.0）已是 `breakdowns` IMPLEMENTED（`docs/reports/breakdowns-2026-10-03.md`，待驗收列核准）；
> Rebuild（13.5a-e）已是 `replacements-rebuilds` PARTIAL（#57）；刺蝟／工兵仍是 DEFERRED（`hedgehogs-engineering`）。R1、R9、R11 狀態不變。
> 集中清單見 `docs/quality/05-todo-inventory.md`。

每一項都依 `AGENTS.md` 寫明：缺少的行為、對使用者的影響、關閉所需的證據。

| TODO | 缺少的行為 | 對使用者的影響 | 關閉證據 |
|---|---|---|---|
| TODO-R1 | manifest 逐條登記 §1–21，不再有未登記的規則；拆開 G-A3 所列的粗項 | 無法判斷哪些規則是真的有做 | `manifest.test.ts` 斷言 §1.0–21.12 每個小節都有一列；每列 `IMPLEMENTED` 都指向實際測試 |
| TODO-R2 | 取得經使用者核准來源的 CRT、Surprise、Barrage、Capture、Attrition 表 | 每場戰鬥與砲擊的結果都不是 OCS 的結果 | 表格資料附 provenance（來源、頁碼、checksum）與逐欄邊界測試；需要**使用者決定來源**（見 §5） |
| TODO-R3 | 戰鬥計算：賠率捨入（G-E1）、AR 選擇（G-E2）、Surprise（G-E3）、地形列與選擇（G-E4）、AT（G-E5）、全格合併防守與多格攻擊（G-E7） | 賠率、DRM、欄位都算錯 | 用規則書範例（§4.2 的 9.75:2 → 5:1、「Comprehensive Combat」、「Overrun with a Hipshoot」）當測試案例，重現書中的欄位與結果 |
| TODO-R4 | 結果結構 L/o/e/DG、option 拆分、攻方先執行、§9.10c/d、§9.11c 損失分配、§9.12 撤退與 DG、§9.13 exploit | 沒有 exploit、沒有攻方 option 選擇 | §9.10 的範例 A–E 各一個測試；在實際 UI 中完成一次有 exploit 的攻擊 |
| TODO-R5 | 依步數計的戰鬥補給成本、守方補給與拒付、內部存量（§12.10） | 補給經濟與攻擊可行性都錯 | §9.5b 範例（3T 對 1T）的測試；補給階段強制補回的測試 |
| TODO-R6 | 燃料（§12.5）的三種付費法與持續時間 | 機械化單位免費移動 | §12.5 範例（5T 對 9T）的測試；在 UI 中操作付燃料再移動 |
| TODO-R7 | 只作用於 Truck 的 ZOC、正確的抵銷、開始時在 ZOC 內可自由離開、Exploit 保留的 ZOC | 移動與補給路徑判定錯誤 | §4.5 的「Movement in Zones of Control」與「Laying a Carpet」範例測試 |
| TODO-R8 | 疊放改為在 segment/phase 結束時檢查、增援階段豁免、超疊消滅流程 | 合法的移動被拒絕 | 移動途中超疊但結束時合法的路徑測試；增援超疊測試 |
| TODO-R9 | 疊堆移動與 drop-off、overrun 後繼續移動、3 MP 成本與 ≤3 MP 目標、階段開始同疊快照、必須推進 | 無法鋪地毯、無法連續 overrun | §8.1a 範例（兩次 overrun 共 6 MP）測試；在實際 UI 完成一次連續 overrun |
| TODO-R10 | Reaction 與 Exploitation 行動資格（G-D2、G-D3），並把 release 建模為移除 Reserve 標記 | 反應階段失去意義 | 已列於 UI/UX 審查第 1 項的關閉條件 |
| TODO-R11 | MA 不捨入（G-C14）；模式子規則（G-C10–C13） | 移動力與防守力算錯 | Reserve 1/4、DG 1/2 的分數 MA 測試（例如 MA 5 的 Reserve 可用 1.25 MP） |
| TODO-R12 | 天氣與先手擲骰（G-B1、G-B2） | 先後手固定不變 | 以 seed 固定的 2d6 先手測試；UI 中操作先手選擇 |
| TODO-R13 | 補給距離改為 MP 路徑、多 dump 加總、HQ throw 範圍、列出所有來源讓玩家選 | 補給可達範圍錯誤 | §12.3「Maximum Stretch of HQs」範例測試 |
| TODO-R14 | 刺蝟、Capture、Attrition、Breakout、Rebuild、Breakdown 等尚未登記的系統 | 功能缺席 | 先在 manifest 登記為 `DEFERRED`（TODO-R1），各自再立關閉條件 |

建議順序：R1 → R2（需要使用者決定）→ R3/R4/R5 → R7/R8/R11 → R6/R9/R10 → 其餘。

## 5. 未決問題與外部依賴

1. **規則表的來源**（阻擋 TODO-R2）：規則書正文不含 CRT、Surprise、Barrage、
   Capture、Attrition 表。要取用哪一份 player aid（例如 BTR 的 chart），需要使用者
   決定並核准授權方式。在此之前，這些表只能標為 `SYNTHETIC`，不能宣稱符合 OCS。
2. **地形戰鬥類別**：隨機地圖的地形要對應到 Open/Close/Very Close/Extremely Close，
   並定出 hexside 修正，需要 TEC 的戰鬥欄。`docs/rules/btr-movement-tec.md` 目前只有移動欄。
3. **轉錄品質**：本研究引用的條文在 PDF 轉錄中有少量亂碼（例如 §9.11d 標題）。
   關閉 TODO 前，應再用官方 PDF 核對一次。
4. **整路徑原子移動的設計**：它與 §6.1f（中途放下）、§8.0（overrun 後繼續移動）、
   §13.2a（運輸暫停使用補給）衝突。需要改為可暫停、可續行的 mover transaction，
   也就是 WBS R5 原本要求的 begin/enter/drop/finish。

## 6. 完成檢查

- [x] 已讀規則 §1.0–13.9、§16、§17、§20，並逐節比對。
- [x] 已比對 WBS、Study 8、切片規格 00–09、R10 報告、manifest。
- [x] 每個落差都有規則出處，並盡可能附上程式碼證據。
- [x] 已列出受影響的完成宣告與應改成的狀態。
- [x] 每個 TODO 都寫明缺少的行為、對使用者的影響、關閉證據。
- [x] 已列出需要使用者決定的外部依賴（規則表來源）。
- [ ] 以官方 PDF 核對所引用的條文（見 §5 第 3 點）。
