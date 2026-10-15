# 雙擊啟動幕作 Agent 工作台

Windows 64位電腦使用 `AI-Drama-Agent-Windows-x64.exe`。這是單檔免安裝桌面程式，包含 Electron 與應用程式，不需要先安裝 Node.js、執行終端命令或解壓 ZIP。

1. 將完整的 EXE 檔案下載到 Windows 電腦桌面。
2. 雙擊 `AI-Drama-Agent-Windows-x64.exe`。首次啟動會先把內含程式解包到暫存目錄，可能需要等待。
3. 在工作台選擇「建立第一個劇集」或「開啟專案」。

這個免安裝版沒有安裝 `.aidrama` 檔案關聯，開啟既有專案請用程式內的「開啟專案」。macOS 不能執行 EXE；Apple Silicon 版本使用 macOS ZIP 內的 `AI Drama Studio.app`。

它是第一期人工製作工作台。AI 供應商呼叫、模型生成及自動發布尚未接入；應用名稱中的 Agent 不代表已具備自動生成能力。

程式在 Linux 雲端交叉打包。正式 Windows 雙擊啟動尚無 Windows runner 可驗證；開發版未簽署。聊天內工作區連結是否能下載由客戶端支援決定，不能把雲端路徑當作使用者電腦上的桌面檔案。

重建單檔版：`npm run package:portable`。檔案位於 `release/AI-Drama-Agent-Windows-x64.exe`。
