# Gameplay Engine WBS

## 1. 目的與邊界

Gameplay Engine 是 Rule Engine 與各 client 之間的 application layer。它管理
一局遊戲的生命週期、dispatch、projection delivery、持久化、history 與 replay，
但不擁有任何 OCS legality 或計算。

```text
Rule Engine                       Gameplay Engine
-----------                       ---------------
validate/apply rule      <------  sequential dispatch
authoritative GameState  <------  current session state
rule projection          <------  viewer delivery/cache
events/explanations      ------>  history/notifications
pending decision         ------>  decision coordination
deterministic transition ------>  save/replay/undo
```

| Gameplay Engine 擁有 | Gameplay Engine 不擁有 |
|---|---|
| session lifecycle、current authoritative snapshot | movement/supply/combat legality |
| sequential dispatch、revision/conflict handling | rules RNG、combat table calculation |
| scenario bootstrap 與 compatibility validation | random map/OOB generation |
| projection delivery、viewer access | rule visibility predicate本身 |
| save/load/checkpoint/replay/undo | React components、pixel/layout |
| history、notifications、diagnostics | AI plan/scoring |
| headless/client ports | editor-specific state |

## 2. Public API 與 port design

```ts
interface GameplayEngine {
  createSession(request: CreateSessionRequest): Promise<GameSession>;
  loadSession(save: SaveEnvelope): Promise<GameSession>;
}

interface GameSession {
  getMetadata(): SessionMetadata;
  getRevision(): Revision;
  getView(viewer: Viewer): GameplayView;
  getActionFamilies(actor: Actor): ActionFamily[];
  getActionCandidates(request: CandidateRequest): CandidateResult;
  dispatch(request: DispatchRequest): Promise<DispatchResult>;
  subscribe(listener: SessionListener): Unsubscribe;
  save(): SaveEnvelope;
  createCheckpoint(label?: string): CheckpointId;
  undoTo(checkpoint: CheckpointId): DispatchResult;
  exportReplay(): ReplayEnvelope;
  close(): Promise<void>;
}
```

Clients 不取得 mutable `GameState` reference。Headless、UI 與未來 AI 都使用
同一 `GameSession` contract。

## 3. Gameplay Engine 工作分解

每個 application-layer stage 都要提交獨立文件：

| Stage | Required document |
|---|---|
| G0 | `docs/gameplay/00-boundaries-ports-and-session-api.md` |
| G1 | `docs/gameplay/01-scenario-bootstrap-and-lifecycle.md` |
| G2 | `docs/gameplay/02-dispatch-and-concurrency.md` |
| G3 | `docs/gameplay/03-action-discovery-and-drafts.md` |
| G4 | `docs/gameplay/04-pending-decision-coordinator.md` |
| G5 | `docs/gameplay/05-projection-access-and-hotseat.md` |
| G6 | `docs/gameplay/06-history-timeline-diagnostics.md` |
| G7 | `docs/gameplay/07-save-load-checkpoint-replay.md` |
| G8 | `docs/gameplay/08-recovery-and-observability.md` |
| G9 | `docs/gameplay/09-headless-driver.md` |
| G10 | `docs/gameplay/G10-gameplay-ui-contract-gate.md` |

### G0：Application contract、ports 與 dependency rule

定義：

- `RuleEnginePort`；
- `ScenarioRepositoryPort`；
- `SaveRepositoryPort`；
- `ClockPort`，只用於 metadata，不進入 rules determinism；
- `SessionLoggerPort`；
- client-facing `GameSession`；
- error taxonomy：rule rejection、stale revision、compatibility、storage、fatal。

提供 memory adapters 供測試。第一版不綁 browser localStorage、filesystem、
Electron 或 network。

產出：

- `docs/gameplay/00-boundaries-and-ports.md`
- `docs/gameplay/00-session-api.md`

Gate：Rule Engine 與 UI 都不需要知道 adapter implementation。

### G1：Scenario bootstrap 與 session lifecycle

實作：

- scenario envelope parse、schema/version compatibility；
- definition/reference/table/configuration validation；
- 用 Rule Engine initializer 建 authoritative initial state；
- lifecycle：`CREATED`、`READY`、`ACTIVE`、`PAUSED`、`FINISHED`、`CLOSED`；
- player/side/seat/viewer binding；
- session metadata 與 scenario/source hashes；
- start/finish/close 的 idempotency；
- fatal validation 不建立半初始化 session。

固定 synthetic scenario 是 G1 唯一輸入；不等待 generator。

### G2：Sequential dispatch 與 concurrency/revision

建立單一 dispatch pipeline：

```text
receive request
  -> authenticate/bind actor
  -> compare expected revision
  -> ask Rule Engine validate/apply
  -> atomically replace snapshot
  -> append accepted action/events
  -> update projection cache
  -> notify subscribers
  -> schedule persistence policy
```

規則：

- 同一 session 同時只 commit 一個 action；
- stale request 回傳 current revision，不自動重試有副作用 action；
- rejected action 不進 accepted history；
- listener exception 不 rollback 已完成 rule transition；
- notification ordering stable；
- dispatch response 帶 accepted/rejected、revision、events、pending summary、
  explanation reference。

測試並行 dispatch、double click、duplicate action ID、late pending response。

### G3：Action discovery 與 interaction/draft support

Gameplay Engine 封裝 Rule Engine query，提供 client-friendly 但不含 UI 的：

- action families；
- candidate pagination/budget；
- selectable origin/target/resource/participant IDs；
- path preview 與 cost explanation；
- combat/supply choice descriptors；
- stable candidate IDs 與 state revision；
- draft revalidation。

Draft 可以由 client 保存；Gameplay Engine 不把 hover/selectedHex/modalOpen 寫進
authoritative state。若提供 `ActionDraft` helper，它只能組 action 並呼叫 query，
不能擁有 rule predicate。

### G4：Pending-decision coordinator

Rule Engine 保存 authoritative pending decision；Gameplay Engine 負責交付：

- 只通知有權回應的 viewer/actor；
- 將 decision options 轉成 stable descriptors；
- resume/reconnect 後重送未完成 decision；
- 封鎖不相關 dispatch 並回傳明確原因；
- decision completed/invalidated notifications；
- hot-seat handoff，不在上一方 view 洩漏下一方資訊。

不得以 UI dialog open state 判斷 decision 是否存在。

### G5：Projection、viewer access 與 hot-seat

分工：

- Rule Engine 決定哪些 rule facts 可見；
- Gameplay Engine 決定哪個 viewer 收到哪個 projection、何時刷新及如何 cache；
- UI 只渲染收到的 `GameplayView`。

工作項目：

- viewer identity/role/side；
- authoritative revision 對應 projection revision；
- public、side-private、observer/debug projection；
- stack summary 與 hidden piece redaction；
- reason/explanation redaction；
- hot-seat privacy screen/handoff token；
- projection cache invalidation；
- access tests，確保 save/debug API 不繞過 viewer policy。

### G6：History、timeline 與 diagnostics

保存三種資料且不混淆：

- accepted action log：重播輸入；
- rule event log：發生的 domain facts；
- session diagnostics：elapsed time、client、performance、非規則錯誤。

建立：

- stable sequence number；
- turn/phase/transaction correlation；
- human-readable summary 由 event formatter 產生；
- rule explanation lookup；
- filtering/pagination；
- rejected action diagnostics 與安全 redaction；
- 不把 UI click/hover 當作 rule event。

### G7：Save、load、checkpoint、replay 與 migration

Save envelope 至少包含：

- engine/schema versions；
- scenario/config/source hashes；
- canonical authoritative snapshot；
- rules RNG state；
- active transaction/pending decision；
- accepted action/event sequence/checkpoint metadata；
- optional client metadata，與 authoritative data 分區。

策略：

- checkpoint snapshot + 後續 accepted action log；
- undo 從 checkpoint replay，不反向 patch mutable state；
- autosave 由 adapter policy 控制；
- migration 先 structural parse，再逐版 migrate，再 Rule Engine validate；
- replay 每個 checkpoint/final 都驗證 state hash；
- corrupted/incompatible save 不覆蓋目前 session。

測試：pending decision、transaction reservation、RNG、hot-seat、finished game 的
save/load/replay。

### G8：Recovery、fault isolation 與 observability

區分：

- expected rule rejection；
- stale/duplicate client request；
- scenario/save compatibility error；
- adapter/storage failure；
- invariant/fatal engine error。

行為：

- rule rejection 可恢復，不污染 session；
- save failure 不回滾已合法完成的 action，但發出 durable warning；
- fatal invariant 停止新 dispatch、保留 diagnostic snapshot；
- logs 不含對方隱藏資訊；
- action latency、projection latency、save/replay time 可量測；
- performance instrumentation 不改 deterministic state。

### G9：Headless driver

在 UI 前提供最小 client：

- 建 session／取得 action families/candidates；
- 由 scripted fixture actions 完成 scenario；
- 自動回應明確指定的 pending decisions；
- save/reload／undo／replay checkpoints；
- 輸出 final state hash、events、coverage、timing；
- 不 import React、Playwright、generator 或 AI。

這不是 bot；所有 action 由測試 script 明確指定，目的是證明 Gameplay contract。

### G10：UI integration contract 與 manual-play gate

UI 開始前凍結：

- `GameplayView` schema；
- action family/candidate descriptors；
- pending-decision descriptors；
- dispatch result、notifications、history/replay API；
- viewer/hot-seat flow；
- loading/error/fatal states；
- performance budgets 與最大 payload assumptions。

以固定 synthetic scenario 建 contract test，UI 不得要求取得 raw authoritative
state 或直接呼叫 Rule Engine private module。

## 4. Session state 與 UI state 的分界

| 資料 | Owner |
|---|---|
| turn/phase/mode/steps/resources/transaction | Rule Engine `GameState` |
| current session snapshot/history/checkpoint | Gameplay Engine |
| viewer projection/cache | Rule + Gameplay boundary |
| selected hex/piece、hover、panel、zoom | UI local state |
| action draft | client local，經 Gameplay query revalidate |
| random map/OOB options | generator/UI，生成前非 session state |
| bot plan/score | AI session metadata |

## 5. 建議 package 版圖

```text
src/gameplay/
  engine/
  session/
  dispatch/
  bootstrap/
  actions/
  decisions/
  projection/
  history/
  persistence/
  replay/
  diagnostics/
  ports/
  adapters/
    memory/
  headless/
```

Browser/filesystem/Electron adapter 待 UI/platform 決策後加入，不進 core package。

## 6. Gameplay Engine 測試矩陣

### Contract

- create/start/pause/resume/finish/close；
- actor/viewer binding；
- action discovery -> dispatch -> notification；
- pending decision handoff；
- headless/UI adapter 行為一致。

### Concurrency

- stale revision；
- duplicate action ID；
- concurrent dispatch serialization；
- subscriber reentrancy；
- late response to completed decision。

### Persistence

- all phase/transaction boundaries save/load；
- checkpoint undo；
- replay final/intermediate hash；
- corrupted/old/future save；
- autosave adapter failure。

### Security/visibility

- side-private projection；
- hidden stack/explanation redaction；
- hot-seat handoff；
- observer/debug access explicit；
- logs/save metadata 不繞過 policy。

### Performance

- large snapshot projection；
- legal candidate pagination；
- dispatch latency；
- save/replay；
- subscriber count/cache invalidation。

## 7. Gameplay Engine 最終 Gate

- G0–G10 每步有文件與測試；
- fixed scenario 只經 `GameSession` public API 完成；
- headless save/load/undo/replay deterministic；
- Gameplay Engine 沒有 OCS rule calculation；
- UI 不需要 raw state 或 private Rule Engine import；
- generator 未存在時仍可使用 fixed scenario；
- AI 未存在時 contract 已足以成為未來 bot client；
- 完成後才進入可人工操作 UI milestone。
