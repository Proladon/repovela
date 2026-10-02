use anyhow::{Context, Result};
use git2::{ErrorCode, Repository};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

#[derive(Serialize)]
#[serde(untagged)]
pub enum ProjectOpenError {
    Ownership(OwnershipIssue),
    Message(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnershipIssue {
    pub kind: &'static str,
    pub path: String,
    pub message: String,
}

fn ownership_error(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<git2::Error>()
        .is_some_and(|error| error.code() == ErrorCode::Owner)
}

// Discovery reads repository markers without bypassing ownership validation.
fn repository_root(path: &str) -> Result<PathBuf> {
    let git_dir = Repository::discover_path(path, &[] as &[&OsStr])?.canonicalize()?;
    let selected = Path::new(path).canonicalize()?;
    for candidate in selected.ancestors() {
        if candidate.join(".git").exists()
            && Repository::discover_path(candidate, &[] as &[&OsStr])?.canonicalize()? == git_dir
        {
            return Ok(candidate.to_owned());
        }
    }
    Ok(git_dir) // Bare repositories have no worktree marker.
}

fn safe_path(path: &Path) -> String {
    super::display_path(path).replace('\\', "/")
}

pub fn open_project_for_ui(path: &str) -> Result<super::Project, ProjectOpenError> {
    super::open_project(path).map_err(|error| {
        if ownership_error(&error) {
            if let Ok(root) = repository_root(path) {
                return ProjectOpenError::Ownership(OwnershipIssue {
                    kind: "ownership",
                    path: super::display_path(&root),
                    message: "Git 偵測到此專案或 .git 目錄的擁有者與目前使用者不同。".into(),
                });
            }
        }
        ProjectOpenError::Message(format!("{error:#}"))
    })
}

fn config_command(args: &[&str], config: Option<&Path>) -> Result<Output> {
    let mut command = Command::new("git");
    command.current_dir(std::env::temp_dir()).arg("config");
    if let Some(config) = config {
        command.arg("--file").arg(config);
    } else {
        command.arg("--global");
    }
    command.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .output()
        .context("無法啟動 Git，請先安裝 Git 並加入 PATH。")
}

fn add_safe_directory(root: &Path, config: Option<&Path>) -> Result<()> {
    let value = safe_path(root);
    anyhow::ensure!(!value.ends_with("/*"), "無法信任含有萬用字元的路徑。");
    let existing = config_command(&["--get-all", "safe.directory"], config)?;
    if !existing.status.success() && existing.status.code() != Some(1) {
        anyhow::bail!(
            "無法讀取 Git 信任設定：{}",
            String::from_utf8_lossy(&existing.stderr).trim()
        );
    }
    if String::from_utf8_lossy(&existing.stdout)
        .lines()
        .any(|entry| {
            let normalized = entry.replace('\\', "/");
            if cfg!(windows) {
                normalized
                    .trim_end_matches('/')
                    .eq_ignore_ascii_case(value.trim_end_matches('/'))
            } else {
                normalized.trim_end_matches('/') == value.trim_end_matches('/')
            }
        })
    {
        return Ok(());
    }
    let output = config_command(&["--add", "safe.directory", &value], config)?;
    anyhow::ensure!(
        output.status.success(),
        "無法儲存 Git 信任設定：{}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(())
}

pub fn trust_project(path: &str) -> Result<super::Project> {
    let _guard = super::operations::WRITES
        .lock()
        .map_err(|_| anyhow::anyhow!("Git 操作鎖定失敗。"))?;
    match super::open_project(path) {
        Ok(project) => return Ok(project),
        Err(error) if ownership_error(&error) => {}
        Err(error) => return Err(error),
    }
    let root = repository_root(path).context("無法定位要信任的 Git 專案。")?;
    add_safe_directory(&root, None)?;
    super::open_project(root.to_str().context("專案路徑不是有效的 UTF-8。")?)
        .context("已加入 Git 信任清單，但仍無法開啟此專案。")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trust_settings_are_exact_idempotent_and_preserve_existing_entries() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("中文 空白");
        std::fs::create_dir(&root).unwrap();
        let config = dir.path().join("global.gitconfig");
        std::fs::write(
            &config,
            "[user]\n\tname = existing\n[safe]\n\tdirectory =\n\tdirectory = /other/repo\n",
        )
        .unwrap();
        add_safe_directory(&root, Some(&config)).unwrap();
        add_safe_directory(&root, Some(&config)).unwrap();
        let config = git2::Config::open(&config).unwrap();
        let mut values = Vec::new();
        config
            .multivar("safe.directory", None)
            .unwrap()
            .for_each(|entry| {
                values.push(entry.value().unwrap().to_owned());
            })
            .unwrap();
        assert_eq!(
            values,
            ["".to_owned(), "/other/repo".to_owned(), safe_path(&root)]
        );
        assert_eq!(config.get_string("user.name").unwrap(), "existing");
    }

    #[test]
    fn identifies_repository_root_without_trusting_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("中文 空白");
        Repository::init(&root).unwrap();
        let nested = root.join("nested");
        std::fs::create_dir(&nested).unwrap();
        assert_eq!(
            repository_root(nested.to_str().unwrap()).unwrap(),
            root.canonicalize().unwrap()
        );
        let bare = dir.path().join("bare.git");
        Repository::init_bare(&bare).unwrap();
        assert_eq!(
            repository_root(bare.to_str().unwrap()).unwrap(),
            bare.canonicalize().unwrap()
        );
        let error = anyhow::Error::new(git2::Error::new(
            ErrorCode::Owner,
            git2::ErrorClass::Config,
            "owner",
        ));
        assert!(ownership_error(&error.context("open")));
        assert!(!ownership_error(&anyhow::anyhow!("not a repository")));
        assert!(trust_project(dir.path().to_str().unwrap()).is_err());
    }
}
