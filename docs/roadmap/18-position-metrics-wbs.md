# 局勢指標研究 WBS

狀態：**IN PROGRESS**。P0–P7 已完成：局勢指標經分組樣本外驗證、殘差檢視與一次前瞻確認，確認成立的指標見 [局勢指標](../ai/policy-errors.md#指標是否可用)。P8–P10 依 [統計與非統計方法的評估](../ai/vp-metrics.md#篩選決定性指標替代終點驗證與實驗設計的八類統計方法) 排序；P8 已完成，P8a 的效果轉移檢查已執行，P9 尚未開始；P10 進行中，已完成查詢來源與派送身份觀測，策略條件尚未覆蓋；指標當 reward 與反向搜尋仍暫緩。本文件只維護工作分解；指標定義、量測結果與結論寫在 [電腦策略的錯誤清單：局勢指標](../ai/policy-errors.md#局勢指標)。

需求來源（使用者）：

- 2026-10-18：「position 無法直接反映在 vp/kill/loss/supply 但是至關重要的問題 我認為目前缺少量測這點的metrics」；「先增加這些指標 並且記錄下來 有了數據之後再來做進一步分析」。
- 2026-10-19：正確方向是「找出更多更深入的metrics 改用metrics當reward」，並且「反向思考尋找讓局勢大大惡化的決策」；隨後決定「這些目前都還不能做 應該繼續focus再增加metrics」。
- 2026-10-19：局勢指標「至關重要」，計畫另開一份，不併入 [AI WBS 第 7 節](11-ai-bot-wbs.md#7-vp-預測指標研究)；同意為前瞻確認新增對局，場數事先登記。

相關文件：

- [局勢指標的定義與驗證結果](../ai/policy-errors.md#局勢指標)
- [VP、Kill、Loss 與補給改善的預測指標](../ai/vp-metrics.md)（目標級紀錄、四結果與第 4 回合補給條件，由 AI WBS 第 7 節維護）
- [AI 對戰評估：工具](../ai/evaluation.md)

## 0. 範圍與分工

局勢指標描述「從目前局面，各方下一回合能做什麼、會承受什麼」，逐玩家回合記錄，用來在局面接續測試中補足 VP、Kill、Loss、Supply 看不到的局勢變化。

| 工作 | 歸屬 |
|---|---|
| 逐回合的局勢指標（下一回合的威脅、機會、補給線、兵力配置）與其近期預測驗證 | 本文件 |
| 目標級紀錄（選定、承諾兵力、控制流失）、四結果、第 4 回合配給缺口與單一來源依賴 | [AI WBS 第 7 節](11-ai-bot-wbs.md#7-vp-預測指標研究) |
| 以指標當 reward 判斷決策、反向搜尋惡化局勢的決策 | 暫緩（使用者 2026-10-19）；本文件的指標通過驗證後再規劃 |

## 1. 指標的標準

一個局勢指標要成為可用的近期訊號，須同時符合：

1. 樣本外能預測對應的近期結果：同一地圖種子的所有對局留在同一折，與「全猜 0」、訓練中位數、距離基準與分桶中位數比較，分角色（攻方行動、守方行動、遭遇戰）報告，並附負對照（`scripts/ai-position-validate.py` 的方法）。
2. 不飽和，在至少一個角色子組內有效，而不只是合併各角色後有效。
3. 在結果發生前可觀測，並指向可調整的決策。
4. 計算成本在局面接續測試中可接受。
5. 長期目標：對終局 VP 有超過 VP、step 與斷補的額外預測力，以 P6、P7 對應證據為準，不能由近期結果推定。

每個候選在驗證前寫下：定義、機制假說、對應的近期結果、基準與通過門檻。通過門檻為至少一個角色子組中，樣本外 MAE 或 R² 勝過所有基準，且種子群組重抽的區間不含 0。未通過的候選保留結果，停止往該方向延伸。

所有既有對局都已用於挑選與檢視，只能作探索資料。指標的正式成立需要第 7 步的前瞻確認。

## 2. 步驟

- [x] P0 第一批局勢指標與記錄。目標風險與可奪、暴露（上限與分配後）、HQ 與補給堆、可移動單位、一步可切斷的補給線；`ai-position-record.mjs` 在既有對局逐玩家回合記錄，附各方損失、目標點變化與補給堆損失。[記錄](../quality/evidence/ai-position-record-2026-10-18/README.md)、[補給線切斷](../quality/evidence/ai-position-supply-cut-2026-10-18/README.md)、[分配後暴露](../quality/evidence/ai-position-exposure-2026-10-18/README.md)
- [x] P0b 分組樣本外驗證工具與首次驗證。以初始 hash、終局 hash 與完整行動序列識別對局（255 條軌跡、96 組地圖種子），推翻以指標陣列去重的舊計數與舊的終局預測結論。[驗證](../quality/evidence/ai-position-validation-2026-10-18/README.md)；其近期數值後來因紀錄列的行動方錯置作廢（見 P2）。
- [x] P0c 第二批指標與損失原因拆分（溫帶 16 局描述）。`payableObjectives*`、`maxSingleStackExpectedLoss`、`surplusCombatSp`、`bestObjectiveEffectiveColumn`、`localForceRatioAt2Hex`；`combatStepsLost` 與 `attritionStepsLost`。[溫帶描述](../quality/evidence/ai-position-metrics-temperate-2026-10-18/README.md)
- [x] P1 驗證工具擴充。加入行動方的指標作特徵（進攻類指標要預測行動方的擊殺與奪點），以及跨到下一列的結果（不行動方在自己下一回合的斷補 step 損失）。自我測試涵蓋新特徵不洩漏未來資料。另加訓練五分位分桶模型，供比例、欄位、期望損失等非計數指標使用。[紀錄](../quality/evidence/ai-position-metrics-p2-2026-10-19/README.md)
- [x] P2 驗證未驗證的既有指標。全部 24 個對局資料夾以目前的記錄器重記，對 P0c 的指標、`dumpSpInReach`、`unitsWithReach` 與損失原因拆分做分組樣本外驗證，分角色報告。過程中發現並修正記錄器的行動方錯置（每個 Game Turn 第一列在先攻擲骰前建立，682／2,944 個 Game Turn 錯置），全部重記後重驗。[紀錄](../quality/evidence/ai-position-metrics-p2-2026-10-19/README.md)
- [x] P3 殘差檢視。用通過 P2 的指標預測近期結果，依事先固定的規則（每項結果取 P2 採用的指標中樣本外 MAE 最低者，每個角色取實際減預測最大的 20 個玩家回合）挑出 240 個案例，重播並整理發生的事。[紀錄](../quality/evidence/ai-position-metrics-p3-2026-10-19/README.md) 發現：戰鬥奪點的攻擊者多從 3 格外來（攻方行動時 85–94%），而有效欄位只算 2 格內的單位；21–42% 的戰鬥奪點只用第 6 欄以下；攻方行動時造成損失的攻擊中位數在第 8 欄，低於暴露的第 9 欄；守方行動與遭遇戰中，P 回合開始時仍有 trace、後來耗損的單位約一半只靠事後被消滅或斷補的 HQ；耗損單位有 49–73% 在 P 回合開始時已斷補，能否吃到口糧沒有量。
- [x] P4 新候選。依 P3 修正後的清單，驗證前寫下定義、結果、基準與門檻（門檻同第 1 節）：

  | 候選 | 定義 | 近期結果 | 基準 |
  |---|---|---|---|
  | `expectedLossAllocated` | 對方下回合的攻擊潛力分配到己方 stack（每個對方單位只攻擊一格）：每輪挑期望損失最高的 stack，留下維持同一欄所需的單位（先拿掉印刷戰力最弱的），期望損失依 2d6 與 Combat Table（持有目標點時 option 算損失），加總 | O 的戰鬥 step 損失 | `contact`；`stacksExposedAllocated` |
  | `objectiveReachColumn` | 己方未持有的目標點中，己方下回合能到旁邊的全部單位一起攻擊時的最高欄位（空的目標點能走進記 12，無法攻擊記 −1） | 行動方奪得的目標點 | `contact`；`bestObjectiveEffectiveColumn` |
  | `hqDependentUnitsInReach` | 有 trace 的己方非 HQ 戰鬥單位中，每條 trace 路線都是 HQ throw、且這些 HQ 都在對方下回合能到旁邊的單位數 | O 斷 trace 的單位增加；O 下一個己方回合的耗損 | `contact`；`outOfTrace` |
  | `outOfTraceUnfed` | 斷 trace 的己方戰鬥單位中，沒有任何己方補給堆的取用範圍涵蓋其所在格的單位數 | O 下一個己方回合的耗損 | `outOfTrace` |
  | `rearHexesInReach` | 對方下回合能到達、離己方戰鬥單位 2 格以上、且在己方 trace 範圍內的格數 | O 斷 trace 的單位增加；O 失去的 HQ | `contact` |

  原清單的預備隊與「可發動的攻擊」刪除：P3 顯示遠處來的攻擊者已由以移動範圍為準的欄位涵蓋。原清單的複合風險與「斷補後能撐幾回合」由 `hqDependentUnitsInReach` 與 `outOfTraceUnfed` 取代。
- [x] P5 實作、一次重記與驗證。候選定案後一次實作並重記（12 個行程約 25 分鐘），用 P1 的工具驗證；量測工具須證明不改變行動序列與終局 hash。全部 368 局重播到記錄的終局 hash，既有指標與 P2 的 20 項檢驗結果不變。`objectiveReachColumn` 勝過 2 格內的有效欄位；`expectedLossAllocated` 與分配後暴露相當；`rearHexesInReach` 只在攻方行動時通過；`hqDependentUnitsInReach` 弱；`outOfTraceUnfed` 不採用。[紀錄](../quality/evidence/ai-position-metrics-p5-2026-10-19/README.md)
- [x] P6 終局預測重驗。以正確的對局識別與種子分組，重驗通過 P2、P5 的指標在 VP、step、斷補之外對終局 VP 的預測力。執行前寫下的設計：每條不重複軌跡在 Game Turn 2～7 開始時的第一列，預測終局 VP 差（軸心減盟軍），攻擊戰與遭遇戰分開；模型 M0 為 VP 差，M1 加 step 差與 `outOfTrace` 差，M2 為 M1 加雙方的 `objectiveReachColumn` 與 `objectiveVpAtRisk`，M3 為 M1 加雙方的 `stacksExposedAllocated`，M4 為 M1 加雙方的 `hqsInReach`；訓練資料標準化的最小平方法，十折地圖種子分組，報告樣本外 R² 與 MAE；增益以種子群組重抽固定樣本外誤差 1,000 次得 95% 區間，區間不含 0 為通過。六個 Game Turn 同時比較，單一回合的通過須保守解讀。結果：攻擊戰中 M1 勝過 M0 到 Game Turn 5；M2 勝過 M1，Game Turn 3～7 的 MAE 與 Game Turn 5、6 的 R² 通過；M3、M4 沒有增益；遭遇戰沒有任何增益通過。[紀錄](../quality/evidence/ai-position-metrics-p6-2026-10-19/README.md)
- [x] P7 前瞻確認。凍結通過的指標版本與門檻，登記場數、種子與策略後跑新對局，揭露結果前保存預測。使用者已同意為此新增對局（2026-10-19），場數在登記時決定並寫入證據。已登記（[登記與結果](../quality/evidence/ai-position-confirmation-2026-10-19/README.md)）：標準策略自戰 160 局、11 項假設，模型只以既有 255 條軌跡擬合。27 格中 20 格通過；`supplyCuttable`、`rearHexesInReach` 對 HQ 損失與守方行動時的目標點指標未確認。
- [x] P8 多方向策略改版與試驗層級替代性。指標要當 reward，須證明「改版對指標的效果」能預測「改版對 VP 的效果」，樣本數是改版數而不是對局數（[統計方法第 6 類](../ai/vp-metrics.md#篩選決定性指標替代終點驗證與實驗設計的八類統計方法)）。有系統地擾動 heuristic 權重，產生數十個方向不同的變體（含變好、無效與變差），各跑少量成對對局，計算 P7 確認指標的試驗層級 R²；場數依檢定力分析登記。與 [AI WBS 的 M5](11-ai-bot-wbs.md#7-vp-預測指標研究) 共用變體與對局。已登記（[登記](../quality/evidence/ai-position-surrogacy-2026-10-19/README.md)）：12 個權重各減半與加倍共 24 個變體，對標準策略在攻擊戰交換座位各 8 對，384 局；主要問題為 Game Turn 4 的 M2 代理的試驗層級 R²。結果：變體效果確有差異（Q0 通過）；M2 代理的試驗層級 R² 0.517（Q1 通過），主要來自 step 與斷補；M2 沒有確定勝過只看 VP（Q2 不通過）；單項局勢指標接近 0。變體真實差異約 1 VP，小於檢定力假設的 2.6 VP，信度約 0.44。
- [x] P8a 跨種子及跨改動方向的效果預測。沿用 P8 的 384 場，以每種地圖各 2 組種子量測早期代理值，預測其餘各 2 組種子的終局 VP 效果；枚舉 36 個有方向的平衡切分。主要比較固定歷史 M2 與 M0 的 VP 平方誤差，另列零效果、訓練平均、完成開發局後的 VP 效果及校準模型。校準排除同權重減半與加倍兩個版本。先對帳原 P8，再驗證只有共同對局噪音的負對照、真正訊號與洩漏檢查。這是既有資料的探索性轉移檢查，不取代 P8 登記結果或前瞻驗證。完整來源對帳、四種控制與誤差比較見[證據](../quality/evidence/ai-surrogate-transfer-2026-10-19/README.md)；未取得能可靠預測獨立種子 VP 改善的優勝指標。
- [ ] P9 適當評分規則與多重比較校正。驗證腳本加入 Poisson deviance、Brier score 與校準檢查，取代「R² 或 MAE」並用的門檻；以 Holm 與 BH 重判 P7 的 27 格，並以同種子內置換取代單一隨機特徵負對照。重判只改變判定的嚴格程度，不新增假設。[同目標工具](../ai/objective-metrics.md) 已在另一批歷史資料實作 Bernoulli Brier、log loss 與校準，未涵蓋這裡的損失計數、Poisson deviance、27 格重判及置換，P9 保持開放。
- [ ] P10 決策閘門阻擋統計。查詢來源與首選／派送身份已有 QUERY_ONLY 觀測及開關等價核對；接著補足策略內的候選評分與條件，缺口見 `bot-decision-gate-observability`。逐單位驗證不改行動及 hash 後，再統計全部候選被拒絕或降評的條件與第一個條件，對照局勢指標惡化的回合，定位可調整的決策；解除單一條件仍須以接續測試驗證。

## 3. 規則

- 指標的定義、結果與結論只寫在 [局勢指標](../ai/policy-errors.md#局勢指標)；本文件只勾選步驟並連到證據。
- 每次記錄與驗證的輸入、指令、數量、區間與限制保存於 `docs/quality/evidence/<run>/`；原始資料放在被忽略的 `artifacts/`。
- 步驟只有在對應證據存在時才勾選；描述性分析不能勾選驗證步驟。
- 局部接續與近期預測不代表策略改善；策略升級仍依 [升級流程](../ai/evaluation.md#標準策略的升級流程)。
- 新增對局前先做檢定力分析，依目標效果量與既有資料的變異決定場數並寫入登記。

## 4. 待決

- 指標通過驗證後當 reward 的形式：各指標分別判斷（不加權）或擬合單一價值函數。依 [VP 指標研究的決策](../ai/vp-metrics.md#決策)，目前不組加權總分。
