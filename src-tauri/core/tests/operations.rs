use git2::Repository;
use repovela_core::{git_operation, read_repository, GitRequest};
use serde_json::json;
use std::path::Path;

fn setup(path: &Path) -> Repository {
    let repo = Repository::init(path).unwrap();
    configure(&repo);
    repo
}

fn configure(repo: &Repository) {
    let mut config = repo.config().unwrap();
    config.set_str("user.name", "測試作者").unwrap();
    config.set_str("user.email", "test@example.com").unwrap();
    config.set_bool("commit.gpgsign", false).unwrap();
    config.set_bool("core.autocrlf", false).unwrap();
    config
        .set_str("core.hooksPath", "unused-test-hooks")
        .unwrap();
}

fn run(path: &Path, value: serde_json::Value) -> anyhow::Result<String> {
    let request: GitRequest = serde_json::from_value(value).unwrap();
    git_operation(path.to_str().unwrap(), request)
}

fn save(path: &Path, message: &str) {
    run(path, json!({"operation": "stage"})).unwrap();
    run(path, json!({"operation": "commit", "message": message})).unwrap();
}

fn index(repo: &Repository) -> git2::Index {
    let mut index = repo.index().unwrap();
    index.read(true).unwrap();
    index
}

fn head(path: &Path) -> git2::Oid {
    Repository::open(path)
        .unwrap()
        .head()
        .unwrap()
        .target()
        .unwrap()
}
fn write_save(path: &Path, file: &str, content: &str, message: &str) -> git2::Oid {
    std::fs::write(path.join(file), content).unwrap();
    save(path, message);
    head(path)
}

#[test]
fn sync_other_branch_fast_forwards_without_checkout_or_worktree_changes() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    let original = repo.head().unwrap().name().unwrap().to_owned();
    repo.branch("同步/中文", &repo.find_commit(base).unwrap(), false)
        .unwrap();
    repo.remote("origin", "unused-offline-remote").unwrap();
    repo.reference("refs/remotes/origin/main", latest, true, "fixture")
        .unwrap();
    repo.find_branch("同步/中文", git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("origin/main"))
        .unwrap();
    let snapshot = read_repository(dir.path().to_str().unwrap(), true, 500).unwrap();
    assert_eq!(
        snapshot
            .branches
            .iter()
            .find(|b| b.name == "同步/中文")
            .unwrap()
            .upstream
            .as_deref(),
        Some("origin/main")
    );
    std::fs::write(dir.path().join("file.txt"), "dirty\n").unwrap();
    let before_index = std::fs::read(repo.path().join("index")).unwrap();
    let before_config = std::fs::read(repo.path().join("config")).unwrap();
    let before_fetch_head = std::fs::read(repo.path().join("FETCH_HEAD")).ok();
    run(dir.path(), json!({"operation":"syncBranch", "branch":"同步/中文", "remoteBranch":"origin/main", "oid":latest.to_string(), "expectedLocalOid":base.to_string(), "expectedHead":latest.to_string(), "expectedBranch":original})).unwrap();
    assert_eq!(
        repo.find_branch("同步/中文", git2::BranchType::Local)
            .unwrap()
            .get()
            .target(),
        Some(latest)
    );
    assert_eq!(repo.head().unwrap().name(), Some(original.as_str()));
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "dirty\n"
    );
    assert_eq!(
        std::fs::read(repo.path().join("index")).unwrap(),
        before_index
    );
    assert_eq!(
        std::fs::read(repo.path().join("config")).unwrap(),
        before_config
    );
    assert_eq!(
        std::fs::read(repo.path().join("FETCH_HEAD")).ok(),
        before_fetch_head
    );
    assert_eq!(
        repo.find_reference("refs/remotes/origin/main")
            .unwrap()
            .target(),
        Some(latest)
    );
}

#[test]
fn sync_current_branch_requires_clean_worktree_and_updates_files() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    repo.remote("origin", "unused-offline-remote").unwrap();
    repo.reference("refs/remotes/origin/main", latest, true, "fixture")
        .unwrap();
    run(
        dir.path(),
        json!({"operation":"createBranch", "branch":"old", "oid":base.to_string()}),
    )
    .unwrap();
    let request = json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":latest.to_string(), "expectedLocalOid":base.to_string(), "expectedHead":base.to_string(), "expectedBranch":"refs/heads/old"});
    for staged in [false, true] {
        std::fs::write(dir.path().join("file.txt"), "dirty\n").unwrap();
        if staged {
            run(dir.path(), json!({"operation":"stage"})).unwrap();
        }
        let before_index = std::fs::read(repo.path().join("index")).unwrap();
        assert!(run(dir.path(), request.clone()).is_err());
        assert_eq!(head(dir.path()), base);
        assert_eq!(
            std::fs::read(repo.path().join("index")).unwrap(),
            before_index
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
            "dirty\n"
        );
        run(
            dir.path(),
            json!({"operation":"reset", "oid":base.to_string(), "mode":"hard"}),
        )
        .unwrap();
    }
    run(dir.path(), request).unwrap();
    assert_eq!(head(dir.path()), latest);
    assert_eq!(repo.head().unwrap().shorthand(), Some("old"));
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "latest\n"
    );
    assert!(repo.statuses(None).unwrap().is_empty());
}

#[test]
fn sync_refuses_stale_invalid_divergent_and_ahead_branches() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    repo.branch("old", &repo.find_commit(base).unwrap(), false)
        .unwrap();
    repo.remote("origin", "unused-offline-remote").unwrap();
    repo.reference("refs/remotes/origin/main", latest, true, "fixture")
        .unwrap();
    let valid = json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":latest.to_string(), "expectedLocalOid":base.to_string()});
    for (key, value) in [
        ("branch", "--bad".to_owned()),
        ("branch", "missing".to_owned()),
        ("remoteBranch", "--bad".to_owned()),
        ("remoteBranch", "origin/missing".to_owned()),
        ("oid", base.to_string()),
        ("expectedLocalOid", latest.to_string()),
        ("expectedLocalOid", String::new()),
        ("expectedHead", base.to_string()),
        ("expectedBranch", "refs/heads/old".to_owned()),
    ] {
        let mut request = valid.clone();
        request[key] = json!(value);
        assert!(run(dir.path(), request).is_err());
        assert_eq!(
            repo.find_branch("old", git2::BranchType::Local)
                .unwrap()
                .get()
                .target(),
            Some(base)
        );
    }
    run(
        dir.path(),
        json!({"operation":"switchBranch", "branch":"old"}),
    )
    .unwrap();
    let fork = write_save(dir.path(), "file.txt", "fork\n", "fork");
    let divergent = json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":latest.to_string(), "expectedLocalOid":fork.to_string()});
    assert!(run(dir.path(), divergent)
        .unwrap_err()
        .to_string()
        .contains("分歧"));
    repo.reference("refs/remotes/origin/main", base, true, "fixture")
        .unwrap();
    assert!(run(dir.path(), json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":base.to_string(), "expectedLocalOid":fork.to_string()})).is_err());
    repo.reference("refs/remotes/origin/main", fork, true, "fixture")
        .unwrap();
    assert!(run(dir.path(), json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":fork.to_string(), "expectedLocalOid":fork.to_string()})).is_err());
    assert_eq!(head(dir.path()), fork);
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "fork\n"
    );
}

#[test]
fn sync_refuses_branches_checked_out_in_other_worktrees() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    repo.remote("origin", "unused-offline-remote").unwrap();
    repo.reference("refs/remotes/origin/main", latest, true, "fixture")
        .unwrap();
    let local = repo
        .branch("old", &repo.find_commit(base).unwrap(), false)
        .unwrap();
    let worktree_dir = tempfile::tempdir().unwrap();
    let worktree_path = worktree_dir.path().join("linked");
    let mut options = git2::WorktreeAddOptions::new();
    options.reference(Some(local.get()));
    let worktree = repo
        .worktree("linked", &worktree_path, Some(&options))
        .unwrap();
    let result = run(
        dir.path(),
        json!({"operation":"syncBranch", "branch":"old", "remoteBranch":"origin/main", "oid":latest.to_string(), "expectedLocalOid":base.to_string()}),
    );
    assert!(result.is_err());
    assert_eq!(
        repo.find_branch("old", git2::BranchType::Local)
            .unwrap()
            .get()
            .target(),
        Some(base)
    );
    assert_eq!(head(&worktree_path), base);
    assert_eq!(
        std::fs::read_to_string(worktree_path.join("file.txt")).unwrap(),
        "base\n"
    );
    drop(worktree);
}

#[test]
fn tags_branches_and_checkout_use_selected_commit_and_validate_stale_requests() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let branch = repo.head().unwrap().shorthand().unwrap().to_owned();
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    run(
        dir.path(),
        json!({"operation": "addTag", "tag": "v1", "oid": base.to_string()}),
    )
    .unwrap();
    run(dir.path(), json!({"operation": "addTag", "tag": "release/中文", "oid": base.to_string(), "message": "註解"})).unwrap();
    assert_eq!(
        repo.find_reference("refs/tags/v1")
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id(),
        base
    );
    assert_eq!(
        repo.find_reference("refs/tags/release/中文")
            .unwrap()
            .peel_to_tag()
            .unwrap()
            .message(),
        Some("註解\n")
    );
    run(dir.path(), json!({"operation": "createBranch", "branch": "from-base", "oid": base.to_string(), "checkout": false})).unwrap();
    assert_eq!(head(dir.path()), latest);
    assert_eq!(
        repo.find_reference("refs/heads/from-base")
            .unwrap()
            .target(),
        Some(base)
    );
    for invalid in ["--force", "bad name", "../bad"] {
        assert!(run(
            dir.path(),
            json!({"operation": "addTag", "tag": invalid, "oid": base.to_string()})
        )
        .is_err());
    }
    assert!(run(
        dir.path(),
        json!({"operation": "checkout", "branch": branch, "oid": base.to_string()})
    )
    .is_err());
    assert!(run(
        dir.path(),
        json!({"operation": "reset", "oid": base.to_string(), "expectedHead": base.to_string()})
    )
    .is_err());
    assert!(run(dir.path(), json!({"operation": "reset", "oid": base.to_string(), "expectedHead": latest.to_string(), "expectedBranch": "refs/heads/from-base"})).is_err());
    assert_eq!(head(dir.path()), latest);
    run(
        dir.path(),
        json!({"operation": "checkout", "oid": base.to_string()}),
    )
    .unwrap();
    assert!(repo.head_detached().unwrap());
    assert_eq!(head(dir.path()), base);
    run(
        dir.path(),
        json!({"operation": "checkout", "oid": latest.to_string(), "branch": branch}),
    )
    .unwrap();
    assert!(!repo.head_detached().unwrap());
    assert_eq!(head(dir.path()), latest);
    assert!(run(
        dir.path(),
        json!({"operation": "addTag", "tag": "no", "oid": "HEAD"})
    )
    .is_err());
}

#[test]
fn remote_checkout_creates_tracking_branches_and_merges_latest_into_master() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "file.txt", "base\n", "base");
    let latest = write_save(dir.path(), "file.txt", "latest\n", "latest");
    let original = repo.head().unwrap().shorthand().unwrap().to_owned();
    repo.remote("origin", "unused-offline-remote").unwrap();
    repo.reference("refs/remotes/origin/master", base, true, "fixture")
        .unwrap();
    repo.reference("refs/remotes/origin/release/2.102", latest, true, "fixture")
        .unwrap();
    repo.set_head_detached(latest).unwrap();
    repo.find_branch(&original, git2::BranchType::Local)
        .unwrap()
        .delete()
        .unwrap();
    let snapshot = read_repository(dir.path().to_str().unwrap(), true, 500).unwrap();
    assert!(snapshot.branches.iter().all(|b| b.is_remote));
    assert_eq!(
        snapshot
            .branches
            .iter()
            .find(|b| b.name == "origin/release/2.102")
            .unwrap()
            .local_name
            .as_deref(),
        Some("release/2.102")
    );
    assert!(run(
        dir.path(),
        json!({"operation":"merge", "oid":base.to_string()})
    )
    .is_err());
    for remote in ["--bad", "origin/missing", "origin/master"] {
        assert!(run(dir.path(), json!({"operation":"checkout", "oid":latest.to_string(), "remoteBranch":remote, "branch":"release/2.102"})).is_err());
    }
    run(dir.path(), json!({"operation":"checkout", "oid":latest.to_string(), "remoteBranch":"origin/release/2.102", "branch":"release/2.102"})).unwrap();
    assert!(!repo.head_detached().unwrap());
    assert_eq!(repo.head().unwrap().shorthand(), Some("release/2.102"));
    assert_eq!(
        repo.find_branch("release/2.102", git2::BranchType::Local)
            .unwrap()
            .upstream()
            .unwrap()
            .name()
            .unwrap(),
        Some("origin/release/2.102")
    );
    assert!(run(dir.path(), json!({"operation":"checkout", "oid":latest.to_string(), "remoteBranch":"origin/release/2.102", "branch":"release/2.102"})).is_err());
    std::fs::write(dir.path().join("file.txt"), "dirty\n").unwrap();
    assert!(run(dir.path(), json!({"operation":"checkout", "oid":base.to_string(), "remoteBranch":"origin/master", "branch":"master"})).is_err());
    assert!(repo.find_branch("master", git2::BranchType::Local).is_err());
    assert_eq!(head(dir.path()), latest);
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "dirty\n"
    );
    std::fs::write(dir.path().join("file.txt"), "latest\n").unwrap();
    run(dir.path(), json!({"operation":"checkout", "oid":base.to_string(), "remoteBranch":"origin/master", "branch":"master"})).unwrap();
    run(dir.path(), json!({"operation":"merge", "oid":latest.to_string(), "mode":"auto", "expectedBranch":"refs/heads/master", "expectedHead":base.to_string()})).unwrap();
    assert_eq!(repo.head().unwrap().shorthand(), Some("master"));
    assert_eq!(head(dir.path()), latest);
    assert_eq!(
        repo.find_reference("refs/remotes/origin/master")
            .unwrap()
            .target(),
        Some(base)
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "latest\n"
    );
}

#[test]
fn cherry_pick_and_revert_apply_the_target_changes() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let base = write_save(dir.path(), "base.txt", "base\n", "base");
    let original = repo.head().unwrap().shorthand().unwrap().to_owned();
    run(
        dir.path(),
        json!({"operation": "createBranch", "branch": "feature"}),
    )
    .unwrap();
    let feature = write_save(dir.path(), "feature.txt", "feature\n", "feature");
    run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": original}),
    )
    .unwrap();
    run(
        dir.path(),
        json!({"operation": "cherryPick", "oid": feature.to_string()}),
    )
    .unwrap();
    let picked = repo.find_commit(head(dir.path())).unwrap();
    assert_eq!(picked.parent_id(0).unwrap(), base);
    assert!(dir.path().join("feature.txt").exists());
    run(
        dir.path(),
        json!({"operation": "revert", "oid": picked.id().to_string()}),
    )
    .unwrap();
    assert!(!dir.path().join("feature.txt").exists());
    assert_eq!(
        repo.find_commit(head(dir.path()))
            .unwrap()
            .parent_id(0)
            .unwrap(),
        picked.id()
    );
}

#[test]
fn merge_and_merge_revert_use_the_selected_mainline() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    write_save(dir.path(), "base.txt", "base\n", "base");
    let original = repo.head().unwrap().shorthand().unwrap().to_owned();
    run(
        dir.path(),
        json!({"operation": "createBranch", "branch": "feature"}),
    )
    .unwrap();
    let feature = write_save(dir.path(), "feature.txt", "feature\n", "feature");
    run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": original}),
    )
    .unwrap();
    let before = write_save(dir.path(), "main.txt", "main\n", "main");
    assert!(run(
        dir.path(),
        json!({"operation": "merge", "mode": "ffOnly", "oid": feature.to_string()})
    )
    .is_err());
    assert_eq!(head(dir.path()), before);
    run(
        dir.path(),
        json!({"operation": "merge", "mode": "noFf", "oid": feature.to_string()}),
    )
    .unwrap();
    let merged = head(dir.path());
    assert_eq!(repo.find_commit(merged).unwrap().parent_count(), 2);
    assert!(run(
        dir.path(),
        json!({"operation": "revert", "oid": merged.to_string()})
    )
    .is_err());
    assert!(run(
        dir.path(),
        json!({"operation": "revert", "oid": merged.to_string(), "mainline": 3})
    )
    .is_err());
    run(
        dir.path(),
        json!({"operation": "revert", "oid": merged.to_string(), "mainline": 1}),
    )
    .unwrap();
    assert!(!dir.path().join("feature.txt").exists());
    assert!(dir.path().join("main.txt").exists());
}

#[test]
fn rebase_replays_current_branch_onto_target_commit() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    write_save(dir.path(), "base.txt", "base\n", "base");
    let original = repo.head().unwrap().shorthand().unwrap().to_owned();
    run(
        dir.path(),
        json!({"operation": "createBranch", "branch": "feature"}),
    )
    .unwrap();
    let old = write_save(dir.path(), "feature.txt", "feature\n", "feature");
    run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": original}),
    )
    .unwrap();
    let target = write_save(dir.path(), "main.txt", "main\n", "main");
    run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": "feature"}),
    )
    .unwrap();
    run(
        dir.path(),
        json!({"operation": "rebase", "oid": target.to_string()}),
    )
    .unwrap();
    let rebased = repo.find_commit(head(dir.path())).unwrap();
    assert_ne!(rebased.id(), old);
    assert_eq!(rebased.parent_id(0).unwrap(), target);
    assert!(dir.path().join("main.txt").exists());
    assert!(dir.path().join("feature.txt").exists());
}

#[test]
fn reset_modes_preserve_or_replace_index_and_worktree_as_requested() {
    for mode in ["soft", "mixed", "hard"] {
        let dir = tempfile::tempdir().unwrap();
        let repo = setup(dir.path());
        let base = write_save(dir.path(), "file.txt", "base\n", "base");
        write_save(dir.path(), "file.txt", "committed\n", "latest");
        std::fs::write(dir.path().join("file.txt"), "dirty\n").unwrap();
        run(
            dir.path(),
            json!({"operation": "reset", "mode": mode, "oid": base.to_string()}),
        )
        .unwrap();
        assert_eq!(head(dir.path()), base);
        let indexed = index(&repo).get_path(Path::new("file.txt"), 0).unwrap();
        assert_eq!(
            repo.find_blob(indexed.id).unwrap().content(),
            if mode == "soft" {
                b"committed\n".as_slice()
            } else {
                b"base\n".as_slice()
            }
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
            if mode == "hard" { "base\n" } else { "dirty\n" }
        );
    }
}

#[test]
fn conflicted_operations_can_abort_or_continue_after_staging_resolution() {
    for operation in ["merge", "cherryPick", "rebase", "revert"] {
        for abort in [true, false] {
            let dir = tempfile::tempdir().unwrap();
            let repo = setup(dir.path());
            write_save(dir.path(), "file.txt", "base\n", "base");
            let original = repo.head().unwrap().shorthand().unwrap().to_owned();
            run(
                dir.path(),
                json!({"operation": "createBranch", "branch": "feature"}),
            )
            .unwrap();
            let target = write_save(dir.path(), "file.txt", "feature\n", "feature");
            run(
                dir.path(),
                json!({"operation": "switchBranch", "branch": original}),
            )
            .unwrap();
            let before = write_save(dir.path(), "file.txt", "main\n", "main");
            assert!(run(
                dir.path(),
                json!({"operation": operation, "oid": target.to_string()})
            )
            .is_err());
            let snapshot = read_repository(dir.path().to_str().unwrap(), true, 20).unwrap();
            assert_ne!(snapshot.operation_state, "clean");
            assert!(snapshot.working_files.iter().any(|f| f.conflict));
            if abort {
                run(dir.path(), json!({"operation": "abortOperation"})).unwrap();
                assert_eq!(head(dir.path()), before);
                assert_eq!(
                    std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
                    "main\n"
                );
            } else {
                assert!(run(dir.path(), json!({"operation": "continueOperation"})).is_err());
                std::fs::write(dir.path().join("file.txt"), "resolved\n").unwrap();
                run(
                    dir.path(),
                    json!({"operation": "stage", "files": ["file.txt"]}),
                )
                .unwrap();
                run(dir.path(), json!({"operation": "continueOperation"})).unwrap();
                assert_eq!(
                    std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
                    "resolved\n"
                );
            }
            assert_eq!(
                read_repository(dir.path().to_str().unwrap(), true, 20)
                    .unwrap()
                    .operation_state,
                "clean"
            );
        }
    }
}

#[test]
fn unborn_partial_staging_unstages_without_changing_worktree_and_commits_only_index() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    let file = dir.path().join("中文 [a].txt");
    std::fs::write(&file, "staged\n").unwrap();
    run(
        dir.path(),
        json!({"operation": "stage", "files": ["中文 [a].txt"]}),
    )
    .unwrap();
    std::fs::write(&file, "unstaged\n").unwrap();
    run(
        dir.path(),
        json!({"operation": "unstage", "files": ["中文 [a].txt"]}),
    )
    .unwrap();
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "unstaged\n");
    assert!(index(&repo).is_empty());
    run(dir.path(), json!({"operation": "stage"})).unwrap();
    std::fs::write(&file, "remaining\n").unwrap();
    std::fs::write(dir.path().join("other.txt"), "not committed\n").unwrap();
    run(
        dir.path(),
        json!({"operation": "commit", "message": "初始提交\n\n詳細說明"}),
    )
    .unwrap();
    let tree = repo.head().unwrap().peel_to_tree().unwrap();
    let entry = tree.get_path(Path::new("中文 [a].txt")).unwrap();
    assert_eq!(repo.find_blob(entry.id()).unwrap().content(), b"unstaged\n");
    assert!(tree.get_path(Path::new("other.txt")).is_err());
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "remaining\n");
    assert!(run(dir.path(), json!({"operation": "commit", "message": " "})).is_err());
    assert!(run(
        dir.path(),
        json!({"operation": "commit", "message": "empty"})
    )
    .is_err());
}

#[test]
fn stages_deletions_and_unstages_without_restoring_files() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    std::fs::write(dir.path().join("deleted.txt"), "base\n").unwrap();
    save(dir.path(), "base");
    std::fs::remove_file(dir.path().join("deleted.txt")).unwrap();
    run(
        dir.path(),
        json!({"operation": "stage", "files": ["deleted.txt"]}),
    )
    .unwrap();
    assert!(index(&repo).get_path(Path::new("deleted.txt"), 0).is_none());
    run(
        dir.path(),
        json!({"operation": "unstage", "files": ["deleted.txt"]}),
    )
    .unwrap();
    assert!(index(&repo).get_path(Path::new("deleted.txt"), 0).is_some());
    assert!(!dir.path().join("deleted.txt").exists());
}

#[test]
fn unstages_renames_as_a_pair() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    std::fs::write(dir.path().join("before.txt"), "same\n").unwrap();
    save(dir.path(), "base");
    std::fs::rename(dir.path().join("before.txt"), dir.path().join("after.txt")).unwrap();
    run(dir.path(), json!({"operation": "stage"})).unwrap();
    let snapshot = read_repository(dir.path().to_str().unwrap(), true, 10).unwrap();
    run(
        dir.path(),
        json!({"operation": "unstage", "files": [snapshot.working_files[0].path]}),
    )
    .unwrap();
    let index = index(&repo);
    assert!(index.get_path(Path::new("before.txt"), 0).is_some());
    assert!(index.get_path(Path::new("after.txt"), 0).is_none());
    assert!(dir.path().join("after.txt").exists());
}

#[test]
fn branch_switch_preserves_dirty_files_and_reports_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    std::fs::write(dir.path().join("file.txt"), "base\n").unwrap();
    save(dir.path(), "base");
    let original = repo.head().unwrap().shorthand().unwrap().to_owned();
    run(
        dir.path(),
        json!({"operation": "createBranch", "branch": "feature/中文"}),
    )
    .unwrap();
    std::fs::write(dir.path().join("file.txt"), "feature\n").unwrap();
    save(dir.path(), "feature");
    run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": original}),
    )
    .unwrap();
    std::fs::write(dir.path().join("file.txt"), "dirty\n").unwrap();
    assert!(run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": "feature/中文"})
    )
    .is_err());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("file.txt")).unwrap(),
        "dirty\n"
    );
    assert_eq!(repo.head().unwrap().shorthand(), Some(original.as_str()));
    assert!(run(
        dir.path(),
        json!({"operation": "createBranch", "branch": "--force"})
    )
    .is_err());
    assert!(run(
        dir.path(),
        json!({"operation": "switchBranch", "branch": "missing"})
    )
    .is_err());
}

#[test]
fn rejects_invalid_paths_and_missing_remote_and_detached_push() {
    let dir = tempfile::tempdir().unwrap();
    let repo = setup(dir.path());
    for file in ["../outside", ".git/config", "C:\\outside", "/outside"] {
        assert!(run(dir.path(), json!({"operation": "stage", "files": [file]})).is_err());
    }
    assert!(run(dir.path(), json!({"operation": "fetch"})).is_err());
    std::fs::write(dir.path().join("file.txt"), "base\n").unwrap();
    save(dir.path(), "base");
    assert!(run(dir.path(), json!({"operation": "pull"})).is_err());
    assert!(run(dir.path(), json!({"operation": "push"})).is_err());
    repo.set_head_detached(repo.head().unwrap().target().unwrap())
        .unwrap();
    assert!(run(dir.path(), json!({"operation": "push"})).is_err());
}

#[test]
fn local_remote_fetch_pull_and_push_set_upstream_and_refuse_divergence() {
    let dir = tempfile::tempdir().unwrap();
    let remote_path = dir.path().join("remote.git");
    let remote = Repository::init_bare(&remote_path).unwrap();
    let a_path = dir.path().join("a");
    let a = setup(&a_path);
    a.remote("origin", remote_path.to_str().unwrap()).unwrap();
    std::fs::write(a_path.join("base.txt"), "base\n").unwrap();
    save(&a_path, "base");
    run(&a_path, json!({"operation": "push"})).unwrap();
    let branch = a.head().unwrap().shorthand().unwrap().to_owned();
    remote.set_head(&format!("refs/heads/{branch}")).unwrap();
    assert!(a
        .find_branch(&branch, git2::BranchType::Local)
        .unwrap()
        .upstream()
        .is_ok());
    let b_path = dir.path().join("b");
    let b = Repository::clone(remote_path.to_str().unwrap(), &b_path).unwrap();
    configure(&b);
    std::fs::write(b_path.join("remote.txt"), "remote\n").unwrap();
    save(&b_path, "remote update");
    run(&b_path, json!({"operation": "push"})).unwrap();
    run(&a_path, json!({"operation": "fetch"})).unwrap();
    assert_eq!(
        read_repository(a_path.to_str().unwrap(), true, 10)
            .unwrap()
            .behind,
        1
    );
    std::fs::write(a_path.join("dirty.txt"), "dirty\n").unwrap();
    assert!(run(&a_path, json!({"operation": "pull"})).is_err());
    std::fs::remove_file(a_path.join("dirty.txt")).unwrap();
    run(&a_path, json!({"operation": "pull"})).unwrap();
    assert!(a_path.join("remote.txt").exists());
    std::fs::write(a_path.join("local.txt"), "local\n").unwrap();
    save(&a_path, "local update");
    let before = a.head().unwrap().target().unwrap();
    std::fs::write(b_path.join("another.txt"), "other\n").unwrap();
    save(&b_path, "divergence");
    run(&b_path, json!({"operation": "push"})).unwrap();
    assert!(run(&a_path, json!({"operation": "push"})).is_err());
    assert!(run(&a_path, json!({"operation": "pull"})).is_err());
    assert_eq!(a.head().unwrap().target(), Some(before));
    assert_eq!(
        std::fs::read_to_string(a_path.join("local.txt")).unwrap(),
        "local\n"
    );
}
