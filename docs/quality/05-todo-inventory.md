# TODO 清單

本文件是開放 TODO、未關閉的觀察問題與待使用者決定事項的唯一清單。每一項寫出缺少的行為、使用者可見影響與關閉證據
（`AGENTS.md`）。項目關閉時直接刪除該列並在 commit 訊息說明證據；不另寫日期段落或同步紀錄。

其他狀態不在這裡重複：

- 驗收列狀態：`03-product-operation-verification-plan.md`；統計用 `node scripts/quality/acceptance-summary.mjs --list`。
  非 `PASS` 的列本身就是待辦，不另列於此。
- 規則層缺口：`src/rules/manifest.ts` 各列的 `GAP:` 文字（`PARTIAL`、`DEFERRED`）；逐條規則落差見
  `docs/study/09-rules-vs-plan-gap-analysis.md` §4（TODO-R1、R11、R14 仍開啟）。
- 計畫內的工作項：各 `docs/roadmap/*-wbs.md`。

## 1. 開放 TODO

### 規則與遊戲內容

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `repl-tables-generated` | Variable Replacement Table 與 Rebuild Table 是產生器自訂，不是印刷版 | 補充與重建成本與原版遊戲不同 | 轉錄印刷表並以測試與瀏覽器核對 | `docs/rule-engine/replacements.md` |
| `repl-legacy-unit-migration` | 舊存檔的 REPLACEMENT 沒有 faces，維持舊的數量 counter | 舊存檔的補充單位不能移動，需開新局 | 保留歷史動作的存檔遷移，並實際讀舊檔、移動、重建、存檔、重播 | `docs/rule-engine/replacements.md` |
| `repl-natural-loss-ui` | 地面重建、合併與依表計價只在載入的訓練局面上走過瀏覽器 | 從新局經正常對戰損失再重建或合併的流程未驗證 | 從全新 New Game 經正常戰鬥損失單位，移動 Repl、重建或合併，並完成該回合 | `docs/rule-engine/replacements.md` |
| `naval-shipping` | 無艦艇、登陸艇、兩棲登陸（18.0） | 只能在已持有的港口登陸 | 18.0 實作並實際對局 | manifest `naval-shipping` |
| `air-audit-probe` | 規則稽核探針沒有空軍檢查 | 空軍規則缺少探針層的回歸保護 | 探針加入空軍案例並通過 | `docs/rule-engine/air-power.md` |
| `glider-points` | 沒有獨立 Glider Points（14.10f） | 滑翔機運輸與一般空運共用能力 | 實作並在瀏覽器空運一次 | `docs/rule-engine/air-power.md` |
| `airborne-gpid` | 空降師使用佔位 GPID 900001–900005 | counter 不對應真實 BTR 棋子 | 以審核過的 GPID 取代 | `src/generation/oob/catalog.ts` |
| `para-gpid` | 傘兵營 counter 為產生器自訂 | 同上 | 同上 | `src/generation/oob/counter-corpus.ts` |
| `oob-name-import` | 重新匯入 OOB 名稱會遺失手寫的 Fallschirmjäger 與美軍第 13 空降師 profile | 重新匯入後這兩個 profile 消失 | 匯入腳本保留或重建這兩個 profile | `scripts/import-oob-names.mjs` |
| `attack-balance` | 攻守戰的平衡在鐵路、卡車增援、hedgehog、架橋與預設值（Rail Cap 0.8／師、卡車點數依補給收入、攻方 2 倍師數）改動後沒有以 40 局新 seed 重新量測；16 局開發批中攻方 2 倍兵力沒有多得 VP，電腦每局只宣告約 8 次戰鬥（[證據](evidence/attacker-ratio-2026-10-16/README.md)） | 攻方或守方可能偏強；電腦攻勢不足時，對局結果不能用來判斷兵力比 | 先確認電腦會把兵力優勢轉成攻擊與 VP，再決定平衡目標，以兩種攻方各 40 局、新 seed 驗證並在 New Game 預覽確認數字 | `docs/roadmap/13-engagement-scenarios-wbs.md`、`15-rail-cap-wbs.md` |

### AI

策略現況見 `docs/ai/heuristic-policy.md`；關閉 AI 行為類 TODO 時，除了局部案例，還須通過 `docs/ai/evaluation.md` 的正確性要求，
並以 VP > Kill > Loss 對凍結的標準策略做交換陣營比較。

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `bot-stack-move` | AI 一般移動沒有整疊路線與 `companionIds` 規劃；逐單位查詢已會提供同格多單位 overrun | 部隊分開接近目標，途中較難保留同一進攻堆疊 | bot 對局出現有策略用途的 companionIds MOVE_PIECE，後續整疊 overrun 合法且重播相符，並通過凍結標準策略的對戰比較 | `docs/ai/heuristic-policy.md` |
| `bot-vp-predictive-metrics` | 已有首輪目標事件與預測比較工具，已完成歷史四結果的原因拆分與補給條件比較，仍缺跨政策預測驗證、完整目標承諾、共同支付下的有效到位量測、不同改善方向與前瞻驗證；尚無能可靠預測新策略 VP、Kill、Loss 與補給改善的指標 | 策略研究難以定位退步原因，可能反覆最佳化與 VP 無關的數字 | 真實重播對帳與量測不改變行為的證據、可重現指標比較工具，以及預先保存預測的驗證結果；記錄勝出指標與適用範圍，或未找到有效指標的證據，不以相關性代替策略提升 | [VP 預測指標](../ai/vp-metrics.md)；[工作項](../roadmap/11-ai-bot-wbs.md#7-vp-預測指標研究) |
| `bot-position-final-validation` | 舊終局預測用整局 metrics 去重，已證實合併含不同終局 VP 的對局；尚未以正確軌跡識別、同種子與策略分組重驗 | 可能誤判 Kill／Loss／Supply 或局勢指標對終局 VP 的額外預測力 | 用初始／終局 hash 與完整行動序列重建樣本，分組留出種子與來源，重跑各回合終局基準及額外指標，保留失敗子組與預測誤差、區間；更新主題文件的結論 | [局勢指標驗證](../ai/policy-errors.md#指標是否可用) |
| `bot-position-payability` | 可支付目標代理量未同步強制恢復後的內部存量、未共同支付燃料與戰鬥成本、未驗證進攻位置的來源可達性，空目標仍可重用同一單位 | 策略研究可能把可進攻判成付不起，或把不能同回合完成的奪點當作機會 | 規則引擎重現恢復後內部支付、燃料與戰鬥來源共用、移動後來源可達性、互斥空目標案例；每個計入目標有不重用單位及來源的合法行動／支付見證，再重跑相同窗口的新舊指標比較 | [量測修正順序](../ai/policy-errors.md#量測修正順序) |
| `bot-position-crt-expectation` | CRT 期望損失未指定攻方領隊而用 AR 0，未枚舉 Surprise；option、合法攻擊與整回合分配仍是簡化假設 | 可能錯判能造成損失的進攻為零風險，或拿單格最大值預測整回合 Kill／Loss | 合法領隊、Surprise 與 option 假設逐項對帳真實戰鬥解算；單格值與共同可行分配的回合總量分開命名，並用相同種子留出比較零事件、舊暴露量及修正版 | [量測修正順序](../ai/policy-errors.md#量測修正順序) |
| `bot-position-loss-attribution` | 損失拆分依整筆行動的 attrition 旗標；其餘 STEP_LOST 全稱戰鬥且以事件數代替實際 step，未獨立識別過度堆疊等消滅 | 研究可能把非戰鬥、跨階段耗損或多 step 消滅誤認為戰鬥效率，難以區分策略斷補與自行失誤 | 對帳原始前後 step 數及事件原因；覆蓋直接戰鬥、砲擊、attrition、過度堆疊與同筆跨階段混合案例，保留未知來源，重算受影響比較；斷補因果仍需局面接續對照 | [量測修正順序](../ai/policy-errors.md#量測修正順序) |
| `historical-ai-air-scope` | 歷史對戰以 `air=NONE` 參數認定無空軍，但指標研究抽查的攻擊戰含攻方場外飛機，80 份盤點對局均有空軍任務；其他批次尚未核對 | 無法把既有增益直接解讀為純地面策略增益，可能誤認符合無空軍驗收設定 | 依初始存檔與實際行動稽核受影響批次，修正主題文件的適用範圍，並讓後續要求無空軍的批次檢查實際場景；需重新驗證的 gate 保持開放 | [評估範圍](../ai/evaluation.md) |
| `consolidation-bot` | bot 不會合併單位 | bot 方留著兩個減員的相同師 | bot 對局中出現合併動作 | `docs/rule-engine/replacements.md` |
| `bot-air` | 只派 Air Barrage 與 refit；不派其他任務、不空運、不空降、不建 Air Base；空中待決選第一個合法選項 | 開啟空軍時 bot 明顯偏弱 | 開啟空軍的對局中 bot 有合理的其他任務與待決選擇，並通過對戰比較 | `src/ai/decisions.ts`；`src/ai/policies/heuristic.ts` |
| `bot-ration-search` | 共同口糧分配搜尋上限 50,000 節點，沒有分量拆解或精確後備 | 極端來源網路下可能少餵兵或擋下安全的支出 | 對抗性配置的精確分配證據，以及完整對局的延遲量測 | `src/rules/supply/ration-budget.ts` |
| `GS-AI` | 完整對局中仍有可救援的駐軍餓死；運補沒有同時規劃駐軍與機動部隊的路線與容量 | 有 SP 與卡車時，駐軍仍可能因救援太晚或資源被低價值運補搶走而餓死；阻擋 AI 驗收 | 重跑自然劇本，每個餓死案例保存 Movement 起點、合法運補方案與實際行動；可救援者全部存活，不可救援者有規則邊界的證據 | `tests/ai/garrison-supply.test.ts` |
| `bot-hq-logistics-plan` | 沒有 HQ／卡車接力：HQ 只在不破壞既有 trace 時移動 | 需要協同的 HQ 前推被延後 | 對局中完成 HQ 接力，逐筆支付都可履行，且 VP 比較不退步 | `docs/ai/heuristic-policy.md` |
| `bot-relocation-coverage` | 補給預判只涵蓋一般移動、切模式、戰後前進、Overrun、撤退；鐵路、海運、breakdown、`DISPLACEMENT_HEX` 未預判 | 這些行動仍可能讓友軍斷補 | 各行動種類有預判並與實際 reducer 比對，跑到下一次 Supply | `src/ai/decisions.ts` |
| `bot-advance-first-entry` | 首次進入有敵方運輸單位的格、與 Overrun 成功後強制進駐的補給風險未預判 | 有價值的攻擊後可能自己餓損 | 不偷看骰子的成功／退卻／俘獲預判，與實際 reducer 比對，完整續局並通過對戰比較 | `docs/ai/heuristic-policy.md` |
| `bot-recovery-allocation` | 強制的內部存量恢復依現有順序扣款，未最佳化來源與單位順序 | 可能留下較少口糧 | 不同可達來源的真實局面中證明較優分配且不卡住 Supply | `src/ai/policies/heuristic.ts` |
| `bot-rebuild-plan` | 重建準備只用「剩餘超過 3 回合」門檻；被移除的固定單位釋出的 Pax／Eq 不在同一階段重新分配；沒有規劃重建部隊到達目標點的時間 | 補充可能閒置一個階段；重建部隊可能來不及影響 VP | 含固定與機動單位共用補充的真實快照，以及不同距離的重建到達見證，完成終局 VP 對照 | `docs/ai/heuristic-policy.md` |
| `bot-trace-gain-scan` | 動作後 trace 修正只查分數最高的 12 個候選 | 可能錯過排序較低、可供補的 VP 路線 | 保存遺漏快照，擴大到完整候選或等價評分，並量測延遲 | `src/ai/policies/heuristic.ts` |
| `bot-bridging` | 電腦不會為了過河把工兵或 HQ 以戰鬥模式放到河邊（橋存在時會使用） | 電腦在河流防線前的進攻比人類弱 | 進攻路線被河擋住時 bot 架橋；bot 互打存檔中出現經工兵橋過河的移動，0 錯誤、重播相符 | `docs/roadmap/16-bridging-wbs.md` |
| `bot-eastern-front` | 東歐地圖長距離推進的補給接力與守住遠方目標點 | 對 random-legal 勝率 80%（目標 90%），最後量測於 heuristic@1 | 以標準策略重跑東歐風格 20 局（交換座位、新種子）勝率 ≥ 90% | `docs/roadmap/11-ai-bot-wbs.md` B5 |
| `bot-reserve-reaction` | 沒有 Reserve、Reaction 反擊、Extender、Breakout 規劃；戰鬥預估不含 Surprise | 防守與突破能力受限 | 對局中出現這些行動且通過對戰比較 | `docs/ai/heuristic-policy.md` |
| `bot-defender-counterattack` | 攻擊戰的守方完全不組主攻、不反攻（heuristic@85 的權宜做法）。正確的做法是只在有優勢時反攻：賠率夠、局部兵力佔優，或能切斷攻方補給；v79 的反攻不分有無優勢，接續測試中拿掉它守方每局少損失 2.5 step，但攻方斷補的單位也變少（[證據](evidence/ai-defender-assault-continuation-2026-10-18/README.md)） | 守方在攻方部隊突出、斷補或兵力薄弱時也不會奪回目標點，攻方不必防範反擊 | 有條件反攻的策略在局面接續測試中，Kill − Loss 與 VP 不比完全不反攻差，攻方斷補單位數多於完全不反攻，並通過升級流程 | `docs/ai/heuristic-policy.md` |
| `bot-force-concentration` | 攻方不集中兵力：主攻群以守軍原始戰力 2.5 倍組成、不看地形欄位與 hedgehog；單位逐一以自己和目的地同格友軍判斷暴露，停在敵前 2–3 格；戰鬥與砲擊的補給項讓多數攻擊與砲擊低於門檻（[研究](evidence/ai-force-concentration-v79-2026-10-16/README.md)）。候選 v81 的地形換算、集結與砲兵配屬讓守方與遭遇戰較好，但用在攻擊戰攻方時每一種都比 v79 差（連配砲與 SP 計價也是），v81–v83 的分角色規劃已刪除，v84 照 v79 下（[v81 開發量測](evidence/ai-assault-v81-development-2026-10-17/README.md)、[v82](evidence/ai-assault-v82-development-2026-10-17/README.md)） | 攻方每回合只打約 1.4 次、多為弱小 stack，有守軍的目標點常不被攻擊；兵力比與平衡無法用電腦對局判斷 | `scripts/ai-concentration-study.mjs` 量到主攻目標戰鬥時貼近的戰力與欄位提高、每回合攻擊次數與 index 6 以上的攻擊增加，且通過凍結標準策略的對戰比較 | `docs/ai/heuristic-policy.md` |

### 介面

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `computer-main-thread` | 電腦在頁面主執行緒決策與 dispatch，無法中斷 | 預設大小單一決策最大約 0.65 s（p95 約 0.23 s）頁面不回應輸入，Pause 於該行動結束後才生效；更大的地圖更久 | 決策移到 Web Worker 或可中斷，在 64×48 的瀏覽器操作中 Pause 於 100 ms 內生效（`03` BOT-09） | `docs/ui/computer-players.md` |
| `computer-mid-step-load` | 步驟中途讀檔，電腦不記得該步驟已做的計畫（`BotPhaseMemory`） | 讀檔後電腦該步驟其餘部分的決定可能與未中斷時不同（仍合法、確定） | 步驟記憶可由局面重建或隨存檔保存，並以同一存檔「連續跑」與「中途讀檔再跑」比對決策序列 | `docs/ai/architecture.md` |
| `logistics-helper-scope` | 原 Phase B 延伸需求：自動重組 TP、具體敵方威脅判讀、任務模式預覽、獨立戰鬥／砲擊付費試算、尚未確認的堆／Extender 變更預測 | 玩家須手動調整 TP、檢視威脅及戰鬥草稿；Logistics 預測只針對當前已確認局面 | 實作各延伸能力並以真實動作驗證預覽、確認／取消、成本及風險結果；不得以 SUP-B01–08 通過推定完成 | `docs/gameplay/logistics.md`；`docs/roadmap/09-supply-logistics-ux-wbs.md` |
| `logistics-benchmark` | 尚未對相同 T1 任務量測助手的完整互動數並與 A0 的 11 次比較 | 後勤操作是否實際減少尚無等條件數字 | 凍結 T1 輸入、完整計數運補與燃料的玩家互動，保存影片或操作文字並與 A0 比較；數字門檻由使用者決定 | `docs/roadmap/09-supply-logistics-ux-wbs.md` |
| `logistics-multiphase` | 規劃器不保留跨階段排程 | 當前 Movement 不能送達的任務須分次下指令 | 跨階段排程經實際完整對局，待決、交接、存讀與重播一致 | `docs/gameplay/logistics.md` |
| `logistics-multimodal` | 卡車規劃器未整合鐵路、空運與海運 | 這些運補方式仍須走各自手動操作 | 每種運輸納入同一計畫、預覽成本並經完整回合驗證 | `docs/gameplay/logistics.md` |
| `counter-role-model` | 深層 counter 型別仍非用途專用模型，沒有完成獨立的用途與依賴調查 | 擴充補給／貨物模型仍依賴通用 piece 與關係編碼 | 完成依賴調查、決定模型邊界並以 roster／選取卡／燃料／存讀流程驗證 | `docs/roadmap/09-supply-logistics-ux-wbs.md` |
| `overrun-selection-release` | overrun 結果顯示後選取被放開 | 玩家須再點堆疊才能續動 | 結果後仍選取存活的移動堆疊並可直接點目的地 | `03` ACT-17 |
| `preview-roster-count` | 預覽與名冊的單位數沒有說明：4 個第 2 回合才到的增援單位不在名冊，6 個 Garrison 營在名冊與地圖上但不在預覽與單位數 | 預覽 62、名冊 64，畫面上沒有解釋 | 預覽與名冊交代這兩類單位，或使用者改寫判準；`03` MAP-04 PASS | `03` MAP-04 |
| `unit-status-reserve` | Unit Status 沒有「released」與「barraged」列（投影未提供引擎使用狀態） | 這兩種狀態看不到 | 投影暴露後加列並在瀏覽器驗證 | `src/ui/unit-status.ts` |
| `pax-counter-art` | Pax counter 沿用 BTR「Repl EQ」的版面，只改字為 PAX；未取樣比對 BTR 的 Pax 補充 counter | Pax counter 的顏色與版面可能與原遊戲不同 | 取樣 BTR Pax counter 圖檔並逐項比對 | `docs/rule-engine/replacements.md` |
| `transport-art` | 運輸機輪廓為目測繪製 | 運輸機 counter 不是印刷樣式 | 依參考圖重繪並做視覺比對 | `src/ui/counter.ts` |
| `counter-fidelity` | CF5 指定 NG-07 套件的完整回合及同 counter 狀態存讀／重播尚未有同次實機紀錄；三 counter 與 LOD 已驗證 | CTR 列已通過，但整個 CF5 工作包仍缺回合／持久化的連續證據 | 在 NG-07 依 CF5 第 5 項完成全回合、狀態變化、存讀與重播，複查兩種尺寸畫面 | `docs/roadmap/17-counter-fidelity-wbs.md` |
| `TODO-CM1` | `scripts/counter-lod-gate.mjs` 與 `scripts/desktop-deck-gate.mjs` 無法在現行 UI 執行 | 這兩個 gate 不能重跑 | 腳本更新後在現行 build 跑通 | `docs/ui/map.md` |
| `TODO-CM2` | Canvas 地圖的格子與 counter 不再是可 Tab 的元素，改為單一焦點＋方向鍵游標＋朗讀，未以報讀器實測 | 報讀器使用者只能以游標朗讀辨識格子與單位 | 以 NVDA 實際操作一個移動與一個攻擊並記錄結果 | `docs/ui/overview.md` |
| `defender-single-form` | 守方的補給、領頭單位、地形是三個接連的決策，改補給時不會預覽之後的賠率 | 守方要點三次且不能回頭修改 | 決策協調器接受一次送出多個答案（或可撤回），並在瀏覽器由守方一次送出 | `docs/ui/command-deck.md` |
| `enemy-zoc-display` | 地圖只標出「進入即停止」的可達格，沒有整張地圖的敵方 ZOC | 玩家看不出敵方 ZOC 範圍 | 地圖可顯示敵方 ZOC 並在瀏覽器檢視 | `docs/ui/map.md` |
| `compound-cost-review` | 複合行動（戰鬥、砲擊、空中任務）的成本與後果審閱未在每種可達交易上以真實選項驗證 | 確認前可能不清楚支付或後果 | 以合法交易、決策與取消的瀏覽器操作，記錄前後狀態 | `docs/ui/command-deck.md` |
| `deck-state-records` | 左欄 S0–S5 狀態（未選取、多單位堆疊與長名稱、移動、複合行動、載入／失敗／空清單、決策與交接）在兩種畫面尺寸沒有文字紀錄 | 文字或按鈕被擠壓的情況無法事後複查 | 兩種尺寸逐一操作並在 `docs/quality/evidence/` 記錄文字與控件邊界（截圖只在 `artifacts/` 審閱） | `docs/ui/command-deck.md` |
| `landing-port-view` | 海域局開局地圖置中，登陸港在畫面外 | 玩家要自己找港口 | 開 ports-only 遊戲並直接經可見的地圖／導覽找到港口 | `docs/quality/evidence/vp-allocation-2026-10-14/README.md` |
| `rail-cap-browser` | 沒有在瀏覽器把一整個師集合到車站後一起用鐵路運送 | 整師多單位上車尚未經實際操作；前線控制與拒絕原因已有證據 | 瀏覽器中把一個師的全部單位用鐵路運送並核對成本、位置與後續行動限制 | `docs/roadmap/15-rail-cap-wbs.md` |
| `oob-revision-ui` | OOB 0.4.0 的新計數器（反坦克、突擊砲、虎式）、駐守單位與 New Game 預覽數字沒有在瀏覽器檢視（OOB-R8） | 計數器數值或駐守單位顯示錯誤不會被發現 | 瀏覽器 New Game 預覽與遊戲中辨識新單位與駐守單位，計數器數值與 BTR 一致 | `docs/roadmap/12-oob-revision-wbs.md` |
| `small-map-visual` | 16×12 東歐圖的起始 VP 平衡只有自動化回歸（seeds 1、0x0c500001、777），未在瀏覽器檢視 | 預覽或開局後的分數可能與產生的配置不同；NG-11 無法升級 | 在瀏覽器預覽並開始這三個 seed，雙方起始 VP 相等且沒有 "Objectives are unbalanced" 警告 | `docs/game-flow/deployment.md` |
| `deployment-browser-check` | 分區部署、部隊後放補給堆、戰鬥模式前線只有自動化種子掃描，未在瀏覽器檢視 | 前線可能不均、補給堆位置奇怪、首回合仍可能摸到補給堆 | 瀏覽器中預設 MEETING 與 ALLIED_ATTACKS 各一局：HQ 分布在前線、獨立部隊分散、每個補給堆在自己部隊下、前線單位為戰鬥面、Allied 首個 Movement Segment 的可達範圍內沒有 Axis 補給堆 | `docs/game-flow/deployment.md` |
| `scn-start-trace` | 開局有少數單位不在 trace 內（部署估計與規則引擎不一致，原因未查明；seed 57 Axis 進攻時 Allied 91%） | 該局有單位第 1 回合未移動就會擲消耗 | 找出不一致原因並修正，100 seed × 三種劇本逐單位查詢每方 ≥ 95% | `docs/roadmap/13-engagement-scenarios-wbs.md` |
| `objective-marker-preview` | New Game 預覽的目標仍是舊的金星、不顯示持有者；60% 縮放時十字標記偏小；己方鐵路綠帶疊在淺綠補給範圍上對比弱；一般格子的控制權不在地圖上標示 | 預覽與地圖的控制權資訊不一致或不易看清 | 修正後在瀏覽器檢視預覽、60% 縮放與 Trace Supply | `docs/quality/evidence/control-2026-10-05/RUN.md` |

### 地圖與產生器

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `map-appearance` | 地名是裝飾用的音節產生器；一格一地形（格內丘陵、部分森林無法表示）；沒有 Autobahn；並行道路與覆蓋填補耗時（`docs/generator/map-styles.md`）；新外觀未重跑整合驗收 | 地圖與印刷地圖仍有差距；新外觀的整合流程無證據 | 地圖模型帶真實地名或使用者決定移除；重跑 New Game → 一整回合並記錄 MAP 列 | `docs/ui/map.md` |
| `road-exit-edge` | 地圖資料不記錄產生器的道路出口，出口格另有道路經過時不畫出地圖邊（24 張 32×24 圖中 189 個出口有 13 個） | 少數道路出口看不出通往地圖外 | 地圖資料記錄出口並全部畫出 | `docs/ui/map.md` |
| `case-blue-terrain` | Case Blue 地形與天氣（Hills、輕／重林、乾湖、草原、Volga 級河流、泥濘／冰凍）仍用 BtR 規則 | 東歐主題只有密度不同，地形規則相同 | 另立需求 | `docs/generator/map-styles.md` |
| `oob-naming-ui` | WWII 命名的 UI 驗收未做 | 命名只有單元測試證據 | 在瀏覽器檢視雙方編制名稱 | `docs/oob/random-oob.md` |
| `PERF-7` | New Game 預覽 SVG 以整張地圖字串建立；地圖產生與 theater model 隨地圖約線性以上成長；大於 64×48 的地圖沒有在產品 build 上量過 | 地圖上限 256×256；128×96 已量到 Generate 約 4 s、Start 約 4.5 s，超過 3,000 ms 預算，更大的地圖未知 | `scripts/perf/browser-scale.mjs` 在 256×256 上 Generate 與 Start 各 < 3,000 ms，且 `compare-generation.mjs` 輸出不變 | `docs/quality/performance.md` |
| `large-map-generation` | 產生在頁面主執行緒上執行，單一步驟無法中斷或回報進度 | 大地圖時頁面在一個步驟內不回應輸入，Cancel 要等步驟結束 | 在最大地圖上於瀏覽器量測：每個步驟中頁面都回應輸入、Cancel 在 250 ms 內停止、超過 1 秒的步驟顯示步驟內進度，且 Worker 產生的套件與 `prepare` 相同（scenario hash 與初始 state hash） | `docs/game-flow/new-game-ui.md` |
| `sea-landing-balance` | 無 inland entry 攻方的兵力時序與補給吞吐量尚未校準；少量 bot 敏感度測試不能選定可靠預設 | 海運進攻可能被守方反擊切斷補給線，設定難度不穩定 | 先確認 bot 運補、進攻與斷補原因，依比例、回合、容量及雙向進攻取得配對結果；候選設定經獨立種子與實際玩家流程驗證 | `docs/game-flow/reinforcement-balance.md` |
| `reinforcement-options` | 雙方比例選單、輸入與首批陸路／海運進場已驗證；攻方無 inland entry 時自動提高守方預設尚未實作 | 玩家可手動設定，但設定海運進攻時仍須自行提高守方援軍比例 | 決定並實作自動預設及覆寫契約；在 UI 切換兩種進攻方向與 inland entry、檢查預設／覆寫，並完成設定首批回合的進場 | `docs/game-flow/reinforcement-balance.md`；`03` NG-15 |
| `arrival-merged-selection` | 放置補給援軍與既有補給堆合併後，左欄仍選取被合併而 eliminated 的 0 SP 援軍棋子 | 實際已進場但畫面顯示 eliminated／0T，容易誤以為進場失敗 | 合併後改選保留的補給堆或清除選取，並在瀏覽器重走一次進場合併、確認畫面與實際補給一致 | `docs/quality/evidence/reinforcement-select-2026-10-15/README.md` |
| `turn-limit-default-evidence` | 預設 Turn limit `round((寬+高)/5)` 只由標準 bot 的 144 局（每組 6–10 局、40 回合上限）估計；時間指標的 R² 只有 0.04–0.17，且沒有人類對局或其他 AI 的資料；New Game 欄位在地圖尺寸變動時自動更新的行為只有單元測試，沒有在瀏覽器操作過 | 預設回合數可能對某些地圖或玩法偏長或偏短；玩家可手動覆寫 | 在瀏覽器從 New Game 改變地圖尺寸並確認回合數欄位跟著變、手動改後不再被覆寫、「Use the default」可恢復；加入更多局數或人類對局後重新擬合並更新 `docs/game-flow/turn-limit.md` | `docs/game-flow/turn-limit.md`、`docs/quality/evidence/turn-limit-2026-10-15/` |

### 存檔與工作階段

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `session-reload` | 重新整理頁面會失去遊戲，且無聲換成預設新局（沒有 beforeunload 提示、沒有復原提示、網址 `#new-game` 會重新打開對話框；`03` SES-09 FAIL） | 意外重新整理即失去進度，且畫面上看不出被換掉 | `03` SES-09 PASS | `03` SES-09 |
| `load-same-scenario` | 只能讀回同一劇本的存檔 | 不能讀另一個 New Game 的存檔 | 讀入不同劇本的存檔並繼續遊戲 | 同上 |

## 2. 沒有對應驗收列的觀察問題

| 問題 | 觀察到的情況 | 關閉證據 |
|---|---|---|
| 交接對象文字相反 | 螢幕持有者不是應行動的一方時，頂部列寫「<持有者> to act」，左欄寫「<另一方> commander to act」（手動交接後的 Allied Reinforcement Phase 與每次 Player Turn 交換時） | 兩處文字一致並在瀏覽器重看；2026-10-04 觀察，之後未重新確認 |
| 戰後提示與地圖不一致 | Allied 攻擊 1509 消滅 HQ 後，advance 提示寫「1509 is vacant」，地圖仍標示該格有 enemy Truck | 同一情境重跑時提示與地圖一致；2026-10-04 觀察，之後未重新確認 |

## 3. 待使用者決定

1. 空中任務是否「每段都停下」，以及空戰的交接次數。
2. 補給變體，以及 B3（付費來源偏好）、B4（定期補給線）：`docs/roadmap/09-supply-logistics-ux-wbs.md`。
3. 是否把 Breakdowns 提議的驗收列加入 `03`：`docs/rule-engine/breakdowns.md`。
4. 是否把控制權與 VP 顯示的 CTL-1～5 加入 `03`：`docs/quality/evidence/control-2026-10-05/RUN.md`。
6. 東歐主題的入口格數，或入口格不在鐵路上時的補給源規則；決定後才能把預設東歐圖的鐵路降到 Temperate 的一半以下。
8. 是否要做電腦難度等級（目前只有標準策略，New Game 的電腦座位沒有難度選項）：`docs/roadmap/11-ai-bot-wbs.md` §5。
7. 援軍的具體預設比例、首批回合、整師取樣與分批排程，待平衡評估後決定；雙方皆可設比例、海運攻方對應的守方預設較高、排程必要時可自動提前至 T2 的行為由使用者確認保留。契約與評估見 `docs/game-flow/reinforcement-balance.md`。
