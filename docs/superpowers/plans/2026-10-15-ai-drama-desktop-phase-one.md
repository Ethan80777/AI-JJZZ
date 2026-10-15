# AI Drama Desktop Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可雙擊 `.aidrama` 專案檔開啟、具有完整五幕14步編輯與本機持久保存能力的 Windows／macOS 桌面製作工作台。

**Architecture:** Electron main 管理檔案、SQLite、視窗及系統整合；受限 preload 提供經驗證的 IPC，React renderer 提供畫布與工作編輯器。領域資料與版本引用不依賴任何生成供應商。第一期以真實人工製作流程串通全部節點，保留後續生成與發布的接入契約。

**Tech Stack:** TypeScript、Electron、React、electron-vite、@xyflow/react、better-sqlite3、Zod、Vitest、React Testing Library、Playwright Electron、electron-builder；ZIP 使用 yauzl／yazl 串流讀寫。套件以執行時查證的相容穩定版鎖定 package-lock.json，native SQLite 分別為 Node 測試與 Electron ABI 重建。

**Spec:** [已確認設計規格](../specs/2026-10-15-ai-drama-desktop-design.md)

## Global Constraints

- 安裝後雙擊 `.aidrama` 檔案，即可開啟對應專案及製作畫布。
- 每個實體使用穩定 UUID。
- 下游交付物引用確切上游修訂，不引用會悄悄改變的「最新版」。
- 備份預設保留最近10份成功的快照，保留數可設定；只有新備份驗證成功才清理過期備份。
- Electron 使用 `contextIsolation`、停用 renderer 的 Node integration，並採取限制來源的 CSP。
- 第一階段沒有配置並通過測試的模型接入，不顯示「AI 已生成」。
- 輸出至少包含 UTF-8 SRT、VTT 與 JSON。
- ROI 定義為 `(收入－總成本)／總成本`；另顯示 `收入／總成本` 的回收倍數。
- 沿用 `/workspace/AI-JJZZ` 既有 checkout，不另建 worktree；不推送或發布。
- 第一期不實作遠端生成、FFmpeg 合成、廣告扣款或平台自動發布。需要執行的地方明示人工流程。
- 外網文件查證仍受代理政策限制；未查證工具保留待查證狀態，不捏造模型 ID、價格或能力。

## Review Focus

- 快速連續修改、切換節點、儲存時關閉視窗：保留最後輸入且失敗不報已保存；Task 4 測試。
- 同名專案、中文／空白路徑與重複雙擊：依 canonical path 聚焦正確視窗，不覆蓋另一專案；Task 2、12 測試。
- 機器中斷後殘留鎖及尚在 WAL 的資料：不誤刪活躍鎖，備份與匯出包含最近成功交易；Task 2、3 測試。
- 媒體異常、ZIP 炸彈及大型影音：主程序保持回應，拒絕不安全輸入且保留原專案；Task 3、7 測試。
- 更改已放行版本後匯出舊發行包：精確審核版本重新檢核，草稿與歷史檔案不冒充目前可發布成果；Task 6、11 測試。

## 檔案結構與實作決策

```text
src/shared/              # Zod schemas、IPC 契約、識別碼及結果型別
src/main/projects/       # manifest、SQLite、鎖、備份及 ZIP
src/main/assets/         # 資產複製、雜湊、受限媒體協定
src/main/ipc/            # 驗證與授權到各視窗的 handler
src/main/desktop/        # 開檔事件、視窗、最近專案及關閉協定
src/domain/              # 流程、修訂、Gate、成本、語言與工具能力
src/renderer/features/   # projects、canvas、editors、assets、locales、tools
src/renderer/components/ # 共用表格、欄位、狀態與對話框
tests/unit/              # 領域與序列化測試
tests/integration/       # 真實 SQLite、檔案與 IPC 邊界測試
tests/ui/                # renderer 行為測試
tests/e2e/               # 真實 Electron 使用流程
build/                   # 應用程式與文件圖示、打包設定
docs/                    # 使用方式、接入查證及平台驗收證據
```

共用型別在 Task 1 定義：`UUID = string`（邊界由 Zod uuid 驗證）、`ProjectHandle = string`（僅主程序配置的 opaque token）、`Result<T> = {ok:true,value:T}|{ok:false,error:{code:ErrorCode,message:string}}`、`Scope = {kind:'project'}|{kind:'episode',episodeId:UUID}|{kind:'locale',episodeId:UUID,localeId:UUID}`。

`ProjectSnapshot` 包含 project、template、steps、episodes、scenes、shots、shotGroups、characters、assets、revisions、localeVariants、toolBindings、reviews、costs、releases、metrics、canvas。JSON 與 DB schema version 均從 1 起；實體 schema 定義以已確認規格第7節為準，所有 ID 與跨實體引用顯式化。

資料庫使用各實體表（JSON payload 可用於節點內容）及獨立引用表，不將全部專案保存成單一 blob。時間使用 UTC ISO 8601，媒體時長與字幕時碼使用整數毫秒。UI 預設繁體中文；語言內容可任意選擇。

任務順序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12。每項在自身測試通過後提交；遇故障先診斷，不能以跳過測試標示完成。

## Task 1：可啟動桌面殼與資料契約

**Files — Create:** `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/shared/model.ts`, `src/shared/ipc.ts`, `src/shared/errors.ts`, `src/domain/workflow/default-template.ts`, `tests/unit/template.test.ts`, `tests/e2e/shell.test.ts`。

**Interfaces:** 輸出 `createDefaultTemplate(): WorkflowTemplate`；`WorkflowTemplate={id:UUID,version:number,acts:Act[],steps:StepDefinition[],edges:Dependency[]}`。固定步驟鍵 `01`–`14` 與獨立 UUID 並存；幕次數量為5、子步數量依次為2／3／4／3／2。輸出 `StepContent` discriminated union，14個鍵分別對應規格表的結構化內容，另有自訂文字、表格、資產及檢查清單。Task schema 僅定義供後續期別使用，不新增假任務執行器。

- [ ] 建立最低限度 npm／TypeScript／測試設定並安裝鎖定依賴；記錄版本、授權及原生依賴重建命令至 `docs/development.md`。不關閉 TLS 或 artifact 驗證。
- [ ] 寫失敗測試 `default_template_contains_fourteen_unique_steps`：`expect(template.acts.map(a=>a.stepIds.length)).toEqual([2,3,4,3,2])`；重複 ID、未知 StepContent discriminator、非法 UUID 均驗證失敗。
- [ ] 執行 `npm run test:unit -- tests/unit/template.test.ts`，確認失敗來自尚未實作的模板／schema。
- [ ] 實作型別、Zod schema 與模板；建立 sandboxed BrowserWindow、受限 CSP 與首頁「建立專案」「開啟專案」。測試 renderer 的 `typeof window.require` 為 `undefined`。
- [ ] 執行 `npm run typecheck`、指定單元測試及 `npm run test:e2e -- tests/e2e/shell.test.ts`；Linux 無顯示器時由 `xvfb-run -a` 啟動。驗證視窗內容而非僅 PID。
- [ ] 提交 `feat: establish secure desktop shell and workflow contracts`。

## Task 2：專案建立、交易保存與安全開啟

**Files — Create:** `src/main/projects/manifest.ts`, `database.ts`, `migrations.ts`, `project-service.ts`, `project-lock.ts`（均位於同目錄）；`tests/integration/project-service.test.ts`, `tests/integration/project-lock.test.ts`。

**Interfaces:** 輸入 Task 1 schema；輸出 `createProject(manifestPath:string,name:string):Promise<Result<ProjectHandle>>`、`openProject(manifestPath:string):Promise<Result<ProjectHandle>>`、`readProject(handle:ProjectHandle):Promise<Result<ProjectSnapshot>>`、`commitChanges(handle:ProjectHandle,changes:ProjectChange[]):Promise<Result<ProjectSnapshot>>`、`closeProject(handle:ProjectHandle):Promise<Result<void>>`。`ProjectChange` 是 schema 驗證的實體新增／修訂、畫布設定及封存指令，不允許 SQL 或任意路徑。修訂寫入需 `expectedRevisionId` 以偵測過期寫入。

- [ ] 寫 `create_reopen_preserves_unicode_name`、`missing_assets_does_not_create_empty_database`、`future_schema_is_not_rewritten`、`transaction_failure_rolls_back`、`stale_edit_reports_conflict`；斷言重開快照相等、錯誤後原檔雜湊不變。
- [ ] 寫鎖測試：同一 canonical path 第二寫入者回傳 `PROJECT_BUSY`；另一目錄同名專案可寫；殘留鎖必須驗證擁有者進程及起始識別後才可清理，無法證明失效時不搶鎖。
- [ ] 執行 `npm run test:integration -- tests/integration/project-service.test.ts tests/integration/project-lock.test.ts`，確認紅燈。
- [ ] 實作 manifest（上限1 MiB）、相對路徑／realpath 檢查、SQLite 外鍵與交易、版本 migration、原子 manifest 寫入及每專案鎖。拒絕已存在的目標專案，複製另存時配置新的 project UUID 並重映射專案引用。migration 執行前使用 SQLite backup 建立可恢復副本。
- [ ] 重跑測試至通過；測試 mock 僅限 I/O 失敗注入，其餘使用真實暫存資料庫。
- [ ] 提交 `feat: persist projects safely with versioned SQLite storage`。

## Task 3：一致性備份與可攜專案

**Files — Create:** `src/main/projects/backup.ts`, `archive.ts`, `archive-worker.ts`, `tests/integration/backup.test.ts`, `tests/integration/archive.test.ts`。

**Interfaces:** `createBackup(handle:ProjectHandle,keep?:number):Promise<Result<BackupRecord>>`，預設 keep=10；`exportProject(handle:ProjectHandle,destination:string):Promise<Result<ArchiveReport>>`；`importProject(archivePath:string,destinationDir:string):Promise<Result<ProjectHandle>>`。`BackupRecord={id:UUID,createdAt:string,relativePath:string,sha256:string}`；`ArchiveReport={fileCount:number,totalBytes:number,sha256:string}`。

- [ ] 寫 `backup_includes_uncheckpointed_wal_transaction`、`eleventh_valid_backup_retains_ten`、`failed_backup_keeps_previous_ten`、`archive_roundtrip_preserves_references_and_hashes`。
- [ ] 寫 `rejects_zip_traversal_symlinks_collisions_and_limits`：絕對／父路徑、Windows drive／UNC、大小寫碰撞及 symlink 皆拒絕；以可注入低限制測試超限，原目錄保持不變。匯出 allowlist 中不得出現 secrets、userData、logs、backups 或絕對路徑。
- [ ] 執行 `npm run test:integration -- tests/integration/backup.test.ts tests/integration/archive.test.ts` 並確認預期失敗。
- [ ] 使用 SQLite backup API、串流 ZIP 與背景 worker；上限10萬項、總展開100 GiB、單檔20 GiB、壓縮比1000，邊解壓邊計算實際 bytes 並檢查可用空間，不信任 header。hash manifest 在包內為 `checksums.json`，只包含相對路徑。匯入暫存於目標同磁碟，成功後 rename；失敗清理自身暫存。
- [ ] 重跑指定測試及 worker 心跳測試，確認大型合成檔串流處理時 main 仍回應；新增 `restoreBackup(handle,backupId):Promise<Result<ProjectSnapshot>>`，先備份目前資料再恢復，測試失敗回滾。
- [ ] 提交 `feat: add verified backups and portable project archives`。

## Task 4：受限 IPC 與不丟資料的編輯生命週期

**Files — Create:** `src/main/ipc/register-handlers.ts`, `src/main/desktop/windows.ts`, `src/renderer/features/projects/ProjectHome.tsx`, `src/renderer/features/projects/useProject.ts`, `src/renderer/features/editors/useAutosave.ts`, `tests/integration/ipc.test.ts`, `tests/ui/autosave.test.tsx`。**Modify:** `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/App.tsx`。

**Interfaces:** `window.drama` 暴露 typed methods：`chooseAndCreateProject`、`chooseAndOpenProject`、`readProject(handle)`、`commitChanges(handle,changes)`、`chooseAndExportProject(handle)`、`chooseAndImportProject`、`backupProject(handle)`、`restoreProject(handle,backupId)`、`requestClose(handle)`；均回傳 `Promise<Result<T>>`。檔案選擇器只在 main，renderer 不送任意絕對路徑。`useAutosave` 回傳 `{state:'dirty'|'saving'|'saved'|'error',flush:()=>Promise<boolean>,retry:()=>void}`。

- [ ] 寫 `foreign_window_cannot_use_project_handle`、`invalid_payload_is_rejected`、`unknown_ipc_channel_is_unavailable`；不合法呼叫不改變 DB。
- [ ] 寫 `fast_typing_saves_latest_edit`、`out_of_order_completion_cannot_overwrite_latest`、`close_waits_for_flush`、`failed_save_keeps_draft_and_blocks_silent_close`：輸入 A→AB→ABC，重開必為 ABC；失敗畫面保留 ABC 並可重試。
- [ ] 執行 `npm run test:integration -- tests/integration/ipc.test.ts` 及 `npm run test:ui -- tests/ui/autosave.test.tsx`，確認紅燈。
- [ ] 實作綁定 webContents 的 handle 權限、schema 驗證、序列化寫入及300ms debounce；關閉時先 flush，失敗提供重試／取消關閉／明確捨棄。保留最近專案於機器 userData，過期路徑顯示修復。
- [ ] 重跑指定測試及首頁建立／開啟 Electron smoke test，驗證 reload 後資料仍在。
- [ ] 提交 `feat: connect project UI through validated IPC and reliable autosave`。

## Task 5：五幕畫布、導航與可版本化自訂流程

**Files — Create:** `src/renderer/features/canvas/WorkflowCanvas.tsx`, `ActNode.tsx`, `StepNode.tsx`, `WorkflowList.tsx`（同目錄）；`src/domain/workflow/template-operations.ts`, `tests/ui/workflow-canvas.test.tsx`, `tests/unit/template-operations.test.ts`。

**Interfaces:** `WorkflowCanvas({snapshot,onChanges,onSelectStep})`；`applyTemplateEdit(template:WorkflowTemplate,edit:TemplateEdit):Result<WorkflowTemplate>`；`diffTemplates(before,after):TemplateDiff`。`TemplateEdit` 為 addCustomStep／archiveStep／restoreStep／addDependency／removeDependency；四種自訂內容 schema 延用 Task 1。既有專案升版須以明確 apply 操作建立新 template version。

- [ ] 寫 `shows_five_acts_and_fourteen_editable_steps`、`collapse_preserves_contents_and_positions`、`keyboard_list_opens_same_editor`、`template_upgrade_is_explicit`、`cycle_is_rejected`。斷言拖動位置不改變 dependency edges，新增自訂節點重開仍在。
- [ ] 執行 `npm run test:ui -- tests/ui/workflow-canvas.test.tsx` 與模板單元測試，確認紅燈。
- [ ] 實作縮放、平移、fit、搜尋、幕次收合、側欄清單、節點選取與封存確認；有引用的節點提供影響清單並封存，未引用自訂節點可刪除。樣式採高對比深色製作工作台、每幕區分色、可見鍵盤焦點；狀態不可僅靠顏色。
- [ ] 重跑測試，手動驗證縮放後面板開關不跳回原點；快照包含 canvas viewport／positions／collapsedActs。
- [ ] 提交 `feat: add persistent five-act workflow canvas`。

## Task 6：修訂傳播、缺項檢查與八道審核

**Files — Create:** `src/domain/workflow/revisions.ts`, `gates.ts`, `validation.ts`（同目錄）；`src/renderer/features/editors/ReviewPanel.tsx`, `HistoryPanel.tsx`；`tests/unit/revisions.test.ts`, `tests/unit/gates.test.ts`。**Modify:** `src/main/projects/project-service.ts`。

**Interfaces:** `collectAffectedRevisions(snapshot,changedRevisionId:UUID):UUID[]`；`validateStep(snapshot,stepId:UUID,scope:Scope):ValidationIssue[]`；`evaluateGate(snapshot,gate:'G1'|'G2'|'G3'|'G4'|'G5'|'G6'|'G7'|'G8',scope:Scope):GateEvaluation`；`GateEvaluation={eligible:boolean,issues:ValidationIssue[],revisionIds:UUID[]}`。審核指令保存本次 revisionIds，寫入前主程序重新 evaluate。

- [ ] 寫 `only_transitive_consumers_become_stale`：A→B→C、D 獨立，A 改版只有 B、C 待審；原修訂內容不變。另測循環防護、舊審核不得對新修訂放行。
- [ ] 寫 `archived_required_node_does_not_bypass_gate`、`episode_one_approval_does_not_approve_episode_two`、`locale_approval_is_scoped`、`g2_accepts_character_definition_before_g3_assets`，並驗證草稿允許保存、可發布狀態被阻止。
- [ ] 執行 `npm run test:unit -- tests/unit/revisions.test.ts tests/unit/gates.test.ts`，確認紅燈。
- [ ] 實作穩定修訂引用、失效傳播、規格 Gate 表及內容缺項 validator；UI 顯示原因、操作者、時間及版本，凍結後編輯建立新修訂。確定性「下一步」建議來自缺項／依賴，不宣稱 LLM 智能生成。
- [ ] 重跑測試，加儲存整合測試證明 renderer 不能直接寫入假通過狀態。
- [ ] 提交 `feat: enforce revision-aware workflow review gates`。

## Task 7：資產庫、角色聖經及影音素材管理

**Files — Create:** `src/main/assets/asset-service.ts`, `media-protocol.ts`, `asset-worker.ts`；`src/renderer/features/assets/AssetLibrary.tsx`, `CharacterEditor.tsx`, `MediaEditor.tsx`；`tests/integration/assets.test.ts`, `tests/ui/asset-editors.test.tsx`。**Modify:** `src/shared/ipc.ts`, `src/main/ipc/register-handlers.ts`。

**Interfaces:** `importAsset(handle,selectedPath:string,metadata:AssetMetadata):Promise<Result<Asset>>`（main 內部）；renderer 以 `chooseAndImportAssets(handle)` 呼叫。`AssetMetadata={kind:'image'|'video'|'audio'|'document',characterId?:UUID,shotId?:UUID,localeId?:UUID,rights:RightsRecord}`；Asset 包含 UUID、relativePath、sha256、bytes、MIME、revisionId 及 inspected metadata。`resolveAsset(handle,assetId):Result<AuthorizedAssetPath>` 只供主程序受限協定使用。

- [ ] 寫 `import_copies_and_hashes_media`、`same_name_different_content_does_not_overwrite`、`missing_media_can_be_relinked_with_revision`、`unauthorized_media_url_is_denied`、`unsupported_or_corrupt_media_is_not_marked_usable`。
- [ ] 寫編輯測試：角色→服裝／表情／場景／道具／音色引用可保存；步07–09候選素材可比較、選用、退件；廢片不刪除；步10剪輯決策表可改排序與裁切範圍。
- [ ] 執行 `npm run test:integration -- tests/integration/assets.test.ts` 與對應 UI 測試，確認紅燈。
- [ ] 串流複製與 SHA-256 在 worker 執行，匯入採暫存再 rename；媒體以 scoped 自訂協定送 renderer，檢查檔案類型及 range requests。實際可解碼性／時長由媒體 probe 取得，不信任副檔名；不支援格式清楚顯示，禁止誤標通過。
- [ ] 重跑測試，加入大型合成資產匯入時主程序仍可回應及取消不殘留半成品測試；測試夾具使用自行產生或可追溯授權的小型影音。
- [ ] 提交 `feat: manage versioned production assets and character bibles`。

## Task 8：01–05內容工作區與經濟模型

**Files — Create:** `src/renderer/features/editors/StepWorkspace.tsx`, `MarketEditor.tsx`, `PositioningEditor.tsx`, `NovelEditor.tsx`, `ScriptEditor.tsx`, `StoryboardEditor.tsx`；`src/domain/finance/costs.ts`, `src/domain/storyboard/export.ts`, `tests/unit/costs.test.ts`, `tests/unit/storyboard.test.ts`, `tests/ui/content-editors.test.tsx`。

**Interfaces:** `StepWorkspace({snapshot,stepId,onChanges})` 路由14步及自訂節點至各編輯器，使用六分頁：輸入／工作內容／工具／輸出／檢查／歷史。`calculateEconomics(costs:CostEntry[],revenue:RevenueEstimate,rates:ExchangeRate[],baseCurrency:string):Result<Economics>`；`Economics={totalCost:string,roi:string|null,recoveryMultiple:string|null,missingInputs:string[]}`；金額以 decimal.js 計算，不用浮點累積。`exportStoryboard(shots:Shot[],format:'csv'|'json'):string`。

- [ ] 寫成本測試：成本100、收入150 → ROI `0.5`、回收倍數 `1.5`；零成本／未知收入為 null；缺匯率回報缺項；估算與實際分開。資料來源與匯率日期保存後仍存在。
- [ ] 寫內容測試：競品新增、題材卡、小說章節、分集動作台詞及鉤子、分鏡欄位聯集皆可編輯重開；鏡頭分組保留原 ID；90秒分集以預設±5秒提示時長差異，可配置容差。CSV 正確處理逗號／換行並防試算表公式注入。
- [ ] 執行 `npm run test:unit -- tests/unit/costs.test.ts tests/unit/storyboard.test.ts` 與內容 UI 測試，確認紅燈。
- [ ] 實作各結構化編輯器、欄位驗證、分鏡資產選擇及有檔名的匯出；長文保留段落，不把所有內容縮成一個通用 notes 欄位。自訂文字／表格／資產／清單共用編輯器實際保存其內容。
- [ ] 重跑測試及 typecheck；由步01開到步10驗證 Task 7 編輯器已接入同一工作區。
- [ ] 提交 `feat: add story development editors and transparent cost estimates`。

## Task 9：語言版本、術語及字幕

**Files — Create:** `src/domain/localization/locales.ts`, `variants.ts`, `subtitles.ts`；`src/renderer/features/locales/LocaleEditor.tsx`, `SubtitlePreview.tsx`；`tests/unit/localization.test.ts`, `tests/ui/locale-editor.test.tsx`。

**Interfaces:** `createLocaleVariant(source:LocaleVariant,targetTag:string):Result<LocaleVariant>`；`validateSubtitles(cues:SubtitleCue[],options:{maxCharsPerSecond:number,maxLines:number}):ValidationIssue[]`；`serializeSubtitles(cues,format:'srt'|'vtt'|'json'):string`。`SubtitleCue={id:UUID,startMs:number,endMs:number,text:string}`；時間 end > start，是否重疊以警告處理，不無聲丟棄。

- [ ] 寫 `branches_from_any_source_language`、`glossary_is_versioned`、`arabic_numbers_and_punctuation_roundtrip`、`invalid_times_are_rejected`、`srt_and_vtt_use_correct_timestamps`；`90001ms` 在 SRT 為 `00:01:30,001`，VTT 為 `00:01:30.001`。
- [ ] 寫 UI 測試：從法語派生阿語、獨立編輯配音引用及文化備註，不改來源；預覽 `dir=rtl`、混合數字保留；過長字幕提示可設定閱讀速度與最多行數，原文不被自動截斷。
- [ ] 執行 `npm run test:unit -- tests/unit/localization.test.ts` 及對應 UI 測試，確認紅燈。
- [ ] 實作 BCP47 驗證、規格列出的16個預設標籤（zh-Hans、zh-Hant、en、fr、es、de、ru、ja、ko、ar、tr、id、ms、th、vi、fil）及自訂標籤。使用字素計數，RTL 以 Unicode 雙向隔離處理 UI 插值；費用與視覺重製分開。
- [ ] 重跑測試，驗證三種匯出都為 UTF-8，字幕與術語表保存後可重新開啟。
- [ ] 提交 `feat: add locale branches glossary and subtitle editing`。

## Task 10：工具目錄與真實能力狀態

**Files — Create:** `src/domain/tools/catalog.ts`, `bindings.ts`, `adapter-contract.ts`；`src/renderer/features/tools/ToolPicker.tsx`, `ToolCatalog.tsx`；`docs/tool-verification.md`, `tests/unit/tool-bindings.test.ts`, `tests/ui/tool-picker.test.tsx`。

**Interfaces:** `checkToolBinding(step:StepDefinition,tool:ToolDefinition,input:ToolInput):ValidationIssue[]`；`bindTool(snapshot,stepId,toolId,parameters):Result<ToolBinding>`。ToolDefinition 含來源 URL、查證日期（可 null）、schema、類別及 `verification:'unverified'|'documented'|'tested'`；執行狀態與資料查證狀態分離。

- [ ] 寫 `switching_provider_does_not_reuse_incompatible_params`、`unverified_catalog_entry_is_not_connected`、`manual_tool_allows_export_without_generation`；切換後保留舊交付物、舊綁定歷史及版本。
- [ ] 執行 `npm run test:unit -- tests/unit/tool-bindings.test.ts` 及 UI 測試，確認紅燈。
- [ ] 建立使用者資料所列工具的分類目錄，合併重複品牌；不鎖死未查證版本。允許新增／編輯／封存目錄項目。第一期僅「人工操作」可執行提示詞與資產包匯出；所有未實作 adapter 顯示待接入，不接受或保存 API 金鑰。
- [ ] 定義第二期 adapter 的 validate／estimate／submit／poll／cancel／collect 型別但不提供模擬成功實作；費率／模型限制未知時顯示未知。工具外連限制 https 並開系統瀏覽器，不允許自訂 shell 協定。
- [ ] 重跑測試；檢查 UI 沒有以待查證資料顯示「已連接」或「生成成功」。
- [ ] 提交 `feat: add replaceable tool catalog with explicit integration status`。

## Task 11：合規紀錄、發行包與數據復盤

**Files — Create:** `src/renderer/features/editors/ComplianceEditor.tsx`, `ReleaseEditor.tsx`, `AnalyticsEditor.tsx`；`src/domain/distribution/release.ts`, `metrics.ts`；`src/main/projects/release-export.ts`, `tests/unit/distribution.test.ts`, `tests/integration/release-export.test.ts`, `tests/ui/distribution-editors.test.tsx`。

**Interfaces:** `evaluateRelease(snapshot,releaseId:UUID,now:string):GateEvaluation`；`exportRelease(handle,releaseId,destination:string):Promise<Result<ArchiveReport>>`；`parseMetrics(csv:string):Result<MetricRecord[]>`；`computeMetric(numerator:number,denominator:number):number|null`。MetricRecord 含專案／集／語言／渠道／素材 ID、期間、指標名稱、分子分母及來源；不把不同分母的 retention／completion 直接混合。

- [ ] 寫 `expired_rights_block_release`、`g8_for_other_market_does_not_authorize_release`、`stale_revision_cannot_export_as_release_ready`、`zero_denominator_yields_null`、`mixed_currencies_are_not_summed`；匯出包列出精確母版、字幕、封面、元數據與權利清單。
- [ ] 執行指定單元、整合與 UI 測試，確認紅燈。
- [ ] 實作12–14節點，權利來源及期限可追溯、各平台政策附日期；發行包產生不標記已上架。人工發布另錄帳號、URL、版本、時間與操作者；排程只是記錄／提醒，不暗示背景自動發布。CSV 匯入先預覽欄位及錯誤再交易保存，支援重複行偵測。
- [ ] 重跑測試，驗證留存圖空資料不顯示虛構曲線；A/B素材、語言比較、退件率與改進清單可保存。重開匯出包檢查資產雜湊及引用。
- [ ] 提交 `feat: complete compliance release packaging and production analytics`。

## Task 12：桌面文件關聯、整體驗收與可重用環境

**Files — Create:** `src/main/desktop/open-requests.ts`, `build/icon.svg`, `build/icon.png`, `build/icon.ico`, `build/icon.icns`, `electron-builder.yml`, `scripts/verify-package.mjs`, `tests/unit/open-requests.test.ts`, `tests/e2e/production-flow.test.ts`, `tests/e2e/recovery.test.ts`, `docs/platform-validation.md`, `README.md`。**Modify:** `package.json`, `src/main/index.ts`, `src/main/desktop/windows.ts`, `docs/development.md`。

**Interfaces:** `queueOpenRequest(path:string):void`、`drainOpenRequests(open:(path:string)=>Promise<void>):Promise<void>`；開檔事件在 ready 前先入列，ready 後以 canonical path 去重及聚焦。進程 argv 僅接受 `.aidrama` 文件參數，ZIP 透過應用程式匯入。

- [ ] 寫開檔測試：冷啟動／second-instance／macOS open-file、ready 前多次請求、中文空白路徑、相同檔案不同路徑別名；同一專案不開第二寫入視窗，其他專案可另開。
- [ ] 寫 Electron E2E：建立自行原創且標示示例的一集專案，逐步完成14節點人工操作、兩語字幕（含阿語）、G1–G8、發行包與復盤；關閉重開後比較實體與 hash。另測儲存失敗、缺失資產修復及從備份恢復。E2E 經 UI／正式 IPC，不直接寫 DB 冒充操作。
- [ ] 執行上述測試確認未完成處失敗；實作文件類型及圖示、視窗啟動佇列、Windows NSIS 與 macOS DMG／ZIP 設定、native SQLite 打包 unpack 與 ABI rebuild；生成各平台圖示並驗證格式。不要求簽署憑證即可製作開發版。
- [ ] 依序執行 `npm run typecheck`、`npm run test:unit`、`npm run test:integration`、`npm run test:ui`、`npm run build`、`npm run test:e2e`、`npm run package:dir`；腳本各自先確保適用 ABI，Linux 的 Electron 測試使用 Xvfb。確認測試非零數、退出碼及產出時間。
- [ ] 在可用的 Windows／macOS runner 分別執行 `npm ci`、build、測試及對應 package 命令，完成規格列出的原生安裝／雙擊矩陣；沒有 runner 時如實記錄未驗證及需外部測試，不將 Linux 成功等同跨平台成功。
- [ ] 更新 README：開發啟動、備份、專案移動、工具接入狀態及第一期範圍。記錄已測試的依賴恢復與啟動命令，透過雲端草稿工具保存必要 install_script／start_skill；沿用 checkout，不建立 worktree，進程需重新啟動。若草稿不能保存，明確報告而不宣稱完成。
- [ ] 執行整體 diff 檢查及最終程式碼審查，修正實際問題後重跑受影響測試；提交 `feat: package desktop project workflow and document validation`。不自動 push、發行或發布環境。

## 規格覆蓋與交接

| 規格內容 | 實作任務 |
| --- | --- |
| 1–3 目標、分期、架構 | 1、4、10、12 |
| 4 檔案、保存、備份、桌面入口 | 2、3、4、12 |
| 5 畫布與可修改流程 | 5、8 |
| 6 五幕14步交付物 | 5、7、8、9、11 |
| 7 資料與修訂、成本 | 1、2、6、8 |
| 8 Gate | 6、11 |
| 9 工具契約 | 10（遠端執行器／憑證保存留第二期） |
| 10 多語 | 9 |
| 11 權利與發布 | 7、11（自動發布留第三期） |
| 12 失敗處理 | 2、3、4、6、7、10、12 |
| 13 第一期驗收1–9 | 12 E2E，加各任務針對性測試 |
| 14 實作交接 | 本計畫與執行方式確認 |

計畫自我審查：介面與型別由擁有任務定義；14步均有編輯器責任歸屬；五項 Review Focus 均有測試；未接入服務不假裝成功；平台實測與簽署限制保留。

本文件的命令及測試是待執行計畫，不是已通過的驗證結果。使用者審閱計畫並選定執行方式後，才開始安裝應用程式依賴與實作。
