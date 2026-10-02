use std::ptr;
use windows_sys::Win32::Graphics::Gdi::{
    EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
};

unsafe extern "system" fn collect_family(
    font: *const LOGFONTW,
    _metrics: *const TEXTMETRICW,
    _font_type: u32,
    data: isize,
) -> i32 {
    // SAFETY: GDI 在同步列舉期間提供有效 LOGFONTW；data 是此次呼叫獨占借用的 Vec。
    let (face_name, families) = unsafe { (&(*font).lfFaceName, &mut *(data as *mut Vec<String>)) };
    let end = face_name
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(face_name.len());
    // @ 開頭是同一字體的直書別名，不是另一個字體。
    let family = String::from_utf16_lossy(&face_name[..end]);
    families.push(family.trim_start_matches('@').to_owned());
    1
}

pub fn legacy_families() -> Result<Vec<String>, String> {
    let mut families = Vec::<String>::new();
    let query = LOGFONTW {
        lfCharSet: DEFAULT_CHARSET,
        ..Default::default()
    };
    // SAFETY: 使用螢幕 DC；列舉同步執行且回呼不保留任何指標，結束後釋放同一 DC。
    unsafe {
        let dc = GetDC(ptr::null_mut());
        if dc.is_null() {
            return Err("無法讀取 Windows 系統字體。".into());
        }
        EnumFontFamiliesExW(
            dc,
            &query,
            Some(collect_family),
            (&mut families as *mut Vec<String>) as isize,
            0,
        );
        ReleaseDC(ptr::null_mut(), dc);
    }
    Ok(families)
}
