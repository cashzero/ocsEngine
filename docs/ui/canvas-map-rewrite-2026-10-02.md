# 地圖改用 Canvas、介面改用 lit-html（2026-10-02）

狀態：**IN PROGRESS**（功能流程已以實際 UI 操作驗證；下列 TODO 未關閉前不得標為完成）

## 原因

使用者回報效能不理想。實測（舊版）：

- 地圖是約 4,800 個節點的內嵌 SVG；每次點擊經 `runUi` 讓整頁 `innerHTML` 重建兩次，其中約 600 KB 是不會變的地形。
- 平移／縮放改內層 `<g>` 的 `transform`，瀏覽器無法交給 GPU 合成，每一格都重新點陣化整張 SVG（含 pattern、浮雕濾鏡、整層 14px 陰影），平移約 3 fps。

## 做法

- `src/ui/map-canvas.ts`：單一 canvas 的 `MapView`。地形依縮放級距（每級 √2）畫進快取 tile，分兩層：地面＋格線、以及編號／河流／道路／聚落；平移只貼 tile。可走範圍、變暗、目標框、路徑、counter 每幀依 snapshot 畫在上面。點擊以軸座標換算格子、以 counter 繪製矩形判定，不靠 DOM。
- 美術來源不變：`map-art.ts` 改為先輸出幾何資料、再組 SVG 字串（重構前後所有 SVG 輸出逐位元組相同，3.6 MB 比對）；pattern tile 與 counter 由原 SVG 點陣化一次後重用，因此 canvas 地圖與 New Game 預覽畫的是同一張圖。
- `browser.ts`、`command-deck.ts` 改為 lit-html 模板：只更新有變的 DOM，焦點、捲動位置與輸入框內容不再因重建而遺失。command deck 模板不帶 handler，由 `browser.ts` 一個委派監聽處理。
- 依賴：`lit-html`（以 import map 從 `node_modules` 載入）；開發依賴 `happy-dom`（測試渲染模板）、`playwright`（實際 UI 操作）。

## 驗證（Playwright Chromium，實際滑鼠輸入）

1. Mediterranean coast 16×12、Standard、map seed 4242：New Game 調整 → 預覽 → Start → 完成一整個遊戲回合（兩方增援放置、移動彈窗確認移動、補給、hot-seat 交接）進入 Turn 2。
2. Temperate inland 16×12、Compact、每方 1 個 formation、seeds 92001–92004：5 個回合，含燃料、移動、宣告攻擊、防守方補給決策（經交接）、戰後前進、戰鬥結果卡、Exploitation、Attrition、First Player 決策；共 17 次交接。
3. 同一流程中檢查：縮放按鈕、鍵盤游標與朗讀文字、All units 名冊（搜尋、選取、關閉）、Session 對話框（焦點、`inert`）、Pause/Resume、堆疊清單、隱私畫面不顯示地圖。
4. 以上全程 page error／console error 為 0。`npm run check`（typecheck、49 個測試檔 280 個測試、build、smoke）通過。

過程中發現並修正：顯示可走範圍時，可走格外框畫在地名之上，地名被切掉字母（如「Ar tcourt」）；已改回原 SVG 的圖層順序（外框在編號、河流、道路、聚落之下）。

## 與舊版的已知差異

- 單位可走範圍外「變暗」時，格線也一起變暗（舊版只暗地面與水紋）。
- 個別格子與 counter 不再是可 Tab 的 DOM 元素；改為地圖單一焦點＋方向鍵游標＋朗讀（見 TODO-CM2）。

## TODO

- **TODO-CM1**：`scripts/counter-lod-gate.mjs` 仍讀取舊 SVG 的 `#map-camera`／`.counter`，在 canvas 地圖上無法執行。影響：counter LOD 的既有驗收腳本失效（LOD 本身仍由 `counterLod` 決定，`window.ocsMap.lod` 可讀）。關閉條件：改用 `window.ocsMap.lod` 與 `counterClientRects()` 並重新執行通過，證據存於 `tmp/counter-lod-gate/`。（`desktop-deck-gate.mjs`、`ui-flow-gate.mjs` 在本次之前已失效，見既有報告。）
- **TODO-CM2**：鍵盤／螢幕報讀行為改變（上節）。影響：報讀器使用者改以游標朗讀辨識格子與單位。關閉條件：以 NVDA 實際操作一個移動與一個攻擊並記錄結果。
- **既有問題（非本次引入）**：視窗寬度小於 1680px 時整頁出現水平捲動（`.app-shell` 地圖欄固定 1280px）；舊版同樣如此。
