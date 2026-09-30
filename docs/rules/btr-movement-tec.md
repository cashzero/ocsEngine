# Beyond the Rhine 移動地形效果表（TEC）轉錄

來源：使用者於 2026-09-30 提供的 `BTR_TEC_jp.pdf`（日文版 Beyond the Rhine TEC，
第 2 頁「移動に関する地形効果表」），SHA-256
`2a51331aae3b6e816353c80f3156c7a01df6dc035944374b9fd0eecba54dd0e9`。
使用者指定以此表作為 generated game 的移動成本來源。

符號：數字為 MP；`+n` 為疊加的 hexside 成本；`P` 禁止進入；`All` 需耗盡全部 MA；
`ot` 使用 Hex 內其他地形。欄位順序：Track（裝軌）／Truck（自動車化）／Leg（徒步）。

| 地形 | 通常 Track | 通常 Truck | 通常 Leg | 泥濘 Track | 泥濘 Truck | 泥濘 Leg | 雪 Track | 雪 Truck | 雪 Leg |
|---|---|---|---|---|---|---|---|---|---|
| Open 平地 | 1 | 1 | 1 | 4 | 8 | 2 | 2 | 2 | 2 |
| Hills 丘陵 | 2 | 3 | 1 | 4 | 6 | 2 | 3 | 6 | 2 |
| Woods 森林 | 2 | 3 | 1 | 6 | All | 2 | 4 | 5 | 3 |
| Heavy Woods 深い森林 | 3 | 5 | 2 | All | All | 2 | 4 | 6 | 3 |
| Polder 干拓地 | P | P | 2 | P | P | 3 | P | P | 2 |
| Swamp 湿地 | P | P | 3 | P | P | 4 | 5 | 6 | 3 |
| Mountain 山岳 | P | P | All | P | P | All | P | P | All |
| Village 村 | ot | ot | ot | ot | ot | ot | ot | ot | ot |
| Minor City 小都市 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| Major City 大都市 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| Minor River or Canal 小河川／運河 | +3 | +5 | +1 | +4 | +6 | +2 | +3 | +5 | +1 |
| Major River or Canal 大河川／運河 | P | P | All | P | P | All | P | P | All |
| Rhein River ライン河 | P | P | P | P | P | P | P | P | P |
| Rhine ferry ライン河フェリー | P | P | All | P | P | All | P | P | P |
| Blown bridge 破壊された橋梁 \* | P | P | All | P | P | All | P | P | P |
| Blocked 侵入不可能ヘックスサイド | P | P | P | P | P | P | P | P | P |
| Lake 湖 | P | P | P | P | P | P | P | P | P |
| Ocean 海 | P | P | P | P | P | P | P | P | P |
| Autobahn アウトバーン | 1/3\*\* | 1/3\*\* | 1/3\*\* | 1 | 1 | 1 | 1/2\*\* | 1/2\*\* | 1/2\*\* |
| Secondary Road 二級道路 | 1/2\*\* | 1/2\*\* | 1/2\*\* | 1 | 2 | 1 | 1 | 1 | 1 |
| Track 小道 | 1 | 1 | 1 | 1 | 4 | 1 | 1 | 1 | 1 |
| Railroad 鉄道 | 1 | 1 | 1 | 1 | 4 | 1 | 1 | 1 | 1 |

\* 修復後的萊茵河橋恢復一般道路／小道／鐵道移動成本。
\*\* 一般飛行狀態下，若航空阻止（3.7b）未停止，德軍移動成本增為 1 MP。

## Generated game 對應

實作於 `src/game-flow/movement-tec.ts`，只使用「通常」欄。

| Generated Definition | BTR TEC 列 | 說明 |
|---|---|---|
| `terrain:clear` | Open | |
| `terrain:rough` | Hills | BTR 無 Rough；以同為 Close 戰鬥地形的 Hills 對應 |
| `terrain:woods` | Woods | |
| `terrain:marsh` | Swamp | |
| `terrain:mountain` | Mountain | |
| `terrain:water` | Ocean | |
| `settlement:village` | Village | `ot`，不參與最高成本計算 |
| `settlement:town` | Minor City | 依 6.2d 與其他地形取最高成本 |
| `settlement:city` | Major City | 同上 |
| `edge:river` | Minor River or Canal | 疊加於 Hex 成本 |
| `edge:major-river` | Major River or Canal | |
| `edge:primary-road` | Secondary Road | 1/3 MP 的 Autobahn 無法以四分之一 MP ticks 精確表示，且 generator 不產生高速公路 |
| `edge:road` | Track | |

規則實作（`src/rules/movement/movement.ts`）：

- 6.2a：跨越有道路的 hexside 時付道路成本（多種道路取最低），忽略 Hex 地形與其他 hexside 地物；
  道路也可越過禁止的 hexside（6.2c）。
- 6.2b／6.2d：非道路移動付 Hex 內最高成本地形（`ot` 除外）加上所有 hexside 疊加成本。
- 6.2c／6.1d：禁止地形不可進入；A→B 只有在 B→A 也不被禁止時才合法。
- 6.1c：最低移動一格不可進入禁止地形，且 MA 必須大於 0。
- `All`：進入成本等於單位當前全部 MA，因此只能在未移動時進入（或以最低移動進入）。

## TODO

- 泥濘／雪欄未啟用。影響：天候對移動無影響。關閉證據：天候與地表狀態實作後，依地表狀態選欄並以規則測試與實際 UI 驗證。
- 航空阻止對德軍道路成本的註記未實作。影響：道路移動在空優劣勢下無差別。關閉證據：空權規則實作後依 3.7b 條件套用並測試。
- 燃料（12.5）未實作。影響：Truck／Tracked 單位移動不需付燃料。關閉證據：燃料規則、支付決策與 UI 流程實作並驗證。
