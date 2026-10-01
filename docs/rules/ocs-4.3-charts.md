# OCS v4.3 圖表與 BTR 戰鬥地形表轉錄

來源：使用者提供的 Beyond the Rhine VASSAL 模組 1.27.0（`E:\work\Beyond the Rhine_1_27_0\images`）。
規則引擎程式碼：`src/rules/tables/ocs-4.3.ts`（系列圖表）、`src/game-flow/combat-tec.ts`（BTR 戰鬥地形）、
`src/game-flow/movement-tec.ts`（BTR 移動地形，見 `btr-movement-tec.md`）。

| 圖檔 | SHA-256 | 轉錄內容 |
|---|---|---|
| `v4.3 Charts (final)-2 1000.png` | `0e5b8282b953d8bf389f3461ada4e30bee4ea8897e34390c031ee47d1cc3ad32` | Surprise Rolls（9.8）、Combat Supply（9.5）、Anti-Tank（9.4e）、Action Rating Mods（9.6）、戰果說明（9.10） |
| `v4.3 Charts (final)-3 1000.png` | `5484b15276d54a8afd1896692671b6b56a6d0694162d20fbdce39542e16aa96a` | Combat Table（9.9），4 條地形列 × 13 欄 × 15 列 |
| `v4.3 Charts (final)-4 1000.png` | `69b711ebb28640f9c2262677c8a7595b75765e7b130ec7dfc1b61818abbd94c9` | Barrage Table（10.0a）、Density／Additional Shifts |
| `BTR TEC.jpg` | `70ca1a8564a6527db668fd5c347d423ec81384d45a7a7628162286b1b513a770` | Terrain Effects on Combat（BTR） |

## Combat Table（9.9）

欄位（依防守方地形列）：

| 列 | 13 欄 |
|---|---|
| Open | 1:5 1:4 1:3 1:2 1:1 2:1 3:1 4:1 5:1 7:1 9:1 11:1 13:1 |
| Close | 1:4 1:3 1:2 1:1 2:1 3:1 4:1 6:1 8:1 10:1 12:1 15:1 18:1 |
| Very Close | 1:3 1:2 1:1 2:1 3:1 4:1 6:1 9:1 12:1 15:1 18:1 21:1 24:1 |
| Extr Close | 1:2 1:1 2:1 3:1 4:1 8:1 12:1 16:1 20:1 28:1 36:1 44:1 52:1 |

結果列（修正後 2d6：1 以下、2…14、15 以上）逐格轉錄於程式碼 `COMBAT_TABLE_ROWS`；格式 `攻方/守方`，
`-` 表示該方無結果。

交叉檢查（規則書範例，第 9.8 與 Hip Shoot 範例）：

- Open 4:1 攻方 Surprise 右移 3 欄 → 9:1；擲 7+5=12 → `Ae3/DL2o2DG`；無 Surprise 時 4:1、12 → `Ae4/DL1o2`。兩者皆符合。
- 自 4:1 左移 6 欄 → 1:4；擲 7−5=2 → `AL2`；無 Surprise 時 4:1、2 → `AL1o1/Do1`。符合。
- Hip Shoot 範例 9:1、修正後 7 → `Ao1e4/DL1o2`。符合。
- 例外：綜合戰鬥範例寫「4:1 擲 7 得 Ao1/Do1」，但 v4.3 圖表 4:1、7 為 `Ao1/DL1o1`。以圖表為準（範例文字可能沿用舊版表）。

Surprise（9.8）：Overrun 修正後 ≥9 攻方、≤6 守方；一般攻擊 ≥10 攻方、≤5 守方；有 Surprise 時擲 1 骰決定移欄數。
戰鬥補給（12.4）：攻方每攻擊 step 1T；守方每場 2T（1 RE 以下 1T），守方可拒付並以半戰力防守。

## Barrage Table（10.0a）

欄位與每欄補給成本：1 以下 1T、2 1T、3-4 2T、5-7 2T、8-11 2T、12-16 3T、17-24 3T、25-40 4T、41-68 6T、
69-116 8T、117+ 10T。結果列逐格轉錄於 `BARRAGE_TABLE_ROWS`。

- `[1/2]`：3/4 級 Hedgehog、空中／艦砲，或沒有正確觀測者時視為 DG；否則同 `1/2`。
- `1/2`：擲 1 骰，4–6 損 1 step 並 DG，否則只 DG。
- 密度：1 RE 以下左 1；>1–3 無；>3–4 右 1；>4–5 右 2；>5–6 右 3；>6 右 4（多 step 單位最多算 3 RE）。
- 其他：Hedgehog 左 1、Close/Very Close 左 1、Extremely Close 左 2、無觀測者左 3、目標有 Strat 右 3。

## BTR Terrain Effects on Combat → 產生地圖地形

`[x#]` 只影響攻方（9.4d）。`*`（僅道路）由 9.1f 移動規則處理。

| 產生地形 | BTR 列 | 戰鬥列 | Armor | Mech | Other |
|---|---|---|---|---|---|
| `terrain:clear` | Open | Open | [x2] | [x2] | x1 |
| `terrain:rough` | Hills | Close | x1 | x1 | x1 |
| `terrain:woods` | Woods | Close | x1 | x1 | x1 |
| `terrain:marsh` | Polder or Swamp | Very Close | x1/2 | x1/2 | x1 |
| `terrain:mountain` | Mountain | Extremely Close | x1/3 | [x1/2] | x1 |
| `settlement:village` | Village | Close | x1 | x1 | x1 |
| `settlement:town` | Minor City | Very Close | x1/2 | [x1/2] | x1 |
| `settlement:city` | Major City | Extremely Close | x1/3 | [x1/2] | x1 |
| `edge:river`（hexside） | Minor River（Dry） | ot | [x1/2] | [x1/2] | [x1/2] |
| `edge:major-river`（hexside） | Major River | ot | [x1/4] | [x1/3] | [x1/2] |

## TODO

- （程式已完成 2026-10-01，待實機 UI 驗證）天候（泥濘／雪）欄已依地表狀態選用。原記錄：天候（泥濘／雪）欄未啟用。影響：天候不影響戰鬥與移動。關閉證據：天候規則實作後依地表狀態選欄並以測試與實際 UI 驗證。
- （部分完成 2026-10-01，待實機驗證）防守方的地形選擇（9.3b）已改為玩家決策；
  攻擊堆疊地形（9.4b/c）與砲擊地形選擇仍由引擎代選對防守方最有利者（該選項只會削弱攻方，見重建紀錄 §7）。原記錄：防守方的地形選擇（9.3b、9.4b/c）與砲擊地形選擇由引擎代為選擇對防守方最有利者。影響：玩家不能選擇次佳地形。
  關閉證據：防守方地形選擇決策、UI 呈現與規則測試。

## 2026-10-01 追加的表

| 表 | 來源（VASSAL 模組 1.27.0 images/） | SHA-256 | 程式 |
|---|---|---|---|
| Attrition Table（12.8b）、Capture Table（9.14b/c）、Dump Blowing（12.11a） | `v4.3 Charts (final)-2 1000.png` | 0e5b8282…aa96a 同上頁 | `src/rules/tables/ocs-4.3.ts` |
| BTR Weather Table（地表狀態欄，一顆骰） | `BTR Weather Table.jpg` | 3ba45897450e339c22557e526890e14288d540fe81f65d9db0db2373259ed52f | `src/game-flow/weather-supply-tables.ts` |
| BTR German Supply Table（兩顆骰 × Supply Status） | `BTR Axis Supply.jpg` | e4167413c9bd95cabf5fdca33a60ea1abad401e1144813d62f59ef66eb6865fd | 同上 |
| 5 點卡車背面 Extender（20 Truck MP） | `TuPTS02R08C20B.png` | f85920171e776512085fb448f36cbceebe719e05b916aa9aa3e5d4782fe95d01 | `src/generation/oob/counter-corpus.ts` |
| US 159 Inf Rgt（4-3-3／2-3-14） | `BTR S02 R06 C19.png`／`C19B.png` | d7f71403420c81ebded87769a3cee486392cbca63ede53b6a917240cf5428897（正面） | 同上 |

產生遊戲的取捨（資料，不是規則簡化）：
- 天候表各列的日期範圍延伸到下一列起點，涵蓋 BTR 每月回合日（1、5、8、12、15、19、22、26、29；二月無 29）。飛行狀態不擲（地面遊戲沒有空軍）。
- 雙方共用德軍 Supply Table；Supply Status 欄 = 每方編隊數（1–12）。
