# 幕作 · AI Drama Studio

Windows／macOS 桌面劇集製作工作台，Electron + React + SQLite。五幕14步涵蓋企劃、寫作、分鏡、角色、影音、剪輯、多語、合規、發行包及復盤。

目前為 **0.1 開發版**：提供本機人工製作流程、資產管理與版本審核。第三方 AI 生成、FFmpeg 自動合成及自動發布尚未接入。充值第三方服務點數不會自動連接供應商。

## 開始使用

Windows 單檔免安裝版：下載 `AI-Drama-Agent-Windows-x64.exe`，存到桌面後雙擊。無需 Node.js 或手動解壓。詳見 [雙擊啟動說明](docs/desktop-launch.md)。

安裝後開啟 AI Drama Studio，選擇「建立第一個劇集」，指定儲存位置。點擊畫布節點，或展開左側步驟清單。內容自動保存；「儲存工作」也會重新確認最新上游引用。必要關卡在「檢查」頁審核，尚未完成的草稿可以保存。

- **專案檔**：`名稱.aidrama` 與同目錄的 `名稱.assets/` 必須一起保留。後者包含資料庫、原始素材與備份。只搬移 `.aidrama` 會找不到內容。
- **移動／分享**：使用「匯出專案」建立完整 ZIP，再於另一台電腦匯入。專案 ZIP 不含機器憑證、最近清單或備份。
- **備份**：工具列「備份」建立 SQLite 一致性快照；預設保留最近10份成功備份，可於備份視窗調整。恢復前先建立安全備份；素材不會被回滾或刪除。
- **素材**：從資產庫匯入；檔案複製入專案並雜湊。選用前填寫審核與授權資訊。修復遺失素材只接受相同內容；不同內容應匯入為新素材。
- **流程**：「新增節點」可新增四種自訂節點；管理區提供改名、封存、依賴與 JSON 模板交換。套用不會靜默刪除已有節點；舊專案不會自動升版。
- **語言**：第11步建立語言版本，支援16種預設及其他 BCP47 標籤，獨立術語、字幕與文化備註。可匯出 UTF-8 SRT、VTT、JSON。
- **發行包**：第13步輸出人工發布素材包，須通過目前版本 G1–G8、素材與授權檢查。匯出不代表平台已上架。
- **工具**：可自訂工具目錄及人工製作綁定。第三方工具標示待查證／待接入，第一期不收集 API 金鑰。

## 開發

需要 Node.js 24+、npm，以及作業系統的 Electron 圖形依賴。

```sh
npm ci
npm run dev
npm run verify
npm run test:e2e
```

整合測試的原創媒體夾具需要 `ffmpeg`。無顯示器 Linux 使用 Xvfb。詳見 [開發環境](docs/development.md)。

## 桌面打包

```sh
npm run package:portable  # Windows 單檔免安裝 EXE
npm run package:win  # Windows NSIS + ZIP
npm run package:mac  # macOS DMG + ZIP（在 macOS 執行）
npm run package:dir  # 當前平台 unpacked 應用程式
```

輸出於 `release/`。開發版未簽署／公證；原生安裝、文件雙擊關聯與更新發布尚需各平台驗收。具體實測結果見 [平台驗證](docs/platform-validation.md)，已知差距見 [交付紀錄](docs/implementation-status.md)。
