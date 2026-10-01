# Repovela

Repovela 是以 [keifu](https://github.com/trasta298/keifu) 圖譜演算法為基礎的獨立 Tauri 2 桌面 Git 瀏覽器。第一版聚焦多專案管理與瀏覽，全程唯讀。

## 目前功能

- 一次選取多個 Git 專案，也可貼上資料夾路徑；自動找到儲存庫根目錄並去重。
- 專案清單、釘選、重新命名、移除；移除只會改變應用程式清單。
- 每個專案一個分頁；關閉後仍可從清單開啟。
- 重開還原專案、分頁、目前專案、選取的 commit、遠端顯示選項與歷史載入範圍。
- 沿用 keifu 圖譜布局與色彩分配，改以 SVG 顯示。
- Commit 訊息、作者、日期、分支、標籤、父 commit、變更檔案與文字 diff。
- 已暫存／未暫存／未追蹤檔案分開瀏覽，支援部分暫存的檔案。
- 搜尋訊息、作者、SHA、分支與標籤；Enter／Shift Enter 跳至搜尋結果，保留完整圖譜。
- 分支選單跳至該分支的 commit；不會切換工作目錄的分支。
- 重新取得焦點與每 30 秒更新目前專案；Git 讀取在背景執行。

## Windows 試用

建置後開啟 `src-tauri/target/release/repovela.exe`，按「加入專案」選擇 Git 專案資料夾。可同時選擇多個資料夾。完成後，未來只需開啟這個應用程式。

這是 Windows x64 可攜式版本，需要 Microsoft Edge WebView2 Runtime。應用程式沒有新增開機自動啟動設定；重開還原是在你再次啟動應用程式時生效。

## 開發

需要 Node.js 22.12+、Rust stable，以及 [Tauri 2 作業系統建置前置需求](https://v2.tauri.app/start/prerequisites/)。Windows 需要 Visual Studio C++ Build Tools 與 WebView2。

```powershell
git clone https://github.com/Proladon/repovela.git
cd repovela
npm ci
npm run tauri dev
```

瀏覽器預覽（展示模式使用 keifu 的公開歷史，不讀取本機專案）：

```powershell
npm run dev
```

開啟 `http://127.0.0.1:5173/?demo`，加入 `demo://keifu` 和 `demo://另一個專案` 測試分頁。展示模式只在開發伺服器啟用，正式桌面版本不包含展示資料。

## 建置與測試

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml -p repovela-core
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
npm run tauri build -- --no-bundle
```

最後一個指令會產生 `src-tauri/target/release/repovela.exe`。移除 `--no-bundle` 即可建立平台安裝包。此版本只在 Windows 完成編譯驗證；macOS、Linux 尚未驗證。

## 架構

```text
src/                         React + TypeScript 桌面介面與本機 session
src-tauri/src/lib.rs          Tauri 唯讀 IPC，背景執行 Git 讀取
src-tauri/core/src/lib.rs     儲存庫、commit、工作區與 diff adapter
src-tauri/core/src/git/       keifu Git 資料結構與圖譜演算法
src-tauri/core/src/graph/     keifu 色彩分配演算法
```

唯讀瀏覽使用 libgit2，不需要啟動終端機或依賴 `git` 執行檔。專案與分頁狀態儲存於 WebView 的本機儲存空間；重開保留資料，清除此應用程式的 WebView 資料會重設清單。

## 快捷鍵

| 快捷鍵 | 功能 |
| --- | --- |
| Ctrl / ⌘ O | 加入專案 |
| Ctrl / ⌘ W | 關閉分頁 |
| Ctrl / ⌘ Tab | 下一個專案 |
| Ctrl / ⌘ Shift Tab | 上一個專案 |
| Ctrl / ⌘ F | 搜尋 commit |
| Enter / Shift Enter | 下一筆／上一筆搜尋結果 |
| j / k、↑ / ↓ | 選取 commit |
| @ | 跳至 HEAD |
| R | 重新整理 |

## 第一版範圍

- 不包含 commit、暫存、checkout、fetch、push、merge、rebase 等寫入操作。
- 遠端分支是本機已有的 remote-tracking refs，不會自行從遠端 fetch。
- 預設讀取 500 筆 commit，可逐次增加到 5,000 筆。
- 每筆 commit 最多列出 1,000 個檔案；單一 diff 超過 1 MB 或 10,000 行時截斷顯示。
- Merge commit 與第一個父 commit 比較；初始 commit 與空 tree 比較。
- 二進位檔、子模組與僅權限變更可能沒有文字 diff；未追蹤的符號連結不讀取目標內容。
- 尚未加入工作區群組、分頁拖曳排序、檔案系統即時監聽與 diff 語法高亮。

原始碼授權與來源列於 `LICENSE`、`THIRD_PARTY_NOTICES.md`。這是衍生專案，並非 keifu 官方桌面版。
