# M13-Rail：鐵路（地圖生成、trace supply、Rail Cap）

狀態：**IN PROGRESS**（2026-10-04 建立）。R1 地圖生成、R2 trace supply 規則、R3 UI 已實作；R4 Rail Cap 運輸與 R5 的前線控制判定（rail-front-control）於 2026-10-08 實作，計畫與驗收見 `docs/roadmap/15-rail-cap-wbs.md`（IN PROGRESS）；R5 的軌距與港口仍為 TODO。
本文件是計畫，不是完成宣告；驗收列見 `docs/quality/03-product-operation-verification-plan.md` §H，RAIL-05～RAIL-10 仍為 `UNVERIFIED`。

需求來源（使用者，2026-10-04）：「考慮到rail對OCS的supply規則極重要 安排加入rail 包含map generate 以及對應的supply規則」；
追加指示：「rail不應該跟road一樣dense 應該要少一點」（因此不採 BtR 實測的「鐵路約與道路一樣密」校準值）。

## 0. 範圍界定

使用者要求的是「地圖生成」與「對應的 supply 規則」。OCS 4.3 中直接決定補給的鐵路規則是：

| 規則 | 內容 | 本計畫 |
|---|---|---|
| 12.6a 1) | 允許增援進入的地圖邊緣鐵路 hex 是 Supply Source | R1、R2 |
| 12.6a 2)、13.3c | Detrainable hex（有村／城市／港口，或 13.8c 的 HQ；受控制；鐵路路徑無敵 ZOC 回到 source）是 Supply Source | R2 |
| 13.3h | 只能把鐵路路徑追到（或穿過）自己控制的 detrainable hex；控制依前線 | R2（初始控制）、R5（前線判定） |
| 13.8c | Engineer-Capable HQ 讓所在鐵路 hex 成為 detrainable | R2 |
| 12.7a B/C、12.7g | Extender 連接兩段鐵路，或連接鐵路與 source | R2 |
| 6.2a | 鐵路在移動上視為道路 | R2 |
| 13.3a/b/e、12.2、13.6b | Rail Cap：以鐵路運送部隊、運輸點與 SP（補給移動） | **R4 TODO** |
| 13.3d/f/g | 軌距、Railhead、Rail Repair 單位 | **R5 TODO**（生成遊戲只有一種軌距） |

Rail Cap 屬於「運輸」（13.3 移動與 12.2 SP 移動），不是 trace supply 判定；本次未實作，列為 R4 並在 manifest
`movement.rail-sea-air` 以 `TODO rail-cap` 記錄，未經使用者同意不視為完成。

## R1 地圖生成（DONE，證據：RAIL-01）

- `src/generation/map/rails.ts`，地圖產生器版本 0.4.0。
- 多軌幹線（`edge:multi-track-rail`）：雙方主要 entry hex 與所有 Major City 之間的最近優先樹。
- 單軌支線（`edge:rail`）：每個 entry hex（因此每個 entry 都是 12.6a 的地圖邊緣鐵路 source）與較大的 Minor City（依聚落分數前 40%）。
- 迴圈只在兩站間鐵路繞行超過直線 2.5 倍、距離 8 hex 內時建立。
- 路線成本：偏好開闊低地、避開丘陵與山地，河流上的橋少；沿既有鐵路便宜，所以支線會併入網路。
- 驗證：鐵路必須是單一連通網路（`DISCONNECTED_RAIL_NETWORK`），每邊的 rail entry hex（主 entry 優先，每 `rowsPerRailEntry` 列一個；2026-10-10 使用者決定，其餘 entry 只走公路、仍為 Supply Source）必須在鐵路上（`ENTRY_OFF_RAIL`）；500 seed sweep 全數通過。
- 密度（每 land hex 的鐵路 hexside；道路約 0.55）：

| 尺寸 | 鐵路 / land hex | 鐵路 / 道路 |
|---|---|---|
| 18×12 | 0.15–0.22 | 0.27–0.45（幹線與 entry 支線是固定成本） |
| 32×24（預設） | 0.14–0.18 | 0.25–0.35 |
| 64×48 | 0.12–0.13 | 0.22–0.25 |

## R2 Trace supply 規則（DONE；UI 驗收 RAIL-05～RAIL-09 UNVERIFIED）

- `RuleConfiguration.railroads`（選填；舊存檔沒有此欄位即沒有鐵路）：鐵路 hexside feature 與單／多軌，以及讓鐵路 hex 可下車的 hex feature。
- 設定驗證：每條鐵路都必須有道路移動成本（6.2a，`RAILROAD_WITHOUT_ROAD_COST`）。BtR TEC 鐵路列：各 mobility 1 MP，泥濘時 Truck 4。
- `src/rules/supply/rail.ts`：鐵路圖、station、HQ detrainable、控制、`railTracePassable`、`detrainableHexesFrom`。
- `friendlySupplySources`：地圖邊緣 source、detrainable、Extender 三者做不動點迭代；每個 source 附上種類（`MAP_EDGE` / `DETRAINABLE` / `EXTENDER`）。
- 部署時依部署區（前線）設定鐵路 hex 的初始控制，objective 例外保持無人控制（避免開局就得分）。
- 測試：`tests/rules/ocs-rail-supply.test.ts`（8 項）、`tests/rules/rail-supply-flow.test.ts`、`tests/generation/random-map.test.ts` 鐵路項。

## R3 UI（DONE，證據：RAIL-01～RAIL-04）

- 預覽 SVG 與遊戲 canvas 畫出鐵路（深色軌道加枕木，多軌較粗並雙枕木），圖例加入 Railroad。
- 地圖邊緣 source 沿用 #53 的 S 圓標；Trace Supply overlay 只在自己的 detrainable source 標 `RAIL`、在 Extender 標 `EXT`（`querySupplySources` → `GameSession.getSupplySources`）。
- 驗收腳本：`scripts/rail-acceptance.mjs`。

## R4 Rail Cap 運輸（2026-10-08 實作，見 `docs/roadmap/15-rail-cap-wbs.md`；以下為原 TODO 紀錄）

- 缺少的行為：以 Rail Cap 移動部隊（Move Mode、上車前最多半個 MA、下車後不得再移動）、運輸點與 SP；entrain／move／detrain 只在 Movement Phase；
  全程多軌時成本減半、經過 Trainbusting zone 加倍；增援可在鐵路 entry 從地圖外上車（13.6b）；12.2a 一種運輸方式的 leapfrog 限制。
- 使用者可見影響：鐵路目前只影響補給判定與移動成本，SP 與部隊無法用鐵路遠距調動；Trainbusting 對鐵路沒有作用。
- 需要的設計決定：生成遊戲每回合的 Rail Cap 數值（建議依師數縮放，與 Supply Table status 相同做法），需使用者確認。
- 完成證據：規則測試，加上在真實 UI 用鐵路運送一個師與一批 SP 的驗收列（新增 RAIL-11 以後，需使用者同意加入驗收計畫）。

## R5 進階規則（TODO）

- **rail-front-control**：13.3h 第二種控制變化（hex「明確」位於敵方前線後方，即使沒有單位進入）未自動判定；目前只有單位進入才改變控制。
  影響：深入敵後被包圍的己方車站在無人進入前仍屬於原控制方，但其鐵路路徑通常已被 ZOC 或敵單位切斷。
  完成證據：前線判定規則設計與使用者同意，加上規則測試。
- **gauge**：13.3d/f/g（軌距、Railhead、Rail Repair 單位）在單一軌距的生成遊戲中不存在；若加入多軌距情境需新地圖資料與單位。
- **ports**：有海的生成地圖在沿岸聚落放港口（港口都在村鎮或城市，本來就是車站，13.3c）；港口是持有方的 Supply Source（19.0e），也是鐵路貨運路徑的起點（與地圖邊 source 相同），但不是 Rail Cap 的地圖邊鐵路入口（13.3b 到達只在地圖邊）。
