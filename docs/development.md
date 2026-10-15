# 開發環境

工作目錄 `/workspace/AI-JJZZ`，沿用現有隔離 checkout，不新增 worktree。

已使用 Node 24.19.0、npm 11.9.0；精確套件版本與 integrity 固定於 package-lock.json。核心 Electron 44.7.2、React 19.3.1、better-sqlite3 13.0.3、TypeScript 7.0.2。Electron／React／SQLite wrapper／Vite／React Flow 為 MIT；Zod、Decimal、PapaParse、yauzl/yazl 同為 MIT。發行應保留所有依賴授權，Electron Chromium 第三方通知及 ffprobe LGPL/GPL 建置資訊以隨附套件為準，不以本文件取代授權審核。

## 雲端安裝與驗證

```sh
cd /workspace/AI-JJZZ
export npm_config_cache=/workspace/.npm-cache
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.config
export NODE_USE_ENV_PROXY=1
npm ci
npm run verify
```

better-sqlite3 13 使用 Node-API 預建二進位；本版本不使用舊版 Electron ABI 重建流程。`npmRebuild:false` 是依版本13封裝作出的選擇；更新原生依賴後需重新驗證 Node、Electron及打包版本。Electron installer 保留官方 checksum 驗證。

Linux 無桌面時，啟動 Xvfb 後執行 `DISPLAY=:99 npm run test:e2e`。本雲端已由 Debian 簽署的套件索引下載並解包 Xvfb 至 `/workspace/.desktop-test/extracted/usr/bin/Xvfb`，啟動命令：

```sh
/workspace/.desktop-test/extracted/usr/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp
```

Xvfb 是需要重新啟動的進程。測試以 `--no-sandbox` 配合雲端 SUID 限制；正式應用 BrowserWindow 保持 sandbox、contextIsolation 與禁用 Node integration。此測試參數不可拿來降低正式安裝安全性。

`npm run dev` 啟動 Electron 與開發伺服器；`npm run build` 產生 out。無需資料庫服務、API 金鑰或外部生成供應商。媒體 probe 隨 ffprobe-static 打包；測試夾具生成另外使用系統 ffmpeg。

## 驗證命令

- `npm run verify`：型別、Vitest 單元／整合／UI、production build。
- `npm run test:e2e`：真實 Electron UI／IPC；不是瀏覽器頁面的模擬。
- `npm run package:dir`：當前平台封裝。
- `npm run format:check`：格式檢查。

雲端 Linux 成功不等於 Windows/macOS 原生啟動或安裝驗收成功。沒有簽署憑證不會阻止本機開發，但正式發佈仍需另外處理簽署、公證及目標平台測試。

封裝驗證：`node scripts/verify-package.mjs [unpacked-directory-or-app]` 檢查必要檔案、native binaries 與當前 build 一致性。Linux 可用 `DISPLAY=:99 DRAMA_EXECUTABLE=/workspace/AI-JJZZ/release/linux-unpacked/ai-drama-studio npm run test:e2e -- tests/e2e/pipeline.test.ts` 驗證真正封裝後的程序。
