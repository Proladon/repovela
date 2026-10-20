# Repovela

Repovela 是以 [keifu](https://github.com/trasta298/keifu) 圖譜演算法為基礎的獨立 Tauri 2 桌面 Git 工具，提供多專案管理、歷史瀏覽與基本 Git 操作。

前端使用 Vue 3、TypeScript 與單檔元件（Composition API）。

## 目前功能

- 一次選取多個 Git 專案，也可貼上資料夾路徑；自動找到儲存庫根目錄並去重。
- 專案或 `.git` 擁有者不同時，顯示「信任 Git 專案」確認視窗。確認後只將該專案的完整路徑加入 Git 全域 [safe.directory](https://git-scm.com/docs/git-config#Documentation/git-config.txt-safedirectory)；取消不更改設定。支援沒有遠端或尚無 commit 的本機儲存庫。
- 專案清單、釘選、重新命名、移除；可建立、改名與折疊群組，拖曳群組標題改變順序，拖曳專案排序或移入／移出群組，包含空的或折疊中的群組。移除群組會保留專案並移回未分組清單；重開保留排列與折疊狀態。
- 側邊欄可拖曳右邊界調整寬度，方向鍵微調，雙擊或 Home 還原；重開保留寬度，窄視窗會限制寬度以保留主要內容空間。
- 每個專案一個分頁；關閉後仍可從清單開啟。
- PR／MR 左側清單與 Changes 檔案清單皆可拖曳右邊界調整寬度，方向鍵微調（Shift 為 4px）、End 放大至目前上限，雙擊或 Home 還原自動寬度。兩個清單各自保存寬度，切換分頁、返回歷史或重開仍保留；窄視窗會限制清單寬度，保留右側內容與 diff 的空間，視窗放大後恢復原設定。
- PR／MR 頁面直接接在專案工具列下方，沒有額外標題列或左右外層留白；「建立 PR／MR」與「來源設定」位於上方工具列，狀態篩選與重新整理位於左側清單內。單一遠端自動辨識平台，不顯示遠端／平台選單；多遠端或未知平台可從「來源設定」調整。
- 工具列的「開啟 repo 網站」按鈕使用預設瀏覽器開啟遠端 repo，支援 HTTP(S)、常見 SSH 與 Git 遠端網址；多個遠端時可選擇，沒有網站網址時停用。
- 每個專案的工具列與右鍵選單提供「瀏覽 PR／MR」，將主內容切換為整頁 GitHub PR／GitLab MR 視圖；側邊欄與專案分頁保持可用，按「Git 歷史」返回原本的 commit 與 diff。可切換遠端、篩選開啟中／已合併／已關閉／全部，每次載入 30 筆並繼續載入更多；搜尋目前已載入的編號、標題、作者、分支與標籤。概覽顯示最新作者、狀態、草稿、來源／目標分支、標籤、說明與平台合併狀態；Changes 提供變更檔案、增刪行數、重新命名及含行號的文字 diff，檔案清單可分頁載入。GitLab 支援子群組與自架主機；無法自動辨識的主機需選擇平台。沒有遠端網址時停用。
- PR／MR 可在頁內建立、留言、核准、合併、關閉／重新開啟與切換草稿；GitHub 另提供要求修改，GitLab 提供撤銷核准。表單顯示目標與明確送出按鈕，合併可選 Merge／Squash，GitHub 另可選 Rebase。執行前重新核對來源提交、狀態與合併目標；合併／審核請求帶入所查看的 commit，平台權限與保護規則仍生效。建立使用已存在的遠端分支；操作不推送本機變更、不要求刪除來源分支。執行中禁止重複送出、變更遠端及關閉該專案，仍可切換到其他專案。操作後重新整理遠端資料；失敗或逾時需先核對平台結果，避免重複送出。
- 整合互動式終端機：按工具列的終端機圖示或 `Ctrl / ⌘` 加反引號，在專案根目錄直接輸入指令。每個專案有獨立 shell；隱藏與切換專案保留工作階段，結束終端機、關閉分頁或程式時清理程序。支援 Ctrl+C、清除畫面、重新啟動、拖曳／方向鍵調整面板高度；離開面板時重新讀取 Git 狀態，也可按面板的重新整理按鈕。
- 重開還原專案、分頁、目前專案、選取的 commit、遠端顯示選項與歷史載入範圍。
- 沿用 keifu 圖譜布局與色彩分配，改以 SVG 顯示。
- Commit 訊息、作者、日期、分支、標籤、父 commit、變更檔案與文字 diff。
- 已暫存／未暫存／未追蹤檔案分開瀏覽，支援部分暫存的檔案。
- 工作區可逐檔或全部暫存／取消暫存；輸入提交訊息後提交已暫存變更，保留未暫存內容。取消暫存不會還原工作目錄。
- 「分支操作」可建立並切換分支、切換既有本機分支；Git 會阻止覆寫尚未提交的變更。
- 工具列、工作區列、工作區檔案清單空白處及檔案的右鍵選單，可開啟 Stash 管理：儲存訊息、選擇包含未追蹤檔案、查看清單、套用（Apply）、還原並移除（Pop）、確認後刪除（Drop）。檔案右鍵的「Stash 工作區…」管理整個 repo 的 Stash。可一併還原原本的暫存狀態；忽略的檔案不會儲存。Pop 只有成功時才移除 Stash，衝突時保留，需自行解決並暫存衝突檔案。執行前核對清單項目的編號與 hash，拒絕過期目標；操作後重新整理清單與工作區。
- Fetch 取得所有遠端紀錄；Pull 只允許乾淨工作區與快轉更新；Push 只推送目前分支，沒有上游時推至 origin 並設定上游。操作成功或失敗後都會重新讀取原專案，執行期間禁止重複操作。
- 操作按鈕使用圖示與 tooltip。可在專案工具列、工作區、檔案、分支及 commit 按右鍵開啟對應選單；支援 Shift+F10、方向鍵與 Escape，切換專案時會關閉選單。
- Commit 右鍵選單支援新增 Tag、從指定 commit 建立分支、Checkout、Cherry-pick、Revert、Merge、Rebase、Reset，以及複製完整 hash／標題。執行前顯示目標與參數；建立分支預設不切換。Checkout 優先選取該位置的目前分支或唯一的本機分支；只有遠端分支時，可建立並切換本機追蹤分支，預填名稱可修改，多個候選分支時需要明確選擇。同名本機分支已存在時需另取名稱，不會覆寫；也可自行選擇 Detached HEAD。
- 遠端分支標籤與分支列表的右鍵選單也支援 Checkout。只有 commit、沒有可選分支時預設 Detached HEAD，畫面會標示狀態，停用項目的 tooltip 會說明需要先切換本機分支。
- 遠端分支標籤、分支列表及遠端 tip 所在的整列 commit 右鍵，都提供單一「同步本機分支至此遠端」選項。同一列有多個遠端時，於對話框選擇遠端來源，再選本機目標；右鍵遠端標籤則直接指定該來源。只允許快轉，預選追蹤該遠端或同名的本機分支，也可自行選擇。同步其他分支時保留目前 Checkout／工作目錄；同步目前分支時需乾淨工作區，並更新檔案。本機獨有提交、分歧、過期目標及其他 worktree 正在使用的分支會拒絕同步。使用已取得的遠端紀錄，最新資料請先 Fetch；不會推送或改變上游設定。
- 「合併至目前分支」將右鍵選取的 commit 合併進目前分支，對話框顯示「來源 → 目標」。例如要把最新 release 合併進 master，先 Checkout 本機 master，再對 release 的最新 commit 執行合併；操作不會自動推送遠端。
- Reset 支援 soft／mixed／hard，預設 soft；hard 會提示將捨棄的變更。Merge 可選一般合併、不快轉或只快轉；Cherry-pick／Revert merge commit 時可選主線父 commit。
- Merge、Rebase、Cherry-pick、Revert 發生衝突後，可在外部編輯檔案、於工作區暫存，再按「繼續操作」，也可按「中止操作」。
- 搜尋訊息、作者、SHA、分支與標籤；Enter／Shift Enter 跳至搜尋結果，保留完整圖譜。
- 單擊分支選單跳至該分支的 commit；雙擊分支列表或歷史中的分支標籤可 Checkout，本機分支直接切換、遠端分支開啟追蹤分支視窗。雙擊 commit 開啟 Checkout 視窗。
- 工具列的定位圖示、`M` 快捷鍵及右鍵選單可快速 focus 到 master／main 的最新 commit，支援本機與遠端分支；多個候選時可選擇。目標較舊時自動載入更多歷史，最多 5,000 筆，並清除搜尋、將焦點移到該列。
- 首次開啟分頁時載入 Git 歷史，切換分頁沿用快取；按「重新整理」或 R 更新目前專案。變更遠端顯示選項或載入更多紀錄時會重新讀取；Git 讀取在背景執行。

## 下載與安裝

從 [GitHub Releases](https://github.com/Proladon/repovela/releases/latest) 下載 Windows x64 安裝程式（`-setup.exe`）或可攜式 ZIP；macOS 使用通用版 DMG，同時支援 Apple Silicon 與 Intel，開啟後將 Repovela 拖至 Applications。

macOS 版本使用 ad-hoc 簽署，尚未經 Apple 公證。首次開啟若被阻擋，請至「系統設定 → 隱私權與安全性」允許開啟，詳見 [Apple 說明](https://support.apple.com/zh-tw/102445)。Git 操作需要可從 PATH 啟動的 Git；PR／MR 功能另需對應的 `gh`／`glab`。

偏好設定最上方的「版本與更新」顯示目前版本，提供檢查更新、版本說明、下載進度，以及下載驗證完成後的「安裝更新並重新啟動」。下載期間可關閉設定視窗，重新開啟會保留進度；檢查或下載失敗可重試。安裝會關閉所有終端機工作階段，正在執行 Git 操作時不可安裝。瀏覽器預覽只顯示建置版本，更新功能需使用桌面版。

建置後開啟 `src-tauri/target/release/repovela.exe`，按「加入專案」選擇 Git 專案資料夾。可同時選擇多個資料夾。完成後，未來只需開啟這個應用程式。

Windows 版本需要 Microsoft Edge WebView2 Runtime。應用程式沒有新增開機自動啟動設定；重開還原是在你再次啟動應用程式時生效。

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

最後一個指令在 Windows 會產生 `src-tauri/target/release/repovela.exe`。移除 `--no-bundle` 即可建立平台安裝包。發布流程在 Windows 與 macOS runner 執行測試及編譯；macOS 尚未完成人工桌面操作驗證，Linux 尚未驗證。

在 macOS 建置通用版：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm run tauri build --target universal-apple-darwin --bundles app,dmg
```

## 發布 Windows 與 macOS 更新

更新使用 [Tauri Updater](https://v2.tauri.app/plugin/updater/) 驗證安裝包簽章，從此儲存庫最新正式 GitHub Release 的 `latest.json` 取得版本。建議使用 NSIS 安裝版；可攜式執行檔執行更新時會啟動安裝程式，改用安裝版，不會覆寫原本的可攜式檔案。

簽章私鑰由維護者保存於 `%USERPROFILE%\.tauri\repovela.key`，對應公鑰設定於 `src-tauri/tauri.conf.json`。請保留並備份私鑰，後續版本必須使用同一把金鑰。

首次發布前，在 GitHub 儲存庫的 Actions secrets 設定 `TAURI_SIGNING_PRIVATE_KEY` 為該私鑰檔案的完整內容。這把金鑰未設定密碼，因此 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可留空。私鑰不得加入儲存庫；簽章需求與發布流程見 [Tauri 官方文件](https://v2.tauri.app/distribute/pipelines/github/)。

1. 同步調整 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的版本號，例如 `0.2.0`，並更新 lockfile。
2. 推送相符的版本 tag（例如 `v0.2.0`），或手動執行 `.github/workflows/release.yml`。
3. 工作流程依序在 Windows 與 macOS 執行測試，建置 Windows NSIS／可攜式 ZIP 及 macOS 通用版 DMG／`.app.tar.gz`，建立 Release 草稿。更新套件附帶 `.sig`，共用的 `latest.json` 包含 Windows x64 及 macOS 兩種架構。
4. 確認所有平台工作成功、安裝包及版本說明完整後，發布草稿為正式 Release。草稿與預發行版不會成為此更新來源。macOS 的更新簽章與 Apple 公證不同；目前使用 ad-hoc 應用程式簽署。

在首個正式 Release 發布前，「檢查更新」會顯示來源尚未發布或連線失敗，不會誤顯示為最新版本。

本機建立簽章安裝包：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri\repovela.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
pnpm run tauri build --bundles nsis
```

## 架構

```text
src/                         Vue 3 + TypeScript 桌面介面與本機 session
src-tauri/src/lib.rs          Tauri IPC，背景執行 Git 讀取與操作
src/TerminalPanel.vue         xterm.js 終端機與尺寸同步
src-tauri/src/terminal.rs     portable-pty shell、串流與工作階段清理
src-tauri/core/src/lib.rs     儲存庫、commit、工作區與 diff adapter
src-tauri/core/src/operations.rs Git CLI 基本操作
src-tauri/core/src/git/       keifu Git 資料結構與圖譜演算法
src-tauri/core/src/graph/     keifu 色彩分配演算法
```

瀏覽使用 libgit2；Git 操作需要 Git 2.23+ 的 `git` 執行檔可從 PATH 啟動，沿用本機作者設定、hooks 與憑證設定，不會開啟終端機視窗。提交前請設定 `user.name` 與 `user.email`。遠端操作停用互動式登入；需要驗證時，請先在 Git 中完成憑證或 SSH 設定。展示模式僅供瀏覽。

PR／MR 瀏覽與操作另需安裝對應平台的 [GitHub CLI](https://cli.github.com/)（`gh`）或 [GitLab CLI](https://docs.gitlab.com/cli/)（`glab`）並加入 PATH。先執行 `gh auth login` 或 `glab auth login`；自架平台使用 `--hostname 主機名稱` 登入，HTTP／自訂 API 位址需先在 CLI 設定。Repovela 沿用 CLI 憑證，不儲存 token；單次請求 45 秒逾時。瀏覽器展示模式可預覽清單與 Changes，操作需使用桌面版。Changes 依平台 API 提供的 diff 顯示；二進位檔、缺少 diff 或平台截斷會提示，單檔最多 1 MB／10,000 行。可在網站查看完整內容。尚未提供逐行留言、完整討論串、Reviewer 指派或本機 Checkout。

專案與分頁狀態儲存於 WebView 的本機儲存空間；重開保留資料，清除此應用程式的 WebView 資料會重設清單。

終端機採用與 VS Code 相同的 [xterm.js](https://code.visualstudio.com/docs/terminal/advanced) 前端。VS Code 使用 node-pty；Repovela 的 Tauri 後端使用 [portable-pty](https://docs.rs/portable-pty/)（Windows ConPTY／Unix PTY），透過 Tauri Channel 串流原始 UTF-8 bytes。Windows 使用 `COMSPEC` 指定的 shell（通常是 cmd.exe，停用 cmd AutoRun），macOS／Linux 使用 `SHELL` 或 `/bin/sh`。指令沿用本機環境與權限，工作階段不跨應用程式重啟保存；最多同時 16 個終端機。終端機僅在桌面版可用。

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
| Ctrl / ⌘ + 反引號   | 開啟／隱藏終端機       |
| Enter / Shift Enter | 下一筆／上一筆搜尋結果 |
| j / k、↑ / ↓        | 選取 commit            |
| @                   | 跳至 HEAD              |
| M                   | 跳至 master/main       |
| R                   | 重新整理               |

## 第一版範圍

- 尚未提供逐檔丟棄變更、強制推送與刪除分支。Rebase 使用非互動式流程，不保留 merge 結構；新增 Tag 不簽署。修改目前分支歷史的操作需要先切換至本機分支；Merge、Rebase、Cherry-pick、Revert 開始前需要乾淨工作區。
- 遠端分支顯示本機的 remote-tracking refs；按 Fetch 才會從遠端更新。
- 預設讀取 500 筆 commit，可逐次增加到 5,000 筆。
- 每筆 commit 最多列出 1,000 個檔案；單一 diff 超過 1 MB 或 10,000 行時截斷顯示。
- Merge commit 與第一個父 commit 比較；初始 commit 與空 tree 比較。
- 二進位檔、子模組與僅權限變更可能沒有文字 diff；未追蹤的符號連結不讀取目標內容。
- 尚未加入分頁拖曳排序、檔案系統即時監聽與 diff 語法高亮。

原始碼授權與來源列於 `LICENSE`、`THIRD_PARTY_NOTICES.md`。這是衍生專案，並非 keifu 官方桌面版。
