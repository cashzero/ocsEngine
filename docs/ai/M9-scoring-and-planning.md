# M9 Bot 評分與規劃

狀態：**PLANNED**（2026-10-06 設計）。架構與介面見 [M9 Bot 架構](M9-bot-architecture.md)；步驟與驗收見
[M9 AI Bot WBS](../roadmap/11-ai-bot-wbs.md)。所有權重是初始值，必須在 B5／B6 以 seed batch 校準並寫入 versioned 設定檔，
不得以固定 hex、unit／formation 名稱或 seed 特判調整行為。

## 1. 決策階層

```text
Operational plan（每個 player turn 開始時重算一次）
  objective posture：ATTACK / HOLD / SCREEN / IGNORE
  group missions：每個 formation（或獨立單位群）一個 mission + 目標區
  reserve 配額、後勤需求
        │
        ▼
Phase planner（每個 phase／segment 開始時；結果不符預期時 replan）
  Reinforcement · Movement · Supply · Reaction · Barrage · Combat · Exploitation
        │  產生有序的 plan steps（意圖，不是 action）
        ▼
Action scorer（每一步）
  plan step → 找到本 revision 合法 candidate → score breakdown → dispatch
        │
        ▼
Decision responders（任何時刻，pending decision 屬於我時）
```

為什麼要 phase plan：OCS 一個 Movement Phase 可能有 40+ 個單位，逐 action 貪婪選擇會讓先動的單位佔走好位置、
後面單位無處可去，也無法協調「先 barrage 再攻擊」「先開路再 exploit」。Plan 只是意圖；每一步仍必須對應當下的合法 candidate，
不能對應就 replan，因此 plan 錯誤不會變成非法 action。

## 2. 情勢分析（AnalysisCache，純計算，revision 為 key）

| 分析 | 計算 | 用途 |
|---|---|---|
| 距離場 | 以公開 TEC 與 mobility class（Track／Truck／Leg）在公開地圖上做 Dijkstra（binary heap）；自己的單位改用 `getMovementRange` | 敵方可達範圍、到 objective 的路程 |
| 敵方威脅 | 每個可見／估計的敵 stack，把攻擊強度投射到它下個 player turn 可達的 hex（MA + 1 hex），隨距離衰減 | 單位落點安全性、前線 |
| 我方支援 | 同上投射我方強度 | 局部兵力比 |
| 前線 | 威脅與支援的交界 hex 帶；ZOC hex 標記 | 部署、screen、reserve 位置 |
| 補給覆蓋 | `getTraceCoverage(seat, null)` 與各 formation 的 coverage；`getSupplySources` | 不把單位移出補給範圍 |
| Objective 價值 | VP × 緊迫度（剩餘回合越少越高）× 控制狀態（我方／敵方／無人） | operational posture |
| 地形防禦值 | 公開 TEC 的 combat 效果、河流 hexside | 防守落點與攻擊目標選擇 |

## 3. Operational plan

1. **Objective posture**：每個 objective 計算 `value = VP × urgency`、`局部兵力比 = 我方可在 2 回合內投入的強度 / 敵方估計守備強度`、
   `距離成本`。
   - 敵方控制且兵力比 ≥ 1.5 → `ATTACK`；我方控制且受威脅 → `HOLD`；兵力不足但要拖延 → `SCREEN`；其餘 `IGNORE`。
   - 臨近 turn limit 時，urgency 對「回合結束前能否到達」做硬性截斷：到不了的 objective 不再分配兵力。
2. **Group missions**：以 formation 為分配單位（同 formation 共享 fuel 12.5c A 與 trace 路線，保持 cohesion 便宜）；
   以 assignment（價值 / 距離成本，貪婪 + 一輪交換改善）把 formation 分到 `ATTACK x`、`HOLD y`、`SCREEN 區段`、`RESERVE`。
3. **Reserve 配額**：機械化兵力的 20–30% 保持 Reserve mode 於前線後方 2–4 hex，供 Reaction／Exploitation。
4. **Hysteresis**：上一個 player turn 指派的 mission（由公開歷史推得）有加分，除非價值下降超過門檻，避免每回合換目標。

## 4. Phase planners

### 4.1 Reinforcement
- 每個抵達單位：選 entry hex 使其到所屬 mission 目標的距離最短，且不在敵方威脅高的 hex；同 formation 盡量同 hex 群。

### 4.2 Movement Phase
順序：mode → fuel → breakdown → 移動（含 overrun）→ 物流（B6）→ 結束 phase。

| 子步驟 | 規則 |
|---|---|
| Mode | 距前線 ≥ 敵方威脅半徑 + 2 且走公路 → Strat；預定攻擊的單位 → Combat；reserve 配額 → Reserve；其餘 Move |
| Fuel | 本 phase 會移動的機械化單位才付；同 formation 有 ≥ 3 個需要 fuel → Formation Method（1 SP），否則比較 HQ／Single-Unit Method 成本（用 `getFuelPreview`） |
| Breakdown | 只在 mission 需要覆蓋的 hex 數 > 可用單位數，且單位 ≥ 2 steps 時 |
| 移動指派 | 對每個要動的單位取 `getMovementRange`，以 §5 的 move score 為每個 (unit, destination) 打分，再做 stacking（RE 上限）約束下的指派；先動後方與遠距單位，前線單位最後動以保持 ZOC 牆 |
| Overrun | 路徑上的弱 stack，若 draft odds 達 overrun 門檻且期望值為正，插入 overrun step |
| 結束 | 剩餘所有 step 分數 ≤ 0 → ADVANCE_SEQUENCE（trace 記錄「無正分行動」） |

### 4.3 Supply Phase
- `CHECK_SUPPLY`：對無 trace 的單位，比較「付 SP 讓它在補給中」與「讓它 OOS」的價值（step 價值 × 攻擊計畫是否需要它）；
  資源稀缺時優先保留攻擊方向的 SP。
- `CHOOSE_FORMATION_TRACE`：選擇使最多單位在補給中、且不經過敵 ZOC 的路線。
- `RECOVER_INTERNALS`、`ATTEMPT_BREAKOUT`：依 B6 的 SP 預算決定。

### 4.4 Barrage（Reaction／Combat／Exploitation 的 Barrage segment）
- 只在「同一 phase 有地面攻擊計畫打這個 hex」或「目標是高價值且暴露的單位（HQ、dump 旁）」時 barrage；
  barrage 與後續攻擊綁成同一個 attack plan 一起評分（避免 BCS 的「只轟不攻」）。
- 價值 = P(DG) × 攻擊 odds 改善價值 + P(step loss) × step 價值 − Token 成本 × SP 稀缺係數。

### 4.5 Combat
1. 由 `getActionCandidates(DECLARE_COMBAT)` 取得候選，以 draft explanation 讀 odds、DRM、補給費用。
2. 期望值：以公開 CRT 與 Surprise 表算結果分布，
   `EV = Σ P(result) × (敵 step 損失價值 + 奪點機率 × objective 價值 + advance 價值 − 我方 step 損失價值)` − 攻擊補給成本。
3. 只有 EV > 門檻且最差 10% 結果不會讓關鍵 stack 被殲滅時才宣告。
4. 單位互斥：每個單位一 phase 只參加一個攻擊；以 EV 由高到低貪婪分配，每次戰鬥結束後 replan（戰果、retreat、advance 會改變後續最優）。

### 4.6 Reaction（對方 player turn 中）
- Release reserve：對方突破造成我方 objective 或補給線的威脅超過門檻時，release 並反擊或堵口。
- Barrage：同 4.4，但以打斷對方下一步 exploitation 為主。

### 4.7 Exploitation
- 有 Exploit 標記的單位：優先切斷敵方補給線、奪 objective、包圍；之後的 combat 同 4.5。

### 4.8 Logistics（B6，Movement Phase 中）
- 需求估計：下一個 player turn 的 fuel（移動中的機械化 formation）+ 計畫攻擊的 combat supply + 補給檢查預估。
- 供給：dump 存量、卡車容量、supply source 位置。
- 規劃：把 SP 從後方 dump 用卡車送到攻擊方向的 HQ 附近；dump 不放在敵方下回合可達的 hex；
  需要延伸補給時組 extender；即將被奪的 dump 若無法撤離則 BLOW_DUMP。

## 5. Move score（單位 × 目的地）

| 項目 | 方向 | 初始權重 | 說明 |
|---|---|---|---|
| `missionProgress` | + | 10 | 到 mission 目標的路程縮短量（以距離場計） |
| `objectiveHold` | + | 15 | 落在需要 HOLD 的 objective 或其相鄰防線 |
| `terrainDefense` | + | 4 | 落點地形與河流 hexside 防禦值（公開 TEC） |
| `threatExposure` | − | 12 | 落點的敵方威脅 / 我方防禦強度；超過門檻則大幅扣分 |
| `supplyCoverage` | − | 20 | 落點在 trace coverage 外 |
| `cohesion` | + | 3 | 與同 formation、HQ 範圍的距離 |
| `zocLine` | + | 5 | 補上前線 ZOC 缺口 |
| `stackingWaste` | − | 2 | 落點 RE 使用率過高或過低 |
| `oscillation` | − | 30 | 回到本 phase 已離開的 hex |
| `logisticsExposure` | − | 25 | 卡車、dump、HQ、砲兵落在敵方下回合可達範圍 |

## 6. Pending decision responders

| Decision | 原則 |
|---|---|
| FIRST_PLAYER | 我方有攻勢 posture 且敵方前線薄弱 → 先手；否則後手以利 double turn 判斷（以 objective 與兵力比簡式評估） |
| SUPPLY_SOURCE | 選剩餘量最大、離前線最遠且同 phase 不需要的 dump |
| DEFENDER_LEAD／DEFENDER_TERRAIN | 選使攻方 DRM／odds 最差的選項（從選項 label 與 draft facts） |
| STEP_LOSS／ATTRITION_LOSS／OVERSTACK_ELIMINATION | 先犧牲 step 價值最低者（獨立小單位 > 主力；保留 HQ、砲兵） |
| OPTION_SPLIT | 比較 retreat 後的威脅暴露與 step 損失，取期望價值較高者 |
| RETREAT_HEX／DISPLACEMENT_HEX | 補給內、敵威脅最低、不 overstack、靠近我方前線的 hex |
| ADVANCE_HEX | 奪點或切斷補給線價值最高的 hex；advance 後暴露過高則不 advance（若有不前進選項） |
| BREAKDOWN_ABSORPTION | 吸收到 step 價值最高的 reduced 單位 |
| CARGO_LOSS | 犧牲價值最低的 cargo |
| AIR_*、INTERCEPTION、MISSION_LOSS | B5 以 random-legal fallback（TODO `bot-air`） |

每個 responder 都有 random-legal 後備：若規則新增選項而 responder 尚未支援，仍能完成遊戲並在 trace 標 `RESPONDER_FALLBACK` Warning。

## 7. 防病態規則

- 每個單位每 phase 只有一個 plan target；目標變更需超過 hysteresis 門檻。
- `oscillation` 懲罰 + 同 phase 重複 state hash 檢測（見架構 §4.3）。
- 每個 phase 都必須以 ADVANCE_SEQUENCE 決策結束，且 trace 寫明理由；不得因 candidate 為空而沉默。
- 不允許 policy 讀取 wall clock；搜尋上限以評估次數計。

## 8. 評估分類（headless runner）

Error（exit code 非零，必須為零才能過 gate）：

| 代碼 | 意義 |
|---|---|
| `FAILED_ACTION` | 電腦送出的 action 被規則拒絕（policy 與 legal action 不一致） |
| `BOT_STALLED` | 遊戲未結束但電腦無法產生決策 |
| `BOT_LOOP`／`BOT_BUDGET_EXCEEDED` | 同 phase 重複局面或 action 數超過預算 |
| `EARLY_TERMINATION` | 未到 turn limit 或勝利條件就停止 |
| `REPLAY_MISMATCH` | 匯出 replay 重跑後 final state hash 不同 |
| `VICTORY_MISMATCH` | Game End 結果與 objective 控制計分不符 |
| `RULES_RNG_TOUCHED` | 有 bot 與純 replay 的 rules RNG draws 不同 |
| `INFO_LEAK` | 資訊洩漏測試（架構 §5.4）決策不同 |
| `CONSERVATION` | SP／Token 或 step 守恆檢查失敗 |

Warning（需人工看 trace，跨 seed 比較）：

| 代碼 | 意義 |
|---|---|
| `NO_COMBAT` | 整局一方沒有攻擊 |
| `OBJECTIVE_DRIFT` | 被指派 ATTACK 的 group 多數移動遠離目標 |
| `HIGH_OOS` | 某回合超過 30% combat units 不在補給中 |
| `LOGISTICS_EXPOSURE` | 卡車／dump／HQ 被奪或在敵方可達範圍內結束 phase |
| `BARRAGE_WITHOUT_ATTACK` | barrage 後同 phase 沒有地面攻擊同 hex |
| `FUEL_WASTE` | 付了 fuel 但單位沒移動 |
| `RESPONDER_FALLBACK` | pending decision 用了 random-legal 後備 |
| `SLOW_DECISION` | 單一決策超過延遲目標（只監控，不影響行為） |

評估順序沿用 BCS：先零 Error，再看 Warning 與行為，最後才看勝率；勝率不得抵銷前兩層問題。
