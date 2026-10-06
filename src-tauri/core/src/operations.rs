use anyhow::{bail, Context, Result};
use git2::{BranchType, Repository, RepositoryState};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::process::{Command, Stdio};
use std::sync::Mutex;

// Serialize writes, including requests from multiple application windows.
pub(crate) static WRITES: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GitOperation {
    Stage,
    Unstage,
    Commit,
    CreateBranch,
    SwitchBranch,
    SyncBranch,
    Fetch,
    Pull,
    Push,
    AddTag,
    Checkout,
    CherryPick,
    Revert,
    Merge,
    Rebase,
    Reset,
    ContinueOperation,
    AbortOperation,
    StashPush,
    StashApply,
    StashPop,
    StashDrop,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitRequest {
    pub operation: GitOperation,
    #[serde(default)]
    pub files: Vec<String>,
    pub message: Option<String>,
    pub branch: Option<String>,
    pub remote_branch: Option<String>,
    pub oid: Option<String>,
    pub tag: Option<String>,
    pub mode: Option<String>,
    pub checkout: Option<bool>,
    pub mainline: Option<u32>,
    pub expected_head: Option<String>,
    pub expected_branch: Option<String>,
    pub expected_local_oid: Option<String>,
    pub stash_index: Option<usize>,
    pub stash_oid: Option<String>,
    pub include_untracked: Option<bool>,
    pub restore_index: Option<bool>,
}

fn run(repo: &Repository, args: &[String]) -> Result<String> {
    let root = repo
        .workdir()
        .context("此操作需要工作目錄，不支援裸儲存庫。")?;
    let mut command = Command::new("git");
    command
        .current_dir(root)
        .args(["-c", "credential.interactive=false"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_EDITOR", "true")
        .env("GIT_SEQUENCE_EDITOR", "true")
        .stdin(Stdio::null());
    if std::env::var_os("GIT_SSH_COMMAND").is_none() && std::env::var_os("GIT_SSH").is_none() {
        command.env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command
        .output()
        .context("無法啟動 Git，請先安裝 Git 並加入 PATH。")?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        bail!("Git 操作失敗：{}", text.trim());
    }
    Ok(text.trim().to_owned())
}

fn branch_name(request: &GitRequest) -> Result<&str> {
    let branch = request.branch.as_deref().unwrap_or("");
    if branch.starts_with('-') || !git2::Reference::is_valid_name(&format!("refs/heads/{branch}")) {
        bail!("請輸入有效的分支名稱。");
    }
    Ok(branch)
}

pub(crate) fn operation_state(repo: &Repository) -> &'static str {
    match repo.state() {
        RepositoryState::Clean => "clean",
        RepositoryState::Merge => "merge",
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => "cherryPick",
        RepositoryState::Revert | RepositoryState::RevertSequence => "revert",
        RepositoryState::Rebase
        | RepositoryState::RebaseInteractive
        | RepositoryState::RebaseMerge => "rebase",
        _ => "unsupported",
    }
}

fn require_clean_state(repo: &Repository) -> Result<()> {
    if repo.state() != RepositoryState::Clean {
        bail!("請先繼續或中止目前的 Git 操作。");
    }
    Ok(())
}

fn require_branch(repo: &Repository) -> Result<()> {
    if !repo
        .head()
        .context("尚無 commit，無法執行此操作。")?
        .is_branch()
    {
        bail!("請先切換至本機分支。");
    }
    Ok(())
}

fn require_clean_worktree(repo: &Repository) -> Result<()> {
    let mut options = git2::StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    if !repo.statuses(Some(&mut options))?.is_empty() {
        bail!("請先提交或處理工作區變更，再執行此操作。");
    }
    Ok(())
}

fn target_commit(repo: &Repository, request: &GitRequest) -> Result<git2::Oid> {
    let value = request.oid.as_deref().context("請選擇目標 commit。")?;
    if value.len() != 40 {
        bail!("目標必須是完整的 commit hash。");
    }
    let oid = git2::Oid::from_str(value).context("Commit hash 無效。")?;
    repo.find_commit(oid)
        .context("找不到目標 commit，請重新整理。")?;
    Ok(oid)
}

pub fn git_operation(path: &str, request: GitRequest) -> Result<String> {
    let _guard = WRITES
        .lock()
        .map_err(|_| anyhow::anyhow!("Git 操作鎖定失敗。"))?;
    let repo = Repository::open(path).context("無法開啟 Git 儲存庫。")?;
    if repo.is_bare() {
        bail!("此操作需要工作目錄，不支援裸儲存庫。");
    }
    if let Some(expected) = &request.expected_head {
        let current = repo
            .head()
            .ok()
            .and_then(|head| head.target())
            .map(|oid| oid.to_string());
        if current.as_ref() != Some(expected) {
            bail!("HEAD 已變更，請重新整理並重新開啟操作對話框。");
        }
    }
    if let Some(expected) = &request.expected_branch {
        let current = repo
            .head()
            .ok()
            .map(|head| head.name().unwrap_or("").to_owned());
        if current.as_ref() != Some(expected) {
            bail!("目前分支已變更，請重新開啟操作對話框。");
        }
    }
    let mut args: Vec<String> = Vec::new();
    match request.operation {
        GitOperation::StashPush => {
            require_clean_state(&repo)?;
            repo.head().context("尚無 commit，無法儲存 Stash。")?;
            if repo.index()?.has_conflicts() {
                bail!("請先解決工作區衝突並暫存檔案，再儲存 Stash。");
            }
            let include_untracked = request.include_untracked.unwrap_or(false);
            let mut options = git2::StatusOptions::new();
            options
                .include_untracked(include_untracked)
                .recurse_untracked_dirs(true);
            let has_changes = repo.statuses(Some(&mut options))?.iter().any(|entry| {
                !entry.status().intersects(git2::Status::IGNORED)
                    && (include_untracked || !entry.status().contains(git2::Status::WT_NEW))
            });
            if !has_changes {
                bail!("沒有可儲存的變更；若只有未追蹤檔案，請勾選包含未追蹤檔案。");
            }
            args.extend(["stash", "push"].map(str::to_owned));
            if include_untracked {
                args.push("--include-untracked".into());
            }
            let message = request.message.as_deref().unwrap_or("").trim();
            if !message.is_empty() {
                args.extend(["--message", message].map(str::to_owned));
            }
        }
        GitOperation::StashApply | GitOperation::StashPop | GitOperation::StashDrop => {
            require_clean_state(&repo)?;
            let target =
                super::stash::target(&repo, request.stash_index, request.stash_oid.as_deref())?;
            let command = match request.operation {
                GitOperation::StashApply => "apply",
                GitOperation::StashPop => "pop",
                _ => "drop",
            };
            if command != "drop" && repo.index()?.has_conflicts() {
                bail!("請先解決工作區衝突並暫存檔案，再套用 Stash。");
            }
            args.extend(["stash", command].map(str::to_owned));
            if command != "drop" && request.restore_index.unwrap_or(false) {
                args.push("--index".into());
            }
            // Apply accepts an immutable object id; pop/drop require a verified stash ref.
            args.push(if command == "apply" {
                request.stash_oid.clone().unwrap()
            } else {
                target
            });
        }
        GitOperation::Stage | GitOperation::Unstage => {
            let stage = matches!(request.operation, GitOperation::Stage);
            let mut paths = BTreeSet::new();
            for file in &request.files {
                super::validate_file(file)?;
                if file
                    .split(['/', '\\'])
                    .any(|part| part.eq_ignore_ascii_case(".git"))
                {
                    bail!("不能操作 Git 內部檔案。");
                }
            }
            let mut options = git2::StatusOptions::new();
            options
                .include_untracked(true)
                .recurse_untracked_dirs(true)
                .renames_head_to_index(true)
                .renames_index_to_workdir(true);
            let statuses = repo.statuses(Some(&mut options))?;
            for entry in statuses.iter() {
                let eligible = if stage {
                    git2::Status::WT_NEW
                        | git2::Status::WT_MODIFIED
                        | git2::Status::WT_DELETED
                        | git2::Status::WT_RENAMED
                        | git2::Status::WT_TYPECHANGE
                        | git2::Status::CONFLICTED
                } else {
                    git2::Status::INDEX_NEW
                        | git2::Status::INDEX_MODIFIED
                        | git2::Status::INDEX_DELETED
                        | git2::Status::INDEX_RENAMED
                        | git2::Status::INDEX_TYPECHANGE
                };
                if !entry.status().intersects(eligible) {
                    continue;
                }
                let deltas = [entry.head_to_index(), entry.index_to_workdir()];
                let entry_paths: Vec<_> = deltas
                    .iter()
                    .flatten()
                    .flat_map(|delta| [delta.old_file().path(), delta.new_file().path()])
                    .flatten()
                    .filter_map(|path| path.to_str())
                    .chain(entry.path())
                    .collect();
                if request.files.is_empty()
                    || entry_paths
                        .iter()
                        .any(|p| request.files.iter().any(|f| f == p))
                {
                    let delta = if stage {
                        entry.index_to_workdir()
                    } else {
                        entry.head_to_index()
                    };
                    let affected: Vec<_> = delta
                        .iter()
                        .flat_map(|delta| [delta.old_file().path(), delta.new_file().path()])
                        .flatten()
                        .filter_map(|path| path.to_str())
                        .collect();
                    let affected = if affected.is_empty() {
                        entry.path().into_iter().collect()
                    } else {
                        affected
                    };
                    for file in affected {
                        paths.insert(format!(":(literal){file}"));
                    }
                }
            }
            if paths.is_empty() {
                bail!("沒有可操作的變更檔案，請重新整理。");
            }
            if stage {
                args.extend(["add", "--all", "--"].map(str::to_owned));
            } else if repo.head().is_ok() {
                args.extend(["restore", "--staged", "--"].map(str::to_owned));
            } else {
                args.extend(
                    ["rm", "--cached", "--force", "--ignore-unmatch", "--"].map(str::to_owned),
                );
            }
            args.extend(paths);
        }
        GitOperation::Commit => {
            if repo.state() != RepositoryState::Clean {
                bail!("請先在 Git 中完成目前的合併或變基操作。");
            }
            let message = request.message.as_deref().unwrap_or("").trim();
            if message.is_empty() {
                bail!("請輸入提交訊息。");
            }
            args.extend(["commit", "-m", message].map(str::to_owned));
        }
        GitOperation::CreateBranch | GitOperation::SwitchBranch => {
            if repo.state() != RepositoryState::Clean {
                bail!("請先完成目前的合併或變基操作，再切換分支。");
            }
            let branch = branch_name(&request)?;
            if matches!(request.operation, GitOperation::CreateBranch)
                && request.checkout == Some(false)
            {
                args.extend(["branch", branch].map(str::to_owned));
                if request.oid.is_some() {
                    args.push(target_commit(&repo, &request)?.to_string());
                }
                return run(&repo, &args);
            }
            args.push("switch".into());
            if matches!(request.operation, GitOperation::CreateBranch) {
                args.push("-c".into());
            } else {
                repo.find_branch(branch, BranchType::Local)
                    .context("找不到此本機分支。")?;
            }
            args.push(branch.into());
            if matches!(request.operation, GitOperation::CreateBranch) && request.oid.is_some() {
                args.push(target_commit(&repo, &request)?.to_string());
            }
        }
        GitOperation::SyncBranch => {
            require_clean_state(&repo)?;
            let name = branch_name(&request)?;
            let oid = target_commit(&repo, &request)?;
            let remote = request
                .remote_branch
                .as_deref()
                .context("請選擇遠端分支。")?;
            if remote.starts_with('-')
                || !git2::Reference::is_valid_name(&format!("refs/remotes/{remote}"))
            {
                bail!("遠端分支名稱無效。");
            }
            let remote_ref = repo
                .find_branch(remote, BranchType::Remote)
                .context("找不到此遠端分支，請先 Fetch 並重新整理。")?;
            if remote_ref.get().peel_to_commit()?.id() != oid {
                bail!("遠端分支已變更，請重新整理並重新開啟同步對話框。");
            }
            let local = repo
                .find_branch(name, BranchType::Local)
                .context("找不到此本機分支，請先 Checkout 遠端分支以建立本機追蹤分支。")?;
            let old = local.get().peel_to_commit()?.id();
            if request.expected_local_oid.as_deref() != Some(old.to_string().as_str()) {
                bail!("本機分支已變更，請重新開啟同步對話框。");
            }
            if old == oid {
                bail!("本機分支已同步至此遠端紀錄。");
            }
            if !repo.graph_descendant_of(oid, old)? {
                bail!("無法快轉同步：本機分支有獨有提交或歷史已分歧，請先處理合併或 Rebase。");
            }
            if local.is_head() {
                require_clean_worktree(&repo)?;
                args.extend(["merge", "--ff-only", "--no-edit"].map(str::to_owned));
                args.push(oid.to_string());
            } else {
                // Git validates fast-forward updates and refuses branches checked out
                // in another worktree. The pinned SHA avoids following a moving remote ref.
                args.extend(
                    [
                        "fetch",
                        "--no-tags",
                        "--no-prune",
                        "--no-prune-tags",
                        "--no-write-fetch-head",
                        "--no-recurse-submodules",
                        "--no-auto-maintenance",
                        "--no-write-commit-graph",
                        ".",
                    ]
                    .map(str::to_owned),
                );
                args.push(format!("{oid}:refs/heads/{name}"));
            }
        }
        GitOperation::AddTag => {
            require_clean_state(&repo)?;
            let oid = target_commit(&repo, &request)?;
            let name = request.tag.as_deref().unwrap_or("");
            if name.starts_with('-')
                || !git2::Reference::is_valid_name(&format!("refs/tags/{name}"))
            {
                bail!("請輸入有效的 Tag 名稱。");
            }
            args.extend(["tag", "--no-sign"].map(str::to_owned));
            if let Some(message) = request.message.as_deref().filter(|m| !m.trim().is_empty()) {
                args.extend(["--annotate", "--message", message].map(str::to_owned));
            }
            args.extend([name.to_owned(), oid.to_string()]);
        }
        GitOperation::Checkout => {
            require_clean_state(&repo)?;
            let oid = target_commit(&repo, &request)?;
            if let Some(remote) = request.remote_branch.as_deref() {
                let branch = branch_name(&request)?;
                if remote.starts_with('-')
                    || !git2::Reference::is_valid_name(&format!("refs/remotes/{remote}"))
                {
                    bail!("遠端分支名稱無效。");
                }
                let reference = repo
                    .find_branch(remote, BranchType::Remote)
                    .context("找不到此遠端分支，請先 Fetch 並重新整理。")?;
                if reference.get().peel_to_commit()?.id() != oid {
                    bail!("此遠端分支已不在目標 commit，請重新整理。");
                }
                if repo.find_branch(branch, BranchType::Local).is_ok() {
                    bail!("此本機分支已存在，請切換既有分支或使用其他名稱。");
                }
                args.extend(["switch", "--create", branch, "--track"].map(str::to_owned));
                args.push(format!("refs/remotes/{remote}"));
            } else if request
                .branch
                .as_deref()
                .is_some_and(|branch| !branch.is_empty())
            {
                let branch = branch_name(&request)?;
                let reference = repo
                    .find_branch(branch, BranchType::Local)
                    .context("找不到此本機分支。")?;
                if reference.get().peel_to_commit()?.id() != oid {
                    bail!("此分支已不在目標 commit，請重新整理。");
                }
                args.extend(["switch", branch].map(str::to_owned));
            } else {
                args.extend(["switch".into(), "--detach".into(), oid.to_string()]);
            }
        }
        GitOperation::CherryPick
        | GitOperation::Revert
        | GitOperation::Merge
        | GitOperation::Rebase
        | GitOperation::Reset => {
            require_clean_state(&repo)?;
            require_branch(&repo)?;
            let oid = target_commit(&repo, &request)?;
            if !matches!(request.operation, GitOperation::Reset) {
                require_clean_worktree(&repo)?;
            }
            match request.operation {
                GitOperation::CherryPick | GitOperation::Revert => {
                    let revert = matches!(request.operation, GitOperation::Revert);
                    args.extend(
                        [if revert { "revert" } else { "cherry-pick" }, "--no-edit"]
                            .map(str::to_owned),
                    );
                    let count = repo.find_commit(oid)?.parent_count();
                    if count > 1 {
                        let parent = request
                            .mainline
                            .context("請選擇 Merge commit 的主線父 commit。")?;
                        if parent == 0 || parent as usize > count {
                            bail!("主線父 commit 無效。");
                        }
                        args.extend(["--mainline".into(), parent.to_string()]);
                    } else if request.mainline.is_some() {
                        bail!("此 commit 不需要主線父 commit。");
                    }
                }
                GitOperation::Merge => {
                    args.extend(["merge", "--no-edit"].map(str::to_owned));
                    match request.mode.as_deref().unwrap_or("auto") {
                        "auto" => args.push("--ff".into()),
                        "noFf" => args.push("--no-ff".into()),
                        "ffOnly" => args.push("--ff-only".into()),
                        _ => bail!("Merge 模式無效。"),
                    }
                }
                GitOperation::Rebase => args.extend(
                    [
                        "-c",
                        "rebase.updateRefs=false",
                        "rebase",
                        "--no-autostash",
                        "--no-rebase-merges",
                    ]
                    .map(str::to_owned),
                ),
                GitOperation::Reset => {
                    args.push("reset".into());
                    args.push(
                        match request.mode.as_deref().unwrap_or("soft") {
                            "soft" => "--soft",
                            "mixed" => "--mixed",
                            "hard" => "--hard",
                            _ => bail!("Reset 模式無效。"),
                        }
                        .into(),
                    );
                }
                _ => unreachable!(),
            }
            args.push(oid.to_string());
        }
        GitOperation::ContinueOperation | GitOperation::AbortOperation => {
            let abort = matches!(request.operation, GitOperation::AbortOperation);
            if !abort && repo.index()?.has_conflicts() {
                bail!("請先解決衝突並暫存檔案，再繼續操作。");
            }
            let state = operation_state(&repo);
            let command = match state {
                "merge" => "merge",
                "cherryPick" => "cherry-pick",
                "revert" => "revert",
                "rebase" => "rebase",
                _ => bail!("目前沒有可繼續或中止的 Git 操作。"),
            };
            if state == "merge" && !abort {
                args.extend(["commit", "--no-edit"].map(str::to_owned));
            } else {
                args.extend(
                    [command, if abort { "--abort" } else { "--continue" }].map(str::to_owned),
                );
            }
        }
        GitOperation::Fetch => {
            if repo.remotes()?.is_empty() {
                bail!("此專案尚未設定遠端。");
            }
            args.extend(["fetch", "--all"].map(str::to_owned));
        }
        GitOperation::Pull => {
            let mut options = git2::StatusOptions::new();
            options.include_untracked(true).recurse_untracked_dirs(true);
            if repo.state() != RepositoryState::Clean
                || !repo.statuses(Some(&mut options))?.is_empty()
            {
                bail!("請先提交或處理工作區變更，再執行 Pull。");
            }
            let head = repo.head().context("尚無 commit，無法 Pull。")?;
            if !head.is_branch() {
                bail!("請先切換至本機分支。");
            }
            let name = head.shorthand().context("無法讀取目前分支。")?;
            repo.find_branch(name, BranchType::Local)?
                .upstream()
                .context("此分支尚未設定上游。")?;
            args.extend(["pull", "--ff-only", "--no-rebase"].map(str::to_owned));
        }
        GitOperation::Push => {
            let head = repo.head().context("尚無 commit，無法 Push。")?;
            if !head.is_branch() {
                bail!("請先切換至本機分支。");
            }
            let name = head.shorthand().context("無法讀取目前分支。")?;
            let config = repo.config()?;
            let remote = config.get_string(&format!("branch.{name}.remote")).ok();
            let target = config.get_string(&format!("branch.{name}.merge")).ok();
            let (remote, target, set_upstream) = match (remote, target) {
                (Some(remote), Some(target)) => (remote, target, false),
                _ => {
                    repo.find_remote("origin")
                        .context("尚未設定上游或 origin 遠端。")?;
                    ("origin".into(), format!("refs/heads/{name}"), true)
                }
            };
            if remote.starts_with('-') || !target.starts_with("refs/heads/") {
                bail!("上游設定無效，請先修正分支遠端設定。");
            }
            args.extend(["push", "--no-follow-tags"].map(str::to_owned));
            if set_upstream {
                args.push("--set-upstream".into());
            }
            args.extend([remote, format!("HEAD:{target}")]);
        }
    }
    run(&repo, &args)
}
