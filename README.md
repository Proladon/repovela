# Repovela

Repovela 是以 [keifu](https://github.com/trasta298/keifu) 圖譜演算法為基礎的獨立 Tauri 2 桌面 Git 工具，提供多專案管理、歷史瀏覽與基本 Git 操作。

前端使用 Vue 3、TypeScript 與單檔元件（Composition API）。

## 目前功能

- 一次選取多個 Git 專案，也可貼上資料夾路徑；自動找到儲存庫根目錄並去重。
- 專案或 `.git` 擁有者不同時，顯示「信任 Git 專案」確認視窗。確認後只將該專案的完整路徑加入 Git 全域 [safe.directory](https://git-scm.com/docs/git-config#Documentation/git-config.txt-safedirectory)；取消不更改設定。支援沒有遠端或尚無 commit 的本機儲存庫。
- 專案清單、釘選、重新命名、移除；移除只會改變應用程式清單。
- 每個專案一個分頁；關閉後仍可從清單開啟。
- 重開還原專案、分頁、目前專案、選取的 commit、遠端顯示選項與歷史載入範圍。
- 沿用 keifu 圖譜布局與色彩分配，改以 SVG 顯示。
- Commit 訊息、作者、日期、分支、標籤、父 commit、變更檔案與文字 diff。
- 已暫存／未暫存／未追蹤檔案分開瀏覽，支援部分暫存的檔案。
- 工作區可逐檔或全部暫存／取消暫存；輸入提交訊息後提交已暫存變更，保留未暫存內容。取消暫存不會還原工作目錄。
- 「分支操作」可建立並切換分支、切換既有本機分支；Git 會阻止覆寫尚未提交的變更。
- Fetch 取得所有遠端紀錄；Pull 只允許乾淨工作區與快轉更新；Push 只推送目前分支，沒有上游時推至 origin 並設定上游。操作成功或失敗後都會重新讀取原專案，執行期間禁止重複操作。
- 操作按鈕使用圖示與 tooltip。可在專案工具列、工作區、檔案、分支及 commit 按右鍵開啟對應選單；支援 Shift+F10、方向鍵與 Escape，切換專案時會關閉選單。
- Commit 右鍵選單支援新增 Tag、從指定 commit 建立分支、Checkout、Cherry-pick、Revert、Merge、Rebase、Reset，以及複製完整 hash／標題。執行前顯示目標與參數；建立分支預設不切換。Checkout 優先選取該位置的目前分支或唯一的本機分支；只有遠端分支時，可建立並切換本機追蹤分支，預填名稱可修改，多個候選分支時需要明確選擇。同名本機分支已存在時需另取名稱，不會覆寫；也可自行選擇 Detached HEAD。
- 遠端分支標籤與分支列表的右鍵選單也支援 Checkout。只有 commit、沒有可選分支時預設 Detached HEAD，畫面會標示狀態，停用項目的 tooltip 會說明需要先切換本機分支。
- 遠端分支標籤、分支列表及遠端 tip 所在的整列 commit 右鍵，都提供單一「同步本機分支至此遠端」選項。同一列有多個遠端時，於對話框選擇遠端來源，再選本機目標；右鍵遠端標籤則直接指定該來源。只允許快轉，預選追蹤該遠端或同名的本機分支，也可自行選擇。同步其他分支時保留目前 Checkout／工作目錄；同步目前分支時需乾淨工作區，並更新檔案。本機獨有提交、分歧、過期目標及其他 worktree 正在使用的分支會拒絕同步。使用已取得的遠端紀錄，最新資料請先 Fetch；不會推送或改變上游設定。
- 「合併至目前分支」將右鍵選取的 commit 合併進目前分支，對話框顯示「來源 → 目標」。例如要把最新 release 合併進 master，先 Checkout 本機 master，再對 release 的最新 commit 執行合併；操作不會自動推送遠端。
- Reset 支援 soft／mixed／hard，預設 soft；hard 會提示將捨棄的變更。Merge 可選一般合併、不快轉或只快轉；Cherry-pick／Revert merge commit 時可選主線父 commit。
- Merge、Rebase、Cherry-pick、Revert 發生衝突後，可在外部編輯檔案、於工作區暫存，再按「繼續操作」，也可按「中止操作」。
- 搜尋訊息、作者、SHA、分支與標籤；Enter／Shift Enter 跳至搜尋結果，保留完整圖譜。
- 分支選單跳至該分支的 commit；不會切換工作目錄的分支。
- 工具列的定位圖示、`M` 快捷鍵及右鍵選單可快速 focus 到 master／main 的最新 commit，支援本機與遠端分支；多個候選時可選擇。目標較舊時自動載入更多歷史，最多 5,000 筆，並清除搜尋、將焦點移到該列。
- 首次開啟分頁時載入 Git 歷史，切換分頁沿用快取；按「重新整理」或 R 更新目前專案。變更遠端顯示選項或載入更多紀錄時會重新讀取；Git 讀取在背景執行。

## Windows 試用

建置後開啟 `src-tauri/target/release/repovela.exe`，按「加入專案」選擇 Git 專案資料夾。可同時選擇多個資料夾。完成後，未來只需開啟這個應用程式。

這是 Windows x64 可攜式版本，需要 Microsoft Edge WebView2 Runtime。應用程式沒有新增開機自動啟動設定；重開還原是在你再次啟動應用程式時生效。

## 開發

需要 Node.js 22.12+、pnpm 10.33.0、Rust stable，以及 [Tauri 2 作業系統建置前置需求](https://v2.tauri.app/start/prerequisites/)。Windows 需要 Visual Studio C++ Build Tools 與 WebView2。專案透過 `packageManager` 固定 pnpm 版本，使用 `pnpm-lock.yaml` 鎖定依賴；安裝時執行 `pnpm install --frozen-lockfile`。

```powershell
git clone https://github.com/Proladon/repovela.git
cd repovela
pnpm install --frozen-lockfile
pnpm run tauri dev
```

瀏覽器預覽（展示模式使用 keifu 的公開歷史，不讀取本機專案）：

```powershell
pnpm run dev
```

開啟 `http://127.0.0.1:5173/?demo`，加入 `demo://keifu` 和 `demo://另一個專案` 測試分頁。展示模式只在開發伺服器啟用，正式桌面版本不包含展示資料。

## 建置與測試

```powershell
pnpm run build
pnpm test
pnpm exec playwright install chromium
pnpm run test:visual
cargo test --manifest-path src-tauri/Cargo.toml -p repovela-core
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
pnpm run tauri build --no-bundle
```

最後一個指令會產生 `src-tauri/target/release/repovela.exe`。移除 `--no-bundle` 即可建立平台安裝包。此版本只在 Windows 完成編譯驗證；macOS、Linux 尚未驗證。

## 架構

```text
src/                         Vue 3 + TypeScript 桌面介面與本機 session
src-tauri/src/lib.rs          Tauri IPC，背景執行 Git 讀取與操作
src-tauri/core/src/lib.rs     儲存庫、commit、工作區與 diff adapter
src-tauri/core/src/operations.rs Git CLI 基本操作
src-tauri/core/src/git/       keifu Git 資料結構與圖譜演算法
src-tauri/core/src/graph/     keifu 色彩分配演算法
```

瀏覽使用 libgit2；Git 操作需要 Git 2.23+ 的 `git` 執行檔可從 PATH 啟動，沿用本機作者設定、hooks 與憑證設定，不會開啟終端機視窗。提交前請設定 `user.name` 與 `user.email`。遠端操作停用互動式登入；需要驗證時，請先在 Git 中完成憑證或 SSH 設定。展示模式僅供瀏覽。

專案與分頁狀態儲存於 WebView 的本機儲存空間；重開保留資料，清除此應用程式的 WebView 資料會重設清單。

畫面測試使用改寫前 React 版本保存的 20 張基準圖片，涵蓋 1360×880、1000×640 兩種視窗尺寸。樣式檔與專案儲存格式維持不變。基準來源與比對範圍見 [e2e/BASELINES.md](e2e/BASELINES.md)。

Windows 桌面驗證可執行 `pnpm run validate:windows`，自動建置並測試真正的原生視窗、WebView2 與 Git IPC，另存 19 張截圖；已有執行檔時用 `pnpm run test:windows`。新 checkout 沒有本機畫面基準時可先跑 `pnpm run test:flow`。環境需求、人工資料夾選擇器／DPI 檢查與證據保存見 [e2e/WINDOWS.md](e2e/WINDOWS.md)，結果見 [VALIDATION.md](VALIDATION.md)。

## 快捷鍵

| 快捷鍵              | 功能                   |
| ------------------- | ---------------------- |
| Ctrl / ⌘ O          | 加入專案               |
| Ctrl / ⌘ W          | 關閉分頁               |
| Ctrl / ⌘ Tab        | 下一個專案             |
| Ctrl / ⌘ Shift Tab  | 上一個專案             |
| Ctrl / ⌘ F          | 搜尋 commit            |
| Enter / Shift Enter | 下一筆／上一筆搜尋結果 |
| j / k、↑ / ↓        | 選取 commit            |
| @                   | 跳至 HEAD              |
| M                   | 跳至 master/main       |
| R                   | 重新整理               |

## 第一版範圍

- 尚未提供 stash、逐檔丟棄變更、強制推送與刪除分支。Rebase 使用非互動式流程，不保留 merge 結構；新增 Tag 不簽署。修改目前分支歷史的操作需要先切換至本機分支；Merge、Rebase、Cherry-pick、Revert 開始前需要乾淨工作區。
- 遠端分支顯示本機的 remote-tracking refs；按 Fetch 才會從遠端更新。
- 預設讀取 500 筆 commit，可逐次增加到 5,000 筆。
- 每筆 commit 最多列出 1,000 個檔案；單一 diff 超過 1 MB 或 10,000 行時截斷顯示。
- Merge commit 與第一個父 commit 比較；初始 commit 與空 tree 比較。
- 二進位檔、子模組與僅權限變更可能沒有文字 diff；未追蹤的符號連結不讀取目標內容。
- 尚未加入工作區群組、分頁拖曳排序、檔案系統即時監聽與 diff 語法高亮。

原始碼授權與來源列於 `LICENSE`、`THIRD_PARTY_NOTICES.md`。這是衍生專案，並非 keifu 官方桌面版。
