use anyhow::{bail, Context, Result};
use git2::Repository;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use url::Url;

const PAGE_SIZE: usize = 30;
const OUTPUT_LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Forge {
    Github,
    Gitlab,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequestState {
    Open,
    Closed,
    Merged,
    All,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRequest {
    number: u64,
    title: String,
    body: String,
    author: String,
    state: String,
    draft: bool,
    source_branch: String,
    target_branch: String,
    updated_at: String,
    url: String,
    labels: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRequestPage {
    items: Vec<ChangeRequest>,
    next_cursor: Option<String>,
}

pub(super) struct Target {
    pub(super) host: String,
    pub(super) project: String,
}

pub(super) fn target(remote: &str, forge: Forge) -> Result<Target> {
    let remote = remote.trim();
    if remote.chars().any(char::is_control) {
        bail!("遠端網址包含無效字元。");
    }
    let parsed = if !remote.contains("://") {
        let (host, path) = remote
            .split_once(':')
            .context("此遠端沒有可用的網站網址。")?;
        let host = host.rsplit_once('@').map_or(host, |(_, host)| host);
        Url::parse(&format!("ssh://{host}/{path}"))?
    } else {
        Url::parse(remote)?
    };
    if !["http", "https", "ssh", "git"].contains(&parsed.scheme()) {
        bail!("PR／MR 需要 GitHub 或 GitLab 的遠端網址。");
    }
    let host = parsed.host_str().context("遠端缺少主機名稱。")?;
    let project = parsed.path().trim_matches('/').trim_end_matches(".git");
    let segments: Vec<_> = project.split('/').collect();
    if segments.len() < 2
        || segments.iter().any(|s| {
            s.is_empty()
                || !s
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                || *s == "."
                || *s == ".."
        })
        || matches!(forge, Forge::Github) && segments.len() != 2
    {
        bail!("無法辨識遠端專案路徑，GitHub 需 owner/repo，GitLab 可包含子群組。");
    }
    // SSH 的連接埠與網站不同；HTTP(S) 才保留自訂連接埠。
    let host = if matches!(parsed.scheme(), "http" | "https") {
        parsed
            .port()
            .map_or_else(|| host.to_owned(), |port| format!("{host}:{port}"))
    } else {
        host.to_owned()
    };
    Ok(Target {
        host,
        project: project.to_owned(),
    })
}

pub(super) fn cli(
    program: &str,
    args: &[String],
    root: &std::path::Path,
    host: &str,
) -> Result<Value> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GH_PROMPT_DISABLED", "1")
        .env("NO_COLOR", "1")
        .env("GLAB_CHECK_UPDATE", "false");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().with_context(|| {
        format!("無法啟動 {program}，請安裝並加入 PATH，再執行 `{program} auth login --hostname {host}`。")
    })?;
    let stdout = child.stdout.take().context("無法讀取 CLI 輸出。")?;
    let stderr = child.stderr.take().context("無法讀取 CLI 錯誤。")?;
    let read = |stream: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            stream
                .take(OUTPUT_LIMIT + 1)
                .read_to_end(&mut bytes)
                .map(|_| bytes)
        })
    };
    let stdout = read(Box::new(stdout));
    let stderr = read(Box::new(stderr));
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if start.elapsed() < Duration::from_secs(45) => {
                thread::sleep(Duration::from_millis(25))
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(anyhow::anyhow!(
                    "Git 平台請求逾時；若剛執行操作，請重新整理核對遠端結果後再試。"
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error.into());
            }
        }
    };
    let stdout = stdout
        .join()
        .map_err(|_| anyhow::anyhow!("讀取 CLI 輸出失敗。"))??;
    let stderr = stderr
        .join()
        .map_err(|_| anyhow::anyhow!("讀取 CLI 錯誤失敗。"))??;
    let status = status?;
    if stdout.len() as u64 > OUTPUT_LIMIT || stderr.len() as u64 > OUTPUT_LIMIT {
        bail!("PR／MR 回應過大，請縮小篩選範圍。");
    }
    if !status.success() {
        bail!("Git 平台請求失敗。請確認網路、專案權限與 `{program} auth login --hostname {host}` 登入狀態。\n{}", String::from_utf8_lossy(&stderr).trim());
    }
    serde_json::from_slice(&stdout).context("Git 平台回傳了無效的 JSON。")
}

fn string(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_owned()
}

pub(super) fn item(value: &Value, forge: Forge) -> Result<ChangeRequest> {
    let github = matches!(forge, Forge::Github);
    let number = value[if github { "number" } else { "iid" }]
        .as_u64()
        .context("PR／MR 缺少編號。")?;
    let state = string(value, "state").to_lowercase();
    let labels = if github {
        &value["labels"]["nodes"]
    } else {
        &value["labels"]
    };
    Ok(ChangeRequest {
        number,
        title: string(value, "title"),
        body: string(value, if github { "body" } else { "description" }),
        author: string(&value["author"], if github { "login" } else { "username" }),
        state: if state == "opened" {
            "open".into()
        } else {
            state
        },
        draft: value[if github { "isDraft" } else { "draft" }]
            .as_bool()
            .unwrap_or(false)
            || (!github && value["work_in_progress"].as_bool().unwrap_or(false)),
        source_branch: string(
            value,
            if github {
                "headRefName"
            } else {
                "source_branch"
            },
        ),
        target_branch: string(
            value,
            if github {
                "baseRefName"
            } else {
                "target_branch"
            },
        ),
        updated_at: string(value, if github { "updatedAt" } else { "updated_at" }),
        url: string(value, if github { "url" } else { "web_url" }),
        labels: labels
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|label| {
                if github {
                    label["name"].as_str()
                } else {
                    label.as_str()
                }
            })
            .map(str::to_owned)
            .collect(),
    })
}

pub fn read_change_requests(
    path: &str,
    remote: &str,
    forge: Forge,
    state: RequestState,
    cursor: Option<&str>,
) -> Result<ChangeRequestPage> {
    read_with(path, remote, forge, state, cursor, cli)
}

fn read_with(
    path: &str,
    remote: &str,
    forge: Forge,
    state: RequestState,
    cursor: Option<&str>,
    mut run: impl FnMut(&str, &[String], &std::path::Path, &str) -> Result<Value>,
) -> Result<ChangeRequestPage> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let remote = repo
        .find_remote(remote)
        .context("找不到選取的遠端，請重新整理專案。")?;
    let target = target(remote.url().context("此遠端沒有網址。")?, forge)?;
    let root = repo.workdir().unwrap_or(repo.path());
    let (values, next_cursor) = match forge {
        Forge::Github => {
            let (owner, name) = target
                .project
                .split_once('/')
                .context("無效的 GitHub 路徑。")?;
            let states = match state {
                RequestState::Open => "OPEN",
                RequestState::Closed => "CLOSED",
                RequestState::Merged => "MERGED",
                RequestState::All => "OPEN,CLOSED,MERGED",
            };
            let query = format!("query($owner:String!,$name:String!,$cursor:String){{repository(owner:$owner,name:$name){{pullRequests(first:{PAGE_SIZE},after:$cursor,states:[{states}],orderBy:{{field:UPDATED_AT,direction:DESC}}){{nodes{{number title body author{{login}} state isDraft headRefName baseRefName updatedAt url labels(first:20){{nodes{{name}}}}}} pageInfo{{hasNextPage endCursor}}}}}}}}");
            let mut args = vec![
                "api".into(),
                "graphql".into(),
                "--hostname".into(),
                target.host.clone(),
                "-f".into(),
                format!("query={query}"),
                "-f".into(),
                format!("owner={owner}"),
                "-f".into(),
                format!("name={name}"),
            ];
            if let Some(cursor) = cursor {
                args.extend(["-f".into(), format!("cursor={cursor}")]);
            }
            let data = run("gh", &args, root, &target.host)?;
            if data.get("errors").is_some() {
                bail!("GitHub 無法讀取 PR，請確認專案權限與登入狀態。");
            }
            let connection = &data["data"]["repository"]["pullRequests"];
            let values = connection["nodes"]
                .as_array()
                .context("GitHub 未回傳 PR 清單。")?
                .clone();
            let next = if connection["pageInfo"]["hasNextPage"].as_bool() == Some(true) {
                Some(
                    connection["pageInfo"]["endCursor"]
                        .as_str()
                        .context("GitHub 缺少下一頁游標。")?
                        .to_owned(),
                )
            } else {
                None
            };
            (values, next)
        }
        Forge::Gitlab => {
            let page = cursor
                .map_or(Ok(1_u32), str::parse::<u32>)
                .context("無效的 MR 分頁。")?;
            if page == 0 || page == u32::MAX {
                bail!("無效的 MR 分頁。");
            }
            let state = match state {
                RequestState::Open => "opened",
                RequestState::Closed => "closed",
                RequestState::Merged => "merged",
                RequestState::All => "all",
            };
            let project = target.project.replace('/', "%2F");
            let endpoint = format!("projects/{project}/merge_requests?scope=all&state={state}&order_by=updated_at&sort=desc&per_page={PAGE_SIZE}&page={page}");
            let data = run(
                "glab",
                &[
                    "api".into(),
                    endpoint,
                    "--hostname".into(),
                    target.host.clone(),
                    "--method".into(),
                    "GET".into(),
                ],
                root,
                &target.host,
            )?;
            let values = data.as_array().context("GitLab 未回傳 MR 清單。")?.clone();
            let next = (values.len() == PAGE_SIZE).then(|| (page + 1).to_string());
            (values, next)
        }
    };
    Ok(ChangeRequestPage {
        items: values
            .iter()
            .map(|value| item(value, forge))
            .collect::<Result<_>>()?,
        next_cursor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_filters_and_cursors_use_the_selected_remote_without_writes() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("origin", "https://github.com/other/project.git")
            .unwrap();
        repo.remote("upstream", "git@github.example.com:team/repo.git")
            .unwrap();
        let before = std::fs::read(repo.path().join("config")).unwrap();
        for (state, states) in [
            (RequestState::Open, "OPEN"),
            (RequestState::Closed, "CLOSED"),
            (RequestState::Merged, "MERGED"),
            (RequestState::All, "OPEN,CLOSED,MERGED"),
        ] {
            let result = read_with(dir.path().to_str().unwrap(), "upstream", Forge::Github, state, Some("previous"), |program, args, _, host| {
                assert_eq!(program, "gh");
                assert_eq!(host, "github.example.com");
                assert!(args.contains(&"owner=team".into()));
                assert!(args.contains(&"name=repo".into()));
                assert!(args.contains(&"cursor=previous".into()));
                let query = args.iter().find(|arg| arg.starts_with("query=")).unwrap();
                assert!(query.contains(&format!("states:[{states}]")));
                assert!(!query.contains("mutation"));
                Ok(serde_json::json!({"data":{"repository":{"pullRequests":{"nodes":[{"number":7,"state":"MERGED"}],"pageInfo":{"hasNextPage":true,"endCursor":"next"}}}}}))
            }).unwrap();
            assert_eq!(result.items[0].number, 7);
            assert_eq!(result.next_cursor.as_deref(), Some("next"));
        }
        assert_eq!(std::fs::read(repo.path().join("config")).unwrap(), before);
    }

    #[test]
    fn gitlab_encodes_subgroups_uses_get_and_advances_only_full_pages() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("origin", "https://gitlab.example.com/group/sub/repo.git")
            .unwrap();
        for (state, expected_state) in [
            (RequestState::Open, "opened"),
            (RequestState::Closed, "closed"),
            (RequestState::Merged, "merged"),
            (RequestState::All, "all"),
        ] {
            let result = read_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Gitlab,
                state,
                Some("2"),
                |program, args, _, host| {
                    assert_eq!(program, "glab");
                    assert_eq!(host, "gitlab.example.com");
                    assert!(
                        args[1].starts_with("projects/group%2Fsub%2Frepo/merge_requests?scope=all")
                    );
                    assert!(args[1].contains(&format!("state={expected_state}")));
                    assert!(args[1].contains("per_page=30&page=2"));
                    assert_eq!(args.last().unwrap(), "GET");
                    Ok(Value::Array(
                        (1..=30)
                            .map(|number| serde_json::json!({"iid":number,"state":"opened"}))
                            .collect(),
                    ))
                },
            )
            .unwrap();
            assert_eq!(result.items.len(), 30);
            assert_eq!(result.next_cursor.as_deref(), Some("3"));
        }
        let result = read_with(
            dir.path().to_str().unwrap(),
            "origin",
            Forge::Gitlab,
            RequestState::Open,
            None,
            |_, _, _, _| Ok(serde_json::json!([])),
        )
        .unwrap();
        assert!(result.items.is_empty());
        assert!(result.next_cursor.is_none());
        for cursor in ["0", "-1", "invalid"] {
            assert!(read_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Gitlab,
                RequestState::Open,
                Some(cursor),
                |_, _, _, _| panic!("invalid pagination must not call CLI")
            )
            .is_err());
        }
    }

    #[test]
    fn malformed_api_responses_are_errors_instead_of_empty_lists() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("origin", "https://github.com/team/repo.git")
            .unwrap();
        for data in [
            serde_json::json!({"errors":[{"message":"denied"}]}),
            serde_json::json!({"data":{"repository":null}}),
            serde_json::json!({"data":{"repository":{"pullRequests":{"nodes":[],"pageInfo":{"hasNextPage":true}}}}}),
        ] {
            assert!(read_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                RequestState::Open,
                None,
                |_, _, _, _| Ok(data.clone())
            )
            .is_err());
        }
        assert!(read_with(
            dir.path().to_str().unwrap(),
            "origin",
            Forge::Gitlab,
            RequestState::Open,
            None,
            |_, _, _, _| Ok(serde_json::json!({"message":"denied"}))
        )
        .is_err());
    }

    #[test]
    fn remote_targets_support_ssh_https_and_gitlab_subgroups() {
        let github = target("git@github.com:team/repo.git", Forge::Github).unwrap();
        assert_eq!(
            (github.host.as_str(), github.project.as_str()),
            ("github.com", "team/repo")
        );
        let gitlab = target(
            "ssh://git@gitlab.example.com:2222/group/sub/repo.git",
            Forge::Gitlab,
        )
        .unwrap();
        assert_eq!(
            (gitlab.host.as_str(), gitlab.project.as_str()),
            ("gitlab.example.com", "group/sub/repo")
        );
        assert_eq!(
            target(
                "https://gitlab.example.com:8443/team/repo.git",
                Forge::Gitlab
            )
            .unwrap()
            .host,
            "gitlab.example.com:8443"
        );
        assert!(target("C:\\repos\\test", Forge::Github).is_err());
        assert!(target("file:///team/repo", Forge::Gitlab).is_err());
        assert!(target("https://github.com/team/repo/extra", Forge::Github).is_err());
        assert!(target("https://github.com/team/repo\n", Forge::Github).is_ok());
        assert!(target("https://github.com/team/re\npo", Forge::Github).is_err());
    }

    #[test]
    fn normalizes_both_platforms_and_missing_authors() {
        let github = item(&serde_json::json!({"number":7,"title":"PR","state":"MERGED","isDraft":true,"author":null,"labels":{"nodes":[{"name":"bug"}]}}), Forge::Github).unwrap();
        assert_eq!(github.state, "merged");
        assert!(github.draft);
        assert_eq!(github.author, "");
        assert_eq!(github.labels, ["bug"]);
        let gitlab = item(&serde_json::json!({"id":999,"iid":8,"state":"opened","description":null,"author":{"username":"dev"},"work_in_progress":true,"labels":["feature"]}), Forge::Gitlab).unwrap();
        assert_eq!(gitlab.number, 8);
        assert_eq!(gitlab.state, "open");
        assert_eq!(gitlab.author, "dev");
        assert!(gitlab.body.is_empty());
        assert!(gitlab.draft);
        assert_eq!(gitlab.labels, ["feature"]);
        assert!(item(&serde_json::json!({}), Forge::Github).is_err());
    }

    #[test]
    fn rejects_missing_remote_before_running_cli_without_writing_repo() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let before = std::fs::read(repo.path().join("config")).unwrap();
        assert!(read_change_requests(
            dir.path().to_str().unwrap(),
            "origin",
            Forge::Github,
            RequestState::Open,
            None
        )
        .is_err());
        assert_eq!(std::fs::read(repo.path().join("config")).unwrap(), before);
    }
}
