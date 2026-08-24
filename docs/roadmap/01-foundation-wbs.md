# Foundation WBS：Hex、Map 與 Piece Data Model

## 1. 目的與完成定義

Foundation 的責任是建立「OCS 狀態可以被正確表示」的基礎。它不判斷移動、
堆疊、補給或戰鬥是否合法，也不管理一局遊戲。

完成後，Rule Engine 應可直接使用穩定的 hex/map/piece types 與 synthetic
fixtures，不必自行發明第二套座標、ID、location 或 serialization。

## 2. 邊界

| Foundation 擁有 | Foundation 不擁有 |
|---|---|
| branded IDs、exact scalar、schema version | phase、actor、legal action |
| hex coordinate、direction、edge identity | movement cost、ZOC、stacking limit |
| immutable map definition 與 mutable map-state slots | terrain／facility 的規則效果 |
| piece definition、piece state、location、relations | mode transition、loss、fuel、supply legality |
| canonical serialization 與 structural validation | save slot、undo、session lifecycle |
| synthetic fixture factories | UI view state、generator、AI policy |

## 3. 核心建模決策

### 3.1 `Piece` 而非單一巨大 `Unit`

最上層使用 tagged union：

```ts
type PieceDefinition =
  | GroundUnitDefinition
  | ResourceDefinition
  | AirUnitDefinition
  | NavalUnitDefinition
  | FacilityDefinition
  | MarkerDefinition;

type PieceState =
  | GroundUnitState
  | ResourceState
  | AirUnitState
  | NavalUnitState
  | FacilityState
  | MarkerState;
```

第一版 runtime 只需完整支援 ground/resource/必要 facility；air/naval 可以有
可驗證的 deferred schema，但不得用大量 optional fields 塞進 Ground Unit。

### 3.2 Definition、State、Derived、View 分離

- `Definition`：劇本期間不變的印刷值、face、能力、來源；
- `State`：位置、步數、mode、marker、cargo 等會改變的最小資料；
- `Derived`：current RE、有效 MA/strength、ZOC、supply status 等由 Rule Engine
  即時計算，不在 state 重複保存；
- `View`：隱藏資訊處理後交給 Gameplay/UI 的投影，不屬於 Foundation。

### 3.3 Stack 不作為永久 entity

一般 stack 是「同 location 的 pieces 依 stack order 排列」的 query 結果。
Foundation 不另外保存 `Stack.units[]`，避免 unit location 與 stack membership
兩份資料失同步。需要鎖定 phase-start stack 的 Overrun 等規則，由 Rule
Engine transaction 保存 member ID snapshot。

### 3.4 Base map 與 mutable map state 分離

- `MapDefinition`：hex 存在性、印刷 terrain、road/rail/river、printed facility；
- `MapState`：control、rail gauge、bridge/port/airbase damage、hedgehog、臨時狀態；
- 規則效果由 Rule Engine 根據 Definition + State + configuration 推導。

## 4. Foundation 工作分解

每個子階段都要提交獨立文件；不能只在 code review 說明：

| Stage | Required document |
|---|---|
| F0 | `docs/foundation/00-vocabulary-and-adrs.md` |
| F1 | `docs/foundation/01-core-primitives-and-identity.md` |
| F2 | `docs/foundation/02-hex-geometry-contract.md` |
| F3 | `docs/foundation/03-hexside-and-location-model.md` |
| F4 | `docs/foundation/04-map-definition-and-state.md` |
| F5 | `docs/foundation/05-piece-definition-catalog.md` |
| F6 | `docs/foundation/06-piece-state-and-relations.md` |
| F7 | `docs/foundation/07-scenario-envelope.md` |
| F8 | `docs/foundation/08-schema-and-serialization.md` |
| F9 | `docs/foundation/09-fixture-test-kit.md` |
| F10 | `docs/reports/F10-foundation-integration.md` |

### F0：Vocabulary、ADR 與 package boundary

決定並文件化：

- `piece`、`unit`、`counter`、`marker`、`facility` 的精確用語；
- definition/state/derived/view ownership；
- axial coordinate orientation 與 hex numbering；
- immutable update、error/result 與 public API style；
- package dependency rule 與禁止 import 清單；
- OCS series data、game data、scenario data 的分層。

產出：

- `docs/foundation/00-glossary.md`
- `docs/foundation/adr/001-package-boundaries.md`
- `docs/foundation/adr/002-definition-state-derived-view.md`
- `docs/foundation/adr/003-hex-orientation.md`

Exit gate：同一名詞在後續 schema 與 Rule Engine 不再有兩種含義。

### F1：Core primitives 與 identity

實作：

- branded `HexId`、`PieceId`、`DefinitionId`、`PlayerId`、`ScenarioId`；
- `SchemaVersion`、`Revision`、`SourceReference`、content hash；
- integer Token、quarter-MP tick、exact RE 的 scalar wrappers；
- deterministic compare/sort 與 stable key；
- typed `Result<T, DomainError>`、validation issue、warning severity；
- immutable collection/update helper 的最小集合。

不實作：movement rounding、supply cost、combat odds等 rule math。

測試：invalid scalar、boundary、stable sort、ID collision、JSON round-trip。

### F2：Hex geometry kernel

實作：

- axial coordinate 與必要 cube conversion；
- 六個 `HexDirection`、neighbor、opposite；
- distance、ring、range、line/interpolation；
- canonical `HexId` encode/decode；
- rotation/reflection helpers，僅在 fixture/generator 確有需求時加入；
- logical-to-pixel/pixel-to-logical 純函式；
- explicit orientation/layout parameter，不讀 UI global state。

Property tests：

- neighbor 的 opposite 回到原 hex；
- distance symmetry／triangle inequality；
- ring 數量與 range 去重；
- key round-trip；
- pixel round-trip 在 tolerance 內；
- BCS geometry 若 adapt，需以 contract tests 證明 orientation 相符。

### F3：Hexside、node 與 location model

實作：

- `DirectedHexsideRef` 與 canonical `HexsideId`；
- reciprocal edge normalization；
- edge feature collection，不在此計算 crossing cost；
- map node/region/track/box ID；
- tagged `PieceLocation`：
  `ON_MAP`、`OFF_MAP_BOX`、`HOLDING_AREA`、`TURN_TRACK`、`POOL`、
  `ELIMINATED`、`CONTAINER`；
- location structural validation 與 deterministic ordering。

關鍵決策：map 上的位置使用 `HexId`；reinforcement box 或 dead pile 不偽裝成
特殊座標。

### F4：Map definition 與 map state

拆成：

```text
MapDefinition
  HexDefinition
    base terrain layers
    printed features
    roads/rail/rivers/hexsides
    source/entry/facility declarations

MapState
  control
  mutable infrastructure
  scenario-created features
  damage/reduction state
```

工作項目：

- sparse/dense map container 選擇與 bounds policy；
- hex lookup、ordered iteration、neighbor existence；
- multi-terrain representation，不用單一 terrain enum 封死；
- road、rail、river、bridge 採 edge feature；
- port、airbase、hedgehog、source 採 typed feature/facility reference；
- printed map 與 mutable overlay 合併 query；
- map-level provenance 與 game-specific override hooks 的資料位置；
- structural validator：missing neighbor、orphan edge、duplicate feature、bad ref。

不在 F4 決定 terrain cost、rail movement、port capacity 或 facility repair。

### F5：Piece definition catalog

建立 versioned catalog：

- `PieceDefinition` common header：ID、family、owner/faction、name、source；
- face definitions：printed steps/strength/MA/AR/RE/range 等原始值；
- capability IDs 與 typed parameters；
- nationality、formation/group、unit category、mobility class；
- multi-step face/step profile，不假設只有 front/back；
- resource quantity/capacity definition；
- facility/marker definition；
- source layer：raw、normalized、confidence、review status。

能力只宣告資料，如 `ATTACK_CAPABLE`、`TRANSPORT_CAPACITY`。能力的 eligibility
與效果由 Rule Engine 實作，Foundation 不接受 function callback。

### F6：Piece runtime state 與 relation ledger

Ground MVP state：

- definition reference、owner、location、current face/steps；
- OCS mode 與 face orientation 分離；
- markers/status 的 typed state；
- movement-use bookkeeping 的資料槽只在 Rule Contract 核准後加入；
- stack order 值而非 duplicate membership list。

Relations 使用獨立 ledger：

- cargo/container；
- attachment/parent；
- formation/group membership 若 runtime 可變；
- transport load quantity；
- relation uniqueness、cycle、capacity 的 structural validation。

Foundation 只保證 reference 與 cycle 結構正確；裝載成本、容量效果與 attachment
legality 屬於 Rule Engine。

### F7：Scenario/configuration data envelope

定義可被 Gameplay Engine 載入的靜態輸入：

- map definition/state seed；
- piece catalog subset 與 initial piece states；
- players/sides、turn start、weather/table IDs；
- off-map boxes、tracks、entry/source declarations；
- immutable option/configuration IDs；
- external table references 與 provenance；
- generator metadata 可以存在，但 Foundation 不依賴 generator。

這是固定 synthetic scenario 與未來 generated scenario 的共同格式。

### F8：Schema、canonical serialization 與 migration seam

實作：

- 每個 persistent aggregate 的 schema version；
- strict parser 與完整 validation issue path；
- canonical property/order policy；
- stable content hash；
- unknown future fields 的明確 policy；
- migration interface，只提供 seam，不先寫不存在的 migration；
- Definition ID／State ID reference integrity。

禁止直接把 JSON cast 成 TypeScript live type。

### F9：Fixture builders 與 Foundation test kit

提供最小 builder，而非龐大 scenario framework：

- 5 x 5 plain map；
- road/river/rail/bridge edge fixture；
- ground unit、multi-step unit、HQ、artillery、transport、SP/dump；
- off-map/holding/container location；
- malformed fixture collection；
- deterministic factory IDs，不用 `Math.random()`。

Fixture builder 必須能覆寫單一欄位，以便 Rule Engine 測試聚焦規則。

### F10：Foundation integration gate

建立一份只驗證資料而不執行規則的 synthetic scenario：

- load/validate/canonical serialize/hash/reload；
- enumerate map/hex/pieces/locations；
- resolve every definition/reference；
- verify all edge reciprocity and relation integrity；
- clone/update one piece state without mutation leakage；
- report no BCS domain term contamination。

## 5. 建議 package 版圖

```text
src/
  core/
    id/
    quantity/
    result/
    hex/
    serialization/
  domain/
    map/
      definition/
      state/
      location/
      validation/
    piece/
      definition/
      state/
      relations/
      catalog/
      validation/
    scenario/
      schema/
      validation/
  testing/
    foundationFixtures/
```

目錄只在有實際 code 時建立；這是 ownership map，不要求先 scaffold 空檔案。

## 6. Foundation 最終 Gate

- F0–F10 每一步均有對應文件與測試；
- public types 無 React、Gameplay、generator、AI import；
- geometry/property tests 與 schema round-trip 全數通過；
- Definition/State/Derived/View 沒有重複 ownership；
- map base/mutable state 與 piece definition/runtime state 清楚分離；
- current RE、effective strength/MA/ZOC 等 derived rule values 未重複持久化；
- fixed synthetic scenario 可供 Rule Engine 直接使用；
- 後續發現需求時可加 tagged variant，而不破壞既有 persistent schema。
