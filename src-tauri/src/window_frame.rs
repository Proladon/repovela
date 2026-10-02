use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_ROUND,
};

pub fn apply(window: &tauri::WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    // Windows 11 支援隱藏邊框，同時保留圓角與陰影。
    const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFE;
    let border = DWMWA_COLOR_NONE;
    let corners = DWMWCP_ROUND;
    // Tauri 的陰影保留頂端 1px 非客戶區，使用與自訂標題列相同的 #101216。
    // COLORREF 的排列為 0x00BBGGRR。
    let caption: u32 = 0x00161210;
    // SAFETY: hwnd 屬於存活的主視窗；各值的型別、指標與大小符合 DWM API。
    // 舊版 Windows 不支援的外觀屬性會回傳錯誤，保留其原本外觀即可。
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&corners as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        );
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_CAPTION_COLOR as u32,
            (&caption as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
        DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_BORDER_COLOR as u32,
            (&border as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
    }
}
