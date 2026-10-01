# 驗證記錄

日期：2026-10-01。

專案：Repovela 0.1.0。以下檢查已於專案更名後重新執行。

環境：Windows x64、Node.js 24.6.0、Rust 1.97.1、Tauri 2.12.1。

## 已通過

- React／session：10 項測試。
- Rust 圖譜／tag／真實 Git 儲存庫：9 項測試。
- TypeScript 嚴格型別檢查與 Vite 正式版建置。
- `cargo clippy --all-targets -- -D warnings`。
- Rustfmt 與 Prettier 格式檢查。
- Windows Tauri 正式版編譯。
- 正式版啟動檢查：啟動後 4 秒程序維持執行，未立即崩潰；檢查後關閉。

測試涵蓋：一次加入多專案、分頁獨立選取、重開還原、路徑去重、關閉後重新開啟、過期非同步回應隔離、單一專案讀取失敗、部分暫存 diff、初始 commit、空儲存庫、detached HEAD、tag 歷史、merge 圖譜與第一父 commit diff、未追蹤／二進位檔、大型 diff 截斷、路徑驗證，以及讀取前後 index 檔案不變。

## 尚未完成的驗證

原生 Windows 視窗、資料夾選擇器的端對端操作，以及實際 WebView 排版未能在這次環境中操作驗證：桌面預覽工具未能連上視窗。React 互動測試使用 jsdom；它不會驗證畫面像素與 WebView 的實際行為。

macOS、Linux 尚未編譯或測試。執行檔為未簽署的開發原型。
