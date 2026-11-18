# 西歐攻方低欄位攻擊的單步接續

依[登記方案](protocol.md)，只在普通戰鬥段的一次出手決策中，把欄位 0–3 的敵方目標加分減半。兩組使用相同的候選查詢與遊戲規則，從第二個決策起都用凍結的 v90 建置（`55aff4c`）。這是既有對局的接續研究。

在 v88 攻方的 40 場西歐對局取出全部 52 個符合條件的決策，分布在 27 張地圖。v90 在 52 個原局面全都選了原攻擊動作。減半後改選 31 次，其中 18 次換攻擊格、11 次結束戰鬥段、2 次改選同格的攻擊組合。31 次包含原歷史中 3 次奪點、1 次打空未進佔與 27 次守軍仍在的案例。

每個改選各跑兩條配對骰流，共 62 組配對、124 條終局接續。每組首步選擇與未換骰的探測相同。兩組均從相同局面與步驟記憶開始。接續共 52,392 個行動，無拒絕，逐條重播到對應的終局雜湊。原 40 場也以凍結 v88 重播到記錄的終局雜湊。輸入與終局摘要見 [inputs.json](inputs.json)、[runs.json](runs.json)，登記口徑的計算結果見 [score.json](score.json)。

| 指標 | 減半組－v90 |
|---|---:|
| 終局 VP 差，每張地圖的單步效果加總後平均，含零事件地圖 | −0.225，95% 地圖重抽區間 [−1.550, +0.925] |
| 終局 VP 差，每個入選決策平均，含 21 個未改選決策 | −0.173 |
| Kill，每次改選平均，含敵方耗損 | +0.94 |
| Loss，每次改選平均，含我方耗損 | −0.73 |
| 下個己方回合結束持有原目標，可觀察的 56 組配對 | 19/56 對 24/56 |

在可觀察的補給窗口內，對手移動後切斷 trace 並延續到新標為斷補的紀錄，改選組與 v90 分別是我方 2 對 14 筆、對手 28 對 34 筆。因果見證要求逐步重播看見同一單位從有 trace 變成無 trace。其餘分類為原因未明的紀錄分別是我方 7 對 2 筆、對手 153 對 154 筆。這些是多條接續中的事件計數，部分單位與地圖會重複。終局 Kill 增量含敵方補給耗損 +1.11，Loss 減量含我方補給耗損 −0.66，因此不能把步數交換解讀成出手本身的傷害變化。

依登記，VP 區間下界須大於零才進入整場驗證。這次下界為 −1.550，停止該候選，新增整場 0 局。地圖內多次單步介入共用部分後續，表內加總僅用於篩選。比較只涵蓋這 40 場歷史地圖和登記的兩組骰流。

獨立覆核重播 15,066 個歷史動作，核對 52 個分岔雜湊、首步合法性與配對骰流。三套基準建置各 210 個檔案的雜湊一致，實驗建置只變更出手評分所在檔案。

## 重跑

令 `P` 指向保留 v88 獨立批和 v86、v88、v90 凍結建置的 `artifacts/ai-promotion` 目錄。令 `N` 指向保留兩張分析表的 `artifacts/ai-next` 目錄。這些原始資料留在 `ai-truck-shuttle` worktree。以新輸出目錄 `O` 執行：

```sh
	node scripts/ai-low-column-extract.mjs "$P/frozen-v88-independent/attack-western" "$N/attack-exchange.json" "$N/progress-all.json" "$O/cases.json" "$P/frozen-v88-standard/dist"
	python3 scripts/ai-low-column-build.py "$P/frozen-v90-standard/dist" "$O/dist"
	python3 scripts/ai-low-column-batch.py probe "$O/cases.json" "$P" "$O"
	python3 scripts/ai-low-column-batch.py continue "$O/cases.json" "$P" "$O"
	python3 scripts/ai-low-column-batch.py score "$O/cases.json" "$P" "$O"
```

原始輸出在 `artifacts/western-low-column-results`，逐組保存動作選擇、補給見證和終局摘要。工具在每條接續結束後從分岔狀態重播實際行動，驗證終局雜湊，再寫出摘要。摘要保留雜湊和觀測值。要從頭重放接續行動，需以凍結建置和登記種子重跑。
