use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum TerminalEvent {
    Data { data: Vec<u8> },
    Exit { code: Option<u32> },
    Error { message: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    id: u32,
    shell: String,
    windows: bool,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
struct Sessions {
    next_id: u32,
    stopped: bool,
    entries: HashMap<u32, Arc<Mutex<Session>>>,
}

#[derive(Clone, Default)]
pub struct Terminals(Arc<Mutex<Sessions>>);

fn size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("終端機尺寸超出範圍。".into());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

impl Terminals {
    fn session(&self, id: u32) -> Result<Arc<Mutex<Session>>, String> {
        self.0
            .lock()
            .unwrap()
            .entries
            .get(&id)
            .cloned()
            .ok_or_else(|| "終端機已結束，請重新啟動。".into())
    }

    pub fn open(
        &self,
        path: &str,
        cols: u16,
        rows: u16,
        output: Channel<TerminalEvent>,
    ) -> Result<TerminalInfo, String> {
        // 沿用 Git 儲存庫與擁有者驗證，並從儲存庫根目錄啟動。
        let project = repovela_core::open_project(path).map_err(|e| format!("{e:#}"))?;
        let pair = native_pty_system()
            .openpty(size(cols, rows)?)
            .map_err(|e| e.to_string())?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
        #[cfg(not(windows))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        let mut command = CommandBuilder::new(&shell);
        #[cfg(windows)]
        command.arg("/D");
        #[cfg(not(windows))]
        command.arg("-i");
        command.cwd(&project.path);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "Repovela");
        let mut entries = self.0.lock().unwrap();
        if entries.stopped || entries.entries.len() >= 16 {
            return Err("無法建立終端機：應用程式正在關閉，或已達 16 個工作階段上限。".into());
        }
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| e.to_string())?;
        drop(pair.slave);
        entries.next_id += 1;
        let id = entries.next_id;
        entries.entries.insert(
            id,
            Arc::new(Mutex::new(Session {
                master: pair.master,
                writer,
                killer: child.clone_killer(),
            })),
        );
        drop(entries);

        let manager = self.clone();
        let data_output = output.clone();
        let read_thread = std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            let mut connected = true;
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        // 傳原始 UTF-8 bytes，由 xterm 處理跨區塊字元。
                        if connected
                            && data_output
                                .send(TerminalEvent::Data {
                                    data: buffer[..count].to_vec(),
                                })
                                .is_err()
                        {
                            connected = false;
                            let cleanup = manager.clone();
                            // ConPTY 關閉會等待輸出排空，reader 必須繼續讀。
                            std::thread::spawn(move || {
                                let _ = cleanup.close(id);
                            });
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
        });
        let manager = self.clone();
        std::thread::spawn(move || {
            let result = child.wait();
            // 關閉 master，讓 ConPTY reader 收到 EOF，再送出結束事件。
            let removed = manager.0.lock().unwrap().entries.remove(&id);
            drop(removed);
            let _ = read_thread.join();
            let code = match result {
                Ok(status) => Some(status.exit_code()),
                Err(e) => {
                    let _ = output.send(TerminalEvent::Error {
                        message: e.to_string(),
                    });
                    None
                }
            };
            let _ = output.send(TerminalEvent::Exit { code });
        });
        Ok(TerminalInfo {
            id,
            shell,
            windows: cfg!(windows),
        })
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        if data.len() > 1024 * 1024 {
            return Err("單次輸入超過 1 MB。".into());
        }
        let session = self.session(id)?;
        let mut session = session.lock().unwrap();
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        self.session(id)?
            .lock()
            .unwrap()
            .master
            .resize(size(cols, rows)?)
            .map_err(|e| e.to_string())
    }

    pub fn close(&self, id: u32) -> Result<(), String> {
        let session = self.0.lock().unwrap().entries.remove(&id);
        if let Some(session) = session {
            session
                .lock()
                .unwrap()
                .killer
                .kill()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn close_all(&self, stopping: bool) {
        let sessions = {
            let mut entries = self.0.lock().unwrap();
            entries.stopped |= stopping;
            std::mem::take(&mut entries.entries)
        };
        for session in sessions.into_values() {
            let _ = session.lock().unwrap().killer.kill();
        }
    }
}

#[tauri::command]
pub async fn open_terminal(
    state: tauri::State<'_, Terminals>,
    path: String,
    cols: u16,
    rows: u16,
    output: Channel<TerminalEvent>,
) -> Result<TerminalInfo, String> {
    let terminals = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || terminals.open(&path, cols, rows, output))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_terminal(
    state: tauri::State<'_, Terminals>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let terminals = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || terminals.write(id, &data))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn resize_terminal(
    state: tauri::State<'_, Terminals>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminals = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || terminals.resize(id, cols, rows))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn close_terminal(state: tauri::State<'_, Terminals>, id: u32) -> Result<(), String> {
    let terminals = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || terminals.close(id))
        .await
        .map_err(|e| e.to_string())?
}
