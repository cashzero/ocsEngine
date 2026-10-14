# M9 AI Bot 架構

狀態：**PLANNED**（2026-10-06 設計）。本文件保留目標架構，不是全部元件已實作的宣告。
2026-10-14 的實際查詢邊界、策略、補給與 VP 驗證見 [AI 現行策略與 VP 驗證](current-strategy.md)；標準 v66 已通過獨立 80 場 promotion，先前標準 v35 保留為對照。
實作步驟與驗收見
[M9 AI Bot WBS](../roadmap/11-ai-bot-wbs.md)，決策與評分見 [M9 評分與規劃](M9-scoring-and-planning.md)，
BCS 研究見 [05-bcs-ai-and-selfplay](../generator-study/05-bcs-ai-and-selfplay.md)。

Roadmap 規定 M9 在 M8 產品操作 gate 全部 P0 通過前不得開始實作（`docs/roadmap.md` §12、§13）。
本設計不改變該 gate；WBS 中任何提前開始的步驟都需要使用者明確同意。
使用者已授權本輪 bot 對戰、補給／VP 策略改善與下一次 promotion；該授權不將未操作的 UI 驗收列改成完成。

## 1. 目標與非目標

目標：

1. 電腦可以接手任一方，在 generated scenario 中從 Game Turn 1 打到 Game End，所有 phase、pending decision
   與跨 seat 的守方決策都由同一套 legal actions 完成。
2. 產品上提供「人對電腦」與「電腦對電腦觀戰」，走真實 New Game → Gameplay → Game End 流程。
3. 電腦的每個決定都可解釋（intent + score breakdown + 替代方案），可在 headless runner 大量重跑。
4. 公平：電腦只看到同座位人類看得到的資訊（OCS 4.9 hidden stack 規則）。

非目標（M9 內不做，若需要另立 TODO 並經使用者同意）：

- 難度等級、學習型／搜尋型（MCTS、RL）bot；
- 讓電腦「作弊」看隱藏資訊；
- M10 的 paired promotion gate（M9 只提供 runner 與報告，promotion 屬 M10）；
- Air 任務的主動規劃（見 §9 TODO `bot-air`）。

## 2. 分層與依賴

```text
src/core  src/domain  src/rules(型別與公開表格資料)  src/gameplay(GameSession 公開 API)  src/game-flow(公開 package 型別)
                                     ▲
                                  src/ai
                                     ▲
                       src/ui（座位控制、節奏、觀戰）  scripts/ai-match.mjs（headless runner）
```

依賴規則（以 import boundary test 強制）：

- `src/ai` 可以 import：`core`、`domain` 型別、`rules` 的 **型別** 與公開表格資料（CRT、Surprise、Barrage、TEC，屬印刷圖表的公開知識）、
  `gameplay` 的公開型別、`game-flow` 的 `GeneratedScenarioPackage` 公開欄位型別。
- `src/ai` 不可 import：任何以 `GameState` 為參數的規則函式、`rules/kernel` 執行碼、`gameplay/session.ts` 內部、`ui`。
- `gameplay` 與 `rules` 不可 import `ai`（`docs/roadmap.md` §2）。
- `ui` 只透過 `src/ai` 的 seat controller 介面啟停電腦，不呼叫 policy 內部。

## 3. 元件總覽

```text
                  ┌──────────────────────── GameSession（public API） ────────────────────────┐
                  │ getView · getActionFamilies · getActionCandidates · getMovementRange         │
                  │ getTraceCoverage · getSupplySources · getFuelPreview · getTransportOptions   │
                  │ createDraft/validateDraft · dispatch · respondToPendingDecision · subscribe  │
                  └──────────────▲──────────────────────────────────────────────▲─────────────┘
                                 │ 查詢                                          │ dispatch
┌────────────────────────────────┴──────────┐                    ┌──────────────┴──────────────┐
│ BotObservation（每 revision 一份，唯讀）     │                    │ BotSeatController            │
│  view.projection + PublicGameFacts          │◄───────────────────│  何時輪到我、預算、停止、失敗   │
│  + belief（隱藏敵軍估計）                    │                    └──────────────▲──────────────┘
└────────────────▲──────────────────────────┘                                   │ BotDecision
                 │                                                               │
┌────────────────┴──────────────────────────┐        ┌───────────────────────────┴──────────────┐
│ AnalysisCache（revision 為 key）            │───────►│ BotPolicy（registry：random-legal、        │
│  距離場、影響圖、前線、補給覆蓋、objective    │        │  heuristic、logistics）                   │
└───────────────────────────────────────────┘        │  Operational → Phase planner → Scorer      │
                                                      │  + Decision responders                    │
                                                      └───────────────────────────┬──────────────┘
                                                                                  │ trace
                                                                       ┌──────────┴──────────┐
                                                                       │ BotTelemetrySink     │
                                                                       └─────────────────────┘
```

## 4. BotSeatController（座位驅動）

### 4.1 何時行動

```ts
type BotTurn =
  | { kind: 'DECISION'; decision: PendingDecisionDescriptor } // 自己是 pending decision 的 owner（含守方決策）
  | { kind: 'ACTION' }                                        // sequence.actingPlayerId === 我
  | { kind: 'WAIT' };                                         // 輪到對方、session 非 ACTIVE、或 handoff 進行中
```

- Pending decision 優先：若 `view.pendingDecision` 屬於本座位，一律先回應，即使不是 phasing player
  （DEFENDER_LEAD、DEFENDER_TERRAIN、STEP_LOSS、RETREAT_HEX 等多半屬於守方）。
- Gameplay 的 `dispatch` 只在 handoff 進行中拒絕，不要求 dispatch seat 等於 `activeSeatId`。
  因此電腦座位不需要 hot-seat 交接；`activeSeatId` 保持在人類座位，交接畫面只在「人 → 人」切換時出現。
- 觸發來源：`subscribe` 的 `DISPATCH_ACCEPTED`、`PENDING_DECISION_CHANGED`、`LIFECYCLE_CHANGED`。
  Controller 是單一序列化迴圈，同一時間最多一個在途 dispatch。

### 4.2 執行迴圈

```text
loop:
  view  = session.getView(mySeat)
  turn  = classify(view)                    → WAIT 則等待通知
  obs   = observe(view, publicFacts, history)
  dec   = policy.decide(ctx(obs, actionAccess, botRng(obs), planCache, budget))
  check = dec.action 必須是本 revision 的 candidate 或 validateDraft.current && allowed
  res   = dispatch / respondToPendingDecision
  telemetry.record(obs, dec, res)
  guard(res)                                → 失敗處理見 4.3
```

### 4.3 失敗與防呆

| 狀況 | 處理 | 對外可見 |
|---|---|---|
| 選中的 action 被拒（`REJECTED`） | 記 `FAILED_ACTION`；依分數改試下一個 candidate，最多 3 次 | trace |
| 3 次仍失敗、或 policy 回傳 null 但遊戲未結束 | 停止電腦，狀態 `BOT_STALLED` | UI 顯示錯誤與「改由我操作此方」 |
| 同一 phase 的 action 數超過預算（預設：該方 on-map 單位數 × 6 + 50） | `BOT_BUDGET_EXCEEDED`，同上停止 | 同上 |
| 同一 phase 出現重複 state hash（來回移動） | `BOT_LOOP`，同上停止 | 同上 |
| `FATAL`／session `FAULTED` | 立即停止，不重試 | 沿用既有 fault 畫面 |

不允許「卡住就自動 ADVANCE_SEQUENCE」：那會把 bug 偽裝成電腦放棄行動。只有 policy 明確判斷「本 phase 沒有正分行動」時才結束 phase，
並在 trace 記錄理由。

### 4.4 預算與確定性

- 決策預算以「評估次數／搜尋節點數」計，不以毫秒計；否則不同機器會做出不同決定。毫秒只做監控與報告。
- 目標延遲（B2 實測後定案）：單一決策 p95 ≤ 300 ms；一個完整 player turn（含 UI 播放以外的計算）≤ 20 秒於預設 32×24、6 師規模。

## 5. 觀察（BotObservation）與公平性

### 5.1 資料來源

| 來源 | 內容 |
|---|---|
| `GameplayView.projection` | sequence、stacks（敵方只有頂部單位 + `hiddenCount`）、pending decision、victory、combat、weather、fuel、air、replacements |
| `PublicGameFacts`（由 `GeneratedScenarioPackage` 建立，開局固定） | 地圖 terrain／hexside／road／rail、objectives 與 VP、雙方 entry／supply region、turn limit、Piece Definitions 的印刷數值、TEC 與圖表 |
| 公開歷史 | `getHistory` 中雙方都看得到的事件（移動、戰鬥結果、retreat 等） |
| Session 查詢 | 自己的 movement range、trace coverage、supply sources、fuel preview、transport options、draft explanation（odds、DRM、補給費用） |

### 5.2 前置缺口（B0 需確認，可能需要小幅擴充 gameplay projection）

- **Objective 控制權**：原始設計的此項缺口已由 `RuleProjection.objectives[].controllerId` 提供。現有 `attackVictory` 與 `objectiveRaidThreats` 也透過公開 projection 提供；遠距威脅只使用可見 counter 的印刷值與公開地形，不讀敵方 fuel、隱藏單位或移動 usage。來源與預測範圍見 [現行查詢邊界](current-strategy.md#5-公開資訊與查詢邊界)。
- **增援時程**：需確認 OCS 4.9 下對方增援時程是否公開；未確認前 belief 不使用對方增援資訊。
- **Piece Definition 是否可公開查**：電腦要知道「看得到的敵方頂部單位」的印刷數值，人類也看得到同一個 counter，因此可以；
  但隱藏的 `hiddenCount` 單位只能用 belief 估計。

### 5.3 Belief（隱藏敵軍估計）

- 每個 hidden piece 以「對方已觀察到的同類 combat unit 中位數攻防值」估計，尚無觀察時用開局公開 OOB 摘要的平均值；
  估計值附帶不確定度，評分時守方強度取偏保守的分位數。
- 跨 phase 記憶：已在公開事件中揭露過的敵方單位（戰鬥揭露、移動）在 belief 中保留，直到公開事件顯示其離開。

### 5.4 公平性測試（必須通過）

- **資訊洩漏測試**：同一局面中，把敵方隱藏單位換成不同組成（projection 相同），電腦的決策必須完全相同。
- **型別隔離**：`src/ai` 任何檔案都拿不到 `GameState`（import boundary test + 型別測試）。

## 6. Action 取得與合法性

- 先 `getActionFamilies(seat)` 得 enabled kinds，再依需要呼叫 `getActionCandidates(seat, {kind, pieceId, budget})`。
- MOVE_PIECE 不列舉全部 candidates：對要移動的單位呼叫 `getMovementRange`（一次取得所有可達 hex、路徑與 MP），revision 內快取。
- 戰鬥、barrage、air 等需要結果預估的 action：先 `createDraft` + `validateDraft`，從 explanation facts 讀 odds、DRM、
  補給費用（`combat.odds`、`combat.oddsUnsupplied` 等），再交給 scorer。
- 最終 dispatch 的 action 必須是本 revision 由 session 產生或驗證過的物件；policy 不自行拼裝 action。

## 7. Policy 介面

以下是原始設計介面；實際 `BotDecisionContext`、`BotPhaseMemory`、action access 與 driver 以 `src/ai/model.ts`、`src/ai/access.ts`、`src/ai/driver.ts` 為準，不能用此草案宣告跨回合 planner 或 UI controller 已完成。

```ts
export interface BotPolicy {
  readonly id: BotPolicyId;           // 'random-legal' | 'heuristic' | 'logistics' | ...
  readonly version: string;           // 決策行為改變就升版，寫入 trace 與 save
  readonly decide: (context: BotDecisionContext) => BotDecision | BotPass;
}

export interface BotDecisionContext {
  readonly observation: BotObservation;
  readonly analysis: AnalysisCache;          // 以 stateRevision 為 key 的純計算結果
  readonly actions: BotActionAccess;         // 包裝 session 查詢，含 revision 內快取
  readonly rng: BotRng;                      // 見 §8
  readonly plan: PhasePlanCache;             // 本 player turn 的 operational/phase plan
  readonly budget: DecisionBudget;
}

export interface BotDecision {
  readonly action: GameAction;
  readonly intent: string;                   // 人類可讀：例「3rd Pz Div 向 1408 objective 推進」
  readonly score: number;
  readonly breakdown: readonly ScoreTerm[];  // { term, value, weight, note }
  readonly alternatives: readonly { action: GameAction; score: number }[]; // top 5
  readonly planStep: string | null;          // 對應的 phase plan 步驟 id
}

export interface BotPass { readonly kind: 'PASS'; readonly reason: string } // 只在不是我行動時；結束 phase 必須是 ADVANCE_SEQUENCE 決策
```

同分以 action key 字串排序後再用 bot RNG 取，保證確定性（沿用 BCS 的 tie-break 形狀）。

## 8. 確定性、RNG 與存檔

- Bot RNG 與 rules RNG 完全分離；bot 不消耗 rules RNG（測試：有 bot 的對局 replay 後 rules RNG draws 完全一致）。
- 每次決策的 RNG = `hash(botSeed, stateHash, decisionOrdinal)`，不保存 RNG 狀態。因此 undo、存讀檔、replay 後，
  相同局面會做相同決定。
- **無狀態跨存檔**：operational plan 在每個 player turn 開始時由 observation + 公開歷史重算；跨回合的「持續攻擊同一目標」
  用 hysteresis（上一回合我方移動方向、上次攻擊的目標，皆可由公開歷史推得）實現，不需要另存 bot 記憶。
- **座位設定要存檔**：`SeatBinding` 新增純資料欄位
  `controller: { kind: 'HUMAN' } | { kind: 'BOT'; policyId; policyVersion; seed }`。Gameplay 只保存、不解讀；
  讀檔後 UI 依此重新掛上電腦。Replay 只需要 action 序列，不需要 bot。
  舊存檔沒有此欄位時視為雙方 HUMAN（需 save migration 測試）。
- New Game 增加每個電腦座位的 `botSeed`（與 map/oob/deployment/rules 四個 seed 正交；顯示在 seed 區，可鎖定）。

## 9. 範圍分級與 TODO

| 子系統 | M9 處理 | 未處理時的影響 |
|---|---|---|
| Ground 移動、mode、fuel、overrun、combat、barrage、retreat/advance、reaction、exploitation | heuristic 規劃（B5） | — |
| Supply Phase、補給檢查、formation trace、internals、breakout | heuristic（B5） | — |
| 卡車、dump、extender、SP 運送、炸 dump | logistics policy（B6） | B6 前電腦不主動運補，長局會補給枯竭 |
| 增援放置、replacements 重建 | heuristic（B5） | — |
| Air（refit、任務、air drop、air base） | **TODO `bot-air`**：只以 random-legal fallback 回應 air 的 pending decisions，不主動派任務；Air 選項開啟時 New Game 需提示「電腦不會主動使用空軍」。完成證據：電腦在開啟 Air 的 generated game 中主動派 barrage／interdiction 任務並通過 BOT 驗收列 | 開啟 Air 時電腦明顯偏弱 |
| Rail Cap（R4 尚未實作） | 規則存在後再加 | — |

## 10. UI 整合（產品）

- **New Game**：每一方選「玩家」或「電腦」；可選電腦對電腦（觀戰）。預設值待使用者決定（WBS §開放決定）。
- **人對電腦**：畫面永遠是人類座位的 view，沒有交接畫面；電腦行動期間顯示「電腦思考中／行動中」與目前 phase，
  每個電腦 action 進 history 並以短暫停頓在地圖上播放（速度可調、可暫停）。
- **守方決策**：人類攻擊時，電腦守方的 pending decision 立即回應，UI 顯示結果，不跳交接畫面。
- **電腦卡住**：顯示錯誤代碼與最後的 decision trace 摘要，提供「改由我操作此方」與「存檔回報」。
- **Undo**：人類 undo 到電腦行動之前的 checkpoint 時，電腦依確定性會在相同局面重做相同決定；UI 需說明這點。
- **觀戰模式**：觀戰者選擇以哪一方視角看（保留 hidden 規則）或「上帝視角」（明確標示，只限觀戰）。

## 11. Telemetry 與 headless runner

Decision trace（JSON Lines，每個決策一筆）：

```text
{ match, seat, policy@version, gameTurn, playerTurn, phase, segment, revision, stateHash,
  turnKind: ACTION|DECISION, decisionKind?, action, intent, score, breakdown[], alternatives[],
  planStep, dispatchStatus, events[] 摘要, elapsedMs, evaluations }
```

Runner：`scripts/ai-match.mjs`（Node，直接用 `dist/`；不需要瀏覽器）

```text
--seeds map=..,oob=..,deployment=..,rules=..   --bot allied=heuristic@1:seed  --bot axis=random-legal@1:seed
--matches N --start K --turns T --scale/--map-size --out tmp/ai-match/<name>
```

輸出 `summary.json`、`summary.md`、每局 `trace.jsonl` 與最終 save/replay；Error 讓 exit code 非零。
Error／Warning 分類見 [M9 評分與規劃](M9-scoring-and-planning.md) §8。
