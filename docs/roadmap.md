# ocsEngine 實作 Roadmap

## 1. 正確的產品順序

`ocsEngine` 依下列順序交付：

```text
Hex Framework + Basic Unit Data Structure
  -> OCS Rule Engine
  -> Gameplay Engine
  -> 可人工操作的全新 UI
  -> Random Map + Random OOB/Scenario
  -> AI Bot
  -> Paired Self-play 與完整 OCS 擴充
```

這個順序是強制依賴，不可顛倒：

- Hex Framework 先固定座標、hexside、map container 與 serialization；
- Unit Data Structure 先分離 unit definition、runtime instance、counter face、
  steps、RE、mode、capability 與 location；
- Rule Engine 先定義 state、action、legality 與結果；
- Gameplay Engine 才能安全地管理一局遊戲、save/load/replay 與玩家操作；
- UI 先用固定 synthetic scenario 證明人類可以完整遊玩；
- Random Map/OOB 再依穩定 schema 產生可被同一 Gameplay Engine 載入的內容；
- AI Bot 最後成為同一套 legal actions 的 client，不建立第二套規則。

Beyond the Rhine VASSAL module 是後續 Random OOB 的資料參考，不是 Hex／Unit
Foundation、Rule Engine、Gameplay Engine 或第一版 UI 的前置條件。

## 2. 架構分層

```text
src/core/hex/     座標、方向、neighbor、distance、hexside、pixel transform
src/domain/map/   map/hex container、terrain/facility slots、serialization
src/domain/unit/  definition、instance、face、steps、RE、mode、location
      |
      v
src/rules/        純 OCS 規則、legal actions、state transitions、tables
      |
      v
src/gameplay/     game session、dispatch、history、save/load、replay、projection
      |
      v
src/ui/           全新 map/counter/action/pending-decision 介面
      |
      v
src/generation/   random map、OOB catalog、random OOB、deployment、validation
      |
      v
src/ai/           bot strategy、planning、scoring、telemetry、self-play
```

依賴只能向下游流動：

- `core/hex` 不得 import OCS rules、unit、UI 或 generator；
- `domain/map` 與 `domain/unit` 是資料模型，不執行 gameplay rules；
- `rules` 不得 import gameplay、UI、generation 或 AI；
- `gameplay` 不得 import UI、generation 或 AI；
- `ui` 只能顯示 projection 並 dispatch action，不計算規則；
- `generation` 產生 versioned scenario data，不直接修改 runtime state；
- `ai` 只能取得 projected state 與 legal actions，並 dispatch action。

## 3. Roadmap 總覽

| Milestone | 主要成果 | 使用的內容 | 完成後可做什麼 |
|---|---|---|---|
| M0 | Hex Framework 與基本 Unit Data Structure | Study 1–2、6 | 穩定的 map/piece 基礎型別與 fixtures |
| M1 | Rule Engine contract 與 MVP 規則範圍 | M0、Study 1–5、8 | 開始純規則實作 |
| M2 | Rule Engine foundation | 固定 synthetic fixtures | 執行回合、mode、movement、ZOC |
| M3 | Ground/Logistics Rule Engine | 固定 synthetic fixtures | Headless 完成一局 ground scenario |
| M4 | Gameplay Engine | M2–M3 | 建立 session、save/load/replay、view projection |
| M5 | 可操作的新 UI | M4、固定 scenario | 人類可完成一局遊戲 |
| M6 | Random Map | 穩定 map schema、M5 preview | 生成並檢視可玩 OCS 地圖 |
| M7 | OOB Catalog 與 Random OOB | 穩定 unit/scenario schema | 生成可追溯的 OCS 部隊 |
| M8 | Random Scenario Integration | M6–M7、M4–M5 | 生成後立即人工遊玩 |
| M9 | AI Bot | M8、完整 legal actions | Bot 可完成 generated scenario |
| M10 | Paired Self-play／品質 Gate | M9 | 跨 map/OOB seed 評估與 regression |
| M11 | Air、Naval、Optional、進階 generator | M10 | 擴展完整 OCS 系列能力（Air 計畫：[M11-Air WBS](roadmap/08-air-power-wbs.md)，IN PROGRESS） |

Hex/Unit Foundation 是所有後續工作的起點。AI 是產品目標，但只有在同一
generated scenario 已能由人類透過 UI 完整操作後才進入。

## 4. M0：Hex Framework 與基本 Unit Data Structure

M0 只建立可被 Rule Engine 使用的穩定資料基礎，不先實作 movement、stacking、
combat 或 supply legality。

完整工作分解見 [Foundation WBS](roadmap/01-foundation-wbs.md)，包含 F0–F10、
每一步的 ownership、文件、測試與 exit gate。本節只保留 milestone 摘要。

### Hex Framework

- 明確選定 axial/cube coordinate convention、pointy/flat orientation；
- `HexCoord`、六方向、neighbor、opposite direction、distance、range、line；
- canonical hex key parse/format 與 deterministic ordering；
- hexside 使用「hex + direction」並提供 reciprocal/canonical edge identity；
- logical coordinate 與 pixel coordinate 轉換，但不綁定 SVG/Canvas/React；
- `MapDefinition`／`HexCell` container、dimensions/bounds、lookup/iteration；
- terrain、road、rail、river、facility 採 typed slots，先不計算規則效果；
- canonical serialization、schema version、validation 與 content hash。

### Basic Unit Data Structure

必須分離不變定義與遊戲中狀態：

```ts
interface UnitDefinition {
  id: string;
  family: 'GROUND' | 'RESOURCE' | 'AIR' | 'NAVAL' | 'FACILITY';
  category: string;
  ownership: Ownership;
  printedFaces: UnitFaceDefinition[];
  capabilities: CapabilityId[];
  provenance?: SourceReference;
}

interface UnitState {
  id: string;
  definitionId: string;
  owner: PlayerId;
  location: PieceLocation;
  currentFace: number;
  stepState: StepState;
  modeState: UnitModeState;
  markers: MarkerState[];
  cargo?: CargoState;
}
```

`currentRE`、有效 MA/strength、ZOC 與 supply status 是 Rule Engine derived
values，不在 `UnitState` 重複持久化。

第一版基本欄位至少涵蓋：

- stable ID、faction、nationality、formation/group reference；
- ground/non-combat/resource/air/naval/facility family，先允許 deferred family；
- printed face 與 runtime mode 分離；
- steps、RE、AR、MA/mobility class、range、capabilities；
- on-map hex、off-map box、holding area、eliminated 等 typed location；
- attachment/cargo/parent-child reference 的資料位置；
- raw/source/normalized provenance，不以 image filename 作 identity。

### Fixtures 與測試

- 小型 5 x 5 synthetic map；
- 每種基本 ground/resource piece 的 synthetic definition/state；
- coordinate/neighbor/distance/edge reciprocity property tests；
- map/unit schema round-trip、unknown field/version、duplicate ID validation；
- definition immutable、state copy/update 不污染原物件；
- BCS axial orientation 只在測試證明相容後才 adapt。

### 文件產出

- `docs/foundation/M0-hex-coordinate-and-edge-contract.md`
- `docs/foundation/M0-map-data-structure.md`
- `docs/foundation/M0-unit-definition-and-state.md`
- `docs/foundation/M0-schema-and-fixtures.md`

### Exit gate

- Hex Framework 不依賴 OCS rule、React 或 generator；
- map/unit public types 不包含 BCS activation、AV、Combat Train 等語意；
- map、unit definitions、unit states 均可 canonical serialize/validate；
- synthetic fixtures 足以供下一階段 Rule Engine 測試；
- coordinate orientation、edge numbering、ID 與 location model 已核准。

## 5. M1：Rule Engine Contract

### 目標

將已完成的 OCS／BCS 規則差異研究收斂成可實作的純 Rule Engine contract。

完整實作分解見 [Rule Engine WBS](roadmap/02-rule-engine-wbs.md)。該文件將
reducer、sequence、query、movement、transaction、supply 與 combat 拆成
R0–R10，不允許以一個大型 reducer 或 UI handler 代替。

### 文件產出

| Step | 文件 | 內容 |
|---|---|---|
| M1.1 | `docs/rule-engine/01-domain-model.md` | M0 map/unit model 上的 stack、mode、resource 與 facility rule ownership |
| M1.2 | `docs/rule-engine/02-turn-and-action-model.md` | Player Turn、phase、segment、actor、action、pending decision |
| M1.3 | `docs/rule-engine/03-quantity-and-rng.md` | Token、RE、quarter-MP、immutable rules RNG |
| M1.4 | `docs/rule-engine/04-rule-table-provenance.md` | Combat、Surprise、Barrage 與其他 table 的來源規範 |
| M1.5 | `docs/rule-engine/05-mvp-rule-scope.md` | 第一個 ground/logistics rules slice 使用與 deferred 範圍 |
| M1.6 | `docs/rule-engine/06-test-matrix.md` | 規則章節、invariant、unit/contract/replay test 對照 |

### Rule Engine API

```ts
getLegalActions(state, actor): GameAction[]
applyAction(state, action): TransitionResult
explainAction(state, action): RuleExplanation
projectState(state, viewer): ViewState
```

`TransitionResult` 必須包含新 state、events、pending decision、RNG state 與
validation errors。Rule Engine 不知道 React、component、dialog 或 mouse event。

### Exit gate

- domain schema 與 action vocabulary 已核准；
- 每個 state mutation 都能對應 OCS rule section；
- MVP 支援／deferred 規則明確；
- tables 缺失時 fail-fast，不填入猜測值；
- 測試矩陣涵蓋 OCS v4.3 ground/logistics MVP 範圍。

## 6. M2：Rule Engine Foundation

### 交付內容

- immutable `GameState`、revision、configuration、RNG state；
- typed hex coordinates、neighbors、distance 與 reciprocal edges；
- exact Token、RE、quarter-MP quantities；
- piece family、counter face、steps 與 OCS 六種 mode；
- stacking、ZOC 與 viewer visibility primitives；
- Weather、First Player、兩個 Player Turns、phase/segment state machine；
- basic movement、stack movement/drop-off、terrain/road/hexside cost；
- Reserve、Reaction 與 Exploitation 的 actor/phase permission；
- canonical serialization、event log 與 deterministic replay。

### 文件產出

- `docs/rule-engine/M2-state-and-sequence-report.md`
- `docs/rule-engine/M2-movement-zoc-coverage.md`
- `docs/reports/M2-replay-determinism.md`

### Exit gate

- 不透過 UI 即可完成一個無接敵完整回合；
- `getLegalActions` 的結果 stable、de-duplicated 且 actor 正確；
- invalid/stale action 不造成部分 mutation；
- save/load/replay 產生相同 state hash 與 RNG draws；
- Rule Engine package 沒有 React/browser import。

## 7. M3：Ground／Logistics Rule Engine

### Supply 與 Logistics

- SP/Token、dump、cargo、Transport Point、Organic Truck；
- direct draw、HQ draw/throw、adjacency；
- trace source、detrainable node、Extender；
- fuel、internal stock、OOS、attrition、Breakout；
- combat/barrage/fuel reservation 與取消 rollback；
- load/unload、combine/divide、capture/blow；
- resource/cargo conservation invariants。

### Combat

- Overrun 的 suspended movement transaction；
- regular combat declaration、supply、strength、terrain/category；
- AR、Surprise、table shifts、results、loss/option choices；
- retreat、tagalong、advance、DG、Exploit；
- artillery barrage、spotter、target/firer/phase limits；
- objective control、turn limit 與 victory adapter。

### 固定測試 Scenario

M3 使用 repository 內的小型 synthetic scenario，不等待 random generator 或
Beyond the Rhine 資料。Fixture 必須刻意涵蓋 movement、supply、Overrun、combat、
barrage、retreat、Exploitation 與 victory。

### 文件產出

- `docs/rule-engine/M3-logistics-model.md`
- `docs/rule-engine/M3-combat-transaction.md`
- `docs/rule-engine/M3-ground-rule-coverage.md`
- `docs/reports/M3-headless-scenario-replay.md`

### Exit gate

- headless client 可將 synthetic scenario 從 setup 玩到 victory；
- 所有中間 decision 可 save/load/replay；
- supply 與 combat resource mutation 可解釋且守恆；
- rule/table coverage 連到通過測試；
- 沒有 Gameplay Engine 或 UI 才能完成的規則步驟。

## 8. M4：Gameplay Engine

Rule Engine 決定「是否合法及結果」，Gameplay Engine 管理「一局遊戲如何被
操作」。兩者不可混在同一層。

完整分解見 [Gameplay Engine WBS](roadmap/03-gameplay-engine-wbs.md)，包含
G0–G10 的 ports、session、dispatch、decision、projection、persistence、replay、
recovery、headless driver 與 UI integration contract。

### 交付內容

- `GameSession` lifecycle：create、start、dispatch、pause、resume、finish；
- Rule Engine dispatch queue 與 pending-decision lock；
- state store、subscription、undo/redo by snapshot/replay；
- save/load、schema migration、autosave；
- viewer-specific projection、hot-seat side switching；
- selection、intent、path preview 等非 authoritative interaction state；
- command history、event log、rule explanation；
- headless gameplay adapter，供測試與未來 AI 共用。

### 建議 API

```ts
session.dispatch(action)
session.getLegalActions(actor)
session.getView(viewer)
session.getPendingDecision(viewer)
session.save()
session.load(snapshot)
session.replay(events)
```

### 文件產出

- `docs/gameplay/M4-game-session-contract.md`
- `docs/gameplay/M4-persistence-and-replay.md`
- `docs/gameplay/M4-view-projection.md`
- `docs/reports/M4-headless-gameplay-flow.md`

### Exit gate

- synthetic scenario 可經 Gameplay Engine 完成，不直接呼叫內部 rule function；
- session save/load/undo/replay deterministic；
- hot-seat projection 不洩漏隱藏資訊；
- interaction state 不取代 authoritative domain state；
- 未來 UI、generator 與 AI 都有穩定的使用介面。

## 9. M5：可人工操作的全新 UI

UI 完全重新實作，不沿用 `bcsEngine` React components 或 VASSAL widgets。

### 第一版可操作範圍

- 載入固定 synthetic scenario；
- map pan/zoom、hex/stack inspect、counter rendering；
- 顯示目前 turn/phase/actor、weather、resources；
- 只呈現 Gameplay Engine 提供的 legal actions；
- movement/path/supply/combat modifier explanation；
- pending decision UI：source、AR、loss、option、retreat、advance 等選擇；
- event history、save/load、undo/replay；
- hot-seat 切換與 viewer projection；
- 明確顯示未支援規則或 invalid scenario。

### UI 原則

- UI 不自行判斷 legality；
- UI 不擲 rules dice、不扣 SP、不修改 unit state；
- UI dialog 只呈現 Rule Engine transaction；
- 同一 action 從 UI 或 headless adapter 執行必須產生相同結果。

### 文件產出

- `docs/ui/M5-map-and-counter-contract.md`
- `docs/ui/M5-action-and-decision-flow.md`
- `docs/ui/M5-accessibility-and-hotseat.md`
- `docs/reports/M5-manual-playthrough.md`

### Exit gate

人類玩家能從 UI 將固定 synthetic scenario 完整玩到 victory，不需 editor、
console、直接修改 JSON 或人工修復 state。M5 通過後才開始 Random Map/OOB。

## 10. M6：Random Map

M6 開始前先研究 `bcsEngine/utils/mapGenerator.ts` 並輸出
`docs/generator-study/01-bcs-random-map.md`。可 adapt seeded stage、noise、graph、
hydrology、road-network 與 validation 結構，但必須重寫 BCS terrain/supply/
weather/balance semantics。

### Pipeline

```text
dimensions + style + mapSeed
  -> elevation/moisture
  -> OCS terrain classification
  -> reciprocal rivers/hexsides
  -> settlements/facilities
  -> roads/rail
  -> entry/supply regions
  -> topology/playability validation
  -> GeneratedMap + summary + warnings
```

### 必要 invariants

- reciprocal edge/river 一致；
- road/rail graph 達到連通門檻；
- 每方存在 entry/supply region；
- 有足夠合法部署區與接敵 corridor；
- 不存在大面積孤立或完全不可玩區；
- terrain distribution 符合 style；
- 相同 seed byte-stable；
- 至少 1,000-seed sweep 無未處理 exception／invalid map。

### UI 整合

在既有 UI 新增 map seed、style、width/height、randomize、regenerate、preview、
validation summary 與 save。此時只生成地圖，仍使用固定 OOB fixture 測試。

### 文件產出

- `docs/generator/M6-random-map-spec.md`
- `docs/generator/M6-map-validation.md`
- `docs/reports/M6-map-seed-sweep.md`

## 11. M7：OOB Catalog 與 Random OOB

實作狀態：M7.0–M7.10 已完成；逐步研究、驗證與交付證據見 [Random OOB WBS](roadmap/06-random-oob-wbs.md)。M8 才會加入 deployment 與 playable Scenario composition。

### 研究先行

1. 研究 BCS random OOB/template/deployment，輸出
   `docs/generator-study/02-bcs-random-oob.md`；
2. 研究 Beyond the Rhine `buildFile.xml` 的 PieceSlots、prototypes、container、
   formation、support/logistics，輸出
   `docs/generator-study/03-btr-oob-catalog.md`。

`.vsav` 只作選用 historical placement overlay，不是 base OOB 前置條件。

### Extraction

```text
moduledata + buildFile.xml
  -> raw prototype/PieceSlot records
  -> unit/resource/marker classification
  -> formation/support correlation
  -> reviewed exact OOB catalog
  -> separate generator archetypes
```

### Random OOB

- 本階段交付可追溯的 OOB-inspired random 模式；exact historical import 必須等待官方 game-specific OOB/rating review，不能只憑 VASSAL palette 宣稱完成；
- formation required/optional role slots；
- HQ、artillery、engineer、transport、SP/dump 等 package；
- steps、RE、mobility、AR、artillery、transport、supply capacity 的多維 budget；
- independent units 與 formation units 分離；
- source module/version/`gpid`/raw value/normalization/confidence 可追溯；
- 不套用 BCS HQ command、Combat Train、AV 或 activation semantics。

### 文件產出

- `docs/oob/M7-btr-extraction-report.md`
- `docs/oob/M7-normalization-decisions.md`
- `docs/oob/M7-generator-archetypes.md`
- `docs/generator/M7-random-oob-spec.md`
- `docs/reports/M7-oob-seed-sweep.md`

### Exit gate

- 同 module hash 產生 byte-stable catalog；
- 每個 normalized record 可回溯原始來源；
- generator 不存取 VASSAL module 也能讀 reviewed catalog；
- 固定 `oobSeed` 產生相同 force identity；
- UI 能固定 map、反覆重抽 OOB 並顯示 summary/warnings。

## 12. M8：Random Scenario Integration

實作狀態：**IN PROGRESS**。Random Map 與 Random OOB 已合成可人工操作的 generated scenario，且真實瀏覽器已完成 default、Large 與 contact 主流程；但 lifecycle、real save/load、Game End/final replay 與其餘產品操作 gate 尚未全數驗證，M8.10 不得標為完成。

2026-10-04 瀏覽器驗收（doc 03「Execution record 2026-10-04」）：New Game、Map、counter 與規則行動列多數通過，
但 NG-07（部署格數與凍結期望不符）、NG-10（產生中多個階段同時 active）、MAP-03、MAP-04 為 FAIL，SES 與 UI 列尚未執行，
M8 維持 **IN PROGRESS**。

M8 同時是正式的 Game Flow Integration milestone；詳細 WBS 與架構圖：

- [M8 Game Flow Integration WBS](roadmap/07-game-flow-integration-wbs.md)
- [End-to-end Game Flow Architecture](architecture/game-flow.md)

產品主流程固定為：

```text
New Game → Generate Map → Generate OOB → Compose/Deploy Scenario
         → Gameplay Session → Game End
```

UI 正常入口已移除 fixed synthetic fixture；M6/M7 preview 保留為診斷工具。畫面上的 map、OOB、legal actions、save/replay 與 result 全部來自同一個 generated Scenario。

### Seed contract

- `mapSeed`：terrain、river、road/rail、settlement、entry/supply geography；
- `oobSeed`：force identity、support/logistics package；
- `deploymentSeed`：placement 與 objectives；
- `rulesSeed`：規則擲骰；
- 固定 OOB 更換 map 時 force identity 不變；
- 固定 map 更換 OOB 時 geography byte-stable。

### Scenario composer

- template、scale、turn limit、attacker/defender roles；
- opposing entry/supply regions、front geometry；
- terrain/mode/stacking/RE/supply-legal deployment；
- objectives、victory rules、immutable configuration；
- summary、warnings、rejected-placement explanations；
- 未支援 air/naval/optional requirement 必須 fail-fast。

### Validation

- 無 duplicate ID、illegal location、overstack；
- 每方有合法 initial supply 與必要 resources；
- formation/package 必要角色完整；
- 雙方有 operational route 可達主要 objective；
- force budget 符合 template；
- generated scenario 能被 M4 Gameplay Engine 載入；
- 人類能透過 M5 UI 完成 generated scenario。

### 文件產出

- `docs/game-flow/00-current-gap-and-flow-contract.md` 至 `08-persistence-recovery.md`
- `docs/architecture/game-flow.md`
- `docs/reports/M8-orthogonal-seed-sweep.md`
- `docs/reports/M8-generated-game-flow-gate.md`

### Exit gate

固定 map/不同 OOB、固定 OOB/不同 map、deployment seed orthogonality 已通過；generated session 的整回合主流程亦已由真實瀏覽器操作通過。仍須依 `docs/quality/03-product-operation-verification-plan.md` 完成 real save/load、Game End/final replay、layout 與 fault-visibility gate。所有 P0 通過前，M9 AI Bot 不得開始。

## 13. M9：AI Bot

M9 開始前研究 BCS strategy、legal actions、executor、telemetry、paired self-play，
輸出 `docs/generator-study/05-bcs-ai-and-selfplay.md`。只保留架構與評估方式，
不移植 BCS activation/formation policies 或 handler-coupled executor。

### M9.1 Random-legal smoke bot

- 只從 Gameplay Engine 提供的 legal actions 選擇；
- 處理全部 pending decisions；
- 完成 generated scenario 到 turn limit；
- 用於發現 action coverage、deadlock、replay 問題，不作行為品質 baseline。

### M9.2 Heuristic baseline bot

- faction-level objective 與 operational plan；
- route、force concentration、movement、Overrun、combat scoring；
- 能合理結束 action/phase，避免無限循環；
- 每個 decision 有 score breakdown、intent 與 telemetry；
- 不包含固定 hex、unit/formation name 或 seed 特判。

### M9.3 Logistics-aware bot

- supply source/dump、SP spending、fuel、transport；
- artillery allocation與後勤保護；
- 跨 turn 保留 objective，但能適應不同 random map/OOB。

### AI contract

```text
actions = gameplay.getLegalActions(faction)
view = gameplay.getView(faction)
decision = bot.chooseAction(view, actions, botRng)
result = gameplay.dispatch(decision.action)
bot.recordResult(result.events)
```

AI 不直接呼叫 React handlers 或 Rule Engine 私有 function；bot RNG 不消耗
rules RNG。

### 文件產出

- `docs/ai/M9-bot-architecture.md`
- `docs/ai/M9-scoring-and-planning.md`
- `docs/reports/M9-bot-behavior-baseline.md`

### Exit gate

- Bot 能完成多組 generated scenarios；
- failed legal action、deadlock、infinite loop、replay mismatch 為零；
- human 與 bot dispatch 相同 action 時結果一致；
- decision deterministic 且 rules RNG 不受影響。

## 14. M10：Paired Self-play 與品質 Gate

### Evaluation matrix

1. 固定 OOB，掃不同 map seeds；
2. 固定 map，掃不同 OOB seeds；
3. 固定 map/OOB，掃 deployment seeds；
4. held-out map/OOB/deployment 組合；
5. 相同 scenario 交換 bot faction/seat；
6. baseline/candidate 使用 common rules RNG；
7. regression seeds 與 promotion seeds 分離。

### Blocking errors

- failed action、phase deadlock、early termination；
- save/replay 或 victory mismatch；
- invalid generated scenario escape；
- supply/resource conservation error；
- bot 超過 action/time budget。

### 文件產出

- `docs/selfplay/M10-harness-contract.md`
- `docs/selfplay/M10-telemetry-schema.md`
- `docs/reports/M10-seed-matrix.md`
- `docs/reports/M10-ai-promotion-decision.md`

## 15. M11：完整 OCS 擴充

Ground random scenario、人工 UI 與 AI self-play 穩定後，再依序擴充：

- rail、replacement、engineer、facility、breakdown 的進階功能；
- Air/base/mission/air transport；
- Naval/carrier/amphibious/shipping/port；
- optional rules 21.1–21.12；
- coast/port/island 等新 map styles；
- 新 OOB modules、theater/date filters、templates；
- editor 與 optional Electron packaging。

每個 subsystem 必須先產研究文件，再同步更新 Rule Engine、Gameplay Engine、
UI、generator validation、AI policy 與 self-play coverage。

## 16. 各階段 Definition of Done

### Foundation 完成

- [Foundation WBS](roadmap/01-foundation-wbs.md) F0–F10 通過；
- Hex/Map/Piece schemas 可 canonical serialize、validate、round-trip；
- definition/state/derived/view ownership 不重複；
- synthetic fixtures 足以支撐 Rule Engine，且 public types 無 BCS rule 語意。

### Rule Engine 完成

- [Rule Engine WBS](roadmap/02-rule-engine-wbs.md) R0–R10 通過；
- pure、deterministic、rule-numbered tests；
- 每個 mutation 只經 `applyAction`；
- table/provenance 明確；
- fixed synthetic scenario 可 headless 完成。

### Gameplay Engine 完成

- [Gameplay Engine WBS](roadmap/03-gameplay-engine-wbs.md) G0–G10 通過；
- session/save/load/undo/replay/project view 穩定；
- UI、generator、AI 不需存取 Rule Engine internals；
- authoritative 與 interaction state 分離。

### UI 完成

- 人類可完整玩 fixed scenario；
- UI 不包含 rule calculations；
- pending decisions 與 rule explanations 完整可操作。

### Random Map/OOB 完成

- seeds deterministic 且可分開鎖定；
- map/OOB/scenario validators 通過 seed sweeps；
- generated scenario 可由同一 Gameplay Engine/UI 完整遊玩；
- OOB 可追溯且不依賴 `.vsav` 或商業 assets runtime。

### AI Bot 完成

- 只使用 Gameplay Engine public contract；
- 能在不同 random map/OOB 完成遊戲；
- blocking errors 為零；
- paired held-out evaluation 與 performance gate 通過。

## 17. 立即執行順序

目前不要先做 Random Map/OOB 或 AI。下一步是：

1. 依 Foundation WBS 完成 M0 的 F0–F10；
2. 完成 M1 Rule Engine contract 與 rule/table/test manifest；
3. 實作 M2 Rule Engine Foundation；
4. 實作 M3 Ground/Logistics Rule Engine；
5. 依 Gameplay WBS 建立 M4 Gameplay Engine；
6. 建立 M5 可由人類完整操作的全新 UI；
7. UI/manual playthrough 通過後，才開始 M6–M8 Random Map/OOB；
8. Generated scenario 可由人類完整遊玩後，才開始 M9 AI Bot。
