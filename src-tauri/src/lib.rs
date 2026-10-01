use repovela_core::{CommitDetail, FilePatch, Project, Snapshot};

#[tauri::command]
async fn open_project(path: String) -> Result<Project, String> {
    tauri::async_runtime::spawn_blocking(move || repovela_core::open_project(&path))
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_project,
            read_repository,
            read_commit,
            read_patch
        ])
        .run(tauri::generate_context!())
        .expect("無法啟動 Repovela");
}
