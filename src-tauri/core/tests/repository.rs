use git2::{Repository, Signature};
use repovela_core::{open_project, read_commit, read_patch, read_repository};
use std::path::Path;

fn commit(repo: &Repository, message: &str) -> git2::Oid {
    let mut index = repo.index().unwrap();
    index
        .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let sig = Signature::now("測試作者", "test@example.com").unwrap();
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<_> = parent.iter().collect();
    repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
        .unwrap()
}

#[test]
fn reads_remote_urls_even_when_remote_branches_are_hidden_without_changing_config() {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    repo.remote("origin", "git@github.com:team/repo.git")
        .unwrap();
    repo.remote("upstream", "https://gitlab.example.com/team/repo.git")
        .unwrap();
    let before = std::fs::read(repo.path().join("config")).unwrap();
    let snapshot = read_repository(dir.path().to_str().unwrap(), false, 500).unwrap();
    assert_eq!(snapshot.remotes.len(), 2);
    assert_eq!(snapshot.remotes[0].name, "origin");
    assert_eq!(snapshot.remotes[0].url, "git@github.com:team/repo.git");
    assert_eq!(snapshot.remotes[1].name, "upstream");
    assert_eq!(
        snapshot.remotes[1].url,
        "https://gitlab.example.com/team/repo.git"
    );
    assert_eq!(std::fs::read(repo.path().join("config")).unwrap(), before);
    repo.remote_delete("origin").unwrap();
    repo.remote_delete("upstream").unwrap();
    assert!(read_repository(dir.path().to_str().unwrap(), true, 500)
        .unwrap()
        .remotes
        .is_empty());
}

#[test]
fn discovers_nested_project_and_reads_initial_commit_without_mutating_index() {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    std::fs::write(dir.path().join("檔案.txt"), "第一行\n第二行\n").unwrap();
    std::fs::create_dir(dir.path().join("nested")).unwrap();
    let oid = commit(&repo, "第一筆 commit\n\n完整訊息");
    let index_before = std::fs::read(repo.path().join("index")).unwrap();
    let project = open_project(dir.path().join("nested").to_str().unwrap()).unwrap();
    let snapshot = read_repository(&project.path, true, 500).unwrap();
    assert_eq!(snapshot.commit_count, 1);
    assert!(snapshot.working_files.is_empty());
    let detail = read_commit(&project.path, &oid.to_string()).unwrap();
    assert_eq!(detail.files[0].path, "檔案.txt");
    assert_eq!(detail.files[0].insertions, 2);
    assert!(detail.commit.full_message.contains("完整訊息"));
    let patch = read_patch(&project.path, Some(&oid.to_string()), "檔案.txt", "commit").unwrap();
    assert_eq!(patch.lines.iter().filter(|l| l.kind == "+").count(), 2);
    assert_eq!(
        std::fs::read(repo.path().join("index")).unwrap(),
        index_before
    );
}

#[test]
fn partial_staging_shows_both_diffs_and_untracked_files() {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    std::fs::write(dir.path().join("file.txt"), "base\n").unwrap();
    commit(&repo, "init");
    std::fs::write(dir.path().join("file.txt"), "staged\n").unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("file.txt")).unwrap();
    index.write().unwrap();
    std::fs::write(dir.path().join("file.txt"), "unstaged\n").unwrap();
    std::fs::write(dir.path().join("new.txt"), "new content\n").unwrap();
    let path = dir.path().to_str().unwrap();
    let snapshot = read_repository(path, true, 500).unwrap();
    let partial = snapshot
        .working_files
        .iter()
        .find(|f| f.path == "file.txt")
        .unwrap();
    assert!(partial.staged && partial.unstaged);
    let staged = read_patch(path, None, "file.txt", "staged").unwrap();
    assert!(staged
        .lines
        .iter()
        .any(|l| l.kind == "+" && l.text == "staged"));
    let unstaged = read_patch(path, None, "file.txt", "unstaged").unwrap();
    assert!(unstaged
        .lines
        .iter()
        .any(|l| l.kind == "+" && l.text == "unstaged"));
    let untracked = read_patch(path, None, "new.txt", "unstaged").unwrap();
    assert_eq!(untracked.lines[0].text, "new content");
}

#[test]
fn unborn_and_detached_heads_and_tag_only_history_work() {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    let path = dir.path().to_str().unwrap();
    assert_eq!(read_repository(path, true, 500).unwrap().commit_count, 0);
    std::fs::write(dir.path().join("new.txt"), "one\n").unwrap();
    assert!(read_repository(path, true, 500).unwrap().working_files[0].untracked);
    let first = commit(&repo, "first");
    let obj = repo.find_object(first, None).unwrap();
    repo.tag_lightweight("v1", &obj, false).unwrap();
    std::fs::write(dir.path().join("new.txt"), "two\n").unwrap();
    let second = commit(&repo, "second");
    let branch = repo.head().unwrap().shorthand().unwrap().to_owned();
    repo.set_head_detached(second).unwrap();
    repo.find_branch(&branch, git2::BranchType::Local)
        .unwrap()
        .delete()
        .unwrap();
    let snapshot = read_repository(path, true, 500).unwrap();
    assert_eq!(snapshot.commit_count, 2);
    assert_eq!(
        snapshot.head_oid.as_deref(),
        Some(second.to_string().as_str())
    );
    assert!(snapshot.rows.iter().any(|r| r.is_head));
    let limited = read_repository(path, true, 1).unwrap();
    assert!(limited.has_more);
    assert_eq!(limited.commit_count, 1);
}

#[test]
fn binary_and_large_untracked_diffs_and_path_validation() {
    let dir = tempfile::tempdir().unwrap();
    Repository::init(dir.path()).unwrap();
    let path = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("binary.dat"), [0, 1, 2]).unwrap();
    assert!(
        read_patch(path, None, "binary.dat", "unstaged")
            .unwrap()
            .binary
    );
    std::fs::write(dir.path().join("large.txt"), "x\n".repeat(600000)).unwrap();
    assert!(
        read_patch(path, None, "large.txt", "unstaged")
            .unwrap()
            .truncated
    );
    std::fs::write(dir.path().join("many-lines.txt"), "x\n".repeat(20_000)).unwrap();
    let many_lines = read_patch(path, None, "many-lines.txt", "unstaged").unwrap();
    assert!(many_lines.truncated);
    assert_eq!(many_lines.lines.len(), 10_000);
    assert!(read_patch(path, None, "../outside.txt", "unstaged").is_err());
    assert!(read_patch(path, None, "C:\\outside.txt", "unstaged").is_err());
    assert!(read_patch(path, None, "large.txt", "unknown").is_err());
}

#[test]
fn merged_branch_graph_keeps_both_parents_and_diff_uses_first_parent() {
    let dir = tempfile::tempdir().unwrap();
    let repo = Repository::init(dir.path()).unwrap();
    let path = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("base.txt"), "base\n").unwrap();
    let base = commit(&repo, "base");
    let original = repo.head().unwrap().name().unwrap().to_owned();
    repo.branch("feature", &repo.find_commit(base).unwrap(), false)
        .unwrap();
    repo.set_head("refs/heads/feature").unwrap();
    repo.checkout_head(None).unwrap();
    std::fs::write(dir.path().join("feature.txt"), "feature\n").unwrap();
    let feature = commit(&repo, "feature");
    repo.checkout_tree(
        repo.find_commit(base).unwrap().tree().unwrap().as_object(),
        None,
    )
    .unwrap();
    repo.set_head(&original).unwrap();
    std::fs::write(dir.path().join("main.txt"), "main\n").unwrap();
    let main = commit(&repo, "main");
    let main_commit = repo.find_commit(main).unwrap();
    let feature_commit = repo.find_commit(feature).unwrap();
    let mut merged = repo
        .merge_commits(&main_commit, &feature_commit, None)
        .unwrap();
    assert!(!merged.has_conflicts());
    let tree = repo
        .find_tree(merged.write_tree_to(&repo).unwrap())
        .unwrap();
    let sig = Signature::now("Test", "test@example.com").unwrap();
    let merge = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            "merge",
            &tree,
            &[&main_commit, &feature_commit],
        )
        .unwrap();
    let snapshot = read_repository(path, true, 500).unwrap();
    assert_eq!(snapshot.commit_count, 4);
    assert!(snapshot.max_lane > 0);
    assert!(snapshot.rows.iter().any(|r| r.commit.is_none()));
    let detail = read_commit(path, &merge.to_string()).unwrap();
    assert_eq!(
        detail.commit.parents,
        vec![main.to_string(), feature.to_string()]
    );
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].path, "feature.txt");
}
