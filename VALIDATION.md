# 驗證記錄

## 2026-10-06：專案群組拖曳排序

群組標題支援拖曳排序，展開、折疊及空群組皆可移動；透過原 session 保存群組順序，保留專案成員、釘選、折疊與分頁。搜尋中只交換可見群組，保留隱藏群組位置。外層 Sortable 使用獨立的預設群組，避免屬性更新重設具名群組後阻擋自身排序；群組與專案分別使用標題與專案列作為拖曳範圍。垂直排序及交換門檻支援巢狀清單。

174 項前端測試、Vue 型別／Vite 建置、Prettier 與 diff 空白檢查通過。Windows／WebView2 完成空群組前後移動、含成員的折疊群組排序、搜尋排序保留隱藏群組及重開還原；原有跨群組專案移動、群組內排序、釘選與雙擊 Checkout 流程也通過。HEAD、index 與專案檔案內容不變。原生拖曳測試等待預覽抵達預期位置再放開，避免 fallback 計時器造成過早結束。已檢視更新後的 `sidebar-groups.png`。

Tauri debug 編譯／連結完成，原執行檔使用中無法覆寫；將新版本另存為 `target/debug/repovela-group-order.exe` 完成原生驗證。本次未修改 Rust 邏輯。

## 2026-10-06：側邊欄寬度與專案群組

側邊欄右邊界支援拖曳、方向鍵調整與雙擊／Home 還原，寬度保存於偏好設定；依視窗寬度限制上限，保留主要內容空間，移除窄視窗覆蓋自訂寬度的舊樣式。專案庫可建立、改名、移除與折疊群組，拖曳專案至空的或折疊中的群組、跨群組移動、群組內排序及移回未分組清單。移動保留釘選狀態、分頁與目前專案；移除群組保留成員。搜尋暫時展開符合的群組，清空後恢復原折疊狀態。群組與成員關係保存於原 version 1 session，舊資料可直接還原，孤立群組關係回到未分組清單。

172 項前端測試、Vue 型別／Vite 建置、Prettier 與 diff 空白檢查通過。新增 `e2e/windows/sidebar-groups.spec.ts`，在隔離的 Windows／WebView2 profile 與三個真實 Git 專案連續兩次完成所有拖曳情境、釘選保留、改名／刪除、搜尋與重開還原，確認實際側邊欄寬度及 1000×640 排版；HEAD、index 與檔案內容不變。測試等待 Sortable 的拖曳預覽抵達目標後才放開滑鼠，避免 fallback 計時器尚未更新的誤判。已檢視 `sidebar-groups.png`；原專案排序與雙擊 Checkout 桌面流程也通過。

Tauri debug 編譯／連結完成，最後更新原執行檔因使用中的檔案鎖定失敗；將本次 `target/debug/deps/repovela.exe` 另存為 `target/debug/repovela-sidebar-groups.exe` 完成原生驗證，保留使用者執行中的程式。本次未修改 Rust 邏輯，未重跑 Rust 測試。

## 2026-10-06：Tag 搜尋提示與確認

既有搜尋已比對已載入 commit 的 tag，搜尋欄提示補上 tag。五項既有搜尋前端回歸、型別／Vite 建置及 Tauri debug 建置通過。於隔離的 Windows／WebView2 儲存庫實際確認附註 tag 與輕量 tag 可依名稱搜尋，支援大小寫、前後空白及部分名稱；Enter 定位到較舊的 tag commit，HEAD／index 不變。保存 `test-results/tag-search/tag-search.png`。此次 `target/debug/repovela.exe` 已成功更新。

## 2026-10-06：Stash 無可儲存變更的顯示

沒有可儲存變更時隱藏新增 Stash 的整個表單，以狀態文字取代，保留既有清單與 Apply／Pop／Drop。只有未追蹤檔案時仍顯示表單，讓使用者勾選包含；沒有 commit、進行中的 Git 操作或衝突時，隱藏新增表單並顯示原因。開啟乾淨工作區的視窗及儲存後表單消失時，焦點移到選取的 Stash 或關閉按鈕。

四項 Stash 前端回歸、Vue 型別／Vite 建置、格式檢查及 Windows Stash 完整流程通過。原生流程確認儲存後不再顯示訊息輸入與儲存按鈕，既有 Stash 可繼續 Apply；已檢視更新後的清單畫面。原執行檔被鎖定，另存 `target/debug/repovela-stash-empty-state.exe` 完成原生驗證。

## 2026-10-06：工作區右鍵 Stash

工作區列、工作區檔案清單空白處與檔案右鍵選單加入 Stash 入口，沿用同一個管理視窗與忙碌／桌面模式防護。檔案入口標示「Stash 工作區…」，明確管理整個 repo。前端 163 項測試通過，更新既有 Stash 回歸涵蓋三個入口；最後檔案入口調整後再次通過四項 Stash 回歸、型別／Vite 建置及格式檢查。Windows Stash 流程透過工作區列與檔案右鍵開啟視窗，完成儲存、Apply、Pop、Drop 與衝突保留，全部通過。檔案右鍵測試先捲動並等待畫面穩定，避免自動捲動立即關閉選單。

Tauri debug 編譯／連結完成，最後更新原執行檔因鎖定失敗；另存為 `target/debug/repovela-stash-context.exe` 完成原生驗證。

## 2026-10-06：Stash 管理

工具列與 Git 右鍵選單加入 Stash 管理視窗，支援訊息、選擇包含未追蹤檔案、清單、Apply、Pop、Drop 與還原暫存狀態。後端透過 refs/stash 的 reflog 讀取編號、hash、訊息與日期，沿用 Git CLI 與寫入鎖執行操作。Drop 需確認；Apply／Pop／Drop 執行前核對編號與 hash，拒絕過期或無效目標。拒絕沒有 commit／可儲存變更、進行中的 Git 操作與未解決衝突；Git 防止覆寫工作區變更，Pop 衝突時保留 Stash。操作後刷新原專案，切換專案關閉視窗。錯誤在視窗內顯示，長訊息可展開詳情，衝突明確標示原 Stash 保留。調整視窗層級，避免完成提示遮住操作按鈕。

163 項前端測試、34 項 Rust 測試、Vue 型別／Vite 建置、Clippy、Rustfmt 及格式檢查通過；最後訊息顯示調整後再次通過四項 Stash 前端回歸。新增 `e2e/windows/stash.spec.ts`，於隔離的中文／空白路徑與 Git 設定，以真正 Windows／WebView2 完成部分暫存及未追蹤檔案的儲存、Apply、選擇較舊項目 Pop、取消／確認 Drop 及 Pop 衝突。核對工作區內容、index、HEAD、ignored 檔案與 stash refs；流程通過，已檢視 1000×640 的清單及衝突畫面。

Tauri debug 編譯／連結完成，最後更新 `target/debug/repovela.exe` 因檔案被鎖定失敗。將本次 `target/debug/deps/repovela.exe` 另存為 `target/debug/repovela-stash.exe` 完成原生驗證。

## 2026-10-06：開啟 repo 網站

專案工具列加入外部連結圖示，使用 Tauri Opener 與預設瀏覽器開啟 repo。後端讀取遠端名稱與網址，前端將 HTTP(S)、SCP SSH、SSH URL 與 Git URL 轉成網站網址，移除 `.git`、認證資訊、query 與 fragment；略過本機路徑及無法解析的網址。多個可用遠端時提供選單、origin 優先，無網站遠端時停用並顯示原因。遠端分支隱藏時仍保留網站功能，展示模式連向 keifu 上游。

159 項前端測試、29 項 Rust 測試、Vue 型別／Vite 建置、Tauri debug 桌面建置及格式檢查通過。新增 `e2e/windows/repository-website.spec.ts`，透過真實 Git 設定與 WebView2 驗證遠端資料、origin／upstream 選擇、專案隔離、1000×640 排版、隱藏遠端分支與不修改 Git 設定；原生 opener 拒絕 file URL。網站開啟的最後 IPC fetch 由測試攔截，先以 file URL 確認攔截生效，再核對兩個網站 URL。原生流程通過，已檢視選單截圖。此次 `target/debug/repovela.exe` 已成功更新。

## 2026-10-06：專案拖拉排序與雙擊 Checkout

使用 `vuedraggable` 4.1.0／SortableJS，釘選與一般專案各自拖拉排序，保存至 session；搜尋結果排序只交換可見專案，保留隱藏專案位置與分頁狀態。使用 fallback 拖曳以支援 Windows WebView2，附帶拖曳預覽與自動捲動。雙擊 commit 開啟既有 Checkout 視窗；雙擊本機分支標籤或分支列表直接切換，遠端分支開啟追蹤分支視窗。分支列表延後單擊跳轉，保留雙擊目標；分支標籤阻止雙擊事件冒泡至 commit，進行中的 Git 操作禁止 Checkout。

137 項前端測試、Vue 型別／Vite 建置、格式及 diff 檢查通過。新增 `e2e/windows/project-interactions.spec.ts`，於隔離的中文路徑、Git 設定與 WebView2 profile，驗證兩種群組排序、跨群組保護、重啟還原、排序不切換專案，以及 commit／本機標籤／遠端列表的實際 Checkout；核對 HEAD、追蹤上游與乾淨工作目錄。原生流程通過，已檢視排序與 Checkout 截圖。

Tauri debug 編譯／連結完成，最後更新 `target/debug/repovela.exe` 因檔案被鎖定失敗。將本次 `target/debug/deps/repovela.exe` 另存為 `target/debug/repovela-project-interactions.exe` 完成原生驗證。

## 2026-10-02：移除 terminal 關閉時的進度區塊

terminal 隱藏／結束後的 Git 資料讀取，原本沿用 `busy` 在工具列下方插入「正在執行 Git 操作…」，使內容位置跳動。移除這個獨立進度區塊，資料讀取與實際 Git 操作改由既有底部狀態列顯示進度，保留衝突操作的繼續／中止介面。

119 個前端測試、型別／Vite 建置、正式桌面建置及格式檢查通過。新增隱藏／結束 terminal 的刷新中回歸，以及 Git 操作使用底部狀態列的驗證。Windows 桌面測試暫停實際刷新回覆，確認上方區塊不可見、專案資訊位置不變，且刷新完成前後歷史面板邊界相同；流程通過，已檢視 `terminal-closed-refresh.png`。

## 2026-10-02：整合互動式終端機

前端使用 xterm.js 6 與 FitAddon，Tauri 後端使用 portable-pty 0.9；Windows 透過 ConPTY 啟動 cmd.exe，原始 UTF-8 bytes 由 Tauri Channel 串流。每個專案有獨立工作階段，隱藏與切換分頁保留 shell；結束終端機、關閉分頁、重新載入頁面及關閉程式時清理。面板支援快捷鍵、清除、重新啟動及尺寸同步，失去焦點或按重新整理時重新讀取 Git 狀態。

116 個前端測試、型別／Vite 建置、Rust 全 target 編譯檢查、Clippy、Rustfmt、diff 空白檢查及正式 Tauri 建置通過。新增三個工作階段競態測試：啟動途中卸載、保留啟動時的 PTY 回覆並依序輸入、重新啟動後忽略舊 shell 事件。

新增 `e2e/windows/terminal.spec.ts`，在真正的 release 桌面版驗證中文／空白工作目錄、指令寫入檔案、中文輸出、Git 切換分支與畫面更新、隱藏／切換後保留環境變數、多專案隔離、Ctrl+C 中斷 ping、面板／視窗尺寸變更、shell 結束碼及重新啟動。透過系統程序查詢確認結束終端機、關閉專案分頁及關閉程式後，測試建立的 shell 均已退出。流程通過，已檢視 1000×640 的 `terminal.png` 截圖；macOS／Linux 尚未實測。

## 2026-10-02：收合多遠端同步選單

commit 整列的右鍵選單固定只顯示一個「同步本機分支至此遠端…」入口。同列有多個遠端時，對話框提供遠端來源下拉選擇，選定後預填對應本機目標；切換來源會重新計算追蹤／同名目標，避免沿用上一個選擇。單一遠端及標籤右鍵沿用直接指定來源的流程，保留快轉與過期目標防護。

前端 100 項測試、型別／Vite 建置及格式檢查通過，涵蓋一個、兩個與八個遠端只產生單一入口，未選來源不能提交，以及切換來源更新本機目標。Windows 同步流程加入八個同 commit 遠端 refs，確認精簡選單、來源選擇及 1000×640 對話框邊界，並完成其他分支／目前分支同步與分歧拒絕；流程通過，兩張截圖已檢視。

debug Tauri 編譯／連結已完成，但主執行檔正在使用，最後複製步驟失敗。將已連結版本另存為 `src-tauri/target/debug/repovela-sync-compact.exe` 完成原生驗證。

## 2026-10-02：補齊 commit 整列的遠端同步選項

先前同步項目只出現在遠端分支標籤與分支列表的右鍵選單，整列 commit 的選單未提供。改為遠端 tip 所在列也顯示同步選項；同一 commit 有多個遠端分支時，列出各遠端名稱供選擇。與分支選單共用來源與停用規則，保留既有快轉防護。

前端 98 項、型別／Vite 建置及 debug Tauri 建置通過。新增單一遠端／多個遠端整列右鍵與非遠端 tip 不提供同步的回歸。Windows 同步流程改以整列右鍵開啟，另保留標籤右鍵驗證，確認選單可見、同步正確及分歧拒絕；流程通過，已檢視整列同步選單截圖。新測試版本為 `src-tauri/target/debug/repovela-branch-sync-row.exe`。

## 2026-10-02：遠端右鍵同步本機分支

遠端分支標籤與分支列表新增「同步本機分支至此遠端…」。對話框預選唯一追蹤該遠端的本機分支，否則使用同名分支；多個追蹤分支需選擇，也可自行指定其他本機分支。顯示同步方向、目標 hash 及是否更新目前工作目錄。只允許快轉，使用已取得的 remote-tracking 紀錄，不推送或更改上游。

後端核對原 HEAD／分支、本機目標 hash 與遠端目標 hash，拒絕本機獨有提交、分歧及過期對話框。目前分支需乾淨工作區，以 FF-only merge 更新分支與檔案；其他分支透過本機 Git fetch 的非強制 refspec 更新固定 commit，保留目前 Checkout、index、工作目錄、FETCH_HEAD 與上游設定，Git 會拒絕更新其他 worktree 已 Checkout 的分支。

前端 95 項、Rust 28 項測試、型別檢查／Vite 建置、Clippy、Rustfmt 及前端格式檢查通過。新增回歸涵蓋同名／追蹤別名／多個候選、已同步、未提交變更、取消、失敗與重複操作防護、分頁隔離、過期目標、分歧、本機領先與 worktree 保護。

新增 `e2e/windows/branch-sync.spec.ts`，使用隔離的中文路徑與離線遠端 refs，於真正 Windows／WebView2 完成同步其他分支、同步目前分支與拒絕分歧，檢查分支、index、設定與檔案內容。此流程通過，已檢視 1000×640 的兩張同步對話框截圖。測試先將標籤捲至可見位置，避免自動水平捲動關閉右鍵選單。

debug Tauri 的編譯／連結已完成，但執行中的 `repovela.exe` 被鎖定，最後複製步驟失敗；將已連結的版本另存為 `src-tauri/target/debug/repovela-branch-sync.exe` 完成原生驗證，保留使用者執行中的程式。

## 2026-10-02：master/main 快速 Focus

新增工具列定位圖示與 tooltip、`M` 快捷鍵及工具列右鍵跳轉項目，支援本機與遠端的 master／main；多個候選時明確選擇。跳轉清除歷史搜尋，選取目標 commit、捲動至可見位置並移動鍵盤焦點，保留目前 Checkout 分支。目標尚未載入時逐步增加歷史範圍，最多 5,000 筆；讀取失敗或超出上限會提示，切換專案會取消待完成跳轉。

前端 89 項測試、Vue 型別檢查／Vite 建置、格式檢查及 debug Tauri 桌面建置通過。新增回歸涵蓋 main／master、遠端候選、搜尋與輸入框快捷鍵、候選選擇、較舊歷史載入、上限、讀取失敗及分頁隔離。

新增 `e2e/windows/branch-focus.spec.ts`，於獨立 520 筆 commit 的離線儲存庫驗證圖示、M、右鍵及自動載入舊 master；核對 HEAD、refs、index、工作目錄檔案與 Git 設定完全不變。此原生 Windows 流程通過，已檢視 1000×640 的分支選單與 focus 後截圖。測試版本另存為 `src-tauri/target/debug/repovela-branch-focus.exe`。

## 2026-10-02：遠端 Checkout 與 Merge 方向

只有 `origin/release/2.102` 等遠端標籤時，原本 Checkout 只能進入 Detached HEAD，導致 Merge 停用。新增從遠端紀錄建立並切換本機追蹤分支，根據遠端名稱預填本機名稱，同名分支存在時要求新名稱，拒絕過期目標與覆寫。遠端分支右鍵提供 Checkout，已有對應本機分支時優先切換；未載入的分支提示先載入更多歷史。Merge 對話框顯示來源與接收分支，維持「所選 commit → 目前分支」的方向。

前端回歸涵蓋遠端標籤／Detached HEAD、建立 release 與 master 追蹤分支、Merge 方向、名稱衝突及 Tag／一般分支操作隔離。Rust 臨時儲存庫驗證追蹤設定、錯誤 ref／過期 hash、名稱衝突、未提交變更保護、Checkout 失敗不留下新分支，以及 master 快轉至最新 release 而 remote-tracking master 不變。

新增 `e2e/windows/remote-merge.spec.ts`，使用離線遠端設定與本機 refs，於原生桌面完成只有遠端分支時的 Checkout、本機追蹤分支建立、切換 master 與合併最新 release，並檢查 refs、上游與檔案內容。保存 1000×640 的遠端 Checkout 與合併方向截圖。

前端 78 項、Rust 24 項及五個 Windows 桌面流程全部通過，另通過 Vue 型別／Vite 建置、Clippy 與格式檢查，兩張新對話框截圖已檢視。執行中的 `repovela.exe` 被鎖定，Tauri 建置在最後複製步驟失敗；Rust 編譯／連結已完成，將 `target/debug/deps/repovela.exe` 另存為 `target/debug/repovela-remote-checkout.exe` 完成桌面驗證。原執行檔尚未更新。

## 2026-10-02：Git 擁有者檢查與信任流程

加入專案遇到 libgit2 `Owner` 錯誤時，回傳結構化原因與實際 repository 根目錄，顯示明確確認視窗。確認後使用 Git CLI 將單一完整路徑加入全域 `safe.directory`，保留既有信任清單、重設項目與其他設定，不加入萬用字元或停用擁有者檢查。一般非 Git 資料夾錯誤保留原行為；多選時可逐一信任或取消，已成功加入的專案保留。

前端 74 項、Rust 23 項測試通過，另通過型別檢查／Vite 建置、debug Tauri 建置、Clippy 與格式檢查。前端新增確認前不執行、取消不加入、失敗保留視窗／可重試、防止重複操作及多專案處理。Rust 新增設定追加／去重／保留、中文空白路徑、子目錄解析、裸儲存庫與 Owner 錯誤分類測試。

新增 `e2e/windows/ownership.spec.ts`，以 `REPOVELA_OWNER_FIXTURE` 指定擁有者不同的測試儲存庫，未指定時跳過。透過獨立子程序 Git home／全域設定驗證取消、信任後加入及讀取，核對 repository 的 HEAD／index／設定及呼叫者全域設定雜湊不變。實際回報資料夾擁有者為使用者，但 `.git` 擁有者為 Administrators。使用此資料夾與隔離設定，四個 Windows 桌面流程全部通過；1000×640 信任視窗截圖已檢視，文字與控制項正常。

## 2026-10-02：Checkout 本機分支修正

原先 Commit Checkout 預設 Detached HEAD，即使該位置有本機分支，未更改下拉選項時仍不會切換分支，導致 Merge／Rebase／Reset 等操作停用。改為預設該位置的目前分支或唯一本機分支；有多個其他本機分支時需要選擇，沒有本機分支時才預設 Detached HEAD。標題列明確顯示 Detached HEAD，停用選單提供原因 tooltip。

新增前端回歸涵蓋從 main Checkout 到較新的 dev，再對 main 執行 Merge／Rebase／Reset，確認操作的目標 hash 與來源分支正確；也驗證多個候選分支必須選擇、明確選擇 Detached HEAD 後的狀態與停用原因。前端共 71 項、型別檢查／Vite 建置及 debug Tauri 建置通過。桌面 Commit 測試加入同樣的 dev／main 情境，並保留明確選擇 Detached HEAD 的驗證；修正初始選單的測試點擊定位後通過。既有桌面瀏覽與基本 Git 操作流程也通過。

## 2026-10-02：Commit 右鍵操作

Commit 選單加入新增 Tag、從指定 commit 建立分支、Checkout、Cherry-pick、Revert、Merge、Rebase、Reset，以及複製完整 hash／標題。操作對話框顯示目標，支援 Tag 註解、建立後切換、Merge 模式、merge commit 主線與三種 Reset；預設 soft，hard 顯示捨棄變更提示。提交時核對原 HEAD 與分支，拒絕過期對話框。衝突後支援暫存、繼續與中止。

前端 67 項、Rust 21 項測試通過，另通過型別檢查／Vite 建置、Clippy、Rustfmt 與 debug 桌面建置。Rust 臨時儲存庫測試涵蓋 commit 目標、非法名稱、過期 HEAD／分支、各種歷史操作、Reset 的 index／工作目錄差異，以及 Merge／Rebase／Cherry-pick／Revert 衝突後繼續與中止。

新增 `e2e/windows/commit-actions.spec.ts`，於獨立儲存庫透過真正 WebView2／Tauri IPC 完成全部八種寫入操作及 soft／mixed／hard Reset，檢查實際 refs、檔案與父 commit；1000×640 驗證選單／對話框邊界並保存截圖。三個 Windows 桌面流程全部通過，使用 debug 執行檔。已檢視 Commit 選單與 Hard Reset 對話框截圖，文字與控制項未遮擋。桌面測試會先將 commit 捲至可見位置，避開固定表頭。修正共用 popover 樣式覆蓋選單固定定位，以及焦點還原造成多餘捲動。

## 2026-10-02：基本 Git 操作

新增暫存／取消暫存、提交已暫存內容、建立／切換本機分支、Fetch、快轉 Pull 與目前分支 Push。Git CLI 在背景執行，沿用作者、hooks 與憑證；Windows 不開啟終端機視窗。展示模式停用寫入操作。

本次通過前端 55 項測試、Rust 15 項測試、Vue 型別檢查／Vite 建置、Tauri IPC 編譯、Clippy 與格式檢查。新增 Rust 測試使用臨時工作目錄及本機裸儲存庫，涵蓋初始／部分暫存、僅提交 index、刪除／重新命名取消暫存、非法路徑、切換分支防止覆寫變更、上游建立、Fetch／Pull／Push 與分歧拒絕。

Windows 使用 `pnpm run tauri build --debug --no-bundle` 產出的 `src-tauri/target/debug/repovela.exe` 通過真正 WebView2／Tauri IPC 操作流程：中文／空白路徑、逐檔／全部暫存、取消暫存保留內容、提交後訊息清空、分支建立／切換、對本機遠端推拉，以及 1000×640 下操作面板與彈窗排版。新增測試為 `e2e/windows/operations.spec.ts`；預設 `test:windows` 仍使用 release 執行檔，可用 `REPOVELA_EXE` 指定 debug 執行檔。

本次尚未驗證公開網路遠端的 HTTPS／SSH 憑證與簽署提交；沿用 Git 設定，錯誤會顯示於介面。以下為先前唯讀版本的歷史驗證記錄。

後續加入操作圖示與 tooltip、共用右鍵選單，涵蓋工具列、工作區／檔案、分支與 commit。前端驗證暫存區域區分、操作期間停用、分頁隔離、Escape／方向鍵、無障礙名稱及 tooltip；桌面操作流程改以右鍵執行暫存、取消暫存、提交、Fetch 與切換分支，另驗證 Shift+F10、焦點還原及視窗邊界定位。輸入框沿用瀏覽器文字編輯選單。

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
