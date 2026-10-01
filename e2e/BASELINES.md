# 畫面基準

`appearance.spec.ts-snapshots/` 的 20 張圖片於 2026-10-01、改寫前的 React 版本產生，原始碼 commit 為 `623cda05d8b75f4d6d3451f474c6f13ec55962d1`。Vue 遷移後保留這批圖片，沒有以 Vue 的畫面覆寫基準。

環境：Windows x64、Playwright 1.63.0、Chromium 153.0.8010.12、zh-TW、Asia/Taipei、device scale factor 1。

1360×880 與 1000×640 各涵蓋：歡迎畫面、加入專案、Git 歷史、分支選單、搜尋、diff、工作區、專案選單、重新命名、快捷鍵與關於。

比對使用 `maxDiffPixels: 0`、`threshold: 0.01`。色差門檻只排除瀏覽器圓角邊緣的極小色彩量化誤差；不允許超過此門檻的差異像素。游標與動畫由 Playwright 統一處理。這是嚴格的畫面回歸比對，不代表 PNG 位元組完全相同。

Vue 模板保留相鄰文字節點的邊界，避免合併節點後出現不同的字距與抗鋸齒。`styles.css` 與 React 版本完全相同，其 SHA-256 為 `91E95EC7AC3A69B4B8BCC3E170F4D0BFD2478168DACC60F327AF04CEDCED77A6`。

測試以本機開發伺服器的展示資料執行，也驗證專案加入、釘選、改名、鍵盤操作、分頁切換與重開還原。原生資料夾選擇器與 WebView2 的畫面仍需在桌面環境實際驗證。其他作業系統或字型環境應另行建立經人工檢查的基準。
