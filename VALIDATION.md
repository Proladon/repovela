# 驗證記錄

日期：2026-10-01。

專案：Repovela 0.1.0，Vue 3 前端。本次新增 Windows 桌面自動驗證；Rust 檢查保留 Vue 遷移時的既有紀錄，未於本次重跑。

環境：Windows x64、100% 縮放（96 DPI）、Node.js 24.6.0、pnpm 10.33.0、Vue 3.5.43、Rust 1.97.1、Tauri 2.12.1、Playwright 1.63.0、Chromium 153.0.8010.12、WebView2 154.0.4258.48。

## pnpm 遷移

套件管理改用 pnpm 10.33.0，透過 `packageManager` 固定版本；匯入原鎖定資訊產生 `pnpm-lock.yaml`，16 個直接依賴的版本均保持一致，移除舊鎖定檔。`pnpm-workspace.yaml` 僅允許 esbuild 的依賴建置腳本。

已清除工作區 `node_modules`，使用 `pnpm install --frozen-lockfile` 完成乾淨安裝。Tauri 前置指令、Playwright 伺服器、一鍵驗證及文件均改用 pnpm；下方前端與 Windows 驗證重新以 pnpm 執行。

## 已通過

- Vue／session／資料夾選擇器契約：20 項測試（Vue 互動 11、session 5、選擇器契約 4）。
- Rust 圖譜／tag／真實 Git 儲存庫：既有 9 項測試通過，本次未重跑。
- `vue-tsc` 嚴格型別檢查與 Vite 正式版建置。
- Chromium：2 個完整瀏覽流程、20 張畫面回歸比對，基準為改寫前的 React 版本。
- `styles.css`、本機 session 格式、Tauri IPC 與 Rust 後端維持不變。
- `cargo clippy --all-targets -- -D warnings` 與 Rustfmt：遷移時通過，本次未重跑。
- 本次修改的 TypeScript、JSON 與 Markdown：Prettier 格式檢查。
- Windows Tauri 正式版編譯。
- `pnpm run validate:windows`：一鍵流程通過，依序完成 20 項測試、正式版建置與實際桌面驗證。
- 正式版實際 Tauri／WebView2：原生視窗、真實 Git IPC、排版、正常關閉（exit code 0）後重啟還原；不再僅依程序存活判定啟動成功。
- `pnpm run test:flow`：兩種尺寸的完整瀏覽流程，不讀取／建立截圖基準，適合新 checkout。
- `pnpm run test:windows --repeat-each=2`：連續兩次通過，各保存 19 張 WebView2 截圖及執行環境、Win32 視窗紀錄。
- `pnpm run validation:fixtures`：可建立固定 Git 歷史及中文／空白路徑的人工驗證資料。

測試涵蓋：一次加入多專案、分頁獨立選取、重開還原、路徑去重、關閉後重新開啟、過期專案／commit／diff 回應隔離、單一專案讀取失敗、部分暫存 diff、搜尋與鍵盤選取、每個分頁的搜尋與遠端選項、取消釘選／改名／移除、輸入框自動焦點、重新取得焦點時更新 diff、初始 commit、空儲存庫、detached HEAD、tag 歷史、merge 圖譜與第一父 commit diff、未追蹤／二進位檔、大型 diff 截斷、路徑驗證，以及讀取前後 index 檔案不變。

畫面比對涵蓋 1360×880、1000×640 各 10 個狀態。比對門檻與限制詳見 [e2e/BASELINES.md](e2e/BASELINES.md)。

## Tauri 設定與自動化範圍

`beforeDevCommand`／`devUrl` 對應 Vite `127.0.0.1:5173` 與 `strictPort: true`；開發與正式建置指令已改用 `pnpm run dev`／`pnpm run build`，正式建置執行 Vue 型別檢查與 Vite，Tauri 使用 `../dist`。主視窗為 `main`，預設內容區 1360×880、下限 1000×640；capability 對應 `main`、允許 `dialog:allow-open`，Rust 已註冊 dialog plugin。正式版未啟用展示模式。視窗設定、CSP、capability 與 Rust 後端維持不變。

新增獨立 `playwright.windows.config.ts`，透過本機 CDP 連到正式版 WebView2，不啟動 Vite 或 Chromium，也不 mock Git IPC。每次使用獨立 profile 及暫存 Git fixture，不更動日常專案清單。連線方法依據 [Playwright WebView2 文件](https://playwright.dev/docs/webview2)。

原生自動化檢查可見主視窗、標題、預設尺寸，使用 Win32 調整真正視窗至兩種內容區尺寸，最小化／還原，正常關閉後重啟確認分頁、目前專案與工作區選取還原。透過 Vue 貼上路徑驗證非 Git 錯誤、子目錄解析、去重、多專案、commit、diff 與工作區；兩個 fixture 的 Git index 雜湊在讀取前後相同。

WebView2 檢查頁面不溢出、主要面板／彈窗在內容區內、長 diff 可水平捲動，保存兩種尺寸各 9 個狀態及重啟畫面，共 19 張。目前沒有 WebView2 像素回歸基準，也未完成人工字型／遮擋檢查。選擇器測試使用 mock，僅證明資料夾／多選／標題、取消／單選／多選／錯誤的呼叫契約，以及取消不改 session、失敗後可重試的 Vue 行為。

完整指令與人工步驟見 [e2e/WINDOWS.md](e2e/WINDOWS.md)。本機報告：`playwright-report/windows/index.html`；機器可讀結果：`test-results/windows/results.json`，含 fixture 路徑、執行檔 SHA-256、版本、PID、URL、DPI、尺寸與截圖。報告不提交 Git，重跑同類測試會覆寫舊證據，需保存時先複製。

本次 pnpm 連續兩次執行的證據另存於 `.validation/pnpm-repeat-windows-report/index.html` 與 `.validation/pnpm-repeat-windows-results.json`；預設報告會依最近一次桌面測試更新。

## 仍需人工操作：全部未執行

| ID    | 待驗證事項                                                                                       | 狀態                                     |
| ----- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| W1    | 原生標題列／工作列按鈕、最大化／還原、拖曳移動、按 X 關閉後重開                                  | 未執行；Win32 呼叫不取代實際系統按鈕操作 |
| W2    | 拖曳邊框驗證 1000×640 最小內容區限制                                                             | 未執行；自動測試只調整至指定尺寸         |
| D1–D3 | Windows 原生資料夾選擇器的取消、Escape、多選、中文／空白、重複／子目錄、非 Git、焦點與失敗後重試 | 未執行；mock 不代表原生對話框通過        |
| V1    | 人工檢視 WebView2 文字、遮擋、捲動及 19 張截圖                                                   | 未執行；目前只有互動與幾何斷言           |
| V2    | 125%／150% 縮放、不同 DPI 多螢幕移動與排版                                                       | 未執行；自動化僅在 96 DPI 執行           |

macOS、Linux 尚未編譯或測試。執行檔為未簽署的開發原型。
