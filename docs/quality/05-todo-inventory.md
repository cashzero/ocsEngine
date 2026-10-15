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
| `artillery-vs-facility` | `DECLARE_BARRAGE` 沒有設施目標 | 地面砲兵不能打港口或 Air Base，只有飛機與持有者自己的單位能損壞港口 | 給設施目標並付表列成本，實際打一次港口 | `docs/generator/03-coast-and-hydrology.md`；manifest `barrage.artillery` |
| `naval-shipping` | 無艦艇、登陸艇、兩棲登陸（18.0） | 只能在已持有的港口登陸 | 18.0 實作並實際對局 | manifest `naval-shipping` |
| `air-audit-probe` | 規則稽核探針沒有空軍檢查 | 空軍規則缺少探針層的回歸保護 | 探針加入空軍案例並通過 | `docs/rule-engine/air-power.md` |
| `glider-points` | 沒有獨立 Glider Points（14.10f） | 滑翔機運輸與一般空運共用能力 | 實作並在瀏覽器空運一次 | `docs/rule-engine/air-power.md` |
| `airborne-gpid` | 空降師使用佔位 GPID 900001–900005 | counter 不對應真實 BTR 棋子 | 以審核過的 GPID 取代 | `src/generation/oob/catalog.ts` |
| `para-gpid` | 傘兵營 counter 為產生器自訂 | 同上 | 同上 | `src/generation/oob/counter-corpus.ts` |
| `oob-name-import` | 重新匯入 OOB 名稱會遺失手寫的 Fallschirmjäger 與美軍第 13 空降師 profile | 重新匯入後這兩個 profile 消失 | 匯入腳本保留或重建這兩個 profile | `scripts/import-oob-names.mjs` |

### AI

策略現況見 `docs/ai/heuristic-policy.md`；關閉 AI 行為類 TODO 時，除了局部案例，還須通過 `docs/ai/evaluation.md` 的正確性要求，
並以 VP > Kill > Loss 對凍結的標準策略做交換陣營比較。

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `bot-stack-move` | AI 逐一移動與 overrun，不整疊行動 | bot 的 overrun 戰力偏弱 | bot 對局出現帶 companionIds 的 MOVE_PIECE 與多單位 overrun | `src/rules/query/candidates.ts` TODO(AI) |
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
| `bot-eastern-front` | 東歐地圖長距離推進的補給接力與守住遠方目標點 | 對 random-legal 勝率 80%（目標 90%），最後量測於 heuristic@1 | 以標準策略重跑東歐風格 20 局（交換座位、新種子）勝率 ≥ 90% | `docs/roadmap/11-ai-bot-wbs.md` B5 |
| `bot-reserve-reaction` | 沒有 Reserve、Reaction 反擊、Extender、Breakout 規劃；戰鬥預估不含 Surprise | 防守與突破能力受限 | 對局中出現這些行動且通過對戰比較 | `docs/ai/heuristic-policy.md` |

### 介面

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `overrun-selection-release` | overrun 結果顯示後選取被放開 | 玩家須再點堆疊才能續動 | 結果後仍選取存活的移動堆疊並可直接點目的地 | `03` ACT-17 |
| `roster-name-truncation` | 名冊列在 1680 寬度截斷長名稱（`Chmbln TF (Det. 2) / 1…`） | 看不到完整單位名稱 | `03` UI-02 PASS | `03` UI-02 |
| `preview-roster-count` | 預覽與名冊的單位數沒有說明：4 個第 2 回合才到的增援單位不在名冊，6 個 Garrison 營在名冊與地圖上但不在預覽與單位數 | 預覽 62、名冊 64，畫面上沒有解釋 | 預覽與名冊交代這兩類單位，或使用者改寫判準；`03` MAP-04 PASS | `03` MAP-04 |
| `unit-status-reserve` | Unit Status 沒有「released」與「barraged」列（投影未提供引擎使用狀態） | 這兩種狀態看不到 | 投影暴露後加列並在瀏覽器驗證 | `src/ui/unit-status.ts` |
| `pax-counter-art` | Pax counter 沿用 BTR「Repl EQ」的版面，只改字為 PAX；未取樣比對 BTR 的 Pax 補充 counter | Pax counter 的顏色與版面可能與原遊戲不同 | 取樣 BTR Pax counter 圖檔並逐項比對 | `docs/rule-engine/replacements.md` |
| `transport-art` | 運輸機輪廓為目測繪製 | 運輸機 counter 不是印刷樣式 | 依參考圖重繪並做視覺比對 | `src/ui/counter.ts` |
| `counter-fidelity` | CF5 三計數器堆疊與縮放 LOD 三級未驗證（CTR-05 已 PASS） | counter 視覺驗收 IN PROGRESS | `03` CTR-06、CTR-08 PASS 並驗證 LOD | `docs/roadmap/17-counter-fidelity-wbs.md` |
| `TODO-CM1` | `scripts/counter-lod-gate.mjs` 與 `scripts/desktop-deck-gate.mjs` 無法在現行 UI 執行 | 這兩個 gate 不能重跑 | 腳本更新後在現行 build 跑通 | `docs/ui/map.md` |
| `TODO-CM2` | Canvas 地圖的格子與 counter 不再是可 Tab 的元素，改為單一焦點＋方向鍵游標＋朗讀，未以報讀器實測 | 報讀器使用者只能以游標朗讀辨識格子與單位 | 以 NVDA 實際操作一個移動與一個攻擊並記錄結果 | `docs/ui/overview.md` |
| `defender-single-form` | 守方的補給、領頭單位、地形是三個接連的決策，改補給時不會預覽之後的賠率 | 守方要點三次且不能回頭修改 | 決策協調器接受一次送出多個答案（或可撤回），並在瀏覽器由守方一次送出 | `docs/ui/command-deck.md` |
| `enemy-zoc-display` | 地圖只標出「進入即停止」的可達格，沒有整張地圖的敵方 ZOC | 玩家看不出敵方 ZOC 範圍 | 地圖可顯示敵方 ZOC 並在瀏覽器檢視 | `docs/ui/map.md` |
| `compound-cost-review` | 複合行動（戰鬥、砲擊、空中任務）的成本與後果審閱未在每種可達交易上以真實選項驗證 | 確認前可能不清楚支付或後果 | 以合法交易、決策與取消的瀏覽器操作，記錄前後狀態 | `docs/ui/command-deck.md` |
| `deck-state-records` | 左欄 S0–S5 狀態（未選取、多單位堆疊與長名稱、移動、複合行動、載入／失敗／空清單、決策與交接）在兩種畫面尺寸沒有文字紀錄 | 文字或按鈕被擠壓的情況無法事後複查 | 兩種尺寸逐一操作並在 `docs/quality/evidence/` 記錄文字與控件邊界（截圖只在 `artifacts/` 審閱） | `docs/ui/command-deck.md` |
| `landing-port-view` | 海域局開局地圖置中，登陸港在畫面外 | 玩家要自己找港口 | 開 ports-only 遊戲並直接經可見的地圖／導覽找到港口 | `docs/quality/evidence/vp-allocation-2026-10-14/README.md` |
| `small-map-visual` | 小地圖的視覺驗收未做 | NG-11 無法升級 | 見來源 | `docs/game-flow/03-deployment-generator.md` |
| `objective-marker-preview` | New Game 預覽的目標仍是舊的金星、不顯示持有者；60% 縮放時十字標記偏小；己方鐵路綠帶疊在淺綠補給範圍上對比弱；一般格子的控制權不在地圖上標示 | 預覽與地圖的控制權資訊不一致或不易看清 | 修正後在瀏覽器檢視預覽、60% 縮放與 Trace Supply | `docs/quality/evidence/control-2026-10-05/RUN.md` |

### 地圖與產生器

| ID | 缺少的行為 | 使用者可見影響 | 關閉證據 | 詳細 |
|---|---|---|---|---|
| `map-appearance` | 地名是裝飾用的音節產生器；一格一地形（格內丘陵、部分森林無法表示）；沒有 Autobahn；並行道路與覆蓋填補耗時（`docs/generator/10-btr-scale-density.md`）；新外觀未重跑整合驗收 | 地圖與印刷地圖仍有差距；新外觀的整合流程無證據 | 地圖模型帶真實地名或使用者決定移除；重跑 New Game → 一整回合並記錄 MAP 列 | `docs/ui/map.md` |
| `road-exit-edge` | 地圖資料不記錄產生器的道路出口，出口格另有道路經過時不畫出地圖邊（24 張 32×24 圖中 189 個出口有 13 個） | 少數道路出口看不出通往地圖外 | 地圖資料記錄出口並全部畫出 | `docs/ui/map.md` |
| `case-blue-terrain` | Case Blue 地形與天氣（Hills、輕／重林、乾湖、草原、Volga 級河流、泥濘／冰凍）仍用 BtR 規則 | 東歐主題只有密度不同，地形規則相同 | 另立需求 | `docs/generator/11-eastern-europe-theme.md` |
| `east-small-objectives` | 最小的 16×12 東歐圖雙方起始 VP 可能不相等（預覽顯示 "Objectives are unbalanced"） | 小圖開局不公平 | seeds 1、0x0c500001、777 的 16×12 東歐預覽皆等 VP 且無警告 | `docs/game-flow/03-deployment-generator.md` 步驟 7 |
| `oob-naming-ui` | WWII 命名的 UI 驗收未做 | 命名只有單元測試證據 | 在瀏覽器檢視雙方編制名稱 | `docs/oob/random-oob-naming.md` |
| `PERF-7` | New Game 預覽 SVG 以整張地圖字串建立；地圖產生與 theater model 隨地圖約線性以上成長；大於 64×48 的地圖沒有在產品 build 上量過 | 地圖上限 256×256；128×96 已量到 Generate 約 4 s、Start 約 4.5 s，超過 3,000 ms 預算，更大的地圖未知 | `scripts/perf/browser-scale.mjs` 在 256×256 上 Generate 與 Start 各 < 3,000 ms，且 `compare-generation.mjs` 輸出不變 | `docs/quality/performance.md` |
| `large-map-generation` | 產生在頁面主執行緒上執行，單一步驟無法中斷或回報進度 | 大地圖時頁面在一個步驟內不回應輸入，Cancel 要等步驟結束 | 見來源 | `docs/game-flow/06-new-game-ui-flow.md` |

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
2. 補給 B3（付費來源偏好）、B4（定期補給線）：`docs/roadmap/09-supply-logistics-ux-wbs.md`。
3. 是否把 Breakdowns 提議的驗收列加入 `03`：`docs/rule-engine/breakdowns.md`。
4. 是否把控制權與 VP 顯示的 CTL-1～5 加入 `03`：`docs/quality/evidence/control-2026-10-05/RUN.md`。
5. SES-01（Pause）：產品沒有 Pause 控制項（`src/ui/controller.ts`：回合制遊戲不需要暫停），改寫該列或維持 `BLOCKED`。
6. 東歐主題的入口格數，或入口格不在鐵路上時的補給源規則；決定後才能把預設東歐圖的鐵路降到 Temperate 的一半以下。
7. 海上登陸平衡：沒有 inland entry 的一方只有一個 2 SP 港口時（實測只能上岸 8T／相位，補給表收入約 36T），
   敵方兵力是否調降，或部分師改從 Turn 2 經 inland entry 進場；比例固定或依上岸容量縮放、是否對稱、是否在設定中可覆寫。
   細節：`docs/generator/03-coast-and-hydrology.md` TODO (sea-landing balance)。
