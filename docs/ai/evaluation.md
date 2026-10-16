# AI 對戰評估

## 範圍

如何量測電腦策略的正確性與強度、新策略如何成為標準，以及目前的量測結果。策略內容見
[heuristic-policy.md](heuristic-policy.md)。這些都是 headless 對局證據，不改變
`docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。

## 現行行為

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
| `scripts/ai-role-margin.mjs` | 把候選策略在攻擊戰的攻方與守方效果分開：與對手策略自我對戰的同種子基準比較每局攻方 margin |
| `scripts/ai-concentration-study.mjs` | 攻方兵力集中：戰力離敵距離與任務分佈、可攻擊格與宣告攻擊的 Combat Table 欄位、主攻群貼近目標的戰力、砲兵模式與砲擊（需 `--trace`） |
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
2. **設定**：32×24、每方 6 師（2 裝甲）、8 回合、不開空軍（`ai-match.mjs` 必須明確給 `--air NONE --air-transport NONE`；
   不給時產生器預設會產生飛機，v66 的獨立批就是在有飛機的設定下跑的）；地圖 `TEMPERATE_INLAND` 與 `EASTERN_EUROPE`；
   交戰 `MEETING` 與 `AXIS_ATTACKS`。同種子交換陣營成對。地中海風格已移除，不再使用。
3. **開發批**：已知種子，可多次使用，只用來決定方向。
4. **獨立批**：凍結候選、登記 source／build hash 與全新種子後才開始；固定 **80 場／40 對**（每組地圖 × 交戰 10 對；
   使用者把原本 256 場減為 80 場）。只評估一次，不與開發批或失敗批合併，失敗後也不追加場次。
5. **通過條件**：遭遇戰與攻擊戰的 VP 差各為正；40 對平均 VP 差的 `mean − 2.1 × SE` > 0；全部局符合正確性要求；
   完整 typecheck、build、測試、smoke 通過。不另外要求每個地圖子組為正，但子組退步要揭露。
6. 通過後把策略版本與預設權重設為新標準。

### 攻方運補 gate

改變卡車、鐵路或海運行為的候選，除了升級流程，還要通過這個 gate（使用者決定，登記於實作之前）。它檢查電腦是否把
進攻方的補給送到前線，否則攻方缺補給只是電腦的錯，不能拿來判斷平衡。

- **範圍**：開發批的 `AXIS_ATTACKS` 局，候選擔任進攻方的 Movement Segment，從第 3 回合起；對照組是同一批中凍結標準策略擔任
  進攻方的局。指令：`node scripts/ai-logistics-study.mjs <attack 資料夾…> --gate <候選 policy>`，任一項失敗時 exit code 1。
- **鐵路**：該 segment 開始時，若有合法 `RAIL_MOVE` 能把 SP 送到離最近敵方戰鬥單位至少近 3 格、且離敵至少 3 格的車站，
  實際用鐵路運的 SP ÷ min(Rail Cap, 這些 SP) ≥ 70%。
- **後方存量**：segment 結束時離敵 6 格以上、不屬駐軍的 SP，平均值 ≤ 對照組的一半。
- **駐軍存量**：卡車裝載或鐵路運送駐軍存量的次數為 0。

原本還有「卡車載量（裝上卡車的 SP ÷ 卡車總容量）≥ 60%」一項，看過 v78 開發批後由使用者刪除：攻方每個 Movement Segment
平均只收到 9.0 SP，地圖上卡車 15.2 點，即使每個到達的 SP 都由卡車裝一次，載量也只有 59%（鐵路先運走的 SP 本 phase 不能再裝，
12.2a，實際上限 55%），這個門檻量的是收入與卡車數的比例，不是電腦有沒有把補給送出去。載量仍列在報表中。

舊標準 `heuristic@75` 在 v77 開發批（種子 1300200–1300207、1300300–1300307）的攻方：鐵路 100%（48 個 segment 中只有
14 個有可用的前送鐵路）；後方存量 11.2 SP（segment 開始時 12.0 SP）；駐軍存量 0。卡車沒有循環往返，開始時已載貨的卡車回合有
84/130 沒有卸貨（其中 38 次停在原地），入場格的 SP 則逐回合累積（一局中第 6 回合累積到 124T）；每回合開始時可裝的後方 SP
只裝走 23%。

標準 `heuristic@78`（卡車循環運補，[行為](heuristic-policy.md#後勤)）在同一組種子、對凍結 v75 的開發批通過（獨立批也通過：
後方存量 3.0 對 8.8 SP）：鐵路 100%；
後方存量 2.6 SP，同批 v75 為 12.0 SP；駐軍存量 0。可裝的後方 SP 裝走 70%（5.9／8.4 SP），前線 4 格內的 SP 由 2.8 升到 10.5。
[證據](../quality/evidence/ai-logistics-truck-shuttle-development-2026-10-16/README.md)。

### 攻方送補 gate

改變 HQ、卡車、鐵路送補或單位與補給距離的候選，除了升級流程與攻方運補 gate，還要通過這個 gate（使用者決定，
2026-10-16 登記於 heuristic@79 之前）。它檢查進攻方的 SP 有沒有送到前線用得到的地方（OCS 的 rail → HQ → 投送，12.3、13.3）：
SP 在地圖上卻沒有前線單位取用得到，前線缺燃料與口糧只是電腦的錯。

- **範圍**：開發批的 `AXIS_ATTACKS` 局，從第 3 回合起每個進攻方 Movement Segment；對照組是同一批中凍結標準策略擔任進攻方的局。
  指令：`node scripts/ai-fuel-study.mjs <attack 資料夾…> --gate <候選 policy>`，失敗時 exit code 1。
- **前線取用不到的 SP**：segment 結束時，進攻方補給堆（不含駐軍存量）中沒有任何前線單位（離敵方戰鬥單位 4 格內、HQ 以外的戰鬥單位）
  能以直接取用或 HQ 投送（12.3a–b）取得的 SP，每個 segment 的平均值 ≤ 對照組的一半。
- 同一份報表另列（不設門檻）：第一個戰鬥單位行動時（HQ、鐵路、海運之後），未與敵相鄰、需要燃料、未加油且沒有任何合法加油方式的
  單位，以及沒有補給堆能供應的乾 HQ 比例。

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

標準策略 `heuristic@79`（`93df378`，補給鏈 rail → HQ → 投送）由使用者決定不跑獨立批、以開發批證據直接升級（見[決策](#決策)）。
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
區間與獨立批都沒有量測。之後的候選以 `93df378` 的凍結 v79（`artifacts/ai-promotion/frozen-v79`）為對手。

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
| v81 依交戰角色規劃主攻 | v79 | 開發 40 對（重複使用） | +72 | +66／+6 | [開發中](../quality/evidence/ai-assault-v81-development-2026-10-17/README.md)，成對 +1.80 ± 1.59；攻方 −1.8、守方 +2.4（角色分離）；尚未登記獨立批 |
| v78 卡車循環運補 | v75 | 獨立 80 場 | +76 | +50／+26 | [未達登記門檻](../quality/evidence/ai-logistics-v78-independent-2026-10-16/README.md)，區間下界 −0.155；攻方運補 gate 與全部正確性檢查通過；開發 32 場 +44；使用者破例升級為標準 |
| v80 砲兵轉 Combat Mode | v79 | 開發 32 場 | −2 | −8／+6 | [淘汰](../quality/evidence/ai-artillery-mode-v80-development-2026-10-16/README.md)，砲擊次數反而減少 |

已完成驗證的對戰批均合法打完 8 回合，重播 hash 一致，既定一般補給與嚴格前進稽核違例為零。v77 的完整品質檢查為 752 passed／8 skipped，typecheck、build、smoke 通過；該批成對平均 +0.25、區間 [−0.275, 0.775]，尚未登記或執行獨立批；v77 以 v75 為基底，要成為標準須改以 v78 為基底重新驗收。各次 frozen quality 的命令、時間、來源與建置雜湊在個別 evidence 的 JSON 中；觀測 commit 與歷史重寫後相同 tree 的對照見 [來源對照](../quality/evidence/ai-vp-terminal-option-development-2026-10-16/source-equivalence.json)。

對 `random-legal` 的基準（WBS B5）最後量測於 heuristic@5（OOB 0.4.0，對 random-legal 39/40，終局 91% 在補給內）；
東歐風格最後量測於 heuristic@1，勝率 80%（目標 90%）。

## 決策

- 以 VP 為第一判準（使用者決定），勝率與 Kill／Loss 不能抵銷 VP 或正確性的問題。
- 驗收條件在實作與開跑前登記，失敗的批次完整保留，不事後新增或放寬門檻；例外只由使用者決定並寫明原因。目前有四次：
  - 攻方運補 gate 刪除卡車載量一項（理由見[攻方運補 gate](#攻方運補-gate)）。
  - `heuristic@78` 未達 VP 門檻仍升級為標準（使用者決定）。這次改動的目的是讓電腦正確運用卡車，平衡研究才能用電腦對局
    判斷攻方補給是否不足；VP 門檻是判斷「變強」的條件。v78 通過事先登記的運補 gate 與全部正確性檢查，獨立批 VP +76、
    兩種交戰都是正的，沒有退步跡象。這不改變升級流程：其他候選仍須通過 VP 門檻。
  - 攻方加油 gate 改為攻方送補 gate（SP 量測，理由見[攻方送補 gate](#攻方送補-gate)）。
  - `heuristic@79` 不跑獨立批、只憑開發批直接升級為標準（使用者決定，2026-10-16）。v79 讓電腦照 OCS 的補給鏈運補，
    開發批中攻方無法加油的單位由每局 26.6 降到 5.9、兩個補給 gate 全部通過、攻守 VP 都高於 v78；但沒有遭遇戰與獨立批，
    VP 門檻沒有量測。這不改變升級流程：其他候選仍須跑獨立批。
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
