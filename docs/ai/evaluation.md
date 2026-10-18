# AI 對戰評估

## 範圍

如何量測電腦策略的正確性與強度、新策略如何成為標準，以及目前的量測結果。策略內容見
[heuristic-policy.md](heuristic-policy.md)。這些都是 headless 對局證據，不改變
`docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。

## 現行行為

電腦策略先修錯再談強：[錯誤清單](policy-errors.md)列出標準策略看起來不正確的決策，逐項用局面接續測試量修正的影響。目前也優先進行 [VP 改善的預測指標研究](vp-metrics.md)，先實驗哪些指標能預測新種子與新策略變體的 VP 增益，再據此選擇策略改善方向。已有首輪歷史資料探索，尚無前瞻驗證結論；研究不改變下列策略升級條件。

歷史場景的空軍範圍不能只依 CLI 參數認定。[指標研究盤點](../quality/evidence/ai-vp-metrics-inventory-2026-10-18/README.md)的 `v79-baseline-wide`、`v80g-wide`、`v80j-wide`、`v80q-wide` 共 80 份攻擊戰存檔，即使 options 為 `air=NONE`、`airTransport=NONE`，仍有場外飛機與實際 `DECLARE_AIR_MISSION`。這些批次的「無空軍」描述不成立，只能作含場外空軍的歷史探索資料。其他批次的實際組成尚待稽核，不能由參數推定。缺口見 `historical-ai-air-scope`。

### 工具（皆需先 `npm run build`）

| 腳本 | 用途 |
|---|---|
| `scripts/ai-match.mjs` | 完整對局：地圖風格、交戰型態、尺寸、Rail Cap、海域等選項；`--swap` 同種子交換陣營；`--trace` 決策紀錄；`--allied heuristic@<dist 目錄>` 讓凍結的另一份建置對戰；每局存檔並以重播比對終局 hash，失敗時 exit code 1 |
| `scripts/ai-compare.mjs` | 對戰彙總：勝負和與符號檢定、平均 VP 與 VP 差的標準誤、Kill、Loss |
| `scripts/ai-acceptance.mjs` | WBS B5 驗收指標（對 random-legal 與電腦互打） |
| `scripts/ai-replay-study.mjs` | 重播：目標點換手方式、step 損失原因、斷補單位、攻擊結果 |
| `scripts/ai-supply-study.mjs` | 重播：每次 attrition 的最後 trace／口糧觸發、移動預判與實際執行的比對 |
| `scripts/ai-vp-study.mjs` | 重播：找出保留補給且當下 VP 較高的替代移動（待查的候選，不是已證明的失誤） |
| `scripts/ai-oos-census.mjs`、`ai-logistics-study.mjs`、`ai-fuel-study.mjs`、`ai-truck-trips.mjs`、`ai-garrison-supply-study.mjs`、`ai-air-count.mjs` | 斷補、鐵路與卡車使用、攻方送補與加油、每輛卡車每回合趟數、駐軍送補、空軍任務數的統計 |
| `scripts/ai-objective-flow-study.mjs` | VP 從哪裡來：目標點以走進空格或戰鬥決定取得與失去、攻擊目標點的欄位與結果（攻擊戰攻方、遭遇戰雙方） |
| `scripts/ai-error-census.mjs` | 錯誤清單的普查（[錯誤清單](policy-errors.md)）：各方每局有好賠率卻不攻的 Combat Segment、攻擊欄位分布與第 10 欄以上的攻擊、戰後不前進與前進、整局沒移動的戰鬥單位 |
| `scripts/ai-attack-allocation-study.mjs` | 錯誤清單 E4：高賠率攻擊中可抽出而仍維持第 9 欄的單位，與它們旁邊是否有其他未被攻擊的敵格；低賠率攻擊目標點時旁邊閒置的己方單位 |
| `scripts/ai-find-branches.mjs` | 從 trace 找分岔點：某一方在某個 segment 做了要研究的決策（例如攻擊戰守方的主攻任務），輸出該 segment 第一個行動的 index |
| `scripts/ai-continue.mjs` | 局面接續：從存檔的分岔點重設 Rules RNG，各策略變體在同一組骰子種子下對固定對手接著下，記錄 +h 回合與終局的局面指標與事件 |
| `scripts/ai-position-metrics.mjs` | 局面指標（模組）：VP、目標點持有／有人守／受威脅、單位與 step、DG、接敵、離敵距離、斷補、SP（地圖上、前線取用得到、取用不到）、乾 HQ；事件：step 損失、SP 支出、攻擊、砲擊 |
| `scripts/ai-continue-compare.py` | 比較接續結果：每個指標的成對差（同一分岔點的骰子先平均）、t 值，以及早期差與終局 VP 差的相關 |
| `scripts/ai-role-margin.mjs` | 把候選策略在攻擊戰的攻方與守方效果分開：與對手策略自我對戰的同種子基準比較每局攻方 margin |
| `scripts/ai-concentration-study.mjs` | 攻方兵力集中：戰力離敵距離與任務分佈、可攻擊格與宣告攻擊的 Combat Table 欄位、主攻群貼近目標的戰力、砲兵模式與砲擊（需 `--trace`） |
| `scripts/ai-vp-metrics-extract.mjs`、`scripts/ai-vp-metrics-compare.py` | 固定回合的目標控制與戰術指標重播、同角色自戰差分、留出種子與策略變體的探索比較；首輪 manifest、重現方式與限制見 [VP 指標研究](vp-metrics.md) |
| `scripts/ai-narrate.mjs` | 一局 trace 的逐步摘要，供人工檢視 |
| `scripts/ai-train.mjs` | 權重自我對戰（已停用，見「決策」） |

原始存檔、trace 與凍結建置留在本機被 git 忽略的 `artifacts/`；舊批次的原始資料已刪除，只留文字紀錄。commit 進 `docs/quality/evidence/` 的只有文字紀錄與個別 run 的小型腳本；可重用工具放在 `scripts/`。`scripts/ai-promotion/freeze.py` 凍結現行標準與候選，`quality.py` 在凍結目錄跑完整檢查；`batch.py` 執行同引擎交換陣營對戰及補給／前進稽核，`verify.py` 核對來源、設定、重播、候選陣營與成對 VP 結果。`register.py` 登記獨立 gate 前，確認新種子沒有出現在任何現存的 `match-*.save.json`，也不在已下過種子的清冊 `artifacts/ai-promotion/played-seeds.tsv`（每行「種子<TAB>資料夾」）裡；刪除存檔騰空間前，先把種子補進這份清冊。

### 正確性要求（每一局）

- 打完全部回合到 `FINISHED`；沒有 `FAILED_ACTION`、`BOT_STALLED`、`BOT_BUDGET_EXCEEDED`、`NO_BOT_FOR_ACTOR`、`FATAL`。
- 存檔重播的終局 state hash 相同。
- 補給稽核（`ai-supply-study.mjs`）：一般移動與切模式不破壞既有 trace 或口糧、可選支出不破壞共同口糧承諾、
  戰後前進與 Overrun 的預判與實際 reducer 一致。違例數必須為 0。

### 標準策略的升級流程

用於「新策略取代標準策略」：

1. **對手**：凍結的現行標準策略；雙方使用候選版本的同一份引擎與產生器。
2. **設定**：32×24、每方 6 師（2 裝甲）、8 回合、地圖上不開空軍（`ai-match.mjs` 必須明確給 `--air NONE --air-transport NONE`；
   不給時產生器預設會產生飛機，v66 的獨立批就是在有飛機的設定下跑的）。攻擊戰的攻方另有場外機場與飛機，與 `--air` 無關
   （產生器的交戰設計，[engagements plan](../quality/evidence/engagements-plan-2026-10-07/README.md) §6）：v82 獨立批的攻擊戰
   每局攻方約 4 次空中任務，不論哪個策略擔任攻方；遭遇戰沒有飛機。成對比較因此仍公平，但攻擊戰不是無空軍的對局；地圖 `TEMPERATE_INLAND` 與 `EASTERN_EUROPE`；
   交戰 `MEETING` 與 `AXIS_ATTACKS`。同種子交換陣營成對。地中海風格已移除，不再使用。
3. **開發批**：已知種子，可多次使用，只用來決定方向。
4. **獨立批**：凍結候選、登記 source／build hash、全新種子、主要量測與不劣化幅度後才開始；固定 **80 場／40 對**
   （使用者把原本 256 場減為 80 場）。兩種交戰都改變時每組地圖 × 交戰 10 對；開發批證明某種交戰未改變（見下）時，80 場全部
   給改變的交戰，每種地圖 20 對（`register.py` 依開發批的 `unchangedEngagements` 分配）。只評估一次，不與開發批或失敗批合併，
   失敗後也不追加場次。
5. **通過條件**（使用者決定，2026-10-18）：量測三項，每項都是候選該局的值減標準策略的值、以交換陣營的一對平均：
   - **VP**：雙方 VP 差。
   - **Kill − Loss**：擊殺減損失的 step。兩方對打時一方的擊殺就是另一方的損失，所以這裡無法把 Kill 與 Loss 分開；要分開
     須與標準策略的自我對戰比較（局面接續或 `ai-role-margin.mjs`）。
   - **Supply**：對方終局斷補的戰鬥單位數減己方的。

   候選在登記時指定一項**主要量測**，並給其他兩項**不劣化幅度**（每對）。主要量測在每一種改變的交戰平均為正，且這些交戰的
   成對 `mean − 2.1 × SE` > 0；其他兩項的 `mean − 2.1 × SE` > −幅度。改善 Kill − Loss 或 Supply 而 VP 不變的候選也可以通過。
   進階指標尚未驗證（[VP 指標研究](vp-metrics.md)），只列在報表中，驗證前不能當主要量測。另須全部局符合正確性要求，
   完整 typecheck、build、測試、smoke 通過。不另外要求每個地圖子組為正，但子組退步要揭露。

   一種交戰的每一對兩局終局 state hash 都相同時，候選在這種交戰下的是標準策略的棋，算作「未改變」：成對差必為 0，不計入
   正負與區間；至少要改變一種交戰（使用者決定，2026-10-17）。在此之前登記的候選沒有主要量測，等同主要量測為 VP、沒有其他門檻。
6. 通過後把策略版本與預設權重設為新標準。

### 攻方運補 gate

改變卡車、鐵路或海運行為的候選，除了升級流程，還要通過這個 gate（使用者決定，登記於實作之前）。它檢查電腦是否把
進攻方的補給送到前線，否則攻方缺補給只是電腦的錯，不能拿來判斷平衡。

- **範圍**：開發批的 `AXIS_ATTACKS` 局，候選擔任進攻方的 Movement Segment，從第 3 回合起；對照組是凍結標準策略在相同種子上的
  自我對戰（同樣 `--swap`），取與候選擔任進攻方相同 match index 的局（理由見[兩個補給 gate 的對照組](#兩個補給-gate-的對照組)）。
  指令：`node scripts/ai-logistics-study.mjs <attack 資料夾…> --baseline <自我對戰資料夾> … --gate <候選 policy>`，任一項失敗時
  exit code 1。
- **鐵路**：該 segment 開始時，若有合法 `RAIL_MOVE` 能把 SP 送到離最近敵方戰鬥單位至少近 3 格、且離敵至少 3 格的車站，
  實際用鐵路運的 SP ÷ min(Rail Cap, 這些 SP) ≥ 70%。
- **後方存量**：segment 結束時離敵 6 格以上、不屬駐軍的 SP，平均值 ≤ 對照組。
- **駐軍存量**：卡車裝載或鐵路運送駐軍存量的次數為 0。

原本還有「卡車載量（裝上卡車的 SP ÷ 卡車總容量）≥ 60%」一項，看過 v78 開發批後由使用者刪除：攻方每個 Movement Segment
平均只收到 9.0 SP，地圖上卡車 15.2 點，即使每個到達的 SP 都由卡車裝一次，載量也只有 59%（鐵路先運走的 SP 本 phase 不能再裝，
12.2a，實際上限 55%），這個門檻量的是收入與卡車數的比例，不是電腦有沒有把補給送出去。載量仍列在報表中。

舊標準 `heuristic@75` 在 v77 開發批（種子 1300200–1300207、1300300–1300307）的攻方：鐵路 100%（48 個 segment 中只有
14 個有可用的前送鐵路）；後方存量 11.2 SP（segment 開始時 12.0 SP）；駐軍存量 0。卡車沒有循環往返，開始時已載貨的卡車回合有
84/130 沒有卸貨（其中 38 次停在原地），入場格的 SP 則逐回合累積（一局中第 6 回合累積到 124T）；每回合開始時可裝的後方 SP
只裝走 23%。

標準 `heuristic@78`（卡車循環運補，[行為](heuristic-policy.md#後勤)）在同一組種子、對凍結 v75 的開發批通過當時的門檻（同批對照組的一半；獨立批也通過：
後方存量 3.0 對 8.8 SP）：鐵路 100%；
後方存量 2.6 SP，同批 v75 為 12.0 SP；駐軍存量 0。可裝的後方 SP 裝走 70%（5.9／8.4 SP），前線 4 格內的 SP 由 2.8 升到 10.5。
[證據](../quality/evidence/ai-logistics-truck-shuttle-development-2026-10-16/README.md)。

### 攻方送補 gate

改變 HQ、卡車、鐵路送補或單位與補給距離的候選，除了升級流程與攻方運補 gate，還要通過這個 gate（使用者決定，
2026-10-16 登記於 heuristic@79 之前）。它檢查進攻方的 SP 有沒有送到前線用得到的地方（OCS 的 rail → HQ → 投送，12.3、13.3）：
SP 在地圖上卻沒有前線單位取用得到，前線缺燃料與口糧只是電腦的錯。

- **範圍**：開發批的 `AXIS_ATTACKS` 局，從第 3 回合起每個進攻方 Movement Segment；對照組與攻方運補 gate 相同（標準策略在相同
  種子上的自我對戰）。指令：`node scripts/ai-fuel-study.mjs <attack 資料夾…> --baseline <自我對戰資料夾> … --gate <候選 policy>`，
  失敗時 exit code 1。
- **前線取用不到的 SP**：segment 結束時，進攻方補給堆（不含駐軍存量）中沒有任何前線單位（離敵方戰鬥單位 4 格內、HQ 以外的戰鬥單位）
  能以直接取用或 HQ 投送（12.3a–b）取得的 SP，每個 segment 的平均值 ≤ 對照組。
- 同一份報表另列（不設門檻）：第一個戰鬥單位行動時（HQ、鐵路、海運之後），未與敵相鄰、需要燃料、未加油且沒有任何合法加油方式的
  單位，以及沒有補給堆能供應的乾 HQ 比例。

#### 兩個補給 gate 的對照組

兩個 gate 原本以同一批中凍結標準策略擔任進攻方的局為對照組、門檻是對照組的一半；2026-10-17 由使用者改為上面的定義。
原本的對照組那些局的守方是候選，所以量到的是候選守方的影響（[證據](../quality/evidence/ai-assault-v82-development-2026-10-17/README.md)）：
v82 的攻方與 v79 逐局相同（終局 hash 一致），仍以後方 SP 5.4 對 1.3、前線取用不到的 SP 1.7 對 0.2 未通過；同一組 v79 攻方對 v79
自己時後方 SP 是 5.4，對 v82 的守方只剩 1.3（「後方」以離敵 6 格計，守方貼近時攻方的補給堆就不算後方）。「減半」也只有改善後勤
的候選才可能達到，後勤與 v79 相同的 v80n 在寬種子上也未通過（1.7 對 1.8）。新定義下 v82 開發批為 5.4 對 5.4、1.7 對 1.7。

原本登記的門檻是 segment 開始時「無法加油的單位數」與「乾 HQ 比例」各減半；看過 v79 開發批後由使用者改為上面的 SP 量測：
segment 開始時量測在 HQ 與鐵路送補之前，而使用者要看的是 SP 有沒有被正確運送，不是單位當下能不能加油。

登記時的量測（`heuristic@78` 對 v79 候選開發版的開發批，種子 1300200–1300207、1300300–1300307）：v78 進攻方前線取用不到的
SP 每 segment 7.4–9.8 SP（地圖上 SP 的 29–36%）。

### 歸因規則

- Attrition 歸因記錄的是「最後一次失去 trace／口糧的觸發行動」，不是唯一原因，也不是意圖的證明。
- 一次 attrition 可能同時有 trace 與口糧觸發，不能把兩個觸發當兩個損失。
- `own-action` 或「由己方發起的戰鬥」不足以證明電腦犯錯：敵方的撤退或 reaction 可能在己方發起的戰鬥中切斷補給。
- 被迫的支出（強制的內部存量恢復）不算可避免的浪費。
- 只比較同一份引擎與產生器上的結果；不能把不同批次、不同基底的增益相加推論。
- 攻擊戰的成對結果混合了兩個角色：候選的攻方面對對手的守方，對手的攻方面對候選的守方，所以單看「攻方 VP」不能判斷攻方強弱。
  要分開角色時，以對手策略自我對戰、相同種子與 `--swap` 的批次為基準，用 `scripts/ai-role-margin.mjs` 比較（v81 開發時，
  原始的「攻方 VP」看起來是攻方打平、實際是守方 +2.4、攻方 −1.8 至 −11）。

### 目前結果

標準策略 `heuristic@85`（`f660ed1`，攻擊戰的守方不反攻）由使用者決定不跑獨立批、以局面接續測試與開發批證據直接升級（見[決策](#決策)）：

| 量測 | 結果（相對 v79） |
|---|---|
| 局面接續（49 個局面 × 3 組共用骰子） | 守方損失 −2.50 ± 0.69 step（t −3.6）、Kill − Loss +2.91 ± 0.97、VP 差 +1.90 ± 0.89；攻方斷補單位 −1.15 |
| 全新開發種子 40 對攻擊戰（不反攻的守方） | 每對 VP +0.70 ± 0.60、Kill − Loss +2.29 ± 0.98、Supply −0.25 ± 0.35 |
| 凍結 v85 的開發批 32 場 | 遭遇戰未改變（每對兩局終局 hash 相同）；攻擊戰 8 對 VP +4.88 ± 1.81、Kill − Loss +3.44 ± 2.78、Supply −0.69 ± 0.50 |

[升級證據](../quality/evidence/ai-defender-no-effort-v85-promotion-2026-10-18/README.md)。之後的候選以 `artifacts/ai-promotion/frozen-v85`
為對手。

前一個標準 `heuristic@79`（`93df378`，補給鏈 rail → HQ → 投送）由使用者決定不跑獨立批、以開發批證據直接升級（見[決策](#決策)）。
對凍結 v78 的最後開發批（16 場攻擊戰，種子 1300200–1300207、1300300–1300307，Rail Cap 0.8／師）：

| 項目 | v79 | v78 |
|---|---|---|
| 攻方無法加油的單位 | 每局 5.9（需要燃料者的 8%） | 26.6（24%） |
| 攻方乾 HQ | 1% | 14% |
| 前線取用不到的 SP | 每 segment 1.8 | 6.7 |
| 攻方 VP／殺傷／損失（step） | 7.6／27.6／12.2 | 5.8／23.4／15.4 |
| 守方 VP | 8.5 | 6.6 |
| 正確性 | 16 場合法完成、重播相同、補給稽核違例 0 | |
| gate | 攻方送補 gate、攻方運補 gate 三項全部通過 | |

證據：[ai-supply-chain-v79-draw-reach](../quality/evidence/ai-supply-chain-v79-draw-reach-2026-10-16/README.md)、
[ai-supply-chain-v79-development](../quality/evidence/ai-supply-chain-v79-development-2026-10-16/README.md)。遭遇戰、VP 成對
區間與獨立批都沒有量測。v81–v84 以 `93df378` 的凍結 v79（`artifacts/ai-promotion/frozen-v79`）為對手。

前一個標準 `heuristic@78`（`affa01a`），對凍結的 `heuristic@75`，獨立 80 場（種子 6900000 起，不開空軍）。VP 未達升級門檻，
由使用者破例升級（見[決策](#決策)）：

| 項目 | 結果 |
|---|---|
| 總 VP | 841–765（+76）；遭遇 +50（溫帶 +38、東歐 +12）、攻擊 +26（溫帶 −8、東歐 +34） |
| 40 對平均 VP 差 | +0.95，SE 0.526，區間 [−0.155, 2.055]（下界低於 0，VP 門檻未過） |
| 正確性 | 80 場合法完成、重播 hash 相同、0 拒絕、補給稽核與前進稽核違例 0 |
| 戰後前進 | 258 次一般前進中 253 次有共同口糧支付；30 次成功 Overrun 都有支付 |
| 損失 | 己方 step 損失 1,383 對 1,426 |
| 攻方運補 gate | 開發批與獨立批都通過（獨立批後方存量 3.0 對 8.8 SP，前線 4 格內 5.4 對 2.9 SP） |
| 決策延遲 | 開發批 p95 283 ms，同批 v75 293 ms |

證據：[README](../quality/evidence/ai-logistics-v78-independent-2026-10-16/README.md)、
[v78-result.json](../quality/evidence/ai-logistics-v78-independent-2026-10-16/v78-result.json)。

前一個標準 `heuristic@75`（基底 main `716bac9`），對凍結的 `heuristic@66`，獨立 80 場（不開空軍）：

| 項目 | 結果 |
|---|---|
| 總 VP | 919–657（+262）；遭遇 +154（溫帶 +120、東歐 +34）、攻擊 +108（溫帶 +80、東歐 +28） |
| 40 對平均 VP 差 | +3.275，區間 [1.587, 4.963] |
| 正確性 | 80 場合法完成、重播 hash 相同、0 拒絕、補給稽核與前進稽核違例 0 |
| 戰後前進 | 223 次一般前進中 220 次有共同口糧支付，其餘 3 次是第 8 回合該方最後一次 Supply 之後的奪點前進；20 次成功 Overrun 都有支付 |
| 損失 | 己方 step 損失 938 對 1,308 |
| 決策延遲（12 個 worker 並行） | heuristic@75 p95 257 ms、p99 551 ms、最長 5.3 s；heuristic@66 p95 236 ms、p99 547 ms、最長 4.3 s |

證據：[v75-result.json](../quality/evidence/ai-vp-v75-promotion-2026-10-16/v75-result.json)、
[README](../quality/evidence/ai-vp-v75-promotion-2026-10-16/README.md)；開發批與不採用的變體在同目錄的
`development-runs.json`。前一個標準 `heuristic@66` 對 `heuristic@35` 的獨立 80 場：
[v66-main-acceptance.json](../quality/evidence/ai-vp-next-promotion-2026-10-14/v66-main-acceptance.json)。

### 候選策略量測

下表是升級研究；開發批使用已知種子，只決定方向，不代表通過獨立驗收。v66 基底的候選以 `716bac9` 的凍結 v66 為對手；v76、v77 以 `2528b6d` 的凍結 v75 為對手，不能把跨對手／基底的增益相加。候選以 source／build hash 區別，同號的其他分支變體不能視為同一策略。

| 候選／方向 | 對手 | 批次 | VP 差 | 遭遇／攻擊 | 判定與證據 |
|---|---|---|---:|---|---|
| v67 任務價值排移動順序 | v66 | 品質檢查 | — | — | [有補給 Overrun 回歸與逾時](../quality/evidence/ai-vp-order-quality-2026-10-15/README.md)，未開對戰 |
| v68 Overrun 後按任務價值排序 | v66 | 開發 32 場 | −10 | −12／+2 | [淘汰](../quality/evidence/ai-vp-order-development-2026-10-15/README.md) |
| v69 只提前 Overrun | v66 | 開發 32 場 | −2 | 0／−2 | [淘汰](../quality/evidence/ai-vp-overrun-order-development-2026-10-15/README.md) |
| v70 VP 折減包含戰後補強 | v66 | 品質檢查 | — | — | [提前停止必要補強](../quality/evidence/ai-vp-defense-quality-2026-10-15/README.md)，未開對戰 |
| v71 守備需求乘 VP 比例 | v66 | 開發 32 場 | −4 | −16／+12 | [淘汰](../quality/evidence/ai-vp-defense-development-2026-10-16/README.md) |
| v72 只折減低 VP 守備 | v66 | 獨立 80 場 | +70 | +88／−18 | [未達登記門檻](../quality/evidence/ai-vp-defense-cap-independent-2026-10-16/README.md)，區間下界 −0.589 |
| v73 按實際指派戰力停止補防 | v66 | 開發 32 場 | −6 | +4／−10 | [淘汰](../quality/evidence/ai-vp-garrison-strength-development-2026-10-16/README.md) |
| v74 保留 VP 攻擊的前進資格 | v66 | 品質／局部接續 | — | — | [748 passed、8 skipped](../quality/evidence/ai-vp-option-quality-2026-10-16/README.md)；換基底前未開對戰，不作升級證據 |
| v76 全回合支付可存活的攻方 option | v75 | 開發 32 場 | −2 | +2／−4 | [淘汰](../quality/evidence/ai-vp-option-development-2026-10-16/README.md) |
| v77 限最後一位玩家的最後回合 | v75 | 開發 32 場 | +8 | 0／+8 | [增益集中一對種子](../quality/evidence/ai-vp-terminal-option-development-2026-10-16/README.md)，尚未獨立驗收 |
| v85 攻擊戰守方不反攻 | v79 | 局面接續 49 × 3；開發 32 場 | +78 | 0／+78 | [使用者決定升級為標準](../quality/evidence/ai-defender-no-effort-v85-promotion-2026-10-18/README.md)，未跑獨立批；接續測試守方損失 −2.5 ± 0.7、VP +1.9 ± 0.9；開發批攻擊戰 VP +4.88 ± 1.81 一對 |
| v84 刪除 v81–v83 的分角色規劃 | v79 | 開發 32 場 | 0 | 0／0 | 遭遇戰與攻擊戰每一對兩局終局 hash 相同（16/16）：照 v79 下，另含對港口與機場的砲擊（`7990052`，這些局沒有改變任何一局） |
| v83 只改攻擊戰守方 | v79 | 開發 32 場 | +33 | 0／+33 | [開發中](../quality/evidence/ai-assault-v83-development-2026-10-17/README.md)，遭遇戰每對兩局 hash 相同（未改變）、攻方與 v79 逐局相同；攻擊戰成對 +4.13 ± 1.69；同一守方規劃在 v82 獨立批攻擊戰 20 對 +0.35 ± 0.73、[全新開發種子](../quality/evidence/ai-defender-efforts-development-2026-10-18/README.md) 40 對每局 −2.4 ± 1.25；守方不組主攻每局 +1.4 ± 1.2；未登記獨立批 |
| v82 攻方照 v79、守方與遭遇戰規劃主攻 | v79 | 獨立 80 場 | −20 | −34／+14 | [未達登記門檻](../quality/evidence/ai-assault-v82-independent-2026-10-17/README.md)，區間 [−1.47, 0.97]，遭遇戰為負；全部正確性檢查與兩個補給 gate（自我對戰對照，5.4 對 5.4、1.7 對 1.7）通過；[開發](../quality/evidence/ai-assault-v82-development-2026-10-17/README.md) 32 場 +22（成對 +1.38 ± 1.47）、重複使用的寬種子 40 場 +63 |
| v81 依交戰角色規劃主攻 | v79 | 開發 32 場 | −22 | −32／+10 | [未登記獨立批](../quality/evidence/ai-assault-v81-promotion-development-2026-10-17/README.md)，成對 −0.69 ± 1.40；攻方運補 gate（後方 SP 6.3 對 1.3）與攻方送補 gate（4.0 對 0.2）未通過；重複使用的 40 對 [+72](../quality/evidence/ai-assault-v81-development-2026-10-17/README.md)（成對 +1.80 ± 1.59，攻方 −1.8、守方 +2.4） |
| v78 卡車循環運補 | v75 | 獨立 80 場 | +76 | +50／+26 | [未達登記門檻](../quality/evidence/ai-logistics-v78-independent-2026-10-16/README.md)，區間下界 −0.155；攻方運補 gate 與全部正確性檢查通過；開發 32 場 +44；使用者破例升級為標準 |
| v80 砲兵轉 Combat Mode | v79 | 開發 32 場 | −2 | −8／+6 | [淘汰](../quality/evidence/ai-artillery-mode-v80-development-2026-10-16/README.md)，砲擊次數反而減少 |

已完成驗證的對戰批均合法打完 8 回合，重播 hash 一致，既定一般補給與嚴格前進稽核違例為零。v77 的完整品質檢查為 752 passed／8 skipped，typecheck、build、smoke 通過；該批成對平均 +0.25、區間 [−0.275, 0.775]，尚未登記或執行獨立批；v77 以 v75 為基底，要成為標準須改以 v78 為基底重新驗收。各次 frozen quality 的命令、時間、來源與建置雜湊在個別 evidence 的 JSON 中；觀測 commit 與歷史重寫後相同 tree 的對照見 [來源對照](../quality/evidence/ai-vp-terminal-option-development-2026-10-16/source-equivalence.json)。

對 `random-legal` 的基準（WBS B5）最後量測於 heuristic@5（OOB 0.4.0，對 random-legal 39/40，終局 91% 在補給內）；
東歐風格最後量測於 heuristic@1，勝率 80%（目標 90%）。

## 決策

- 以 VP 為第一判準（使用者決定），勝率與 Kill／Loss 不能抵銷 VP 或正確性的問題。
- 驗收條件在實作與開跑前登記，失敗的批次完整保留，不事後新增或放寬門檻；例外只由使用者決定並寫明原因。目前有八次：
  - 攻方運補 gate 刪除卡車載量一項（理由見[攻方運補 gate](#攻方運補-gate)）。
  - `heuristic@78` 未達 VP 門檻仍升級為標準（使用者決定）。這次改動的目的是讓電腦正確運用卡車，平衡研究才能用電腦對局
    判斷攻方補給是否不足；VP 門檻是判斷「變強」的條件。v78 通過事先登記的運補 gate 與全部正確性檢查，獨立批 VP +76、
    兩種交戰都是正的，沒有退步跡象。這不改變升級流程：其他候選仍須通過 VP 門檻。
  - 攻方加油 gate 改為攻方送補 gate（SP 量測，理由見[攻方送補 gate](#攻方送補-gate)）。
  - `heuristic@79` 不跑獨立批、只憑開發批直接升級為標準（使用者決定，2026-10-16）。v79 讓電腦照 OCS 的補給鏈運補，
    開發批中攻方無法加油的單位由每局 26.6 降到 5.9、兩個補給 gate 全部通過、攻守 VP 都高於 v78；但沒有遭遇戰與獨立批，
    VP 門檻沒有量測。這不改變升級流程：其他候選仍須跑獨立批。
  - 兩個補給 gate 的對照組改為標準策略在相同種子上的自我對戰、門檻由「對照組的一半」改為「不比對照組差」（使用者決定，
    2026-10-17，理由見[兩個補給 gate 的對照組](#兩個補給-gate-的對照組)）。
  - `heuristic@85` 不跑獨立批、以局面接續測試與開發批證據直接升級為標準（使用者決定，2026-10-18）。錯誤清單的 E1
    （守方不分優勢反攻）經局面接續測試確認：拿掉反攻，守方損失 −2.5 ± 0.7 step（t −3.6）、VP +1.9 ± 0.9；全新開發種子 40 對
    Kill − Loss +2.29 ± 0.98。登記的主要量測與不劣化幅度沒有設定；Supply 在每次量測都略差（攻方斷補單位變少）。
    這不改變升級流程：其他候選仍須跑獨立批。
  - 升級條件由「VP」改為登記的主要量測（VP、Kill − Loss 或 Supply）加上其他量測的不劣化幅度，未改變的交戰的 80 場給改變的交戰（使用者決定，2026-10-18）。理由：VP 太粗，局面接續測試中 Loss 比 VP 清楚得多（t −3.6 對 +2.1）。
  - VP 門檻只評估候選改變的交戰（使用者決定，2026-10-17）。v82 的攻方與 v79 逐局相同、只改守方與遭遇戰；獨立批遭遇戰
    −34、攻擊戰 +14。只改守方的候選在遭遇戰下的是 v79 的棋，成對差必為 0，「兩種交戰都為正」不可能成立。
- 權重自我對戰停用（使用者決定）：四代挑戰者對冠軍都不顯著（p = 0.25～0.68），權重小幅變化的差異落在雜訊內。
  工具 `scripts/ai-train.mjs` 保留。
- 隔離單一因素時固定對手：歷史局面接續測試讓候選對凍結的標準策略，而不是雙方都換策略。

## 已知缺口

- `heuristic@79` 尚未重跑 WBS B5（對 random-legal、東歐風格），也沒有遭遇戰與獨立批的量測；目前數字來自較舊的版本。
- WBS B2 的 100 局、大地圖 20 局、開啟空軍 20 局批次未完成。
- 升級流程只用兩種地圖與兩種交戰，沒有 `ALLIED_ATTACKS`、海域、空軍或其他尺寸。

## 驗證

- 本文件的數字來自上述 evidence 的文字紀錄；各舊批次（v13～v65）的結果在 `docs/quality/evidence/ai-*` 的
  `results.json` 與 git 歷史。
- 重現：以 evidence README 記錄的 commit、種子範圍與 `scripts/ai-match.mjs` 參數重跑，再用 `ai-compare.mjs` 與
  `ai-supply-study.mjs` 彙總。
