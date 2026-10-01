//! Read-only desktop adapter around keifu's commit graph engine.
pub mod git;
pub mod graph;

use anyhow::{bail, Context, Result};
use git::graph::CellType;
use git::{BranchInfo, CommitInfo, TagInfo};
use git2::{Diff, DiffOptions, Oid, Repository, Status};
use serde::Serialize;
use std::collections::HashSet;
use std::io::Read;
use std::path::{Component, Path};

const PATCH_LIMIT: usize = 1024 * 1024;
const PATCH_LINES_LIMIT: usize = 10_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub oid: String,
    pub is_head: bool,
    pub is_remote: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub oid: String,
    pub short_id: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub full_message: String,
    pub parents: Vec<String>,
}

impl From<&CommitInfo> for Commit {
    fn from(c: &CommitInfo) -> Self {
        Self {
            oid: c.oid.to_string(),
            short_id: c.short_id.clone(),
            author: c.author_name.clone(),
            email: c.author_email.clone(),
            date: c.timestamp.to_rfc3339(),
            message: c.message.clone(),
            full_message: c.full_message.clone(),
            parents: c.parent_oids.iter().map(ToString::to_string).collect(),
        }
    }
}

#[derive(Serialize)]
pub struct Cell {
    pub kind: &'static str,
    pub color: usize,
    pub secondary: usize,
}

impl From<CellType> for Cell {
    fn from(c: CellType) -> Self {
        let (kind, color, secondary) = match c {
            CellType::Empty => ("empty", 0, 0),
            CellType::Pipe(c) => ("pipe", c, c),
            CellType::Commit(c) => ("commit", c, c),
            CellType::BranchRight(c) => ("branchRight", c, c),
            CellType::BranchLeft(c) => ("branchLeft", c, c),
            CellType::MergeRight(c) => ("mergeRight", c, c),
            CellType::MergeLeft(c) => ("mergeLeft", c, c),
            CellType::Horizontal(c) => ("horizontal", c, c),
            CellType::HorizontalPipe(c, p) => ("cross", c, p),
            CellType::TeeRight(c) => ("teeRight", c, c),
            CellType::TeeLeft(c) => ("teeLeft", c, c),
            CellType::TeeUp(c) => ("teeUp", c, c),
        };
        let safe = |c| if c == usize::MAX { 11 } else { c };
        Self {
            kind,
            color: safe(color),
            secondary: safe(secondary),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub commit: Option<Commit>,
    pub branches: Vec<String>,
    pub tags: Vec<String>,
    pub is_head: bool,
    pub cells: Vec<Cell>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub kind: String,
    pub insertions: usize,
    pub deletions: usize,
    pub binary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingFile {
    pub path: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub conflict: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub project: Project,
    pub head: Option<String>,
    pub head_oid: Option<String>,
    pub branches: Vec<Branch>,
    pub rows: Vec<Row>,
    pub max_lane: usize,
    pub working_files: Vec<WorkingFile>,
    pub has_more: bool,
    pub commit_count: usize,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub commit: Commit,
    pub files: Vec<ChangedFile>,
    pub total_files: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchLine {
    pub kind: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
}

#[derive(Default, Serialize)]
pub struct FilePatch {
    pub lines: Vec<PatchLine>,
    pub binary: bool,
    pub truncated: bool,
}

pub fn open_project(path: &str) -> Result<Project> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫，請選擇專案資料夾。")?;
    project_info(&repo)
}

fn project_info(repo: &Repository) -> Result<Project> {
    let root = repo.workdir().unwrap_or_else(|| repo.path());
    let canonical = root.canonicalize().context("無法讀取專案路徑。")?;
    let mut path = canonical.to_string_lossy().into_owned();
    // Windows verbatim paths aren't useful labels; the normal path remains absolute.
    if let Some(normal) = path.strip_prefix(r"\\?\UNC\") {
        path = format!(r"\\{normal}");
    } else if let Some(normal) = path.strip_prefix(r"\\?\") {
        path = normal.to_owned();
    }
    let name = root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    Ok(Project { path, name })
}

pub fn read_repository(path: &str, include_remotes: bool, limit: usize) -> Result<Snapshot> {
    let repo = Repository::open(path).context("專案無法開啟，資料夾可能已移動或刪除。")?;
    let limit = limit.clamp(1, 5000);
    let branches = BranchInfo::list_all(&repo, include_remotes)?;
    let tags = TagInfo::list_all(&repo)?;
    let head = repo.head().ok();
    let head_oid = head
        .as_ref()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| c.id());
    let head_name = head.as_ref().and_then(|h| h.shorthand()).map(str::to_owned);
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    let mut tips = HashSet::new();
    // Push tips in a stable order so equal-time commits keep a consistent layout.
    for tip in branches
        .iter()
        .map(|b| b.tip_oid)
        .chain(tags.iter().map(|t| t.tip_oid))
        .chain(head_oid)
    {
        if tips.insert(tip) {
            walk.push(tip)?;
        }
    }
    let mut commits = Vec::new();
    for oid in walk.take(limit + 1) {
        commits.push(CommitInfo::from_git2_commit(&repo.find_commit(oid?)?));
    }
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    let commit_count = commits.len();
    let layout = git::graph::build_graph(&commits, &branches, &tags, None, head_oid);
    let rows = layout
        .nodes
        .into_iter()
        .map(|n| Row {
            commit: n.commit.as_ref().map(Commit::from),
            branches: n.branch_names,
            tags: n.tag_names,
            is_head: n.commit.as_ref().is_some_and(|c| Some(c.oid) == head_oid),
            cells: n.cells.into_iter().map(Cell::from).collect(),
        })
        .collect();
    let mut working_files = Vec::new();
    if !repo.is_bare() {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);
        for entry in repo.statuses(Some(&mut opts))?.iter() {
            let status = entry.status();
            if status == Status::CURRENT {
                continue;
            }
            working_files.push(WorkingFile {
                path: entry
                    .path()
                    .context("檔案路徑不是有效的 UTF-8。")?
                    .to_owned(),
                staged: status.intersects(
                    Status::INDEX_NEW
                        | Status::INDEX_MODIFIED
                        | Status::INDEX_DELETED
                        | Status::INDEX_RENAMED
                        | Status::INDEX_TYPECHANGE,
                ),
                unstaged: status.intersects(
                    Status::WT_NEW
                        | Status::WT_MODIFIED
                        | Status::WT_DELETED
                        | Status::WT_RENAMED
                        | Status::WT_TYPECHANGE
                        | Status::CONFLICTED,
                ),
                untracked: status.contains(Status::WT_NEW),
                conflict: status.contains(Status::CONFLICTED),
            });
        }
    }
    working_files.sort_by(|a, b| a.path.cmp(&b.path));
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    if let Some(branch) = branches.iter().find(|b| b.is_head) {
        upstream = branch.upstream.clone();
        if let Some(name) = &upstream {
            if let Ok(remote) = repo.find_branch(name, git2::BranchType::Remote) {
                if let Some(oid) = remote.get().target() {
                    (ahead, behind) = repo.graph_ahead_behind(branch.tip_oid, oid)?;
                }
            }
        }
    }
    Ok(Snapshot {
        project: project_info(&repo)?,
        head: head_name,
        head_oid: head_oid.map(|o| o.to_string()),
        branches: branches
            .iter()
            .map(|b| Branch {
                name: b.name.clone(),
                oid: b.tip_oid.to_string(),
                is_head: b.is_head,
                is_remote: b.is_remote,
            })
            .collect(),
        rows,
        max_lane: layout.max_lane,
        working_files,
        has_more,
        commit_count,
        upstream,
        ahead,
        behind,
    })
}

fn commit_diff<'a>(repo: &'a Repository, oid: &str, opts: &mut DiffOptions) -> Result<Diff<'a>> {
    let commit = repo.find_commit(Oid::from_str(oid)?)?;
    let new_tree = commit.tree()?;
    let old_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };
    Ok(repo.diff_tree_to_tree(old_tree.as_ref(), Some(&new_tree), Some(opts))?)
}

pub fn read_commit(path: &str, oid: &str) -> Result<CommitDetail> {
    let repo = Repository::open(path)?;
    let commit = CommitInfo::from_git2_commit(&repo.find_commit(Oid::from_str(oid)?)?);
    let mut opts = DiffOptions::new();
    opts.context_lines(0);
    let diff = commit_diff(&repo, oid, &mut opts)?;
    let total_files = diff.deltas().len();
    let mut files = Vec::new();
    for (i, delta) in diff.deltas().enumerate().take(1000) {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .context("無法讀取 diff 路徑。")?;
        let patch = git2::Patch::from_diff(&diff, i)?;
        let (_, insertions, deletions) = patch
            .as_ref()
            .map(|p| p.line_stats())
            .transpose()?
            .unwrap_or((0, 0, 0));
        files.push(ChangedFile {
            path: path.to_string_lossy().into_owned(),
            kind: format!("{:?}", delta.status()),
            insertions,
            deletions,
            binary: patch.is_none(),
        });
    }
    Ok(CommitDetail {
        commit: Commit::from(&commit),
        files,
        total_files,
    })
}

fn validate_file(file: &str) -> Result<()> {
    if file.is_empty()
        || Path::new(file)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        bail!("檔案路徑必須是專案內的相對路徑。");
    }
    Ok(())
}

pub fn read_patch(path: &str, oid: Option<&str>, file: &str, area: &str) -> Result<FilePatch> {
    validate_file(file)?;
    let repo = Repository::open(path)?;
    let mut opts = DiffOptions::new();
    opts.context_lines(3)
        .disable_pathspec_match(true)
        .pathspec(file);
    if oid.is_none()
        && area == "unstaged"
        && repo.status_file(Path::new(file))?.contains(Status::WT_NEW)
    {
        return untracked_patch(&repo, file);
    }
    let diff = if let Some(oid) = oid {
        commit_diff(&repo, oid, &mut opts)?
    } else if area == "staged" {
        let head_tree = match repo.head() {
            Ok(head) => Some(head.peel_to_tree()?),
            Err(e)
                if matches!(
                    e.code(),
                    git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
                ) =>
            {
                None
            }
            Err(e) => return Err(e.into()),
        };
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
    } else if area == "unstaged" {
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    } else {
        bail!("未知的 diff 區域。");
    };
    let mut result = FilePatch::default();
    let mut bytes = 0;
    // Print callbacks can stop after the display budget; do not send unbounded IPC data.
    let printed = diff.print(git2::DiffFormat::Patch, |delta, _, line| {
        result.binary |= delta.flags().contains(git2::DiffFlags::BINARY);
        bytes += line.content().len();
        if bytes > PATCH_LIMIT || result.lines.len() >= PATCH_LINES_LIMIT {
            result.truncated = true;
            return false;
        }
        if matches!(line.origin(), '+' | '-' | ' ' | 'H' | '=' | '>' | '<') {
            result.lines.push(PatchLine {
                kind: line.origin().to_string(),
                old_line: line.old_lineno(),
                new_line: line.new_lineno(),
                text: String::from_utf8_lossy(line.content())
                    .trim_end_matches('\n')
                    .trim_end_matches('\r')
                    .to_owned(),
            });
        }
        true
    });
    if !result.truncated {
        printed?;
    }
    Ok(result)
}

fn untracked_patch(repo: &Repository, file: &str) -> Result<FilePatch> {
    let root = repo
        .workdir()
        .context("專案沒有工作目錄。")?
        .canonicalize()?;
    let full = root.join(file);
    if std::fs::symlink_metadata(&full)?.file_type().is_symlink() {
        bail!("未追蹤的符號連結只顯示檔案狀態。");
    }
    let full = full.canonicalize()?;
    if !full.starts_with(&root) {
        bail!("檔案位於專案之外。");
    }
    let mut bytes = Vec::new();
    std::fs::File::open(full)?
        .take((PATCH_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)?;
    let mut truncated = bytes.len() > PATCH_LIMIT;
    bytes.truncate(PATCH_LIMIT);
    if bytes.contains(&0) {
        return Ok(FilePatch {
            binary: true,
            truncated,
            lines: vec![],
        });
    }
    let mut lines = Vec::new();
    for (i, text) in String::from_utf8_lossy(&bytes).lines().enumerate() {
        if i >= PATCH_LINES_LIMIT {
            truncated = true;
            break;
        }
        lines.push(PatchLine {
            kind: "+".into(),
            old_line: None,
            new_line: Some(i as u32 + 1),
            text: text.into(),
        });
    }
    Ok(FilePatch {
        lines,
        binary: false,
        truncated,
    })
}
