# Rule Engine WBS

## 1. 目的與邊界

Rule Engine 是 OCS 規則唯一權威。給定 immutable state 與 action，它必須產生
deterministic transition、events、pending decision 與 explanation。

| Rule Engine 擁有 | Rule Engine 不擁有 |
|---|---|
| phase/actor/legality、derived values | React/UI selection、dialog open/close |
| state transition、RNG、rule events | save slot、autosave、network transport |
| mode/ZOC/movement/supply/combat | session lifecycle、subscription |
| transaction、reservation、pending decision | generator、AI scoring |
| visibility rule 與 safe facts | visual layout、animation |
| rule/table provenance 與 invariants | commercial scenario asset extraction |

Rule Engine 使用 Foundation types，但 Foundation 不得反向依賴 Rule Engine。

## 2. Rule Engine public contract

OCS action 空間很大，不應假設所有 path/supply/combat 組合都能一次平坦列舉。
使用 action family + deterministic candidate query：

```ts
interface RuleEngine {
  getActionFamilies(state: GameState, actor: Actor): ActionFamily[];
  getActionCandidates(
    state: GameState,
    request: CandidateRequest,
  ): CandidateResult;
  validateAction(state: GameState, action: GameAction): ActionValidation;
  applyAction(state: GameState, action: GameAction): TransitionResult;
  explain(state: GameState, request: ExplanationRequest): RuleExplanation;
  projectForViewer(state: GameState, viewer: Viewer): RuleProjection;
}
```

UI 與 AI 可用不同 candidate request/budget，但最終 action 一律由
`validateAction`／`applyAction` 權威驗證。Pending decision 存在時，無關 action
family 必須被封鎖。

## 3. State ownership

`GameState` 只保存重播下一步所需的 authoritative facts：

```text
GameState
  schema/revision/configuration
  turn/phase/segment/actor
  mapState
  pieceStates + relation ledger
  resource ledgers
  usage/commitment state
  active transaction / pending decision
  rules RNG state
  victory/progress state
```

不持久化可安全推導的 cache，例如 current RE、movement range、ZOC map、effective
strength、supply path。Cache 必須以 state revision 與 query purpose 作 key，且
清除 cache 不得改變結果。

## 4. Rule Engine 工作分解

每個 rule slice 必須同步提交獨立 contract/coverage 文件：

| Stage | Required document |
|---|---|
| R0 | `docs/rule-engine/00-manifest-scope-and-tables.md` |
| R1 | `docs/rule-engine/01-reducer-action-event-contract.md` |
| R2 | `docs/rule-engine/02-sequence-and-pending-decisions.md` |
| R3 | `docs/rule-engine/03-query-explanation-visibility.md` |
| R4 | `docs/rule-engine/04-mode-stacking-zoc.md` |
| R5 | `docs/rule-engine/05-movement-and-path-execution.md` |
| R6 | `docs/rule-engine/06-transaction-and-reservation.md` |
| R7 | `docs/rule-engine/07-supply-and-logistics.md` |
| R8 | `docs/rule-engine/08-combat-overrun-barrage-retreat.md` |
| R9 | `docs/rule-engine/09-lifecycle-facility-victory.md` |
| R10 | `docs/rule-engine/R10-rule-engine-integration.md` |

### R0：Rule manifest、scope 與 table provenance

建立 implementation manifest：

- OCS 1.0–21.12 support status；
- `implemented`、`deferred`、`game-specific`、`not-applicable`；
- 每條規則的 owner module、action/query、tests；
- table ID、series/game version、page、checksum、review status；
- series rule 與 game override 的 resolution order；
- MVP fixed scenario 所需的最小 ground/logistics slice。

產出：

- `docs/rule-engine/00-rule-manifest.md`
- `docs/rule-engine/00-table-provenance.md`
- `docs/rule-engine/00-mvp-scope.md`

Gate：缺 table 或 unresolved conflict 的 feature 不可標記 implemented。

### R1：Reducer kernel、revision、actions 與 events

實作：

- versioned `GameState` envelope；
- discriminated `GameAction`，包含 action ID、actor、expected revision；
- `GameEvent` 與 stable event ordering；
- immutable `applyAction` dispatch table；
- precondition validation、domain error taxonomy；
- rules RNG stream 與 roll event；
- state invariant hook；
- transition atomicity：失敗不消耗 RNG、不改 state、不留 reservation。

測試：

- stale revision、wrong actor、unknown action、invalid phase；
- same state/action 產生 same state/events；
- failed action input object 未 mutation；
- RNG 只有 commit point 才前進。

### R2：Sequence、actor 與 pending-decision kernel

實作 OCS hierarchy：

- Game Turn、Weather、First Player、Player Turn；
- Aircraft Refit、Reinforcement、Movement、Supply、Reaction、Combat、
  Exploitation、Clean Up；
- phase/segment enter/exit guards；
- phasing/non-phasing actor permissions；
- `currentMover`／exclusive action ownership；
- serializable `PendingDecision` union；
- decision owner、allowed responses、expiry/completion；
- Clean Up 與 usage reset hook。

先以 pass/finish action 跑完空白 turn，再逐一掛接 subsystem。

Gate：兩方可 headless 完成空白完整 Game Turn；pending decision 能在 save/reload
後繼續且阻擋無關 action。

### R3：Rule query、explanation 與 visibility-safe facts

所有規則 query 使用共同結果型別：

```ts
interface RuleQueryResult<T> {
  allowed: boolean;
  value?: T;
  reasons: RuleReason[];
  facts: RuleFact[];
  dependencies: StateDependency[];
}
```

建立：

- stable reason code，不依賴英文 UI 字串；
- calculation trace：input、modifier、rule citation、final value；
- purpose-specific query context；
- hidden information redaction policy；
- cache key 包含 state revision、actor/viewer、purpose、configuration；
- UI/AI 可使用但不能修改的 explanation tree。

Gate：同一 legality predicate 不在 UI、AI 或另一 rule module 重寫。

### R4：Mode、stacking、ZOC 與 usage commitments

分開實作：

1. printed face orientation 與六種 OCS mode；
2. voluntary/involuntary transition policy；
3. dynamic RE derivation與 checkpoint-specific stacking；
4. stack query、stack order 與 phase-start membership snapshot；
5. purpose-specific ZOC：movement、supply、retreat、combat等；
6. ZOC negation commitment 與 Exploitation exception；
7. unit/stack usage ledger：moved、fired、attacked、barraged、released。

不要建立一個通用 `isInZoc` boolean 供所有規則共用；不同 purpose 需要明確
query。

### R5：Movement 與 path execution

拆成兩層：

- path query：reachable set、cost/explanation、stop/prohibit；
- action execution：begin mover、enter hex、drop unit、finish、suspend/resume。

涵蓋：

- exact fractional MP、mode multiplier；
- multi-terrain、road、hexside、minimum move；
- unit與stack movement、drop-off 不可恢復；
- current mover lock；
- friendly/enemy stack、ZOC、temporary/final stacking；
- Reaction／Exploitation allowance；
- transport pause/spend seam；
- Overrun suspension seam，實際 resolution 於 R8。

Property/invariant tests：cost non-negative、replay exact、path endpoints合法、
cancel/suspend 不重複扣 MP。

### R6：Transaction、reservation 與 choice framework

OCS supply/combat 不是單一 handler，建立通用 resumable transaction：

```text
declare
  -> validate participants/target
  -> enumerate resource choices
  -> reserve resources
  -> collect player choices
  -> roll at documented commit point
  -> apply result atomically
  -> release/consume reservation
  -> emit events and close
```

交易資料包含：

- transaction ID/type/step/owner；
- immutable participant snapshot 與 origin state revision；
- reservations；
- committed choices；
- pending decision；
- roll/results after commit；
- cancel/abort/complete policy。

必測：save/reload 每一步、cancel rollback、stale participant、resource 被另一交易
占用、RNG commit timing、transaction completion exactly once。

### R7：Supply 與 logistics

依序交付：

1. integer Token ledger、owner、location、cargo；
2. typed supply purpose 與 consumer requirement；
3. direct draw、HQ draw/throw、adjacency；
4. trace source/detrainable node/path explanation；
5. Extender/chains 與 dynamic invalidation；
6. combat/barrage/fuel reservation；
7. fuel method、duration、moving-HQ lock；
8. internal stocks Normal/Low/Exhausted；
9. OOS、attrition、Breakout；
10. load/unload、combine/divide、capture/blow。

每一小步都有 conservation property test。Engine 必須列出所有合法供應選項，
不得替玩家靜默挑選最方便來源。

### R8：Combat、Overrun、barrage 與 retreat

Ground combat transaction：

1. declaration/participants/geometry；
2. supply choices/reservation；
3. strength/terrain/category/AT explanations；
4. attacker/defender AR choices；
5. Surprise/RNG/table shifts；
6. CRT result；
7. loss/option choices；
8. DG/Exploit award；
9. retreat/tagalong/path；
10. advance/capture/cleanup。

Overrun 共用 combat calculators，但有自己的 declaration、phase-start stack、
movement suspension、supply與mandatory advance transaction。

Barrage 分 artillery/air/naval/facility target family；MVP 只啟用 artillery，其他
family 保留 fail-fast capability gate。

### R9：Lifecycle、reinforcement、facility 與 victory MVP

只實作 fixed scenario 必要範圍：

- reinforcement arrival/placement 若 fixture 使用；
- rail/bridge/facility 最小 state effect；
- control/capture timing；
- turn limit、objective/victory adapter；
- Clean Up 的 DG/Exploit/mode/usage/resource reset；
- eliminated/pool/captured location transitions。

進階 replacement、breakdown、air、naval、optional rules 維持 manifest deferred。

### R10：Rule Engine integration、invariants 與 coverage gate

建立固定 synthetic scenario 的 headless script：

- setup -> full movement -> supply -> reaction -> combat -> exploitation -> cleanup；
- 至少一次 Overrun、combat、barrage、retreat、advance、supply choice；
- 每個 pending boundary save/reload；
- final state hash/replay comparison；
- rule coverage manifest 自動列出 missing tests；
- cache-on/cache-off 結果一致；
- invariant sweep：resource、piece identity、location、steps、transaction closure。

## 5. 建議 package 版圖

```text
src/rules/
  kernel/
    state/
    action/
    event/
    reducer/
    rng/
  sequence/
  query/
  explanation/
  mode/
  stacking/
  zoc/
  movement/
  transaction/
  supply/
  combat/
  barrage/
  retreat/
  lifecycle/
  victory/
  visibility/
  tables/
  validation/
```

## 6. 每個 Rule slice 的 Definition of Done

- rule section、version、table provenance 已記錄；
- public query/action/event schema 已文件化；
- positive、negative、boundary、pending/replay tests 通過；
- failure 不 mutation、不消耗 RNG/resource；
- explanation 使用 stable reason code 與 rule citation；
- hidden information 不經 reason/fact 洩漏；
- UI/Gameplay/AI 不需重寫 predicate；
- coverage manifest 更新，未支援行為 fail-fast。

## 7. Rule Engine 最終 Gate

- R0–R10 全部通過；
- 固定 scenario 可只用 public actions headless 完成；
- state/action/replay deterministic；
- 所有 multi-step transaction 可中斷、保存、恢復；
- Rule Engine 無 React、session、generator、AI dependency；
- Gameplay Engine 只需 orchestration，不需補規則缺口。
