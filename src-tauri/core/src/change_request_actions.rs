use super::change_requests::{cli, item, target, ChangeRequest, Forge, Target};
use anyhow::{bail, Context, Result};
use base64::Engine;
use git2::Repository;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Mutex;

static WRITES: Mutex<()> = Mutex::new(());
const PATCH_LIMIT: usize = 1024 * 1024;
const PAGE_SIZE: usize = 30;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestDetail {
    request: ChangeRequest,
    head_oid: String,
    merge_status: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFile {
    path: String,
    previous_path: Option<String>,
    kind: String,
    additions: usize,
    deletions: usize,
    patch: Option<String>,
    truncated: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestChanges {
    files: Vec<RequestFile>,
    head_oid: String,
    next_cursor: Option<String>,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RequestOperation {
    Create,
    Comment,
    Approve,
    RequestChanges,
    Unapprove,
    Merge,
    Close,
    Reopen,
    Draft,
    Ready,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestAction {
    pub operation: RequestOperation,
    pub number: Option<u64>,
    pub expected_head: Option<String>,
    pub expected_state: Option<String>,
    pub expected_target: Option<String>,
    pub message: Option<String>,
    pub title: Option<String>,
    pub source_branch: Option<String>,
    pub target_branch: Option<String>,
    pub draft: Option<bool>,
    pub merge_method: Option<String>,
}

struct Client<'a> {
    target: Target,
    root: &'a Path,
    forge: Forge,
}
impl<'a> Client<'a> {
    fn new(repo: &'a Repository, remote: &str, forge: Forge) -> Result<Self> {
        let remote = repo
            .find_remote(remote)
            .context("找不到選取的遠端，請重新整理專案。")?;
        Ok(Self {
            target: target(remote.url().context("遠端沒有網址。")?, forge)?,
            root: repo.workdir().unwrap_or(repo.path()),
            forge,
        })
    }
    fn github(&self) -> bool {
        matches!(self.forge, Forge::Github)
    }
    fn project(&self) -> String {
        if self.github() {
            format!("repos/{}", self.target.project)
        } else {
            format!("projects/{}", self.target.project.replace('/', "%2F"))
        }
    }
    fn endpoint(&self, number: u64) -> Result<String> {
        if number == 0 {
            bail!("無效的 PR／MR 編號。");
        }
        Ok(format!(
            "{}/{}/{number}",
            self.project(),
            if self.github() {
                "pulls"
            } else {
                "merge_requests"
            }
        ))
    }
    fn call(
        &self,
        endpoint: &str,
        method: &str,
        fields: &[(&str, String)],
        runner: &mut impl FnMut(&str, &[String], &Path, &str) -> Result<Value>,
    ) -> Result<Value> {
        let mut args = vec![
            "api".into(),
            endpoint.into(),
            "--hostname".into(),
            self.target.host.clone(),
            "--method".into(),
            method.into(),
        ];
        for (key, value) in fields {
            // User content is always passed literally, without file expansion.
            args.extend([
                if [
                    "draft",
                    "squash",
                    "should_remove_source_branch",
                    "remove_source_branch",
                ]
                .contains(key)
                {
                    "--field"
                } else {
                    "--raw-field"
                }
                .into(),
                format!("{key}={value}"),
            ]);
        }
        runner(
            if self.github() { "gh" } else { "glab" },
            &args,
            self.root,
            &self.target.host,
        )
    }
    fn metadata(
        &self,
        number: u64,
        runner: &mut impl FnMut(&str, &[String], &Path, &str) -> Result<Value>,
    ) -> Result<Value> {
        let data = self.call(&self.endpoint(number)?, "GET", &[], runner)?;
        if data[if self.github() { "number" } else { "iid" }].as_u64() != Some(number) {
            bail!("Git 平台未回傳正確的 PR／MR。");
        }
        Ok(data)
    }
}
fn text(data: &Value, key: &str) -> String {
    data[key].as_str().unwrap_or_default().to_owned()
}
fn head(data: &Value, forge: Forge) -> Result<String> {
    let oid = if matches!(forge, Forge::Github) {
        text(&data["head"], "sha")
    } else {
        text(data, "sha")
    };
    if ![40, 64].contains(&oid.len()) || !oid.bytes().all(|b| b.is_ascii_hexdigit()) {
        bail!("平台未提供有效的來源 commit，請重新整理。");
    }
    Ok(oid)
}
fn state(data: &Value, forge: Forge) -> String {
    if matches!(forge, Forge::Github) && data["merged"].as_bool() == Some(true) {
        return "merged".into();
    }
    let state = text(data, "state");
    if state == "opened" {
        "open".into()
    } else {
        state
    }
}
fn is_draft(data: &Value) -> bool {
    data["draft"].as_bool() == Some(true) || data["work_in_progress"].as_bool() == Some(true)
}

fn draft_title(title: &str, draft: bool) -> String {
    let mut plain = title.trim_start();
    while let Some(prefix) = ["Draft:", "[Draft]", "(Draft)", "WIP:", "[WIP]", "(WIP)"]
        .iter()
        .find(|prefix| {
            plain
                .get(..prefix.len())
                .is_some_and(|text| text.eq_ignore_ascii_case(prefix))
        })
    {
        plain = plain[prefix.len()..].trim_start();
    }
    if draft {
        format!("Draft: {plain}")
    } else {
        plain.to_owned()
    }
}
fn normalize(data: &Value, forge: Forge) -> Result<RequestDetail> {
    let github = matches!(forge, Forge::Github);
    let request = if github {
        item(
            &json!({"number":data["number"],"title":data["title"],"body":data["body"],"author":{"login":data["user"]["login"]},"state":state(data,forge),"isDraft":is_draft(data),"headRefName":data["head"]["ref"],"baseRefName":data["base"]["ref"],"updatedAt":data["updated_at"],"url":data["html_url"],"labels":{"nodes":data["labels"]}}),
            forge,
        )?
    } else {
        item(data, forge)?
    };
    Ok(RequestDetail {
        request,
        head_oid: head(data, forge)?,
        merge_status: text(
            data,
            if github {
                "mergeable_state"
            } else {
                "detailed_merge_status"
            },
        ),
    })
}
pub fn read_request_detail(
    path: &str,
    remote: &str,
    forge: Forge,
    number: u64,
) -> Result<RequestDetail> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let client = Client::new(&repo, remote, forge)?;
    normalize(&client.metadata(number, &mut cli)?, forge)
}
fn normalize_file(data: &Value, forge: Forge) -> Result<RequestFile> {
    let github = matches!(forge, Forge::Github);
    let path = text(data, if github { "filename" } else { "new_path" });
    if path.is_empty() {
        bail!("平台回傳的變更檔案缺少路徑。");
    }
    let raw = data[if github { "patch" } else { "diff" }].as_str();
    let mut truncated =
        data["too_large"].as_bool() == Some(true) || data["collapsed"].as_bool() == Some(true);
    let patch = raw.filter(|p| !p.is_empty()).map(|patch| {
        let mut end = patch.len().min(PATCH_LIMIT);
        if let Some((line_end, _)) = patch.match_indices('\n').nth(10_000) {
            end = end.min(line_end);
        }
        while !patch.is_char_boundary(end) {
            end -= 1;
        }
        truncated |= end != patch.len();
        patch[..end].to_owned()
    });
    let previous = text(
        data,
        if github {
            "previous_filename"
        } else {
            "old_path"
        },
    );
    let kind = if github {
        text(data, "status")
    } else if data["new_file"].as_bool() == Some(true) {
        "added".into()
    } else if data["deleted_file"].as_bool() == Some(true) {
        "removed".into()
    } else if data["renamed_file"].as_bool() == Some(true) {
        "renamed".into()
    } else {
        "modified".into()
    };
    let counts = |sign| {
        let mut hunk = false;
        raw.unwrap_or_default()
            .lines()
            .filter(|line| {
                if line.starts_with("@@ ") {
                    hunk = true;
                }
                hunk && line.starts_with(sign)
            })
            .count()
    };
    Ok(RequestFile {
        path,
        previous_path: (!previous.is_empty()).then_some(previous),
        kind,
        additions: if github {
            data["additions"].as_u64().unwrap_or(0) as usize
        } else {
            counts('+')
        },
        deletions: if github {
            data["deletions"].as_u64().unwrap_or(0) as usize
        } else {
            counts('-')
        },
        patch,
        truncated,
    })
}
pub fn read_request_changes(
    path: &str,
    remote: &str,
    forge: Forge,
    number: u64,
    expected_head: &str,
    cursor: Option<&str>,
) -> Result<RequestChanges> {
    read_changes_with(path, remote, forge, number, expected_head, cursor, cli)
}

pub fn read_request_source(
    path: &str,
    remote: &str,
    forge: Forge,
    number: u64,
    expected_head: &str,
    file: &str,
) -> Result<super::PatchSource> {
    read_source_with(path, remote, forge, number, expected_head, file, cli)
}

fn read_source_with(
    path: &str,
    remote: &str,
    forge: Forge,
    number: u64,
    expected_head: &str,
    file: &str,
    mut runner: impl FnMut(&str, &[String], &Path, &str) -> Result<Value>,
) -> Result<super::PatchSource> {
    super::validate_file(file)?;
    if !file.to_lowercase().ends_with(".vue") {
        bail!("語法來源僅支援 Vue 檔案。");
    }
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let client = Client::new(&repo, remote, forge)?;
    let metadata = client.metadata(number, &mut runner)?;
    let oid = head(&metadata, forge)?;
    if oid != expected_head {
        bail!("來源分支已有新提交，請重新整理 PR／MR。");
    }
    let encoded = url::form_urlencoded::byte_serialize(file.as_bytes())
        .collect::<String>()
        .replace('+', "%20");
    let endpoint = if client.github() {
        let project = metadata["head"]["repo"]["full_name"]
            .as_str()
            .unwrap_or(&client.target.project);
        let source = target(&format!("https://{}/{project}", client.target.host), forge)?;
        format!("repos/{}/contents/{encoded}?ref={oid}", source.project)
    } else {
        let project = metadata["source_project_id"]
            .as_u64()
            .map(|id| format!("projects/{id}"))
            .unwrap_or_else(|| client.project());
        format!("{project}/repository/files/{encoded}?ref={oid}")
    };
    let data = client.call(&endpoint, "GET", &[], &mut runner)?;
    let content = data["content"].as_str().context("平台未提供檔案內容。")?;
    if data["encoding"].as_str() != Some("base64") || content.len() > PATCH_LIMIT * 2 {
        bail!("檔案編碼或大小不支援語法來源。");
    }
    let encoded: String = content
        .chars()
        .filter(|c| !c.is_ascii_whitespace())
        .collect();
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded)?;
    let source = super::syntax_source(&bytes).context("檔案過大或不是 UTF-8 文字。");
    Ok(super::PatchSource {
        old_source: None,
        new_source: Some(source?),
    })
}
fn read_changes_with(
    path: &str,
    remote: &str,
    forge: Forge,
    number: u64,
    expected_head: &str,
    cursor: Option<&str>,
    mut runner: impl FnMut(&str, &[String], &Path, &str) -> Result<Value>,
) -> Result<RequestChanges> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let client = Client::new(&repo, remote, forge)?;
    let page = cursor
        .map_or(Ok(1_u32), str::parse::<u32>)
        .context("無效的 changes 分頁。")?;
    if page == 0 || page == u32::MAX {
        bail!("無效的 changes 分頁。");
    }
    let oid = head(&client.metadata(number, &mut runner)?, forge)?;
    if oid != expected_head {
        bail!("來源分支已有新提交，請重新整理 PR／MR 後再瀏覽 Changes。");
    }
    let endpoint = format!(
        "{}/{}?per_page={PAGE_SIZE}&page={page}",
        client.endpoint(number)?,
        if matches!(forge, Forge::Github) {
            "files"
        } else {
            "diffs"
        }
    );
    let data = client.call(&endpoint, "GET", &[], &mut runner)?;
    let files = data.as_array().context("平台未回傳變更檔案清單。")?;
    if head(&client.metadata(number, &mut runner)?, forge)? != oid {
        bail!("讀取期間來源分支已有新提交，請重新整理 PR／MR。");
    }
    Ok(RequestChanges {
        files: files
            .iter()
            .map(|file| normalize_file(file, forge))
            .collect::<Result<_>>()?,
        head_oid: oid,
        next_cursor: (files.len() == PAGE_SIZE).then(|| (page + 1).to_string()),
    })
}
pub fn operate_request(
    path: &str,
    remote: &str,
    forge: Forge,
    action: RequestAction,
) -> Result<String> {
    let _guard = WRITES
        .try_lock()
        .map_err(|_| anyhow::anyhow!("另一個 PR／MR 操作正在執行，請稍後再試。"))?;
    operate_with(path, remote, forge, action, cli)
}
fn operate_with(
    path: &str,
    remote: &str,
    forge: Forge,
    action: RequestAction,
    mut runner: impl FnMut(&str, &[String], &Path, &str) -> Result<Value>,
) -> Result<String> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let client = Client::new(&repo, remote, forge)?;
    let github = client.github();
    let message = action.message.as_deref().unwrap_or("");
    if message.len() > 65_536 {
        bail!("內容不可超過 65,536 bytes。");
    }
    if matches!(action.operation, RequestOperation::Create) {
        let title = action.title.as_deref().unwrap_or("").trim();
        let source = action.source_branch.as_deref().unwrap_or("").trim();
        let target = action.target_branch.as_deref().unwrap_or("").trim();
        if title.is_empty()
            || title.len() > 500
            || source.is_empty()
            || target.is_empty()
            || source == target
        {
            bail!("請填寫標題與不同的來源／目標分支。");
        }
        let title = if !github && action.draft.unwrap_or(false) {
            format!("Draft: {title}")
        } else {
            title.into()
        };
        let mut fields = vec![
            ("title", title),
            (if github { "body" } else { "description" }, message.into()),
            (if github { "head" } else { "source_branch" }, source.into()),
            (if github { "base" } else { "target_branch" }, target.into()),
        ];
        fields.push(if github {
            ("draft", action.draft.unwrap_or(false).to_string())
        } else {
            ("remove_source_branch", "false".into())
        });
        let data = client.call(
            &format!(
                "{}/{}",
                client.project(),
                if github { "pulls" } else { "merge_requests" }
            ),
            "POST",
            &fields,
            &mut runner,
        )?;
        let number = data[if github { "number" } else { "iid" }]
            .as_u64()
            .context("平台未確認建立結果，請重新整理清單核對。")
            .map_err(|e| anyhow::anyhow!(e))?;
        return Ok(format!(
            "已建立 {}{}。",
            if github { "#" } else { "!" },
            number
        ));
    }
    let number = action
        .number
        .context("請選擇 PR／MR。")
        .map_err(|e| anyhow::anyhow!(e))?;
    let metadata = client.metadata(number, &mut runner)?;
    let oid = head(&metadata, forge)?;
    let state = state(&metadata, forge);
    if action.expected_head.as_deref() != Some(oid.as_str())
        || action.expected_state.as_deref() != Some(state.as_str())
    {
        bail!("PR／MR 的提交或狀態已變更，請重新整理後再執行操作。");
    }
    match action.operation {
        RequestOperation::Comment => {}
        RequestOperation::Reopen if state == "closed" => {}
        RequestOperation::Close
        | RequestOperation::Draft
        | RequestOperation::Ready
        | RequestOperation::Unapprove
            if state == "open" => {}
        RequestOperation::Approve | RequestOperation::RequestChanges | RequestOperation::Merge
            if state == "open" && !is_draft(&metadata) => {}
        _ => bail!("目前 PR／MR 狀態不允許此操作。"),
    }
    let endpoint = client.endpoint(number)?;
    if matches!(action.operation, RequestOperation::Merge) {
        let target = if github {
            text(&metadata["base"], "ref")
        } else {
            text(&metadata, "target_branch")
        };
        if action.expected_target.as_deref() != Some(target.as_str()) {
            bail!("合併目標分支已變更，請重新整理後再執行操作。");
        }
    }
    let (endpoint, method, fields) = match action.operation {
        RequestOperation::Comment => {
            if message.trim().is_empty() {
                bail!("請填寫留言。");
            }
            (
                if github {
                    format!("{}/issues/{number}/comments", client.project())
                } else {
                    format!("{endpoint}/notes")
                },
                "POST",
                vec![("body", message.into())],
            )
        }
        RequestOperation::Approve | RequestOperation::RequestChanges => {
            if !github && matches!(action.operation, RequestOperation::RequestChanges) {
                bail!("GitLab 請使用留言提出修改，或撤銷核准。");
            }
            if matches!(action.operation, RequestOperation::RequestChanges)
                && message.trim().is_empty()
            {
                bail!("要求修改時請填寫原因。");
            }
            (
                format!("{endpoint}/{}", if github { "reviews" } else { "approve" }),
                "POST",
                if github {
                    vec![
                        (
                            "event",
                            if matches!(action.operation, RequestOperation::Approve) {
                                "APPROVE"
                            } else {
                                "REQUEST_CHANGES"
                            }
                            .into(),
                        ),
                        ("commit_id", oid),
                        ("body", message.into()),
                    ]
                } else {
                    vec![("sha", oid)]
                },
            )
        }
        RequestOperation::Unapprove => {
            if github {
                bail!("GitHub 不支援這個撤銷核准操作。");
            }
            (format!("{endpoint}/unapprove"), "POST", vec![])
        }
        RequestOperation::Merge => {
            let method = action.merge_method.as_deref().unwrap_or("merge");
            if !["merge", "squash", "rebase"].contains(&method) || !github && method == "rebase" {
                bail!("不支援此合併方式。");
            }
            (
                format!("{endpoint}/merge"),
                "PUT",
                if github {
                    vec![("sha", oid), ("merge_method", method.into())]
                } else {
                    vec![
                        ("sha", oid),
                        ("squash", (method == "squash").to_string()),
                        ("should_remove_source_branch", "false".into()),
                    ]
                },
            )
        }
        RequestOperation::Close | RequestOperation::Reopen => (
            endpoint,
            if github { "PATCH" } else { "PUT" },
            vec![(
                if github { "state" } else { "state_event" },
                if matches!(action.operation, RequestOperation::Close) {
                    if github {
                        "closed"
                    } else {
                        "close"
                    }
                } else if github {
                    "open"
                } else {
                    "reopen"
                }
                .into(),
            )],
        ),
        RequestOperation::Draft | RequestOperation::Ready => {
            let draft = matches!(action.operation, RequestOperation::Draft);
            if github {
                let id = metadata["node_id"]
                    .as_str()
                    .context("平台未提供 PR ID。")
                    .map_err(|e| anyhow::anyhow!(e))?;
                let operation = if draft {
                    "convertPullRequestToDraft"
                } else {
                    "markPullRequestReadyForReview"
                };
                let query = format!("mutation($id:ID!){{{operation}(input:{{pullRequestId:$id}}){{pullRequest{{isDraft}}}}}}");
                let data = client.call(
                    "graphql",
                    "POST",
                    &[("query", query), ("id", id.into())],
                    &mut runner,
                )?;
                if data.get("errors").is_some()
                    || data["data"][operation]["pullRequest"]["isDraft"].as_bool() != Some(draft)
                {
                    bail!("GitHub 未確認草稿切換結果，請重新整理核對。");
                }
                return Ok("已更新草稿狀態。".into());
            }
            let title = draft_title(&text(&metadata, "title"), draft);
            (endpoint, "PUT", vec![("title", title)])
        }
        RequestOperation::Create => unreachable!(),
    };
    let data = client.call(&endpoint, method, &fields, &mut runner)?;
    if matches!(
        action.operation,
        RequestOperation::Draft | RequestOperation::Ready
    ) {
        let draft = data["draft"]
            .as_bool()
            .or_else(|| data["work_in_progress"].as_bool());
        if draft != Some(matches!(action.operation, RequestOperation::Draft)) {
            bail!("平台未確認草稿狀態已變更，請重新整理核對。");
        }
    }
    if matches!(action.operation, RequestOperation::Merge)
        && (if github {
            data["merged"].as_bool() != Some(true)
        } else {
            data["state"].as_str() != Some("merged")
        })
    {
        bail!(
            "平台未確認合併成功：{}。請重新整理核對結果。",
            text(&data, "message")
        );
    }
    Ok("PR／MR 操作已完成。".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        Repository::init(dir.path())
            .unwrap()
            .remote("origin", "https://code.example.com/group/repo.git")
            .unwrap();
        dir
    }
    fn metadata(forge: Forge) -> Value {
        if matches!(forge, Forge::Github) {
            json!({"number":7,"title":"PR title","body":"description","state":"open","draft":false,"merged":false,"node_id":"PR_id","user":{"login":"dev"},"head":{"sha":"a".repeat(40),"ref":"feature"},"base":{"ref":"main"},"labels":[{"name":"bug"}],"html_url":"https://code.example.com/group/repo/pull/7"})
        } else {
            json!({"iid":7,"title":"MR title","description":"description","state":"opened","draft":false,"sha":"a".repeat(40),"source_branch":"feature","target_branch":"main","author":{"username":"dev"},"labels":["bug"]})
        }
    }
    #[test]
    fn vue_source_reads_exact_head_from_forks_and_encodes_paths() {
        let dir = fixture();
        for forge in [Forge::Github, Forge::Gitlab] {
            let mut calls = 0;
            let source = read_source_with(
                dir.path().to_str().unwrap(), "origin", forge, 7, &"a".repeat(40), "src/元 件+.vue",
                |_, args, _, _| {
                    calls += 1;
                    assert_eq!(args[5], "GET");
                    if calls == 1 {
                        let mut meta = metadata(forge);
                        meta["head"]["repo"] = json!({"full_name":"contributor/fork"});
                        meta["source_project_id"] = json!(42);
                        return Ok(meta);
                    }
                    let project = if matches!(forge, Forge::Github) { "repos/contributor/fork/contents" } else { "projects/42/repository/files" };
                    assert_eq!(args[1], format!("{project}/src%2F%E5%85%83%20%E4%BB%B6%2B.vue?ref={}", "a".repeat(40)));
                    Ok(json!({"encoding":"base64","content":base64::engine::general_purpose::STANDARD.encode("<script setup lang=\"ts\">\nconst answer = 42;\n</script>")}))
                },
            ).unwrap();
            assert!(source.new_source.unwrap().contains("const answer = 42"));
            assert_eq!(calls, 2);
        }
    }

    #[test]
    fn vue_source_rejects_stale_heads_and_oversized_or_invalid_content() {
        let dir = fixture();
        let mut calls = 0;
        assert!(read_source_with(
            dir.path().to_str().unwrap(),
            "origin",
            Forge::Github,
            7,
            &"b".repeat(40),
            "App.vue",
            |_, _, _, _| {
                calls += 1;
                Ok(metadata(Forge::Github))
            }
        )
        .is_err());
        assert_eq!(calls, 1);
        for content in [vec![0_u8], vec![b'x'; PATCH_LIMIT + 1], vec![255]] {
            assert!(read_source_with(dir.path().to_str().unwrap(), "origin", Forge::Github, 7, &"a".repeat(40), "App.vue",
                |_, args, _, _| {
                    if args[1].contains("/contents/") {
                        Ok(json!({"encoding":"base64","content":base64::engine::general_purpose::STANDARD.encode(&content)}))
                    } else { Ok(metadata(Forge::Github)) }
                }).is_err());
        }
    }
    fn action(operation: &str) -> RequestAction {
        serde_json::from_value(json!({"operation":operation,"number":7,"expectedHead":"a".repeat(40),"expectedState":"open","expectedTarget":"main","message":"第一行\n第二行 @literal","mergeMethod":"squash"})).unwrap()
    }
    #[test]
    fn all_github_actions_use_exact_targets_commit_guards_and_literal_text() {
        let dir = fixture();
        for (operation, endpoint, method, field) in [
            (
                "comment",
                "repos/group/repo/issues/7/comments",
                "POST",
                "body=第一行\n第二行 @literal",
            ),
            (
                "approve",
                "repos/group/repo/pulls/7/reviews",
                "POST",
                "event=APPROVE",
            ),
            (
                "requestChanges",
                "repos/group/repo/pulls/7/reviews",
                "POST",
                "event=REQUEST_CHANGES",
            ),
            (
                "merge",
                "repos/group/repo/pulls/7/merge",
                "PUT",
                "merge_method=squash",
            ),
            ("close", "repos/group/repo/pulls/7", "PATCH", "state=closed"),
            ("reopen", "repos/group/repo/pulls/7", "PATCH", "state=open"),
            ("draft", "graphql", "POST", "id=PR_id"),
            ("ready", "graphql", "POST", "id=PR_id"),
        ] {
            let mut request = action(operation);
            let mut meta = metadata(Forge::Github);
            if operation == "reopen" {
                meta["state"] = json!("closed");
                request.expected_state = Some("closed".into());
            }
            if operation == "ready" {
                meta["draft"] = json!(true);
            }
            let mut calls = 0;
            operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                request,
                |program, args, _, host| {
                    assert_eq!(program, "gh");
                    assert_eq!(host, "code.example.com");
                    calls += 1;
                    if calls == 1 {
                        assert_eq!(args[5], "GET");
                        return Ok(meta.clone());
                    }
                    assert_eq!(args[1], endpoint);
                    assert_eq!(args[5], method);
                    assert!(args.contains(&field.into()));
                    assert!(!args
                        .iter()
                        .any(|arg| arg.contains("admin") || arg.contains("delete-branch")));
                    if ["approve", "requestChanges"].contains(&operation) {
                        assert!(args.contains(&format!("commit_id={}", "a".repeat(40))));
                    }
                    if operation == "merge" {
                        assert!(args.contains(&format!("sha={}", "a".repeat(40))));
                    }
                    if ["draft", "ready"].contains(&operation) {
                        let name = if operation == "draft" {
                            "convertPullRequestToDraft"
                        } else {
                            "markPullRequestReadyForReview"
                        };
                        return Ok(
                            json!({"data":{name:{"pullRequest":{"isDraft":operation == "draft"}}}}),
                        );
                    }
                    Ok(json!({"merged":true}))
                },
            )
            .unwrap();
            assert_eq!(calls, 2);
        }
    }
    #[test]
    fn all_gitlab_actions_use_encoded_paths_and_never_remove_source_branches() {
        let dir = fixture();
        let repo = Repository::open(dir.path()).unwrap();
        repo.remote_set_url("origin", "git@gitlab.example.com:group/sub/repo.git")
            .unwrap();
        for (operation, suffix, method, field) in [
            ("comment", "/notes", "POST", "body=第一行\n第二行 @literal"),
            ("approve", "/approve", "POST", ""),
            ("unapprove", "/unapprove", "POST", ""),
            ("merge", "/merge", "PUT", "squash=true"),
            ("close", "", "PUT", "state_event=close"),
            ("reopen", "", "PUT", "state_event=reopen"),
            ("draft", "", "PUT", "title=Draft: MR title"),
            ("ready", "", "PUT", "title=MR title"),
        ] {
            let mut request = action(operation);
            let mut meta = metadata(Forge::Gitlab);
            if operation == "reopen" {
                meta["state"] = json!("closed");
                request.expected_state = Some("closed".into());
            }
            if operation == "ready" {
                meta["draft"] = json!(true);
                meta["title"] = json!("Draft: MR title");
            }
            let mut calls = 0;
            operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Gitlab,
                request,
                |program, args, _, host| {
                    assert_eq!(program, "glab");
                    assert_eq!(host, "gitlab.example.com");
                    calls += 1;
                    if calls == 1 {
                        return Ok(meta.clone());
                    }
                    assert_eq!(
                        args[1],
                        format!("projects/group%2Fsub%2Frepo/merge_requests/7{suffix}")
                    );
                    assert_eq!(args[5], method);
                    if !field.is_empty() {
                        assert!(args.contains(&field.into()));
                    }
                    if ["merge", "approve"].contains(&operation) {
                        assert!(args.contains(&format!("sha={}", "a".repeat(40))));
                    }
                    if operation == "merge" {
                        assert!(args.contains(&"should_remove_source_branch=false".into()));
                    }
                    Ok(json!({"state":"merged", "draft":operation == "draft"}))
                },
            )
            .unwrap();
            assert_eq!(calls, 2);
        }
    }
    #[test]
    fn creates_remote_requests_without_pushing_or_modifying_git() {
        let dir = fixture();
        let config = std::fs::read(dir.path().join(".git/config")).unwrap();
        for forge in [Forge::Github, Forge::Gitlab] {
            let request = serde_json::from_value(json!({"operation":"create","title":"新功能","message":"第一行\n@literal","sourceBranch":"feature","targetBranch":"main","draft":true})).unwrap();
            operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                forge,
                request,
                |_, args, _, _| {
                    assert_eq!(args[5], "POST");
                    assert!(args.contains(&"--raw-field".into()));
                    if matches!(forge, Forge::Github) {
                        assert!(args.contains(&"head=feature".into()));
                        assert!(args.contains(&"draft=true".into()));
                        Ok(json!({"number":8}))
                    } else {
                        assert!(args.contains(&"source_branch=feature".into()));
                        assert!(args.contains(&"title=Draft: 新功能".into()));
                        Ok(json!({"iid":8}))
                    }
                },
            )
            .unwrap();
        }
        assert_eq!(
            std::fs::read(dir.path().join(".git/config")).unwrap(),
            config
        );
    }
    #[test]
    fn rejects_stale_commits_states_targets_drafts_and_invalid_methods_before_writes() {
        let dir = fixture();
        for case in ["head", "state", "target", "draft", "method"] {
            let mut request = action("merge");
            let mut meta = metadata(Forge::Github);
            match case {
                "head" => meta["head"]["sha"] = json!("b".repeat(40)),
                "state" => meta["state"] = json!("closed"),
                "target" => meta["base"]["ref"] = json!("release"),
                "draft" => meta["draft"] = json!(true),
                _ => request.merge_method = Some("invalid".into()),
            }
            let mut reads = 0;
            assert!(operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                request,
                |_, args, _, _| {
                    assert_eq!(args[5], "GET", "must not mutate for {case}");
                    reads += 1;
                    Ok(meta.clone())
                }
            )
            .is_err());
            assert_eq!(reads, 1);
        }
        for operation in ["comment", "requestChanges"] {
            let mut request = action(operation);
            request.message = Some("  ".into());
            assert!(operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                request,
                |_, args, _, _| {
                    assert_eq!(args[5], "GET");
                    Ok(metadata(Forge::Github))
                }
            )
            .is_err());
        }
    }
    #[test]
    fn changes_use_pagination_and_reject_commits_changed_during_reads() {
        let dir = fixture();
        for changed in [false, true] {
            let mut calls = 0;
            let result = read_changes_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                7,
                &"a".repeat(40),
                Some("2"),
                |_, args, _, _| {
                    calls += 1;
                    assert_eq!(args[5], "GET");
                    if calls == 2 {
                        assert!(args[1].ends_with("files?per_page=30&page=2"));
                        return Ok(json!((0..30).map(|i| json!({"filename":format!("file{i}"),"patch":"@@ -1 +1 @@\n-old\n+new","additions":1,"deletions":1})).collect::<Vec<_>>()));
                    }
                    let mut meta = metadata(Forge::Github);
                    if changed && calls == 3 {
                        meta["head"]["sha"] = json!("b".repeat(40));
                    }
                    Ok(meta)
                },
            );
            if changed {
                assert!(result.is_err());
            } else {
                let page = result.unwrap();
                assert_eq!(page.files.len(), 30);
                assert_eq!(page.next_cursor.as_deref(), Some("3"));
            }
        }
    }
    #[test]
    fn gitlab_ready_removes_supported_draft_markers_without_losing_the_title() {
        for title in [
            "Draft: Feature",
            "[Draft] Feature",
            "(Draft) Feature",
            "WIP: Feature",
            "[Draft] Draft: Feature",
        ] {
            assert_eq!(draft_title(title, false), "Feature");
            assert_eq!(draft_title(title, true), "Draft: Feature");
        }
        assert_eq!(draft_title("中文標題", false), "中文標題");
    }
    #[test]
    fn preserves_binary_renamed_utf8_and_truncated_diff_metadata() {
        let renamed = normalize_file(&json!({"new_path":"new.ts","old_path":"old.ts","renamed_file":true,"diff":"@@ -1 +1 @@\n---old\n+++new"}), Forge::Gitlab).unwrap();
        assert_eq!(renamed.kind, "renamed");
        assert_eq!(renamed.previous_path.as_deref(), Some("old.ts"));
        assert_eq!((renamed.additions, renamed.deletions), (1, 1));
        let binary = normalize_file(&json!({"filename":"image.png"}), Forge::Github).unwrap();
        assert!(binary.patch.is_none());
        let long = normalize_file(
            &json!({"filename":"long.ts","patch":"中".repeat(PATCH_LIMIT),"additions":1}),
            Forge::Github,
        )
        .unwrap();
        assert!(long.truncated);
        assert!(long.patch.as_ref().unwrap().len() <= PATCH_LIMIT);
        let many_lines = normalize_file(
            &json!({"filename":"lines.ts","patch":"+a\n".repeat(20_000)}),
            Forge::Github,
        )
        .unwrap();
        assert!(many_lines.truncated);
        assert!(many_lines.patch.unwrap().lines().count() <= 10_001);
    }
    #[test]
    fn merge_and_graphql_error_responses_never_claim_success() {
        let dir = fixture();
        for operation in ["merge", "draft"] {
            let mut calls = 0;
            assert!(operate_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                action(operation),
                |_, _, _, _| {
                    calls += 1;
                    Ok(if calls == 1 {
                        metadata(Forge::Github)
                    } else if operation == "merge" {
                        json!({"merged":false,"message":"blocked"})
                    } else {
                        json!({"errors":[{"message":"denied"}]})
                    })
                }
            )
            .is_err());
        }
    }
}
