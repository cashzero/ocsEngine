# M12-Supply：補給與運補 UI/UX 改善計畫

狀態：**IN PROGRESS**。Phase A 的核准範圍已交付；Phase B 的 SUP-B01–08 產品操作有實機證據，
但原計畫中的延伸能力與 T1 操作數比較仍開放。驗收列與狀態只維護於
[產品操作驗收表](../quality/03-product-operation-verification-plan.md) §G。

現行契約與設計決策見 [後勤助手](../gameplay/logistics.md) 及 [command deck](../ui/command-deck.md)。
本文件只維護工作分解；開放缺口的行為、影響與關閉證據統一於 [TODO 清單](../quality/05-todo-inventory.md)。

## 目標與邊界

減少逐單位付燃料、裝卸、點算 Token 與換算 MP 的機械操作，保留玩家對目的地、囤積與付費來源的決定。
規則的原子動作仍是唯一狀態來源；助手先預覽、再確認，執行逐步進入歷史、存檔與 replay。
試算只對目前己方可見資訊作出承諾；畫面明示敵方後續行動與增援可能改變結果。

Phase A 改善手動流程；Phase B 將玩家的數量、來源與目的地展開為合法動作。
抽象補給變體、跨階段排程、整合鐵路／空運／海運不屬於目前卡車助手的交付範圍。

## 工作分解

| 項目 | 工作 | 進度與證據 |
|---|---|---|
| A0 | 基準操作、問題調查、驗收列 | 完成；[A0 基準](../quality/evidence/supply-ux-a0-2026-10-02/README.md)，T1 基準 11 次點擊 |
| A1 | 轉運唯讀查詢與不可用原因、counter role 投影 | 完成；查詢接入 Gameplay，供手動轉運與助手共用 |
| A2 | 部分數量裝卸、MP、13.2f 原因與 6.1g 警告 | 完成；SUP-A 操作證據見 `03` |
| A3 | 貨物、卡車與補給 counter 的顯示／計數 | 完成核准的 UI 範圍；深入用途建模仍見 `counter-role-model` |
| A4 | Undo 與 checkpoint | 完成既有核准語意；契約見 `gameplay/session.md` |
| A5 | 補給帳目與來源 | 完成；帳目由接受動作推導 |
| A6 | Phase A 實機整合 | 核准範圍完成；原檔案式存讀檔路徑曾移出，當前驗收以 `03` SUP-A10 為準 |
| B0 | 副本 reducer 模擬、確認前預檢、失敗處理 | 已實作；模擬／手動／助手完整 hash 比對，失敗保留已接受步驟並指向 checkpoint |
| B1 | 卡車運補預覽、確認／取消、MP、目的地、缺口與替代格 | SUP-B01–04 已實機操作；原延伸需求仍見 `logistics-helper-scope` |
| B2 | 所選單位燃料試算、缺口導引、Supply 預測與支付 | SUP-B05–07 已實機操作；原延伸需求仍見 `logistics-helper-scope` |
| B3 | 付費來源偏好政策 | 未排入，待使用者決定；見 `05` 待決事項 |
| B4 | 定期補給線建議 | 未排入，待使用者決定；見 `05` 待決事項 |
| B5 | 完整回合、改計畫、存讀檔／重播、T1 比較 | SUP-B08 已完成完整回合與終局重播；T1 比較未量測（`logistics-benchmark`），整個 B5 不標完成 |

## 原 Phase B 延伸需求

B1 原計畫還包含必要時自動合併／分拆 TP、具體敵方威脅風險判讀，以及任務模式的預覽。
目前部分裝載不必拆 counter；可用卡車依序、多趟運送，預覽留在 Logistics tab。
這些差異不改寫 SUP-B01–04 的操作判準，也不代表原延伸需求完成，詳細缺口見 `logistics-helper-scope`。

B2 原計畫還包含獨立戰鬥／砲擊付費試算，以及預測尚未確認的堆與 Extender 變更。
目前燃料／Supply 使用已確認位置與存量，戰鬥仍由原有草稿與決策流程處理；見同一 TODO。

## 驗收順序

1. 先操作預覽／取消、合法與不足的運補、非法目的地，再比較助手和完全相同手動動作的最終狀態。
2. 對選定單位試算並實際支付；從自然缺口導入運補；在真實 Supply 比較預測和 `CHECK_SUPPLY`。
3. 配置不同 Map/OOB，預覽並開始同一套件，使用助手完成整回合及所有待決與交接；存檔讀回並重播至相同結果。
4. 複查截圖、耗時與錯誤，再記錄回歸檢查。證據：[operations](../quality/evidence/operations-2026-10-15/README.md)。
5. 另行量測 T1「從 A 堆送 N T 到 B 格，並為一個單位付一次燃料」的完整互動數，與 A0 的 11 次比較。
   使用者同意改善方向但沒有指定數字，不能自行將某個次數當作核准門檻。

## 開放工作

`05`：`logistics-helper-scope`、`logistics-benchmark`、`logistics-multiphase`、`logistics-multimodal`、
`counter-role-model`。補給變體、B3／B4 的範圍仍由使用者決定。
