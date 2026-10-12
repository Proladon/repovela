use repovela_core::{CommitDetail, FilePatch, GitRequest, Project, ProjectOpenError, Snapshot};
use tauri::Manager;
mod terminal;

#[tauri::command]
async fn read_request_detail(
    path: String,
    remote: String,
    provider: repovela_core::Forge,
    number: u64,
) -> Result<repovela_core::RequestDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::read_request_detail(&path, &remote, provider, number)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}
#[tauri::command]
async fn read_request_changes(
    path: String,
    remote: String,
    provider: repovela_core::Forge,
    number: u64,
    expected_head: String,
    cursor: Option<String>,
) -> Result<repovela_core::RequestChanges, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::read_request_changes(
            &path,
            &remote,
            provider,
            number,
            &expected_head,
            cursor.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}
#[tauri::command]
async fn operate_request(
    path: String,
    remote: String,
    provider: repovela_core::Forge,
    request: repovela_core::RequestAction,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::operate_request(&path, &remote, provider, request)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn read_change_requests(
    path: String,
    remote: String,
    provider: repovela_core::Forge,
    state: repovela_core::RequestState,
    cursor: Option<String>,
) -> Result<repovela_core::ChangeRequestPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::read_change_requests(&path, &remote, provider, state, cursor.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn prepare_update_install(app: tauri::AppHandle) {
    // Windows 更新器會直接結束程式，先清理仍在執行的 shell。
    app.state::<terminal::Terminals>().close_all(false);
}

#[cfg(windows)]
mod system_fonts;
#[cfg(windows)]
mod window_frame;

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut families = font_kit::source::SystemSource::new()
            .all_families()
            .map_err(|e| format!("無法讀取系統字體：{e}"))?;
        // Windows 的舊式家族名稱也用於 CSS 字體選擇，例如 Arial Black。
        #[cfg(windows)]
        families.extend(system_fonts::legacy_families()?);
        families.retain(|family| !family.trim().is_empty());
        families.sort_by_cached_key(|family| family.to_lowercase());
        families.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        Ok(families)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_operation(path: String, request: GitRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || repovela_core::git_operation(&path, request))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn open_project(path: String) -> Result<Project, ProjectOpenError> {
    tauri::async_runtime::spawn_blocking(move || repovela_core::open_project_for_ui(&path))
        .await
        .map_err(|e| ProjectOpenError::Message(e.to_string()))?
}

#[tauri::command]
async fn trust_project(path: String) -> Result<Project, String> {
    tauri::async_runtime::spawn_blocking(move || repovela_core::trust_project(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn read_repository(
    path: String,
    include_remotes: bool,
    limit: usize,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::read_repository(&path, include_remotes, limit)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn read_commit(path: String, oid: String) -> Result<CommitDetail, String> {
    tauri::async_runtime::spawn_blocking(move || repovela_core::read_commit(&path, &oid))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn read_patch(
    path: String,
    oid: Option<String>,
    file: String,
    area: String,
) -> Result<FilePatch, String> {
    tauri::async_runtime::spawn_blocking(move || {
        repovela_core::read_patch(&path, oid.as_deref(), &file, &area)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

pub fn run() {
    tauri::Builder::default()
        .manage(terminal::Terminals::default())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                webview.state::<terminal::Terminals>().close_all(false);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            prepare_update_install,
            list_system_fonts,
            open_project,
            trust_project,
            read_repository,
            read_change_requests,
            read_request_detail,
            read_request_changes,
            operate_request,
            read_commit,
            read_patch,
            git_operation,
            terminal::open_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::close_terminal
        ])
        .build(tauri::generate_context!())
        .expect("無法啟動 Repovela")
        .run(|_app, _event| {
            if matches!(_event, tauri::RunEvent::Exit) {
                _app.state::<terminal::Terminals>().close_all(true);
            }
            #[cfg(windows)]
            {
                use tauri::Manager;
                // 視窗初始化與啟用後套用，避免系統重新顯示主題色邊框。
                if matches!(
                    _event,
                    tauri::RunEvent::Ready
                        | tauri::RunEvent::WindowEvent {
                            event: tauri::WindowEvent::Focused(true)
                                | tauri::WindowEvent::ThemeChanged(_),
                            ..
                        }
                ) {
                    if let Some(window) = _app.get_webview_window("main") {
                        window_frame::apply(&window);
                    }
                }
            }
        });
}
