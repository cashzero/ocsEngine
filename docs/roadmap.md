# ocsEngine 實作 Roadmap

本文件是里程碑與計畫的總覽。各里程碑的工作分解在 `docs/roadmap/`，現行行為在各主題資料夾
（`docs/foundation/`、`rule-engine/`、`gameplay/`、`ui/`、`game-flow/`、`generator/`、`oob/`、`ai/`），
驗收狀態在 `docs/quality/03-product-operation-verification-plan.md`，開放 TODO 在 `docs/quality/05-todo-inventory.md`。

## 1. 產品順序

```text
Hex Framework + Unit Data Structure
  -> OCS Rule Engine
  -> Gameplay Engine
  -> 可人工操作的 UI
  -> Random Map + Random OOB + Scenario（New Game）
  -> AI Bot
  -> Paired self-play 與完整 OCS 擴充
```

這是依賴順序：Foundation 固定座標、資料與序列化；Rule Engine 定義 state、action、合法性與結果；Gameplay Engine 管理
一局遊戲與存讀檔；UI 只顯示投影並送出合法行動；產生器產出同一個 Gameplay Engine 能載入的 scenario；AI 是同一套合法行動的
client，不另建規則。

## 2. 架構分層

```text
src/core/         座標、方向、hex geometry、ID、精確數量、validation
src/domain/       map、piece、scenario 資料模型與結構驗證
src/serialization 嚴格載入、canonical JSON、hash、migration seam
src/rules/        純 OCS 規則、合法行動、state transition、圖表
src/gameplay/     session、dispatch、history、存讀檔、replay、projection
src/generation/   random map、OOB catalog、random OOB
src/game-flow/    New Game：部署、scenario 組合、驗證、啟動 session
src/ui/           地圖、counter、command deck、決策、交接
src/ai/           bot 驅動、策略、評估
```

依賴只能往下游：`rules` 不 import `gameplay`、UI、產生器或 AI；`gameplay` 不 import UI、產生器或 AI；UI、產生器與 AI 只用公開
投影與行動。邊界由 `tests/integration/foundation-gate.test.ts` 掃描 import 強制（`docs/foundation/principles.md`）。

## 3. 里程碑

| 里程碑 | 內容 | 狀態 | 計畫 | 現況 |
|---|---|---|---|---|
| M0 | Hex Framework 與 Unit Data Structure | **DONE** | [01-foundation-wbs](roadmap/01-foundation-wbs.md) | `docs/foundation/` |
| M1–M3 | Rule Engine（contract、基礎、地面與後勤） | **IN PROGRESS**（R10 gate） | [02-rule-engine-wbs](roadmap/02-rule-engine-wbs.md) | `docs/rule-engine/` |
| M4 | Gameplay Engine | **DONE** | [03-gameplay-engine-wbs](roadmap/03-gameplay-engine-wbs.md) | `docs/gameplay/session.md` |
| M5 | 可操作的 UI | **IN PROGRESS**（U10 gate） | [04-ui-wbs](roadmap/04-ui-wbs.md) | `docs/ui/` |
| M6 | Random Map | **DONE** | [05-random-map-wbs](roadmap/05-random-map-wbs.md) | `docs/generator/` |
| M7 | OOB Catalog 與 Random OOB | **DONE**；0.4.0 改版 IN PROGRESS | [06-random-oob-wbs](roadmap/06-random-oob-wbs.md)、[12-oob-revision-wbs](roadmap/12-oob-revision-wbs.md) | `docs/oob/`、`docs/generator/` |
| M8 | Random Scenario 與 Game Flow 整合 | **IN PROGRESS**（M8.10 gate） | [07-game-flow-integration-wbs](roadmap/07-game-flow-integration-wbs.md)、[13-engagement-scenarios-wbs](roadmap/13-engagement-scenarios-wbs.md) | `docs/game-flow/` |
| M9 | AI Bot | **IN PROGRESS**（headless B0–B5；UI 整合 B7 等 M8） | [11-ai-bot-wbs](roadmap/11-ai-bot-wbs.md) | `docs/ai/` |
| M10 | Paired self-play 與品質 gate | **IN PROGRESS**：升級流程已在使用（`docs/ai/evaluation.md`）；權重自我對戰停用 | 本文件 §4 | `docs/ai/evaluation.md` |
| M11 | 完整 OCS 擴充 | **IN PROGRESS**，見下表 | 本文件 §4 | 各主題資料夾 |

M11 已進行的擴充：

| 擴充 | 狀態 | 計畫 | 現況 |
|---|---|---|---|
| 空軍（14.0–15.0） | IN PROGRESS | [08-air-power-wbs](roadmap/08-air-power-wbs.md) | `docs/rule-engine/air-power.md` |
| 補給與運補 UI | IN PROGRESS（Phase B 未開始） | [09-supply-logistics-ux-wbs](roadmap/09-supply-logistics-ux-wbs.md) | `docs/ui/command-deck.md` |
| 鐵路 | IN PROGRESS | [10-rail-wbs](roadmap/10-rail-wbs.md) | manifest `supply.rail-trace` |
| Rail Cap 與 13.3h 控制 | IN PROGRESS | [15-rail-cap-wbs](roadmap/15-rail-cap-wbs.md) | manifest `movement.rail-cap` |
| Hedgehog（16.0） | DONE | [14-hedgehogs-wbs](roadmap/14-hedgehogs-wbs.md) | manifest `hedgehogs` |
| 工兵架橋（13.8b） | IN PROGRESS（電腦未使用） | [16-bridging-wbs](roadmap/16-bridging-wbs.md) | manifest `engineering.bridging` |
| Breakdown（20.0） | 待使用者核准驗收列 | — | `docs/rule-engine/breakdowns.md` |
| 補充與重建（13.5、13.9） | IN PROGRESS | — | `docs/rule-engine/replacements.md` |
| 港口與海運（19.0） | IN PROGRESS（MAP-07～09） | — | manifest `movement.sea` |
| 印刷 counter 忠實度 | IN PROGRESS | [17-counter-fidelity-wbs](roadmap/17-counter-fidelity-wbs.md) | `docs/ui/map.md` |

## 4. 尚未開始的工作

- **M9**：B6 完整的後勤規劃、B7 產品 UI 整合（人對電腦、觀戰）、B8 行為基準、B9 exit gate（`11-ai-bot-wbs.md`）。
- **M10**：跨 map／OOB／deployment seed 的評估矩陣與 held-out 組合；blocking error（失敗行動、deadlock、重播或勝負不符、
  資源守恆錯誤、超出預算）一律為零。現行的對戰評估與升級流程見 `docs/ai/evaluation.md`。
- **M11**：艦艇、登陸艇與兩棲作戰（18.0）；選用規則（21.1–21.12）；新的地圖風格與 OOB 模組；editor；選用的 Electron 封裝。
  每個子系統先寫研究，再同步更新 Rule Engine、Gameplay、UI、產生器驗證、AI 與 self-play。

## 5. 各層完成定義

- **Foundation**：schema 可 canonical serialize、驗證、round-trip；definition／state／derived／view 不重複；fixtures 足以支撐規則測試。
- **Rule Engine**：純函式、確定性、依條文的測試；所有變動只經 `applyAction`；圖表來源明確；manifest 每列有證據。
- **Gameplay**：session、存讀檔、undo、replay、投影穩定；UI、產生器、AI 不需規則內部。
- **UI**：人類可完整玩一局；UI 不含規則計算；決策與規則說明完整可操作；`03` 的 UI 列通過。
- **Random Map／OOB**：seed 確定且可分開鎖定；產生的 scenario 通過 seed sweep，並可由同一 Gameplay Engine 與 UI 玩完。
- **AI Bot**：只用 Gameplay 公開介面；在不同 random map／OOB 完成遊戲；blocking error 為零；paired held-out 評估通過。
