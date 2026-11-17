# AI 對戰評估

## 範圍

如何量測電腦策略的正確性與強度、新策略如何成為標準，以及目前的量測結果。策略內容見
[heuristic-policy.md](heuristic-policy.md)。這些都是 headless 對局證據，不改變
`docs/quality/03-product-operation-verification-plan.md` 任何 UI 驗收列的狀態。

## 現行行為

電腦策略先修錯再談強：[錯誤清單](policy-errors.md)列出標準策略看起來不正確的決策，逐項用局面接續測試量修正的影響。[VP 改善的預測指標研究](vp-metrics.md)沒有找到能可靠預測新種子 VP 增益的指標，已暫停（使用者決定，2026-11-13）；策略改進的順序（補給延續、有條件反攻的守方、兵力集中、獨立批）與各階段的驗收見 [AI 攻防策略改進 WBS](../roadmap/19-ai-strategy-improvement-wbs.md)，不改變下列策略升級條件。

歷史場景的空軍範圍不能只依 CLI 參數認定。[指標研究盤點](../quality/evidence/ai-vp-metrics-inventory-2026-10-18/README.md)的 `v79-baseline-wide`、`v80g-wide`、`v80j-wide`、`v80q-wide` 共 80 份攻擊戰存檔，即使 options 為 `air=NONE`、`airTransport=NONE`，仍有場外飛機與實際 `DECLARE_AIR_MISSION`。這些批次的「無空軍」描述不成立，只能作含場外空軍的歷史探索資料。其他批次的實際組成尚待稽核，不能由參數推定。缺口見 `historical-ai-air-scope`。

### 工具（皆需先 `npm run build`）

| 腳本 | 用途 |
|---|---|
| `scripts/ai-match.mjs` | 完整對局：地圖風格、交戰型態、尺寸、Rail Cap、海域等選項；`--swap` 同種子交換陣營；`--trace` 決策紀錄；`--observe-decisions` 查詢來源、移動評分與派送身份報告；`--allied heuristic@<dist 目錄>` 讓凍結的另一份建置對戰；每局存檔並以重播比對終局 hash，失敗時 exit code 1 |
| `scripts/ai-compare.mjs` | 對戰彙總：勝負和與符號檢定、平均 VP 與 VP 差的標準誤、Kill、Loss |
| `scripts/ai-acceptance.mjs` | WBS B5 驗收指標（對 random-legal 與電腦互打） |
| `scripts/ai-replay-study.mjs` | 重播：目標點換手方式、step 損失原因、斷補單位、攻擊結果 |
| `scripts/ai-supply-study.mjs` | 重播：每次 attrition 的最後 trace／口糧觸發、移動預判與實際執行的比對 |
| `scripts/ai-vp-study.mjs` | 重播：找出保留補給且當下 VP 較高的替代移動（待查的候選，不是已證明的失誤） |
| `scripts/ai-oos-census.mjs`、`ai-logistics-study.mjs`、`ai-fuel-study.mjs`、`ai-truck-trips.mjs`、`ai-garrison-supply-study.mjs`、`ai-air-count.mjs` | 斷補、鐵路與卡車使用、攻方送補與加油、每輛卡車每回合趟數、駐軍送補、空軍任務數的統計 |
| `scripts/ai-objective-flow-study.mjs` | VP 從哪裡來：目標點以走進空格或戰鬥決定取得與失去、攻擊目標點的欄位與結果（攻擊戰攻方、遭遇戰雙方） |
| `scripts/ai-error-census.mjs` | 錯誤清單的普查（[錯誤清單](policy-errors.md)）：各方每局有好賠率卻不攻的 Combat Segment、攻擊欄位分布與第 10 欄以上的攻擊、戰後不前進與前進、整局沒移動的戰鬥單位 |
| `scripts/ai-attack-allocation-study.mjs` | 錯誤清單 E4：高賠率攻擊中可抽出而仍維持第 9 欄的單位，與它們旁邊是否有其他未被攻擊的敵格；低賠率攻擊目標點時旁邊閒置的己方單位 |
| `scripts/ai-approach-study.mjs` | 錯誤清單 E6：移動中的戰鬥單位停在離目標多遠、目標旁的格子是否到得了、所選移動的評分項目 |
| `scripts/ai-position-record.mjs` | 既有對局每個玩家回合開始時雙方的現況與下一回合局勢指標（[局勢指標](policy-errors.md#局勢指標)），附該玩家回合的損失（含戰鬥與耗損拆分）、目標點變化、補給堆被奪或被毀的 SP 與終局 VP；補給線切斷只算不行動的一方；重播 hash 不符的局略過 |
| `scripts/ai-position-analysis.py` | 既有局勢指標的描述性分析（含戰鬥與耗損拆分及可付費目標風險）；其 metrics 去重會合併不同對局，終局預測結論待重驗，見 [目前限制](policy-errors.md#指標是否可用) |
| `scripts/ai-position-validate.py` | 依初始／終局 hash 與完整行動序列識別對局；留出整組種子及來源批次的近期預測比較，包含零事件、中位數、線性、固定分桶與訓練五分位分桶基準；特徵含不行動方與行動方（`mover.`）的指標，結果含行動方的奪點與不行動方下一個己方回合的耗損；`--train-manifest` 只以舊對局擬合、在種子全新的對局計分（前瞻確認），見 [指標是否可用](policy-errors.md#指標是否可用) |
| `scripts/ai-position-residuals.py`、`scripts/ai-position-residual-review.mjs` | 局勢指標的殘差檢視（[局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md) P3）：依事先固定的規則挑出各角色中指標低估最多的玩家回合，重播並整理該回合的戰鬥、奪點與耗損 |
| `scripts/ai-position-final.py` | 局勢指標的終局預測：每條軌跡各 Game Turn 開始時，以 VP、step、斷補與局勢指標預測終局 VP 差，地圖種子分組十折，樣本外 R² 與 MAE 及其增益區間（[局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md) P6）；`--train-manifest` 只以舊對局擬合、在新對局計分 |
| `scripts/ai-theater-survey.mjs` | 戰區補給配置的地圖普查：重播存檔到 Game Turn 3，記錄鐵路網、補給源與雙方的戰區劃分（`scripts/ai-theater-supply.mjs` 的 `theaters`）；分岔門檻 4、6、8 格的戰區數（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-attack-check.mjs` | 戰區補給配置的 Combat 階段核對：重播存檔，在每次實際攻擊前與每次進入 Combat 時呼叫 `bestPayableAttack`（`scripts/ai-theater-supply.mjs`），比較可付最佳欄位與實際欄位、統計補給是否阻擋攻擊（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-fuel-check.mjs` | 戰區補給配置的 Movement 階段燃料核對：重播存檔，在每次進入 Movement 時把需要燃料的單位分成已加油、付得起與無法支付，並以規則移動範圍檢查能否到達未持有目標旁（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-inflow-check.mjs` | 戰區補給配置的 1 回合運入核對：重播存檔，比較每個戰區從進入 Movement 到進入 Combat 實際運入前線區域的 token 與 `inflowBound` 上限（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-capture-extract.mjs`、`scripts/ai-theater-capture-model.py` | 戰區補給配置的奪點機率：抽取每個被攻擊目標與回合的最強實際攻擊及回合結束持有者，依地圖種子分組十折比較候選模型並凍結（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-allocation-check.mjs` | 戰區補給配置的配置搜尋核對：在每個玩家回合的 Movement 開始執行 `allocate`（`scripts/ai-theater-allocation.mjs`），並以最多 K 個單位的子問題與窮舉最佳解比較（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-theater-validate.py` | 戰區補給配置的預測驗證：讀 `ai-position-record.mjs --theater` 的列，比較潛力對終局 margin（在 M2 之上）與本回合奪點（對可達欄位與可支付風險）的預測增益，地圖種子重抽區間（[戰區補給配置](theater-supply-plan.md)） |
| `scripts/ai-paired-measures.mjs` | 交換座位成對的 ai-match：候選策略減對手的 VP、Kill − Loss、Supply，每對平均、95% t 區間與正／零／負對數 |
| `scripts/ai-theater-realized.mjs` | 讀 `ai-position-record.mjs --theater` 的列：攻方依策略與 Game Turn 1～3／4～8 的潛力、Combat 入口實現量、比例與取得目標 VP，並以交換座位成對比較取得的目標 VP（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-theater-delay.mjs` | 戰區補給配置策略上層的下回合折扣：重播存檔，在攻方每個 Game Turn 的第一個 Movement 決策處記錄有守軍的未持有目標，比較下一回合同一時點的守軍估計戰力，依 Game Turn 報告沒有增加的比例與地圖種子重抽區間（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-theater-move-terms.mjs` | 戰區配置的移動執行診斷：重播配置版擔任攻方的存檔，在記錄局面上讓策略以步驟記憶重做每個 Movement 決策並核對與記錄相同，記錄本步驟組成員的原地分數、所選與目標旁最佳格的評分項，以及友軍補給關卡的結果（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-theater-rollout.mjs` | 戰區配置的移動段推演：在存檔中攻方每個 Movement 段開頭截斷存檔、載入成 session，讓 seat runner 以配置版策略走完該段（另一席為標準策略），記錄配置的組、被指派的 HQ 是否到位、集結者是否停在卸貨點及其補給狀態、卡車在卸貨點卸下多少 token，以及卡車與集結者的動作；`--through n` 再讓雙方打到攻方第 n 個玩家回合結束，記錄攻方取得的目標點數、雙方損失步數與攻擊次數，`--standard` 與 `--dist` 換攻方策略或建置，`--compare` 把兩種策略從相同局面出發的結果依地圖成對比較，`--save-dir` 寫出推演後的存檔供兩個補給 gate 腳本讀取，`--defender-weights` 讓另一席以指定權重下；不開新局（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-supply-gap-study.mjs` | 兩個攻方補給 gate 的差距歸因：重播存檔，在攻方每個 Movement segment 結束時把每個補給堆依「這一段在那一格發生了什麼」分類（本段卸貨、本段鐵路運到、鐵路出口被切斷、鐵路可前送卻沒運、卡車裝過仍有餘量、舊卸貨點、HQ 移走、空車可達），並記錄鐵路與卡車的流量；`--summarize` 依地圖分群（交換座位的兩局同一群）比較兩組（[S1.1](../roadmap/19-ai-strategy-improvement-wbs.md)） |
| `scripts/ai-theater-hq-follow.mjs` | 戰區配置含 HQ 與卡車指派的執行追蹤：重播配置版擔任攻方的存檔，記錄被指派的 HQ 移動段結束時是否到達指定格、被指派的卡車是否在卸貨點附近卸下 SP、本步驟組成員是否在目標旁且有 trace、是否攻擊與持有，以及下一步驟組在下一回合的配置、攻擊與持有（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-theater-next-step.mjs` | 戰區配置下一步驟組的追蹤：重播配置版擔任攻方的存檔，記錄每個有守軍的下一步驟組成員在計畫時是否走得到目標旁、是否在 trace 內、移動時友軍補給關卡是否放行，以及下一回合配置是否保留目標、HQ 距離、是否攻擊與持有（[戰區補給配置](theater-supply-plan.md#策略上層)） |
| `scripts/ai-theater-adherence.mjs` | 戰區補給配置策略上層的執行核對：重播存檔，在攻方每個 Movement 的第一個決策處讓開啟權重與標準策略各自規劃，比較兩者的目標與單位，並核對進入 Combat 時是否到位、是否攻擊、回合末是否持有（[戰區補給配置](theater-supply-plan.md#策略上層)）；`--execution` 逐單位追蹤策略自己的本步驟組成員：移動當下能否到目標旁、停在哪裡、未移動的原因、進入 Combat 時是否到位 |
| `scripts/ai-position-confirm.py` | 依登記檔的門檻判定前瞻確認的每項假設（[局勢指標研究 WBS](../roadmap/18-position-metrics-wbs.md) P7） |
| `scripts/ai-find-branches.mjs` | 從 trace 找分岔點：某一方在某個 segment 做了要研究的決策（例如攻擊戰守方的主攻任務），輸出該 segment 第一個行動的 index；`--replay` 改為重播存檔，給沒有 trace 的對局用（只限不看 intent 的 `first-movement`；與 trace 的結果逐欄相同） |
| `scripts/ai-continue.mjs` | 局面接續：從存檔的分岔點重設 Rules RNG，各策略變體在同一組骰子種子下對固定對手接著下，記錄 +h 回合與終局的局面指標與事件 |
| `scripts/ai-continue-batch.mjs` | 平行執行多個 `ai-continue.mjs`（每個分支 × 變體一個檔），可續跑：已完成的檔保留，中斷的重跑，同名變體換了策略、對手、骰子數或時點即報錯；變體可分次加跑；最後列出失敗與沒打完的接續 |
| `scripts/ai-position-metrics.mjs` | 局面指標（模組）：VP、目標點持有／有人守／受威脅、單位與 step、DG、接敵、離敵距離、斷補、SP（地圖上、前線取用得到、取用不到、扣除口糧與燃料後的剩餘戰鬥 SP）、未控目標最佳有效欄位、2 格局部兵力比、乾 HQ；下一回合局勢（[局勢指標](policy-errors.md#局勢指標)），含近似共同 SP 預算的目標風險與可攻達性（尚非合法支付計劃）、對方一步能切斷補給的單位數、對方每單位只攻擊一格時的暴露量與單格最高期望損失；事件：step 損失（總計、戰鬥、耗損）、補給堆被奪或被毀的 SP、SP 支出、攻擊、砲擊 |
| `scripts/ai-continue-compare.py` | 比較接續結果：每個指標的成對差（同一分岔點的骰子先平均）、t 值，以及早期差與終局 VP 差的相關；`--by-style`、`--by-role` 依地圖風格與角色（攻擊戰攻方、守方、遭遇戰）分格，報各格、各風格與各格等權的平均；`--cluster-by-map` 以地圖為 SE 的單位（cluster-robust）；並列出終局與基準不同的分支數 |
| `scripts/ai-role-margin.mjs` | 把候選策略在攻擊戰的攻方與守方效果分開：與對手策略自我對戰的同種子基準比較每局攻方 margin |
| `scripts/ai-concentration-study.mjs` | 攻方兵力集中：戰力離敵距離與任務分佈、可攻擊格與宣告攻擊的 Combat Table 欄位、主攻群貼近目標的戰力、砲兵模式與砲擊（需 `--trace`） |
| `scripts/ai-vp-metrics-extract.mjs`、`scripts/ai-vp-metrics-compare.py`、`scripts/ai-outcome-metrics-observer.mjs`、`scripts/ai-outcome-metrics-compare.py` | 固定回合的目標控制與戰術指標重播（含未控目標最佳有效欄位與 2 格局部兵力比）；`--advanced` 加入補給階段的共同配給條件、耗損前 RE 暴露與損失原因，四結果比較使用各自的早期基準、同角色自戰差分、留出種子與策略變體；manifest、重現方式與限制見 [VP 指標研究](vp-metrics.md) |
| `scripts/ai-objective-replay.mjs`、`scripts/ai-objective-study.py`、`scripts/ai-objective-replay-verify.mjs` | 先後手決定後擷取同目標條件、控制事件及保有結果；逐行動比對觀測開關的 state／event hash，核對雙方 gross／signed VP；固定機率模型留出整組種子，報告 Brier、log loss、校準及 VP 誤差，見[同目標研究](objective-metrics.md) |
| `scripts/ai-surrogate-transfer.py`、`scripts/ai-surrogate-transfer-inputs.py` | 核對 P8 來源、交換座位及歷史模型，固定早期代理值預測不同種子的改版 VP 效果；一元校準留出完整權重家族，保留猜零與開發終局基準、36 切分及共同噪音負對照，見[效果轉移驗證](policy-errors.md#改版效果能否轉移到另一批種子) |
| `scripts/ai-observation-study.mjs` | 對凍結建置及目前觀測開關逐項比對實際 session 的行動、查詢、記憶、亂數、事件與 hash；驗證查詢回傳、快取重用及派送身份對帳，見[觀測契約](vp-metrics.md#決策閘門的觀測契約) |
| `scripts/ai-movement-gates-study.mjs` | 核對已綁定 hash 的移動觀測，按角色及指派目標彙總實際檢查、組別結局與同時刪除候選／原地分數項的門檻敏感度；見[指標契約](vp-metrics.md#移動候選的描述性指標)，未認定 VP 預測或因果效果 |
| `scripts/ai-movement-objectives-study.mjs` | 重播已綁定的移動觀測 session，連結候選路徑、接受 request 與同目標控制帳本；區分取得、既有持有及未觀測的保有結果，保留去重窗口數，見[同目標結果契約](vp-metrics.md#移動選項與同目標結果) |
| `scripts/ai-movement-panel-record.mjs`、`scripts/ai-movement-panel-compare.py` | 從原始快照、策略權重與座位種子重算既有對戰，逐接受行動及 hash 對帳；以固定早期移動條件預測不同種子的策略對戰 VP 差，留出整個權重家族並比較 VP、step／OOS 基準，見[跨策略移動指標比較](vp-metrics.md#跨策略移動指標比較) |
| `scripts/ai-narrate.mjs` | 一局 trace 的逐步摘要，供人工檢視 |
| `scripts/ai-train.mjs` | 權重自我對戰（已停用，見「決策」） |

原始存檔、trace 與凍結建置留在本機被 git 忽略的 `artifacts/`；舊批次的原始資料已刪除，只留文字紀錄。commit 進 `docs/quality/evidence/` 的只有文字紀錄與個別 run 的小型腳本；可重用工具放在 `scripts/`。`scripts/ai-promotion/freeze.py` 凍結現行標準與候選，`quality.py` 在凍結目錄跑完整檢查；`batch.py` 執行同引擎交換陣營對戰及補給／前進稽核，`verify.py` 核對來源、設定、重播、候選陣營與成對 VP 結果。`register.py` 登記獨立 gate 前，確認新種子沒有出現在任何現存的 `match-*.save.json`，也不在已下過種子的清冊 `artifacts/ai-promotion/played-seeds.tsv`（每行「種子<TAB>資料夾」）裡；刪除存檔騰空間前，先把種子補進這份清冊。

### 正確性要求（每一局）

- 打完全部回合到 `FINISHED`；沒有 `FAILED_ACTION`、`BOT_STALLED`、`BOT_BUDGET_EXCEEDED`、`NO_BOT_FOR_ACTOR`、`FATAL`。
- 存檔重播的終局 state hash 相同。
- 補給稽核（`ai-supply-study.mjs`）：一般移動與切模式不破壞其他單位既有的 trace 或口糧；移動的單位自己失去 trace，只在它到該 Movement Segment 結束時既沒有 trace、也沒有 SP 可吃（12.6c）時才算違例（使用者決定，2026-11-15：戰區配置的組員會離開 trace 到有 SP 可吃的攻擊位置，集結者先停在卡車稍後才卸貨的卸貨點，[紀錄](../quality/evidence/ai-s4-v87-2026-11-15/README.md)）；可選支出不破壞共同口糧承諾、
  戰後前進與 Overrun 的預判與實際 reducer 一致。違例數必須為 0。

### 標準策略的升級流程

用於「新策略取代標準策略」：

1. **對手**：凍結的現行標準策略；雙方使用候選版本的同一份引擎與產生器。
2. **設定**：32×24、每方 6 師（2 裝甲）、8 回合、地圖上不開空軍（`ai-match.mjs` 必須明確給 `--air NONE --air-transport NONE`；
   不給時產生器預設會產生飛機，v66 的獨立批就是在有飛機的設定下跑的）。攻擊戰的攻方另有場外機場與飛機，與 `--air` 無關
   （產生器的交戰設計，[engagements plan](../quality/evidence/engagements-plan-2026-10-07/README.md) §6）：v82 獨立批的攻擊戰
   每局攻方約 4 次空中任務，不論哪個策略擔任攻方；遭遇戰沒有飛機。成對比較因此仍公平，但攻擊戰不是無空軍的對局；地圖 `WESTERN_EUROPE` 與 `EASTERN_EUROPE`；
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

   主要量測是 **VP**（使用者，2026-11-15：「vp才是主要index」）；登記時給 Kill − Loss 與 Supply **不劣化幅度**（每對）。VP 在
   每一種改變的交戰平均為正，且這些交戰的成對 `mean − 2.1 × SE` > 0；其他兩項的 `mean − 2.1 × SE` > −幅度。Kill − Loss 或 Supply
   的改善不能抵銷 VP。VP 的預估檢定力不足時，登記前回報使用者，不改用其他主要量測。檢定力估計用實測的標準差：獨立批的
   VP 每對約 6（遭遇戰 6.1）與 3.7（攻擊戰），從 Game Turn 2 打到終局的局面接續每分支 5.3～6.6（[VP 診斷](../quality/evidence/ai-s4-vp-diagnosis-2026-11-15/README.md)），攻擊戰的單組骰子在西歐 11.1～11.5、東歐 6.0～6.5（[S5.2](../quality/evidence/ai-s5-vp-check-2026-11-15/README.md)，西歐 458 個分支）；
   E5 的 2.5 只適用短期接續。40 對時，兩種交戰都改變的候選要觀察到每對約 +1.74 以上且每種交戰為正；只改攻擊戰（遭遇戰未改變、
   80 局全給攻擊戰）時約 +1.2～1.5。兩種交戰都改變、真實效果只在攻擊戰（+2.25）的候選，通過機率約 0.24
   （[複核](../quality/evidence/ai-s4-vp-review-2026-11-15/README.md)）。
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
- **後方存量**：segment 結束時離敵 6 格以上、不屬駐軍、且沒有任何前線單位（與攻方送補 gate 相同的定義）能直接取用或經 HQ 投送取得的 SP，平均值 ≤ 對照組。全部後方 SP 只列在報表。
  原本計入全部後方 SP；使用者決定（2026-11-14）只計前線取用不到的部分：[S1.1 的歸因](../quality/evidence/ai-supply-gap-attribution-2026-11-13/README.md)顯示，鐵路把較多 SP 送到離敵 6 格以上、前線取用得到的車站時，舊定義也把它算成後方存量，量到的是運送距離而不是 SP 有沒有送到前線用得到的地方。這一節以下的舊結果都用舊定義。
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

標準策略 `heuristic@89` 是 heuristic@88 加一項直接修正（Exploitation 階段的戰區配置不計卡車與 HQ 的移動，使用者決定不跑升級流程，
見[決策](#決策)與 [S6](../quality/evidence/ai-s6-exploitation-moves-2026-11-17/README.md)）；它沒有自己的對戰量測。下表是 `heuristic@88`（heuristic@86 加攻擊戰的五項，
[內容](heuristic-policy.md#heuristic88-採用的五項攻擊戰)），由使用者決定例外升級（2026-11-17）：走完升級流程，量測與兩個補給 gate 達標，補給稽核有違例：

| 量測 | 結果（相對 v86） |
|---|---|
| 獨立 160 局攻擊戰（西歐 2800200–2800279、東歐 2800300–2800379；使用者例外加大） | VP 每對 +2.04 [+1.10, +2.98]（西歐 +2.65、東歐 +1.43）、Kill − Loss +3.09 [+1.27, +4.92]、Supply +0.16 [−0.39, +0.71] |
| 遭遇戰（開發批 16 局） | 每對兩局終局 hash 相同，未改變 |
| 攻方運補 gate（對同種子的 v86 自我對戰 160 局） | 鐵路 100%、駐軍存量 0、後方前線取用不到的 SP 3.3 對 3.9：通過 |
| 攻方送補 gate（同上） | 前線取用不到的 SP 3.6 對 4.1：通過 |
| 正確性 | 160 局合法打完、重播相同；沒有補給的前進只在第 8 回合；**補給稽核 16 次違例**（Exploitation 中往主攻目標移動後無 trace 且無 SP 可吃；v86 當攻方 6 次、v88 當攻方 10 次） |

[獨立批](../quality/evidence/ai-s5-v88-independent-2026-11-17/README.md)、[開發批與登記](../quality/evidence/ai-s5-v88-2026-11-16/README.md)。之後的候選以 `artifacts/ai-promotion/frozen-v89-standard` 為對手。

前一個標準 `heuristic@86`（攻擊戰的攻方以戰區配置規劃，[設計](theater-supply-plan.md#策略上層)）由使用者決定例外升級：沒有跑獨立批，
兩個補給 gate 未通過（見[決策](#決策)）：

| 量測 | 結果（相對 v85） |
|---|---|
| 事先登記的 80 局西歐攻擊戰（2100400–2100479，修正鐵路之前的版本） | VP 每對 +2.70 [+1.15, +4.25]、Kill − Loss +1.81 [−1.28, +4.91]、Supply −0.24 [−0.66, +0.18]；攻方前 3 回合目標 VP +3.70 [2.31, 5.09] |
| 攻方運補 gate（同一批，對 v85 自我對戰） | 鐵路 100%、駐軍存量 0 通過；後方剩餘 SP 9.3 對 5.6 **未通過** |
| 攻方送補 gate（同一批） | 前線取用不到的 SP 3.9 對 1.7 **未通過**；加不到油的單位每局 13.5 對 9.6、乾 HQ 10% 對 5% |
| 鐵路修正後，從同批第 1 回合局面推演到第 6 回合（80 局 × 3 種攻方） | 後方剩餘 6.5 對 4.9、前線取用不到 2.4 對 1.5（兩個 gate 仍未通過）；加不到油的單位每局 5.8 對 6.3；目標點數每張地圖 +2.80 [1.23, 4.37] |
| 開發種子的正確性檢查 | 東歐攻擊戰 8 局合法完成、重播相同；遭遇戰（西歐、東歐各 2 對）每對兩局終局 hash 相同，未改變 |

[觀測](../quality/evidence/ai-theater-untraced-games-2026-11-13/README.md)、[補給 gate 與鐵路修正](../quality/evidence/ai-theater-supply-gates-2026-11-13/README.md)、
[升級紀錄](../quality/evidence/ai-theater-v86-promotion-2026-11-13/README.md)。

前一個標準 `heuristic@85`（`f660ed1`，攻擊戰的守方不反攻）由使用者決定不跑獨立批、以局面接續測試與開發批證據直接升級（見[決策](#決策)）：

| 量測 | 結果（相對 v79） |
|---|---|
| 局面接續（49 個局面 × 3 組共用骰子） | 守方損失 −2.50 ± 0.69 step（t −3.6）、Kill − Loss +2.91 ± 0.97、VP 差 +1.90 ± 0.89；攻方斷補單位 −1.15 |
| 全新開發種子 40 對攻擊戰（不反攻的守方） | 每對 VP +0.70 ± 0.60、Kill − Loss +2.29 ± 0.98、Supply −0.25 ± 0.35 |
| 凍結 v85 的開發批 32 場 | 遭遇戰未改變（每對兩局終局 hash 相同）；攻擊戰 8 對 VP +4.88 ± 1.81、Kill − Loss +3.44 ± 2.78、Supply −0.69 ± 0.50 |

[升級證據](../quality/evidence/ai-defender-no-effort-v85-promotion-2026-10-18/README.md)。

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
| 總 VP | 841–765（+76）；遭遇 +50（西歐 +38、東歐 +12）、攻擊 +26（西歐 −8、東歐 +34） |
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
| 總 VP | 919–657（+262）；遭遇 +154（西歐 +120、東歐 +34）、攻擊 +108（西歐 +80、東歐 +28） |
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
| v87 入場修正、HQ 接力、守方斷補、貼近目標 | v86 | 開發 32 場；獨立 80 場 | +58 | −32／+90 | [以 VP 判定未通過](../quality/evidence/ai-s4-v87-independent-2026-11-15/README.md)：VP 每對 +0.73 [−1.01, +2.46]、遭遇戰 −0.80；Kill − Loss +5.64 [+2.60, +8.67]，兩個攻方補給 gate 通過；[開發批](../quality/evidence/ai-s4-v87-2026-11-15/README.md) Kill − Loss +5.03 ± 1.64 |
| v88 v87 的四項（`approachAttack` 只給攻擊戰攻方、`arrivalRailForward` 只在攻擊戰）加攻方 option 保留前進 | v86 | 開發 32 場；獨立 160 場（使用者例外，全為攻擊戰） | +326 | 未改變／+326 | [量測達標、補給稽核有違例，使用者例外升級為標準](../quality/evidence/ai-s5-v88-independent-2026-11-17/README.md)：VP 每對 +2.04 [+1.10, +2.98]（西歐 +2.65、東歐 +1.43）；Kill − Loss +3.09 [+1.27, +4.92]、Supply +0.16 [−0.39, +0.71]；兩個攻方補給 gate 通過；補給稽核 16 次違例（Exploitation 中往主攻目標移動後無 trace 且無 SP 可吃），v86 當攻方 6 次、v88 當攻方 10 次 |
| v85 攻擊戰守方不反攻 | v79 | 局面接續 49 × 3；開發 32 場 | +78 | 0／+78 | [使用者決定升級為標準](../quality/evidence/ai-defender-no-effort-v85-promotion-2026-10-18/README.md)，未跑獨立批；接續測試守方損失 −2.5 ± 0.7、VP +1.9 ± 0.9；開發批攻擊戰 VP +4.88 ± 1.81 一對 |
| v84 刪除 v81–v83 的分角色規劃 | v79 | 開發 32 場 | 0 | 0／0 | 遭遇戰與攻擊戰每一對兩局終局 hash 相同（16/16）：照 v79 下，另含對港口與機場的砲擊（`7990052`，這些局沒有改變任何一局） |
| v83 只改攻擊戰守方 | v79 | 開發 32 場 | +33 | 0／+33 | [開發中](../quality/evidence/ai-assault-v83-development-2026-10-17/README.md)，遭遇戰每對兩局 hash 相同（未改變）、攻方與 v79 逐局相同；攻擊戰成對 +4.13 ± 1.69；同一守方規劃在 v82 獨立批攻擊戰 20 對 +0.35 ± 0.73、[全新開發種子](../quality/evidence/ai-defender-efforts-development-2026-10-18/README.md) 40 對每局 −2.4 ± 1.25；守方不組主攻每局 +1.4 ± 1.2；未登記獨立批 |
| v82 攻方照 v79、守方與遭遇戰規劃主攻 | v79 | 獨立 80 場 | −20 | −34／+14 | [未達登記門檻](../quality/evidence/ai-assault-v82-independent-2026-10-17/README.md)，區間 [−1.47, 0.97]，遭遇戰為負；全部正確性檢查與兩個補給 gate（自我對戰對照，5.4 對 5.4、1.7 對 1.7）通過；[開發](../quality/evidence/ai-assault-v82-development-2026-10-17/README.md) 32 場 +22（成對 +1.38 ± 1.47）、重複使用的寬種子 40 場 +63 |
| v81 依交戰角色規劃主攻 | v79 | 開發 32 場 | −22 | −32／+10 | [未登記獨立批](../quality/evidence/ai-assault-v81-promotion-development-2026-10-17/README.md)，成對 −0.69 ± 1.40；攻方運補 gate（後方 SP 6.3 對 1.3）與攻方送補 gate（4.0 對 0.2）未通過；重複使用的 40 對 [+72](../quality/evidence/ai-assault-v81-development-2026-10-17/README.md)（成對 +1.80 ± 1.59，攻方 −1.8、守方 +2.4） |
| v78 卡車循環運補 | v75 | 獨立 80 場 | +76 | +50／+26 | [未達登記門檻](../quality/evidence/ai-logistics-v78-independent-2026-10-16/README.md)，區間下界 −0.155；攻方運補 gate 與全部正確性檢查通過；開發 32 場 +44；使用者破例升級為標準 |
| v80 砲兵轉 Combat Mode | v79 | 開發 32 場 | −2 | −8／+6 | [淘汰](../quality/evidence/ai-artillery-mode-v80-development-2026-10-16/README.md)，砲擊次數反而減少 |

已完成驗證的對戰批均合法打完 8 回合，重播 hash 一致，既定一般補給與嚴格前進稽核違例為零。v77 的完整品質檢查為 752 passed／8 skipped，typecheck、build、smoke 通過；該批成對平均 +0.25、區間 [−0.275, 0.775]，尚未登記或執行獨立批；v77 以 v75 為基底，要成為標準須改以 v78 為基底重新驗收。各次 frozen quality 的命令、時間、來源與建置雜湊在個別 evidence 的 JSON 中；觀測 commit 與歷史重寫後相同 tree 的對照見 [來源對照](../quality/evidence/ai-vp-terminal-option-development-2026-10-16/source-equivalence.json)。

對 `random-legal` 的基準（WBS B5）在現行標準上沒有量測：最後量測於 heuristic@5（OOB 0.4.0，對 random-legal 39/40，終局 91% 在補給內）；
東歐風格最後量測於 heuristic@1，勝率 80%（目標 90%）。未升級的候選 heuristic@87 在全新種子上預設地圖 40/40、東歐風格 20/20，
B5-1～B5-6 全部通過（[紀錄](../quality/evidence/ai-b5-v87-2026-11-15/README.md)）。

## 決策

- 以 VP 為第一判準（使用者決定），勝率與 Kill／Loss 不能抵銷 VP 或正確性的問題。
- 驗收條件在實作與開跑前登記，失敗的批次完整保留，不事後新增或放寬門檻；例外只由使用者決定並寫明原因。目前有十二次：
  - 攻方運補 gate 刪除卡車載量一項（理由見[攻方運補 gate](#攻方運補-gate)）。
  - 攻方運補 gate 的後方存量改為只計前線取用不到的 SP（使用者決定，2026-11-14，理由見[攻方運補 gate](#攻方運補-gate)）。
  - `heuristic@87` 的候選帶有兩項沒通過自己檢查的改動（使用者決定）：S1 的入場修正與 HQ 接力在沒用於開發的局面上沒讓
    兩個補給 gate 通過（2026-11-14：「完成S2」，維持例外、權重帶到 S4），`approachAttack` 的 S3 檢查（事先登記）目標點數
    +0.00 [−1.48, +1.48] 未通過不劣化門檻（2026-11-15：「例外帶到 S4」）。升級流程本身沒有例外：獨立批判定四項合起來的效果。
  - 補給稽核中，移動者自己失去 trace 只在移動段結束時仍無 trace 且無 SP 可吃才算違例（使用者決定，2026-11-15）。heuristic@86 的戰區配置刻意讓組員與集結者離開 trace；它例外升級時沒跑這個稽核，heuristic@87 的開發批才發現：攻擊戰 90 次全是移動者自己、v86 與候選都有，每一次在移動段結束時都已有 trace 或 SP 可吃（[紀錄](../quality/evidence/ai-s4-v87-2026-11-15/README.md)）。
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
  - `heuristic@89` 不跑升級流程：它是 heuristic@88 加一項修正（使用者決定，2026-11-17：「這樣明確的bug可以直接修正」）。戰區配置在
    Exploitation 階段安排了不能移動的卡車（11.0a），集結者因此走到沒有補給的卸貨點；這就是 heuristic@88 獨立批補給稽核 16 次違例中的
    15 次。修正後在那 10 個局面重下該移動段，段末無補給由 10 次降為 1 次；整局的對戰量測沒有做（這種移動每局約 0.1 次）。
    明確的預測錯誤可以這樣直接修正；改變取捨的改動仍走升級流程。
  - `heuristic@88` 的獨立批量測與兩個補給 gate 達標，但補給稽核有 16 次違例，仍升級為標準（使用者決定，2026-11-17：「先升級88 再研究
    Exploitation 的移動 我建議先不把其當成bug 而是分析利弊之後再決定」）。違例是攻方在 Exploitation 中往主攻目標移動、段結束時無 trace
    且無 SP 可吃；v86 自己在同一批種子上也有（當攻方 80 局 6 次，v88 10 次）。分析後查明是預測錯誤，已在 heuristic@89 修正（上一項）。獨立批 160 局也是使用者的例外（每批上限 80 局）。這不改變升級流程。
  - `heuristic@86` 不跑獨立批、兩個攻方補給 gate 未通過仍升級為標準（使用者決定，2026-11-13：「既然如此 promte此solution」，
    看過 gate 結果與鐵路修正後選擇「例外升級並 push」）。證據只有西歐攻擊戰：事先登記的 80 局 VP 每對 +2.70 [+1.15, +4.25]，
    是攻擊戰攻方的改動，遭遇戰與守方不變。gate 的差距一部分來自鐵路不運計畫裝貨格的錯誤，已修正；修正後加不到油的單位
    少於 v85，但前線取用不到的 SP 仍是 v85 的 1.6 倍；[歸因](../quality/evidence/ai-supply-gap-attribution-2026-11-13/README.md)後這項差距在地圖層級未確立、集中在少數地圖（`bot-theater-allocation`）。修正後的版本只有推演、沒有
    對局觀測；東歐攻擊戰只做過正確性檢查。這不改變升級流程：其他候選仍須跑獨立批並通過 gate。
  - 升級條件是 VP 加上 Kill − Loss 與 Supply 的不劣化幅度，未改變的交戰的 80 場給改變的交戰（使用者決定，2026-10-18）。當時也允許登記 Kill − Loss 或 Supply 為主要量測（VP 太粗，局面接續測試中 Loss 比 VP 清楚得多，t −3.6 對 +2.1）；使用者 2026-11-15 重申「vp才是主要index」。heuristic@87 登記時，agent 沒有依改進 WBS S4.3 把 VP 檢定力不足回報使用者，自行改以 Kill − Loss 為主要量測；以 VP 判定，該批未通過（[獨立批](../quality/evidence/ai-s4-v87-independent-2026-11-15/README.md)）。
  - VP 門檻只評估候選改變的交戰（使用者決定，2026-10-17）。v82 的攻方與 v79 逐局相同、只改守方與遭遇戰；獨立批遭遇戰
    −34、攻擊戰 +14。只改守方的候選在遭遇戰下的是 v79 的棋，成對差必為 0，「兩種交戰都為正」不可能成立。
- 權重自我對戰停用（使用者決定）：四代挑戰者對冠軍都不顯著（p = 0.25～0.68），權重小幅變化的差異落在雜訊內。
  工具 `scripts/ai-train.mjs` 保留。
- 隔離單一因素時固定對手：歷史局面接續測試讓候選對凍結的標準策略，而不是雙方都換策略。

## 已知缺口

- `heuristic@86` 未通過兩個攻方補給 gate（例外升級），東歐攻擊戰的效果沒有量測。
- 標準策略 `heuristic@89` 尚未重跑 WBS B5；B5-1～B5-6 只以未升級的候選 heuristic@87 量過，B5-7 最後在 heuristic@1。
- WBS B2 的 100 局、大地圖 20 局、開啟空軍 20 局批次未完成。
- 升級流程只用兩種地圖與兩種交戰，沒有 `ALLIED_ATTACKS`、海域、空軍或其他尺寸。

## 驗證

- 本文件的數字來自上述 evidence 的文字紀錄；各舊批次（v13～v65）的結果在 `docs/quality/evidence/ai-*` 的
  `results.json` 與 git 歷史。
- 重現：以 evidence README 記錄的 commit、種子範圍與 `scripts/ai-match.mjs` 參數重跑，再用 `ai-compare.mjs` 與
  `ai-supply-study.mjs` 彙總。
