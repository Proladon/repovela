# 第三方原始碼

本專案沿用 [trasta298/keifu](https://github.com/trasta298/keifu) 的 Git commit、branch、tag 資料結構、圖譜布局與色彩分配演算法。

- 原始版本：`4d9f033c33813810f7ab66c98f2082f0e95f8e38`
- 檔案：`src-tauri/core/src/git/{branch,commit,graph,tag}.rs` 與 `src-tauri/core/src/graph/colors.rs`
- 調整：移除 ratatui 色彩型別，保留色彩索引；桌面 adapter 加入唯讀資料介面。
- Copyright (c) 2025 trasta298
- 授權：MIT，完整條文保留於 `LICENSE`。

Repovela 是衍生專案，並非上游 keifu 的官方桌面版本。其他套件的授權由各套件自行提供。
