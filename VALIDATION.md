# 驗證記錄

日期：2026-10-01。

專案：Repovela 0.1.0，Vue 3 前端。以下檢查已於 Vue 遷移後重新執行。

環境：Windows x64、Node.js 24.6.0、Vue 3.5.43、Rust 1.97.1、Tauri 2.12.1、Playwright 1.63.0。

## 已通過

- Vue／session：14 項測試。
- Rust 圖譜／tag／真實 Git 儲存庫：9 項測試。
- `vue-tsc` 嚴格型別檢查與 Vite 正式版建置。
- Chromium：2 個完整瀏覽流程、20 張畫面回歸比對，基準為改寫前的 React 版本。
- `styles.css`、本機 session 格式、Tauri IPC 與 Rust 後端維持不變。
- `cargo clippy --all-targets -- -D warnings`。
- Rustfmt 與 Prettier 格式檢查。
- Windows Tauri 正式版編譯。
- 正式版啟動檢查：啟動後 4 秒程序維持執行，未立即崩潰；檢查後關閉。

測試涵蓋：一次加入多專案、分頁獨立選取、重開還原、路徑去重、關閉後重新開啟、過期專案／commit／diff 回應隔離、單一專案讀取失敗、部分暫存 diff、搜尋與鍵盤選取、每個分頁的搜尋與遠端選項、取消釘選／改名／移除、輸入框自動焦點、重新取得焦點時更新 diff、初始 commit、空儲存庫、detached HEAD、tag 歷史、merge 圖譜與第一父 commit diff、未追蹤／二進位檔、大型 diff 截斷、路徑驗證，以及讀取前後 index 檔案不變。

畫面比對涵蓋 1360×880、1000×640 各 10 個狀態。比對門檻與限制詳見 [e2e/BASELINES.md](e2e/BASELINES.md)。

## 尚未完成的驗證

原生 Windows 視窗、資料夾選擇器的端對端操作，以及 WebView2 的實際排版仍未操作驗證。Vue 互動測試使用 jsdom，畫面與瀏覽流程則使用真正的 Chromium；後者不等同原生 WebView2。

macOS、Linux 尚未編譯或測試。執行檔為未簽署的開發原型。
