# M13-Rail：鐵路（地圖生成、trace supply、Rail Cap）

狀態：**IN PROGRESS**。R1–R4 完成；R5 的軌距、Railhead、Rail Repair 不在單一軌距的生成遊戲中（manifest `supply.rail-trace` 的 GAP）；
瀏覽器驗收 RAIL-05～RAIL-10、RAIL-15、RAIL-16 仍未 `PASS`（`docs/quality/03-product-operation-verification-plan.md` §H）。

需求來源（使用者，2026-10-04）：「考慮到rail對OCS的supply規則極重要 安排加入rail 包含map generate 以及對應的supply規則」；
「rail不應該跟road一樣dense 應該要少一點」。

| 步驟 | 內容 | 狀態 | 現況 |
|---|---|---|---|
| R1 | 地圖生成：多軌幹線、單軌支線、單一連通網路，密度低於道路 | DONE（RAIL-01） | `docs/generator/`、`src/generation/map/rails.ts` |
| R2 | Trace supply：地圖邊緣鐵路 source、detrainable hex、13.3h 控制、Extender 連接 | DONE（規則測試；RAIL-05～09 UNVERIFIED） | manifest `supply.rail-trace` |
| R3 | UI：地圖畫出鐵路，Trace Supply 標出 RAIL／EXT source | DONE（RAIL-01～04） | `docs/ui/map.md` |
| R4 | Rail Cap 運輸與前線控制 | 見 `15-rail-cap-wbs.md` | manifest `movement.rail-cap`、`supply.rail-front-control` |
| R5 | 軌距、Railhead、Rail Repair（13.3d/f/g） | 不適用於生成遊戲；加入多軌距情境時另立計畫 | manifest `supply.rail-trace` |

原始計畫、密度量測與實作紀錄：`docs/quality/evidence/rail-plan-2026-10-04/README.md`。
