# 第一期交付紀錄

已實作：安全 Electron 殼、專案檔與 SQLite、交易保存及修訂、備份恢復、完整專案 ZIP、五幕14步與自訂流程、結構化編輯、素材審核、多語字幕、工具目錄、G1–G8、人工發行包、數據 CSV。程式碼與產出仍屬開發版；不聲稱整份遠期產品規格已完成。

## 實作決策

1. 遠端 skill helper 不可讀：採等價本地 ledger 與測試記錄；代價是手動維護進度。
2. 前兩項任務合併提交：保留獨立測試證據；代價是提交粒度較粗。
3. 大檔案採非同步串流與不壓縮 ZIP，未另起 worker：避免大 buffer；若增加 CPU 密集壓縮需搬到 worker。
4. 14步使用各自結構化欄位與共用編輯引擎，另加素材／字幕專用元件：較少重複程式碼；部分精細互動仍不如專用剪輯器。
5. SQLite 13 使用 Node-API prebuilds，不做舊式 Electron ABI rebuild；需在各目標平台驗證 native loading。
6. 全流程驗收透過正式 IPC 加 UI 操作測試，沒有直接寫 DB 冒充用戶行為；並非每個欄位都經完整 UI 自動化。
7. 沒有 Windows/macOS runner：產生跨平台 ZIP，原生安裝與雙擊驗收另列，不冒充完成。

## 邊界與待完成驗收

- 大型影音具非同步串流及大小限制，但未提供逐項進度／取消控制；未完成100 GiB級壓力測試。
- 模板 JSON 匯入保留既有節點身份；不同模板的節點合併／跨專案身份映射尚無自動化。
- 資產目錄若整體遺失，需將原目錄移回 `.aidrama` 旁；個別素材可由 UI 依 hash 修復。
- schema 1 沒有歷史 schema migration 路徑，未來版本會被拒絕而非覆寫。
- 未接入任何 AI 生成／遠端任務、FFmpeg 合成及平台自動發布。
- 原生平台驗收與安裝包限制參見 platform-validation.md。

最終獨立審查結果與修正證據將追加於下方。

## 最終獨立審查

審查者回報4項重要問題、無 critical／minor 項目；四項均列入同一修正批次：

- 發行母版／平台可脫離已審核成果：新增精確 G6 母版、G8 市場／平台及媒體類型檢查；wrong-master／wrong-platform 測試先失敗後通過。
- 字幕與資產欄位保存失敗會丟輸入：本地草稿、逐筆序列保存、重試及關閉 flush；兩項真實 UI 失敗測試先紅後綠。
- 上游音軌授權到期仍能發行：G8 重新檢核製作鏈引用資產授權；expired-soundtrack 測試先紅後綠。
- 副檔名冒充媒體類型：檢查實際 stream 與容器；WAV 偽裝 MP4 測試先紅後綠。

審查者未判定原生安裝／簽署及超大型媒體效能：維持未驗證標記，因本機只有 Linux runner；代價是這些環境問題需原生驗收才能排除。沒有延後處理的 minor finding。

最終驗證：45/45 Vitest、2/2 Electron E2E、typecheck、production build、Prettier及 git diff --check 均通過。雲端腳本實際重新執行 npm ci 及 verify 成功；install_script 與 start_skill 草稿保存成功，尚未發布或驗證新任務還原。
