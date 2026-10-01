# Windows 桌面驗證

## 重跑自動檢查

從專案根目錄執行。需要 Node.js 22.12+、Git、Rust／Visual Studio C++ Build Tools、Windows PowerShell 5.1 與 WebView2 Runtime。請在已登入的 Windows 桌面執行；100% 縮放時螢幕需容納 1360×880 的內容區及標題列。

```powershell
npm ci
npx playwright install chromium
npm run test:flow
npm run test:visual
npm run validate:windows
```

`validate:windows` 依序執行 Vue／session／選擇器契約測試、正式 Tauri 建置與桌面測試，失敗就停止。已有本次原始碼編譯的執行檔時，可直接執行：

```powershell
npm run test:windows
npm run test:windows -- --repeat-each=2
npx playwright show-report playwright-report/windows
```

`test:flow` 不讀取或建立截圖基準，適合新 checkout。`test:visual` 仍要求本機已確認的 Chromium 基準，詳見 [BASELINES.md](BASELINES.md)；不要為了通過測試直接覆寫基準。

Windows 測試使用 `playwright.windows.config.ts`，不啟動 Vite／Chromium、不使用展示資料或 mock IPC。預設執行 `src-tauri/target/release/repovela.exe`；可用 `REPOVELA_EXE` 指向要驗證的絕對路徑，報告記錄執行檔 SHA-256。非 Windows 會標記 skipped，不代表通過。

## 自動化涵蓋範圍

| 檢查          | 方法與通過條件                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原生啟動      | 等待實際 WebView2 CDP 可連線與 Vue 畫面出現；檢查可見主視窗、標題與預設內容區尺寸                                                                        |
| 尺寸          | Win32 `SetWindowPos` 調整真正視窗至 1360×880、1000×640；依 DPI 換算內容區，確認 WebView2 `innerWidth/innerHeight` 相符                                   |
| 生命週期      | Win32 最小化、還原、`WM_CLOSE` 正常關閉（exit code 0）；同一測試 profile 重啟後還原分頁、目前專案與工作區選取                                            |
| 真實 IPC      | 貼上中文／空白路徑、子目錄解析根目錄、去重、非 Git 錯誤、兩專案切換、commit／diff／工作區                                                                |
| WebView2 排版 | 歡迎、歷史、分支、搜尋、diff、工作區、專案選單、改名、快捷鍵各尺寸截圖，加上重啟，共 19 張；檢查頁面不溢出、主要面板與彈窗在內容區內、長 diff 可水平捲動 |
| 鍵盤／焦點    | 路徑、分支、改名輸入框自動焦點；Ctrl+F、搜尋 Enter、Ctrl+W、Ctrl+Tab／Ctrl+Shift+Tab、Escape                                                             |
| 唯讀          | 兩個 Git fixture 的 `.git/index` SHA-256 在測試前後相同；不宣稱檢查所有磁碟寫入                                                                          |
| 選擇器契約    | Vitest mock `dialog.open`，檢查資料夾、多選、標題、取消／單選／多選正規化與錯誤傳遞；Vue 測取消不改 session、失敗可重試                                  |

只在測試子程序設定 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`，以隨機本機 port 啟用 CDP；每次使用獨立 `WEBVIEW2_USER_DATA_FOLDER`。正式 Tauri 設定、capability 與 CSP 不增加測試權限。連線方法依據 [Playwright WebView2 文件](https://playwright.dev/docs/webview2)。

fixture 位於 `%TEMP%/repovela-validation/fixtures-*`，避免非 Git 資料夾向上找到本專案。包含兩個各 25 筆固定 commit、分支、tag、部分暫存與未追蹤檔案的儲存庫；保留供失敗重現，不修改日常專案。

報告：`playwright-report/windows/index.html`；機器可讀結果：`test-results/windows/results.json`。附件含 fixture 路徑、WebView2／Node／OS 版本、執行檔雜湊、PID、URL、DPI、尺寸與截圖。失敗時保留可擷取的畫面；清理只針對本次啟動的 PID。Chromium 與 Windows 使用不同輸出目錄；重跑同類測試會覆寫其前次報告，需保存時先複製。

19 張 WebView2 截圖是驗證證據，目前沒有 WebView2 像素回歸基準。幾何與捲動斷言無法判斷所有字型、截字或遮擋問題，仍需人工看圖。

## 人工驗證準備

以下步驟尚未操作驗證。產生資料，再以獨立 profile 啟動正式版：

```powershell
npm run validation:fixtures
$validationFixtures = Get-Content .validation/fixtures.json -Raw -Encoding UTF8 | ConvertFrom-Json
$validationProfile = Join-Path $validationFixtures.root 'manual-webview2'
$validationPreviousProfile = $env:WEBVIEW2_USER_DATA_FOLDER
$validationPreviousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    $env:WEBVIEW2_USER_DATA_FOLDER = $validationProfile
    Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    $validationProcess = Start-Process -FilePath (Resolve-Path src-tauri/target/release/repovela.exe) -PassThru
} finally {
    $env:WEBVIEW2_USER_DATA_FOLDER = $validationPreviousProfile
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $validationPreviousArguments
}
$validationFixtures
```

`fixtures.json` 每次重新產生會更新路徑；人工操作使用獨立的 `manual-webview2`。完成後關閉視窗，保存紀錄與截圖；清理時僅清除此份 `fixtures.json` 指定的測試目錄。

## 仍需人工操作的步驟

| ID  | 操作                                                                                          | 通過條件／證據                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| W1  | 用標題列最小化、從工作列還原、最大化／還原、拖曳移動、按 X 關閉後重開                         | 系統按鈕可操作、無白畫面、分頁還原；保存標題列／工作列截圖                                                |
| W2  | 拖曳邊框縮小至下限；執行 `scripts/native-window.ps1 -ProcessId $validationProcess.Id`         | 無法縮至小於 1000×640 邏輯像素；標題列不計入內容區。自動 `SetWindowPos` 未測使用者拖曳下限                |
| D1  | 按「加入專案」開啟原生選擇器並取消；再用 Ctrl+O 開啟並按 Escape                               | 原生標題「加入 Git 專案」、只選資料夾；取消不改清單、選取與分頁，焦點返回，可再次操作                     |
| D2  | 從 fixture 根目錄一次選取「專案 A 空白」「專案 B」                                            | 出現兩個分頁與專案，中文／空白保留，commit／diff 可讀；確認真實多選手勢                                   |
| D3  | 再選 A、A 的「子目錄」、「不是 Git 專案」；取消後再選有效專案                                 | 重複／子目錄不產生重複項；非 Git 顯示錯誤、不新增分頁，原有專案可繼續操作                                 |
| V1  | 查看 19 張 WebView2 圖片；在實際視窗開啟搜尋、分支、改名、快捷鍵、長 diff，捲動圖譜與詳細資訊 | 文字可讀、沒有意外截字、重疊或遮擋；焦點與捲動正常。人工通過後才建立專用像素基準                          |
| V2  | Windows 縮放依序用 100%、125%、150%，重開應用程式；多螢幕時跨不同 DPI 螢幕移動與縮放          | 圖譜、輸入、diff、彈窗、標題列清晰可操作；保存各 DPI 的大／小視窗截圖與尺寸讀值，未執行組合逐項標示未驗證 |

請在 [VALIDATION.md](../VALIDATION.md) 追加結果。未操作填「未執行」，不可因 mock 或 Chromium 通過而填通過：

```text
日期／操作者：
原始碼 commit／工作樹修改：
執行檔 SHA-256：
Windows／WebView2／顯示語言：
螢幕解析度／DPI／螢幕組合：
fixture 根目錄／profile：
W1、W2、D1、D2、D3、V1、V2：通過／失敗／未執行
截圖／報告位置：
失敗步驟、預期與實際結果：
```
