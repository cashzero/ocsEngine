# M11-Air：Air Power work breakdown（OCS 14.0–15.0）

狀態：**IN PROGRESS**（見 §6）。本文件是計畫，不是完成宣告；實作紀錄與未完成項目見 [air-power.md](../rule-engine/air-power.md)。

## 0. 目標與邊界

目標：在產生劇本的 New Game → Game End 流程中，雙方可使用真實 OCS 空軍——機場、Active／Inactive、
Refit、各種任務、空戰、攔截、防空、空中砲擊、Trainbusting、空運與空降——並完成整局對戰。

不在本計畫內（各自保留 manifest `DEFERRED`）：

- 18.0 海軍、18.2 航艦、18.3 反艦砲擊、魚雷轟炸機（18.3e）。產生劇本沒有艦艇；反艦相關條文明確排除。
- 13.3 鐵路與 Rail Cap：Trainbusting 對鐵路的效果（14.8c 第二點）無作用對象，需在 manifest `GAP:` 註明。
- 13.8 工兵建設：15.3 建造／升級機場依賴 13.8d。2026-10-03 依使用者要求只做 13.8d 的機場建造（Engineer-Capable 單位 2 Leg MP 內建造），架橋、刺蝟陣地、下車格（13.8a-c）仍未實作（見 D4）。

## 1. 來源與條文清單

### 1.1 系列規則（`docs/rules/ocs-series-rules-v4.3.md`）

| 條文 | 內容 | 本計畫切片 |
|---|---|---|
| 2.2／2.3 | Aircraft Refit Phase；Movement／Reaction／Exploitation 的移動段與砲擊段可出任務；Clean Up 移除敵方 Trainbusting | A2、A3 |
| 3.5、14.1 | 五種機型（F／T／S／Tpt／Combo）、兩 step、Active／Inactive、Strat Bomber 限制（14.1e） | A1 |
| IV-E | 飛機開局皆 Active | A7 |
| 4.5a-H、4.5b | 機場位於未抵銷敵 ZOC 不可 Refit；抵銷範例 | A2 |
| 4.7、4.7d | 運輸當量（Leg MA 1–6 減半）、一相位一種運輸、空運前後半 MA | A5 |
| 4.8e、4.8c | 空中單位堆疊顯示（Active 在上、Fighter 為最上層空中單位）；任務機可進入任何敵格 | A1、A8 |
| 4.9a／c／d | 敵方可見最上層 Active 飛機；砲擊揭露總戰力與 Flak；空戰揭露全部參與機 | A8 |
| 7.0a／c、11.0a／d | Reaction／Exploitation 中可用的空中單位與空運例外 | A3、A5 |
| 9.14f | 機場被佔領：Air Base Capture Table、2× 航程內轉場並 Inactive，否則消滅 | A2 |
| 10.0、10.0a–e、10.2 | 砲擊通則、Barrage vs Facility、混合目標宣告、每格每相位一次（被 Flak／攔截打掉仍計數）、空中砲擊無補給成本、短程右移 | A4 |
| 12.6h、12.9c | 計畫空降單位當回合免追蹤補給；Refit 需地圖上補給（draw／throw） | A2、A5 |
| 13.5f、13.6、13.6a | 空中補充（系列規則：無補充表時以 Eq 重建，1 Eq 兩 step）；增援飛機以 Active 抵達任一友方機場且須符合堆疊 | A2；13.5f 隨 13.5 切片 |
| 13.9-4 | 兩架同型、同值、同狀態的減損飛機可合併 | A2 |
| 14.2a–f | 任務堆疊上限 4、機場 Active 上限 4＋Level、航程不需路徑、每相位一任務、任務序列 A–G | A3 |
| 14.3 | 空戰：括號評等、攻守身分、自願中止、逐回合選機、2d6＋差值、損失骰 5–6 | A3 |
| 14.4 | Flak：哪些任務擲、Patrol Zone（機場 10 格）、修正、11 以上損 1 step、Mission Loss Table、貨物損失 | A3 |
| 14.5 | 攔截：只對須擲 Flak 的任務、目標在 PZ、單一 Active Fighter、每任務一次、勝者保持 Active | A3 |
| 14.6 | Fighter Sweep（移動段） | A3 |
| 14.7、14.7a–d | 空中砲擊、不可與砲兵／艦砲合併、短程右移、Hip Shoot（單機、須觀測者、不計入每格限制、限遊戲指定國籍） | A4 |
| 14.8 | Trainbusting：Facility 表 `*`、TZ（本格＋相鄰 6 格，Leg 只限本格）、地面移動 +1 MP、不影響撤退與補給路徑 | A4 |
| 14.9 | 空運：容量合併、1/2T 規則、貨物種類（Move Mode 且 Leg MA ≤10）、半 MA、2× 航程／正常／半航程倍載、卸載上限 2T×Level | A5 |
| 14.10 | 空降：Para／滑翔機資格、Drop Plan（兩回合前、Refit Phase 擬定、延後／取消）、Air Transport Success Table、滑翔機 | A5 |
| 14.11 | 轉場：2× 航程，Fighter 在正常航程內保持 Active | A3 |
| 15.0–15.4 | 機場 Level 效果、最低 Level 1、免追蹤補給、Refit（每基地每相位一次、1T、2×Level 架）、Air Strip、建造、拆除 | A2 |
| 17.0d | 系列規則：天候不禁止 Refit | A2 |
| 21.4、21.5、21.12 | 選用規則：Long Range Air、Re-Basing Limits、XYZ 空運與空運 DRM | A9（預設關閉） |

### 1.2 OCS v4.3 圖表（Beyond the Rhine VASSAL 模組 1.27.0，`E:\work\Beyond the Rhine_1_27_0\images`）

| 圖檔 | SHA-256 | 需轉錄的表 |
|---|---|---|
| `v4.3 Charts (final)-1 1000.png`（模組 Chart「Air」） | `c12961fdf2eb4c9eb5bf750d81300cd727abe2dc04deccebe59eb89a31c35822` | Air Combat Table（≤6 攻方中止／7 雙方中止／≥8 守方中止；損失骰 5–6）、Air Transport Success Table（Friendly／Enemy × Clear／Closed、DRM）、Air Base Capture Table（≤6 step loss；Active +2、推進佔領 +2）、Flak 修正（≥3 架 +1、HQ +1、機場 Level、地圖 Flak／艦 Flak、PZ 內有 Fighter +1／無 Fighter +2、Trainbusting +1）、Mission Loss Table（2／3／4 架 × 1d6，`W`／`S`） |
| `v4.3 Charts (final)-4 1000.png`（已轉錄 Barrage Table） | `69b711ebb28640f9c2262677c8a7595b75765e7b130ec7dfc1b61818abbd94c9` | Barrage vs Facility Table（8 欄 × 1d6；`-`、`*`、`1`、`2`、`(#)`）；Barrage Table 的「全部飛機在 10 格內右 1」與「21.4 超過半航程左 1」兩列 |

### 1.3 Beyond the Rhine 遊戲專屬資料（同一模組）——暫不採用

**使用者決定（2026-10-01）：BTR 專屬空軍規則暫不加入。** 本計畫只實作 OCS 4.3 系列規則；下表僅保留來源紀錄，供日後重新啟用。BTR 的資料（飛機 counter 數值、機型）仍是 OOB 語料來源，那是資料，不是規則。

| 圖檔 | SHA-256 | 與空軍有關的內容 |
|---|---|---|
| `BTR Weather Table.jpg`（已用於地表狀態） | `3ba45897450e339c22557e526890e14288d540fe81f65d9db0db2373259ed52f` | Flight Conditions 2d6：None／Limited／Normal（依日期列）。Limited：只有該玩家「Regular Movement Phase」可出任務、不可 Hip Shoot、Interdiction 暫停（3.7b）。None：不可出任務，但可 Refit 與空中增援抵達。Mud／Snow：機場 Refit 減半 |
| `BTR TEC.jpg` | `70ca1a8564a6527db668fd5c347d423ec81384d45a7a7628162286b1b513a770` | 註 \*\*：Normal Flight 時 Axis 走道路／Autobahn 的成本提高為 1 MP，除非 Interdiction 暫停（3.7b） |
| `BTR Allied Repl.jpg` | `8beb042827bd3fdf9bf8090bc4732def4d8f6aa311aeac0303ab77e6a4e2a23a` | 美軍／大英國協 Ftr、Other 空中補充；Eq 不可重建飛機；必須立即使用 |
| `BTR Axis Repl, RR & Sea Caps.jpg` | `833abc44cacdf9ddafaccf974f493afb782bb4be73f5ea1280154a6fada46ee7` | 德軍 Ftr、Jet 空中補充；Ju 52、Ju 88 不可重建；LR（Luftflotte Reich 戰機釋出，規則 2.2） |
| `BTR Rebuild Table 2.jpg` | `dc025e692df0b72571b2122249e0543b58c0c1e6e3ab479fe3353a278b144000` | Air step：依 Repl Table |
| `Interdict.png` 等標記 | `ecad127d389ecd401991fd80d332317d517b12b258649f907ef557ff6e6fb515` | BTR 的 Interdiction 區域標記與全域「Interdiction／暫停」標記；飛機另有「Interdiction」版本（白色 X） |

`buildFile.xml` 有 47 個飛機 PieceSlot（原型 `AAir`／`XAir`；指令為 Mark Inactive、Step Loss、Send to Dead Pile、
Place Interdiction）、一個可切換 Level 1–3 與國籍的 `Airbase`，以及雙方的 Trainbusting 與 Interdiction 標記。
與本專案 OOB 相關的機型：

- 美軍：P-38、P-47、P-51、A-20、A-26、B-26、C-47、C-47＋Gldr，以及 P-47／P-51／A-20／A-26／B-26 的 Interdiction 版本
- 德軍：Bf 109（4-1、5-1、Luftflotte）、Fw 190a／d／f、Me 262、He 162、Ar 234、Me 163、Go 229、Ju 52、Ju 88

counter 格式：左上機型徽章、右上機名、黃底數字為航程；左下為 Air Combat Rating（括號表示不能主動空戰），
右下為 Barrage Strength，運輸機另有容量（1T；C-47＋Gldr 為 2T）。

範例（全額／減損）：P-47 5-8／4-4，航程 114；Bf 109 4-1／3-0，航程 76；Ju 52 (0)-0、1T，航程 62。

### 1.4 不加入 BTR 專屬規則的影響（TODO／技術債）

依使用者決定，下列行為不實作。每項都是 TODO，重新啟用時需先取得 BTR 規則書空軍條文並轉錄到 `docs/rules/`（新檔）。

| 項目 | 系列規則下的行為 | 玩家可見影響 | 重新啟用的關閉證據 |
|---|---|---|---|
| Flight Conditions（BTR 天候表 2d6、None／Limited 的任務限制） | 不擲；每回合都可在 14.1g 的所有相位出任務 | 天候永遠不限制空中任務 | Flight 擲骰與各狀態限制的條文測試；瀏覽器操作 None／Limited 回合 |
| Mud／Snow 時機場 Refit 減半 | 依 17.0d 與 15.1，Refit 不受天候影響 | 壞天氣下 Refit 量偏多 | 減半與捨入的條文測試 |
| 3.7b Interdiction（Normal Flight 時 Axis 道路／Autobahn 成本升為 1 MP、Interdict 標記、Interdiction 版飛機） | 不存在；道路成本照 TEC | 德軍道路機動不受盟軍空優影響 | 條文測試，並在 UI 中觀察移動成本變化 |
| Hip Shoot 國籍（14.7d-B 由遊戲規則指定） | 沒有任何國籍具備此能力；引擎依能力旗標實作並以合成 fixture 測試 | 產品中無法進行 Hip Shoot | 國籍清單確認後，以產生劇本在瀏覽器中實際完成 Hip Shoot |
| BTR 空中補充表（Ftr／Other／Jet；Eq 不可用；Ju 52／Ju 88 不可重建） | 若之後實作 13.5，採系列規則 13.5f（Eq 重建） | 補充來源與 BTR 不同 | BTR 補充表轉錄與條文測試 |
| Luftflotte Reich（2.2）、噴射機與 Me 163／Go 229 的特殊規則 | 產生器不使用依賴這些規則的 counter（見 A7） | 這些機型不會出現在產生劇本 | 規則轉錄後，納入產生器語料並審查 |

## 2. 與現有程式的接點

| 現有位置 | 現況 | 需要的改變 |
|---|---|---|
| `src/domain/piece/definition/model.ts` | 已有 `AIR`、`FACILITY` family 與 `facility` profile；`CounterDefinition` 只涵蓋地面 | 新增 aircraft profile：機型、ACR 是否加括號、砲擊力、航程、運輸容量、內建滑翔機、國籍能力（Hip Shoot）；新增 air base facility profile（Level、Air Strip） |
| `src/rules/kernel/model.ts` `GameState` | 沒有空中狀態；`AIRCRAFT_REFIT` phase 已存在但永遠是空的 | `air`：每架飛機的所在機場、Active、本相位已出任務、攔截可用；`airBases`：Level、本相位已 Refit、本移動段已卸載量、本相位已拆除；`trainbusting` 標記（擁有者、放置回合）；`dropPlans`；`weather.flight` |
| `src/rules/sequence/sequence.ts` | 沒有合法選擇時自動通過 | Refit Phase 有 Inactive 飛機和可用機場時停下；Movement Phase 的 BARRAGE 段在有可用 Active 飛機時停下 |
| `src/rules/combat/combat.ts` 砲擊 | 只有砲兵；Movement Phase 的砲擊被拒絕 | 新增 `AIR` 砲擊來源：無補給成本、短程右移、Strat Bomber 視為無觀測者、`[1/2]`→DG、最多 4 架、Hip Shoot、Facility 表、目標類別宣告 |
| `src/rules/tables/ocs-4.3.ts` | 戰鬥、砲擊、損耗、擄獲表 | 加入 1.2 列出的六張表，含來源雜湊 |
| `src/rules/terrain.ts`、`movement.ts` | TEC、道路、天候 | 地面移動 TZ +1 MP（Leg 只限標記所在格） |
| `src/rules/supply/supply.ts` | draw／throw 付款 | Refit 每基地 1T，沿用 draw／throw（12.9c），不可用內部存量 |
| `src/rules/zoc/zoc.ts` | 抵銷規則 | Refit 的 ZOC 檢查與抵銷 |
| `src/rules/query/projection.ts` | 4.9 地面可見性 | 空中單位可見性（4.9a）、空戰與砲擊時揭露（4.9c／d） |
| `src/generation/oob/*`、`src/game-flow/deployment.ts`、`composer.ts` | 只有地面與後勤 | 每方的空中單位與機場；New Game 的空軍選項；部署時的機場位置 |
| `src/rules/manifest.ts` | `air-power` 為 DEFERRED；`weather` 不擲 Flight | 拆成 `air.*` 多列，每列標明 `IMPLEMENTED`／`PARTIAL` 並附 `GAP:`；`weather` 的 `GAP:` 註明 Flight Conditions 依使用者決定不擲（1.4） |
| 存檔 0.2.0 | 規則狀態有版本 | 升為 0.3.0；沒有空軍的 0.2.0 存檔可遷移（補空的空中狀態），並以重播雜湊證明與舊版一致 |

## 3. 工作分解

每一步都要先有文件或測試計畫，再寫程式。每一列在「關閉證據」出現前都是 TODO。

### A0 來源與資料（無規則程式）

| 步驟 | 產出 | 關閉證據 |
|---|---|---|
| A0.1 | 在 `docs/rules/ocs-4.3-charts.md` 新增空軍表轉錄節（雜湊、逐格、規則書範例交叉檢查） | 14.3 範例（LaGG-3 對 Bf 109f）、14.9 Stuka 兩個目標、14.11 Blenheim 範例都以轉錄表重算吻合 |
| A0.2 | `docs/oob/M11-air-counter-corpus.md`：美、德機型正反面數值與圖檔雜湊 | 每張 counter 兩人覆核（作者轉錄＋使用者抽查）；模組版本與雜湊測試 |

### A1 資料模型與序列化

- 定義：aircraft 與 air base profile，以及 Definition 驗證（例如 Transport 必須有容量、Fighter 不得加括號……）。
- 狀態：見第 2 節。不變量包括：
  - 飛機只能在友方機場或任務格
  - 每機場的 Active 數 ≤ 4＋Level（Air Strip 為 4）
  - 一格最多一座機場
  - 機場 Level 介於 1–3
- 快照解碼與 schema 遷移（0.2.0→0.3.0）。
- 關閉證據：
  - 定義、狀態、快照的正反測試
  - 0.2.0 fixture 存檔遷移後重播雜湊不變

### A2 機場、天候與 Refit

- Aircraft Refit Phase：
  - 每機場每相位一次，費用 1T 走 draw／throw
  - 可 Refit 架數為 2×Level，Air Strip 為 1；天候不影響（17.0d）
  - 未抵銷的敵 ZOC 內不可 Refit
  - 由玩家選擇要 Refit 哪些飛機
- 增援飛機以 Active 抵達友方機場，須符合堆疊上限（13.6）。
- 9.14f 機場被佔領：Air Base Capture Table 依序擲骰、2× 航程內轉場由玩家選擇並轉為 Inactive，否則消滅；推進佔領時 +2。
- 15.4 拆除：1 RE 未移動的 Combat Mode 單位，每相位一次，Level 不低於 1。
- 13.9-4 減損飛機合併。
- 15.3 建造與 15.2 Air Strip：依賴 13.8d（D4）。2026-10-03 已實作（Air Strip 1T、升級 3T、新建 Level 1 4T、每回合 +1 Level 4T、最高 Level 3）；產生劇本允許 Air Strip（使用者決定）。
- 關閉證據：每條文一組正反測試，並在瀏覽器中實際操作 Refit。

### A3 任務交易框架、空戰、攔截、Flak

- 新的交易種類 `AIR_MISSION`。步驟依 14.2f：
  DECLARE → MOVE（每架記錄出發機場、檢查航程）→ AIR_COMBAT → INTERCEPTION → FLAK → RESOLVE → RETURN。
- 每架飛機每相位只能出一個任務；每次任務最多 4 架，可來自不同機場。
- 合法相位：
  - Movement 段：Sweep、Hip Shoot、空運、空降、轉場
  - Barrage 段：砲擊、Trainbusting
- Patrol Zone：有 Active Fighter 的機場周圍 10 格。
- 空戰：
  - 雙方先決定自願中止（至少留 1 架）
  - 每回合攻方先選一架非括號評等的飛機，守方再選任一架
  - 2d6＋差值查表，接著擲損失骰
  - 若攻方只剩括號評等的飛機，攻守身分互換；雙方都只剩括號評等時，互相忽略
- 攔截：
  - 只能攔截須擲 Flak 的任務，且目標在 PZ 內
  - 每次任務最多一次，派一架 Fighter
  - 攔截者獲勝時保持 Active，且可再次攔截
- Flak：依修正擲 2d6，結果 11 以上損 1 step；以 Mission Loss Table 決定受損飛機（`W`／`S` 同值時由擁有者選擇）；空運需重算貨物容量。
- 返航：每架由擁有者選擇航程內的友方機場；在友方機場上空中止的飛機必須回同一座。
- 最先實作的兩種任務：Fighter Sweep 與 Base Transfer（2× 航程；Fighter 在正常航程內保持 Active）。
- 關閉證據：14.3 範例、各種 Flak 修正組合、攔截勝負、Mission Loss 各列的條文測試；`rules-conformance-probe.mjs` 新增空軍探針。

### A4 空中砲擊、Hip Shoot、Facility、Trainbusting

- 10.0d 目標類別宣告：作戰單位、機場、Trainbusting。
- 一般 Barrage Table：
  - 空中來源，不可與砲兵混合
  - 無補給成本
  - 所有飛機都在出發機場 10 格內時右 1；Strat Bomber 永遠沒有此加成
  - Strat Bomber 一律視為無觀測者
  - `[1/2]` 結果視為 DG
  - 被 Flak 或攔截全數擊落的任務，仍計入每格每相位一次的限制
- Hip Shoot：單架、Movement 段、需要觀測者、不計入每格限制、限具備國籍能力者，Strat Bomber 禁止。
  依 1.4，產生劇本沒有任何國籍具備此能力；規則以合成 fixture 測試，產品中不可達（TODO）。
- Facility 表：
  - 對機場，`(#)` 時逐架飛機檢查損失；數字結果降低 Level，最低 1
  - 對 Trainbusting，`*` 時放置標記，每格只能一個；擲 Flak 時 +1
- TZ：
  - 地面移動每進入一格 +1 MP；Leg 只計算標記所在格
  - 不影響撤退與補給路徑
  - 標記在下一個敵方 Clean Up 移除（2.3）
- 關閉證據：14.9 兩個 Stuka 目標、14.11 範例重算；TZ 移動成本測試；在瀏覽器實際對敵方完成一次砲擊與一次 Trainbusting。

### A5 空運、空降、滑翔機

- 貨物：SP 與 Move Mode 且 Leg MA ≤10 的作戰單位；不可運 Transport Point（13.2e）。
- 容量：同機場的容量可合併；1/2T 規則；14.9e 三種航程與容量選項；卸載上限 2T×Level，超出的運輸機轉為 Inactive 即可卸載；內建滑翔機不受卸載上限限制（14.10f）。
- 地面規則：空運前後合計半 MA；Reaction 的 MA 再減半；一相位只能用一種運輸（4.7d）；空降當相位不可花 MP。
- 空降：
  - 只有 Para 或滑翔機單位可空降
  - 作戰單位需 Drop Plan：兩回合前於 Refit Phase 擬定，可延後或取消，每個單位同時只能在一份計畫中
  - 補給空降不需計畫
  - Air Transport Success Table 逐單位或逐 1T 擲骰；降落在敵作戰單位上即毀
  - 計畫空降的單位當回合免追蹤補給（12.6h）
- 獨立 Glider Point 只在遊戲有提供時存在，產生劇本不提供。C-47＋Gldr 依 14.10f 視為內建滑翔機（2T、不受卸載上限限制）；
  14.10f 的 Case Blue 註記（不可空降）只適用於該遊戲，因此依系列規則可執行空運與空降。
- 關閉證據：每個子條文的測試；在瀏覽器實際完成一次 SP 空運與一次計畫空降。

### A6 BTR 遊戲專屬空軍規則——暫緩（使用者 2026-10-01 決定）

不在本計畫範圍。缺少的行為、影響與重新啟用的關閉證據見 1.4。manifest 以 `GAP:` 記錄。

### A7 產生劇本整合

- OOB：每方依規模產生空軍編組（Fighter／Tactical／Transport 比例由 BTR 語料統計，記錄在 M7 方式的報告）與機場 counter（Level 1–3）。
  語料排除用途依賴 BTR 專屬規則的 counter：Interdiction 版飛機、Luftflotte 版 Bf 109／Fw 190a，以及 A0.2 審查時發現有特殊規則註記的機型（例如 Me 163、Go 229）。排除清單記錄在 A0.2 報告。
- 部署：
  - 機場位於友方後方可進入的格子，不得與敵相鄰，且每格最多一座
  - 飛機開局全部 Active（IV-E），並符合基地 Active 上限
- New Game：空軍開關、規模、選用規則（21.4／21.5／21.12，預設關閉）。種子維持正交：空軍內容由 OOB 種子決定，位置由 deployment 種子決定。
- 預覽：顯示雙方飛機與機場，與開局後的狀態一致。
- 關閉證據：
  - seed sweep 報告（可重現、無非法堆疊、每方至少一座可用機場）
  - 同一份套件從預覽到開局保持一致

### A8 UI

- 機場 counter：Level、國籍；Active 飛機顯示在機場之上、Inactive 在之下（14.1a）；被選取機場的空中單位清單。
- 疊加圖層：PZ（10 格）、航程（每架飛機）、TZ、Interdict 區域。
- 任務流程：
  - 選任務類型 → 選飛機（最多 4 架，依機場分組）→ 選目標格
  - 預覽顯示：Flak 修正、是否在 PZ、可能攔截、砲擊欄位與移欄、空運容量與卸載上限
  - 確認後執行
- 決策：
  - 自願中止
  - 空戰每回合雙方選機（守方要在看到攻方選擇後才選）
  - 非相位玩家是否攔截
  - `W`／`S` 同值時選擇受損機
  - 返航機場
  - 機場被佔領後的轉場位置
  - Refit 選機
  - Drop Plan 的擬定、延後、取消
- 熱座隱私：空戰與攔截需要交接（D3）；空戰時依 4.9d 公開參與的飛機，其餘仍依 4.9a 只顯示最上層。
- 鍵盤操作與焦點管理比照 UI-05。
- 關閉證據：1920×1080 與 1680×1050 的截圖與操作紀錄、最小文字 13 px、互動延遲符合預算。

### A9 驗證與 Gate

- 規則：`tests/rules/ocs-air.test.ts` 以條文為單位；規則書範例逐一重算；探針擴充；選用規則開與關各一組基準。
- 整合：產生含空軍的劇本，以 headless 打到 Game End，並比對重播雜湊。
- 產品：在 `03-product-operation-verification-plan.md` 增列 AIR 列（下方為提案，加入前需使用者同意）。

| 提案 ID | 操作 | 必要可見結果 |
|---|---|---|
| AIR-01 | 預覽與開局檢視雙方飛機、機場 | 數值、Active 狀態、Level 與預覽一致 |
| AIR-02 | Refit Phase 付 1T Refit | 費用、架數上限、ZOC 限制可見，Inactive 轉 Active |
| AIR-03 | Fighter Sweep 打敵方機場 | 空戰逐回合選機、結果、返航與 Inactive |
| AIR-04 | 在敵方 PZ 內進行空中砲擊並觸發攔截 | 交接後由守方決定攔截；Flak、Mission Loss、砲擊結果、每格一次限制 |
| AIR-05 | Trainbusting | TZ 讓地面移動成本改變；Hip Shoot 依 1.4 在產品中不可達，記為 BLOCKED 而非 PASS |
| AIR-06 | 空運 SP 與單位、計畫空降 | 容量、卸載上限、半 MA、Success Table 結果 |
| AIR-07 | 地面部隊佔領機場 | Capture Table、轉場選擇、Inactive |
| AIR-08 | 同一相位對同一格第二次砲擊、同一架飛機第二個任務 | 不可選並說明原因（10.0e、14.2e） |
| AIR-09 | 含空軍的整個回合，以及打到 Game End | 無死路、console 0 錯誤、存檔重播一致 |

## 4. 建議順序

```text
A0.1/A0.2 ─ A1 ─ A2 ─ A3 ─ A4 ─┬─ A7 ─ A8 ─ A9
                                └─ A5 ─┘
（A6 暫緩）
```

最小可玩切片是 A0.1–A0.2 → A1 → A2 → A3（Sweep、轉場）→ A4（砲擊）→ A7 → A8。
完成後可以在產生劇本中出現「Refit → 掃蕩 → 攔截 → 空中砲擊」的完整循環。
這只是排序建議，**不是縮小驗收範圍**：A5 未完成前，manifest 的 `air.*` 維持 `PARTIAL` 並列出 `GAP:`，
M11-Air 不得標為完成。

## 5. 待使用者決定

| ID | 問題 | 建議 |
|---|---|---|
| D1 | BTR 專屬空軍規則是否加入？ | **已決定（2026-10-01）：暫不加入。** 影響見 1.4 |
| D2 | 產生地圖可設定為 8×8 到 64×48（預設與驗收案例 NG-06／NG-07 為 18×12）。BTR 飛機航程多為 60–229 格：18×12 時航程、PZ（10 格）與短程加成幾乎涵蓋全圖；64×48 時對角距離約 80 格，短航程機型（例如 Ju 52 62 格、Bf 109 76 格）才會受限，PZ 與 10 格短程加成也才有取捨 | 保持印刷數值，不修改規則。A7 的 seed sweep 須涵蓋小、中、最大三種地圖，報告航程、PZ 與短程加成實際受限的比例；驗收提案 AIR-03／AIR-04 至少一次在大地圖（例如 48×36 以上）執行 |
| D3 | 空戰每回合雙方輪流選機，熱座下每回合都要交接 | 照規則逐回合交接，並記錄交接次數與延遲；不提供「預設選擇」捷徑，因為那會改變規則 |
| D4 | 機場建造與 Air Strip（15.2、15.3）依賴工兵 13.8 | 2026-10-03 依使用者要求只做 13.8d 機場建造；產生劇本仍給定起始機場，Air Strip 允許 |
| D5 | 空中補充依賴 13.5 | 2026-10-03 採系列規則 13.5f（Eq 重建），Eq 來源依使用者選擇為每回合固定配給（Compact／Standard 1、Large 2），不是 BTR 補充表；2026-10-04 地面單位補充（13.5a-e）實作，Pax／Eq 內建於每一局並移除 Air support 選項（`docs/rule-engine/replacements.md`） |
| D6 | 是否把 AIR-01～09 加入驗收計畫 03 | 已加入（AIR-01～09）；2026-10-03 依使用者「完成後把全部的驗收做完」加入 AIR-10～15 |
| D7 | `docs/roadmap.md` 把 Air 排在 M11（AI Bot M9、Self-play M10 之後），而 M8／U10 仍為 IN PROGRESS | 提前開工需要使用者確認改變順序；建議至少讓 A0 與 A1（來源與資料模型）先行，因為它們會影響存檔格式與 legal action API |

## 6. 狀態

| 步驟 | 狀態 |
|---|---|
| A0 來源與資料 | DONE（使用者抽查 counter 尚未進行） |
| A1 資料模型與序列化 | DONE |
| A2 機場、Refit | DONE |
| A3 任務、空戰、攔截、Flak | DONE（Mission Loss 的 W／S 選擇未在瀏覽器看到，AIR-04） |
| A4 空中砲擊、Facility、Trainbusting | DONE；Hip Shoot 在生成遊戲不可達（AIR-05 BLOCKED） |
| A5 空運、空降、滑翔機 | DONE，Glider Points 除外（TODO `glider-points`） |
| A6 BTR 專屬空軍規則 | 暫緩（使用者決定） |
| A7 產生劇本整合 | DONE |
| A8 UI | DONE |
| A9 驗證 | 驗收列 AIR-01～15 的狀態以 `docs/quality/03-product-operation-verification-plan.md` 第 F 節為準 |

現況見 `docs/rule-engine/air-power.md`；manifest 的 `air.*` 為 `PARTIAL`，缺口在其 `GAP:`。
