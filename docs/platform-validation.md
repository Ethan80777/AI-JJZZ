# 平台驗證（2026-10-15）

| 目標 | 已驗證 | 尚未驗證／限制 |
|---|---|---|
| Linux x64 雲端 | Node 型別檢查、45項單元／整合／UI測試、production build、2項 Electron E2E；真實 Electron 創建與保存、五幕14步、G1–G8、阿語字幕、發行包、備份恢復、正常關閉重開；素材 hash 比較 | 不作為正式目標平台 |
| Windows x64 | electron-builder 產生 ZIP；套件結構檢查 | NSIS 首次缺少 Wine；重試 electron-builder 官方 Wine 11.0 toolset（1.0.1、校驗 SHA）仍因 ntdll 載入 c0000135 失敗；未完成安裝包。未在 Windows 實測啟動／安裝／雙擊關聯 |
| macOS arm64 | electron-builder 產生包含 `.app` 的 ZIP | 未簽署、公證；未在 macOS 啟動／拖入 Applications／文件雙擊；DMG 需 macOS runner |

測試結果與限制以本文件為準，打包成功不等於目標作業系統可用性驗收。`release/` 中只有 ZIP 和 unpacked 資料夾可用於後續驗收；失敗的安裝器中間檔不作交付。

原生驗收需完成：新機安裝、雙擊應用及 `.aidrama`、冷啟動／已開啟專案聚焦、中文空白路徑、同名不同目錄、缺失素材修復、編輯時關閉保存、備份與可攜 ZIP、媒體播放及不同 CPU 的 SQLite／ffprobe 載入。未提供簽署身份，無法聲稱正式發行可用。

測試夾具由本機 FFmpeg 合成純色影像與正弦音頻，故事與字幕為明示的原創驗收示例。沒有使用受限制的外部影音。

封裝後的 Linux 應用另通過1項完整 E2E：直接執行 `release/linux-unpacked/ai-drama-studio`，驗證封裝內 SQLite／ffprobe、14步、G1–G8、發行包、備份恢復及重開 hash。套件檢查另比對 main／preload／renderer 與當前 build 位元內容，避免舊產物冒充新驗證。

最終產物：Windows x64 ZIP 與 macOS arm64 ZIP 的建置命令皆 exit 0，ZIP 全項 CRC 檢查通過；SHA-256 清單在 `release/SHA256SUMS.txt`。兩平台 unpacked 套件的 main／preload／renderer 均與目前 build 相同。這些是開發版產物，非原生安裝驗收結果。
