# AI 現行策略與 VP 驗證

更新：2026-10-14。狀態：**PROMOTED，heuristic@66 為標準策略**。

標準策略為 `heuristic@66`，取代 v35。新版 main `45e700a` 上的獨立 80 場取得 935–721 VP（+214），遭遇 +84、攻擊 +130，成對區間 [0.787, 4.563]；合法完整重播、補給／前進稽核與完整品質檢查均通過。v65 選兵試驗已撤回。原始設計見 [M9 評分與規劃](M9-scoring-and-planning.md)與 [M9 Bot 架構](M9-bot-architecture.md)；逐版實驗、凍結資料與對戰證據見 [VP 策略報告](ai-vp-next-promotion-2026-10-14.md)及 [evidence](../quality/evidence/ai-vp-next-promotion-2026-10-14/README.md)。

## 1. 決策與評估優先順序

優先順序是 **VP > Kill > Loss**。合法性、完整遊戲與補給正確性是必要條件；在這些條件成立後，以 VP 增益判斷策略，再看敵方與我方 step 損失。迫使敵方斷補是有效進攻手段，不因對戰中出現 OOS 就判定策略有問題。

先避免電腦自行破壞補給，再改善進攻。每次候選只量測具體的策略差異；不把失敗批次延長到信賴區間變正，也不把開發批與獨立驗證合併。

## 2. 目前實作的 VP 規劃

實作位置：[heuristic.ts](../../src/ai/policies/heuristic.ts)、[analysis.ts](../../src/ai/analysis.ts)、[decisions.ts](../../src/ai/decisions.ts)。

- **控制權與分差**：取得中立的 2 VP，只增加我方 2；取得敵方持有的 2 VP，同時讓我方 +2、敵方 −2。目標分配、移動、保護已持 VP 與戰鬥目標評分使用這個分差價值；trace 分開標示 score-margin gain，不能把它稱為實際取得的原始 VP。
- **先保留現有守軍**：分配進攻群前，已持 VP 留下守軍；對手仍有後續回合時，依威脅保留足夠的現有強度，再分配剩餘單位。避免把主守軍送走後才要求遠處部隊補位。
- **遠距道路威脅**：一般機動保留原本的四格局部威脅；已持 VP 額外考慮可見敵軍沿公開道路、地形及 TEC 接近的可能性。若我方本回合先動，敵方可能本回合後動、下回合先動，故需考慮兩次 Movement。這是公開幾何的威脅估計，不是敵方未來行動必然合法的保證。
- **終局控制**：最後一位玩家沒有後續敵方 player turn 時，提高沿路取得 VP 的價值，移除針對後續回合的離開／駐守誘因。仍可能有合法 reserve reaction，因此最終有效性由完整對戰的 Game End 控制權驗證。
- **先後手**：最後回合選後手；遭遇戰 VP 落後時，v66 提早選後手。攻擊戰起始 VP 不對稱，不能直接把起始分差套成相同判斷。撤回這項早期先後手行為的 v62 在同種子對照中退步，未採用。

**v66 進攻進度**：CAPTURE／ASSAULT 的每格接近分數乘上「目標 VP／公開地圖目標平均 VP」，使路線進度也考慮目標價值。留守進度、直接取得 VP、先後手與補給保護不變。此改動在新版 main 45e700a 的開發 32 場為 +84 VP，獨立 80 場為 +214，通過 promotion。704 tests（8 skipped）、typecheck/build/smoke 及全部合法／重播／補給／前進稽核通過。登記種子為遭遇 1295000–1295019／1295100–1295119、攻擊 1296000–1296019／1296100–1296119。稽核曾混用 artifact 名稱與策略版本，已重開並改用實際候選陣營重播全部 80 場；修正與舊紀錄均保留。

計畫保存在目前 phase／segment 的 `BotPhaseMemory`；它不是原始設計中已完整落地的跨回合 formation mission 或 hysteresis 系統。實際介面以 [model.ts](../../src/ai/model.ts)及 [access.ts](../../src/ai/access.ts)為準。

## 3. 補給限制與合法進攻

補給預測由規則查詢提供：[relocation-impact.ts](../../src/rules/supply/relocation-impact.ts)與 [ration-budget.ts](../../src/rules/supply/ration-budget.ts)。Policy 讀取公開 action explanation，不直接讀取 `GameState` 或呼叫規則內部函式。

| 行動 | 標準 v66 的限制 |
|---|---|
| 一般移動、mode | 保留既有 trace 與個別糧食可取得量，包含留在原地的單位及載補給的卡車影響 |
| 可選補給支出 | 保留目前已分配的共同糧食需求；不能只看單一單位附近有 SP |
| Regular 戰後前進 | 第一個進入敵方 hex 的單位也檢查共同糧食與 trace／feed 影響；奪 VP 時優先選可供應的強者 |
| Overrun | 以清空目標且進攻者存活的條件預測，支付實際宣告成本與 internals 消耗，檢查共同糧食及其他友軍 trace；不預支隨機俘獲 SP |
| 最後補給階段後的前進 | 不為不存在的下一次友軍 meal 預留糧食；仍保留相應 trace／feed 保護 |

共同糧食預測會依下一次友軍 Supply 清除已付補給、已恢復 internals、airdrop 與已結束 combat transaction 的暫存承諾，再考慮必要 recovery。這是**目前位置與存量下的供應證據**，不保證敵方之後不會截斷路線，也不預支未來補給抵達。

新增測試使用實際 reducer 行動與完整續局：[combat-advance-supply](../../tests/ai/combat-advance-supply.test.ts)、[vp-advance](../../tests/ai/vp-advance.test.ts)、[vp-threat](../../tests/ai/vp-threat.test.ts)。既有 VP 下限與補給回歸仍保留；它們支持判斷，不能取代獨立完整對戰。

**TODO：共同糧食搜尋上限**。`assignRations` 目前最多搜尋 50,000 個節點，尚缺分量分解或精確後備；耗盡時可能漏掉可行的低優先糧食分配，讓可供應單位未被納入供應。關閉此技術債需對抗性配置的精確分配證據及完整對戰延遲驗證；目前測試與對戰不宣告此問題已解決。

## 4. 斷補歸因

每次 attrition 分開檢查 trace 失去、共同糧食／個別食物可取得量失去的觸發動作，再重播當時狀態與事件。保留以下原因：敵方行動或戰鬥、友軍地面／HQ 移動、戰後前進、敵方對我方攻擊的反應、增援／重建入場、資源使用／轉移，以及未解析原因。

`own-action` 或「由我方發起戰鬥」不足以證明 bot 笨拙；敵方 retreat 或 reaction 可能在我方發起的交易中切斷補給。一次 attrition 也可能同時有 trace 與 ration trigger，不能把兩個 trigger 當兩個損失。

實例：d133b1d 基底的歷史 1291116 對戰，候選在第 4 回合 revision 324 前進後失去 trace，但共同糧食仍可供應；敵方於 revision 335 放置增援後，糧食可取得量才由 1 降至 0，稍後第 7 回合發生 attrition。這不能僅憑前進動作被歸為 `own-action` 就判定當時未考慮補給。

## 5. 公開資訊與查詢邊界

[RuleProjection](../../src/rules/query/model.ts)現有公開 objective 控制權、攻擊戰勝利條件 `attackVictory`，以及 `objectiveRaidThreats`。遠距威脅由 [projection.ts](../../src/rules/query/projection.ts)根據已投影可見的 counter、公開印刷面、TEC、地圖與目前天氣計算；不使用隱藏 stack 成員、敵方 fuel 或私有移動 usage。未知的 future fuel／bridging 採樂觀的幾何估計。

`src/ai` 仍只透過 action access 與 projection 工作；規則層不依賴 AI。此策略更新不宣告完整 belief、Air 計畫、UI 人機座位與觀戰產品流程已完成。UI 驗收狀態以 [產品操作驗證計畫](../quality/03-product-operation-verification-plan.md)為準，不能由 CLI 對戰推升。

## 6. 獨立 promotion 驗證

每批固定 **80 場／40 對**：`TEMPERATE_INLAND`、`EASTERN_EUROPE`，各跑 `MEETING` 與 `AXIS_ATTACKS` 20 場。每組 10 對相同 map／OOB／deployment／rules 種子並交換候選陣營，完整跑八回合。新增對戰不使用已移除的 Mediterranean。

對手是凍結的 v35 自有 policy；雙方使用候選的同一份引擎與 generator。45e700a 上游已把標準 v35 改為支援新的重建價格／成對表格，本輪凍結該主線版本為對照；舊的 e801ce v35 快照與所有批次證據不修改。開跑前登記候選 source／build hashes、main 基底及全新種子。條件為：

1. 遭遇戰與攻擊戰的 VP delta 各為正。
2. 40 對平均 VP 增益的 `mean ± 2.1 × SE` 下界為正。
3. 全部合法完成八回合，無 rejection／error，重播 final state hash 相同；地圖、交戰與交換種子符合登記。
4. 補給及戰後前進預測與實際行動核對無違規，完整 typecheck、build、tests、smoke 通過。
5. 正式 promote、commit、push 與報告狀態一致。

不增加事後的「每個地圖子組都必須正增益」門檻；子組退步仍如實揭露。所有失敗批次獨立保留。

## 7. 目前證據與版本狀態

| 策略／基底 | 獨立場數 | VP delta | 遭遇／攻擊 delta | 成對區間 | 狀態 |
|---|---:|---:|---|---|---|
| v57／84d9d94 | 80 | +130 | +52／+78 | [0.409, 2.841] | 舊 generator 的條件通過；未以此發布到新 main |
| v57／d133b1d（artifact ID 58） | 80 | +10 | +10／0 | [−1.526, 1.776] | 未通過 |
| v61／d133b1d | 80 | +142 | +22／+120 | [−0.335, 3.885] | 未通過區間下界；合法性與補給稽核通過 |
| v65／d133b1d | 未啟動 | — | — | — | 671 tests passed、8 skipped；開發對照退步，不進入獨立驗證 |
| v66／d133b1d | 未啟動 | — | — | — | 671 tests passed、8 skipped；開發 +64，一般補給稽核通過；已 rebase |
| v66／45e700a（artifact 66-main） | 80 | +214 | +84／+130 | [0.787, 4.563] | 已 promote；704 tests passed、8 skipped；全部合法／補給／前進稽核通過 |

artifact 58 是同一 v57 在改變 VP 分配與攻擊勝利門檻的 main 上重跑時誤用的標籤，**不是新策略**；保留原始 trace 作為追溯資料。

v62 的先後手回退、v64 的 ASSAULT／CAPTURE 名額合併均在同種子開發對照中退步，未採用；v65 使用 v61 的配置與先後手行為，加上上述選兵試驗。其開發 32 場為 318–244 VP（+74），遭遇 +22、攻擊 +52；相較 v61 同組 +112 退步 38。全部合法完成並通過重播，32 場一般補給稽核零違規。這是已知種子的開發結果，不能替代 promotion 的獨立 80 場。詳細分數、失敗及超時紀錄維持在報告與 evidence，不用通過的測試覆蓋過去失敗，也不將過去失敗改列為通過；本次通過並 promote 的策略是 v66。

本批候選 229 次 Regular 前進中 223 次有共同糧食供應，其餘 6 次皆為第八回合補給階段之後；31 次成功 Overrun 全部實際有供應，全部稽核零違規。我方 step 損失 1100／對照 1033，attrition 329／292；VP 增益不代表損失也降低。當前批次沒有候選友軍戰後前進的斷補 trigger，但敵方行動、資源使用、入場與未解析原因仍需分開看，不能把 trigger 數當損失數或意圖證據。
