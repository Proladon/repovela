use super::change_requests::{cli, target, Forge};
use anyhow::{bail, Context, Result};
use git2::Repository;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBranches {
    pub branches: Vec<String>,
    pub default_branch: Option<String>,
}

pub fn read_request_branches(path: &str, remote: &str, forge: Forge) -> Result<RequestBranches> {
    read_with(path, remote, forge, cli)
}

fn read_with(
    path: &str,
    remote: &str,
    forge: Forge,
    mut run: impl FnMut(&str, &[String], &std::path::Path, &str) -> Result<Value>,
) -> Result<RequestBranches> {
    let repo = Repository::discover(path).context("找不到 Git 儲存庫。")?;
    let remote = repo.find_remote(remote).context("找不到選取的遠端。")?;
    let target = target(remote.url().context("此遠端沒有網址。")?, forge)?;
    let root = repo.workdir().unwrap_or(repo.path());
    let mut branches = BTreeSet::new();
    let mut default_branch = None;
    let mut cursor = None;
    let mut cursors = BTreeSet::new();
    for page in 1..=1000 {
        let (values, next) = match forge {
            Forge::Github => {
                let (owner, name) = target
                    .project
                    .split_once('/')
                    .context("無效的 GitHub 路徑。")?;
                let query = "query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){defaultBranchRef{name} refs(refPrefix:\"refs/heads/\",first:100,after:$cursor){nodes{name} pageInfo{hasNextPage endCursor}}}}";
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
                if let Some(cursor) = &cursor {
                    args.extend(["-f".into(), format!("cursor={cursor}")]);
                }
                let data = run("gh", &args, root, &target.host)?;
                if data.get("errors").is_some() {
                    bail!("GitHub 無法讀取分支，請確認專案權限與登入狀態。");
                }
                let repository = &data["data"]["repository"];
                default_branch = repository["defaultBranchRef"]["name"]
                    .as_str()
                    .map(str::to_owned);
                let connection = &repository["refs"];
                let values = connection["nodes"]
                    .as_array()
                    .context("GitHub 未回傳分支清單。")?
                    .clone();
                let next = if connection["pageInfo"]["hasNextPage"]
                    .as_bool()
                    .context("GitHub 未回傳分支分頁資訊。")?
                {
                    Some(
                        connection["pageInfo"]["endCursor"]
                            .as_str()
                            .context("GitHub 缺少分支下一頁游標。")?
                            .to_owned(),
                    )
                } else {
                    None
                };
                (values, next)
            }
            Forge::Gitlab => {
                let project = target.project.replace('/', "%2F");
                let data = run(
                    "glab",
                    &[
                        "api".into(),
                        format!("projects/{project}/repository/branches?per_page=100&page={page}"),
                        "--hostname".into(),
                        target.host.clone(),
                        "--method".into(),
                        "GET".into(),
                    ],
                    root,
                    &target.host,
                )?;
                let values = data.as_array().context("GitLab 未回傳分支清單。")?.clone();
                for value in &values {
                    if value["default"].as_bool() == Some(true) {
                        default_branch = value["name"].as_str().map(str::to_owned);
                    }
                }
                let next = (values.len() == 100).then(|| (page + 1).to_string());
                (values, next)
            }
        };
        for value in values {
            let name = value["name"]
                .as_str()
                .filter(|name| !name.is_empty())
                .context("平台分支缺少名稱。")?;
            branches.insert(name.to_owned());
        }
        if next.is_none() {
            return Ok(RequestBranches {
                branches: branches.into_iter().collect(),
                default_branch,
            });
        }
        if !cursors.insert(next.clone()) {
            bail!("平台分支分頁游標重複，請重試。");
        }
        cursor = next;
    }
    bail!("遠端分支數量超過讀取上限。");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn github_reads_all_pages_default_branch_and_selected_host_without_writes() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("upstream", "git@github.example.com:team/repo.git")
            .unwrap();
        let before = std::fs::read(repo.path().join("config")).unwrap();
        let mut calls = 0;
        let result = read_with(dir.path().to_str().unwrap(), "upstream", Forge::Github, |program, args, _, host| {
            calls += 1;
            assert_eq!(program, "gh");
            assert_eq!(host, "github.example.com");
            assert!(args.contains(&"owner=team".into()));
            assert!(args.contains(&"name=repo".into()));
            assert!(args.iter().any(|arg| arg.contains("refs/heads/")));
            assert!(!args.iter().any(|arg| arg.contains("mutation")));
            if calls == 1 {
                Ok(json!({"data":{"repository":{"defaultBranchRef":{"name":"develop"},"refs":{"nodes":[{"name":"feature/中文"},{"name":"develop"}],"pageInfo":{"hasNextPage":true,"endCursor":"next"}}}}}))
            } else {
                assert!(args.contains(&"cursor=next".into()));
                Ok(json!({"data":{"repository":{"defaultBranchRef":{"name":"develop"},"refs":{"nodes":[{"name":"develop"},{"name":"release/2.102"}],"pageInfo":{"hasNextPage":false}}}}}))
            }
        }).unwrap();
        assert_eq!(calls, 2);
        assert_eq!(
            result.branches,
            ["develop", "feature/中文", "release/2.102"]
        );
        assert_eq!(result.default_branch.as_deref(), Some("develop"));
        assert_eq!(std::fs::read(repo.path().join("config")).unwrap(), before);
    }

    #[test]
    fn gitlab_lists_all_pages_and_default_branch_for_encoded_subgroup() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("origin", "https://gitlab.example.com/group/sub/repo.git")
            .unwrap();
        let mut calls = 0;
        let result = read_with(
            dir.path().to_str().unwrap(),
            "origin",
            Forge::Gitlab,
            |program, args, _, host| {
                calls += 1;
                assert_eq!(program, "glab");
                assert_eq!(host, "gitlab.example.com");
                assert_eq!(args.last().unwrap(), "GET");
                assert_eq!(
                    args[1],
                    format!(
                        "projects/group%2Fsub%2Frepo/repository/branches?per_page=100&page={calls}"
                    )
                );
                if calls == 1 {
                    Ok(Value::Array(
                        (0..100)
                            .map(|i| json!({"name":format!("branch/{i}"),"default":i == 42}))
                            .collect(),
                    ))
                } else {
                    Ok(json!([]))
                }
            },
        )
        .unwrap();
        assert_eq!(calls, 2);
        assert_eq!(result.branches.len(), 100);
        assert_eq!(result.default_branch.as_deref(), Some("branch/42"));
    }

    #[test]
    fn rejects_errors_invalid_payloads_and_repeated_cursors() {
        let dir = tempfile::tempdir().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        repo.remote("origin", "https://github.com/team/repo.git")
            .unwrap();
        for data in [
            json!({"errors":[{"message":"denied"}]}),
            json!({"data":{"repository":null}}),
            json!({"data":{"repository":{"refs":{"nodes":[{}],"pageInfo":{"hasNextPage":false}}}}}),
            json!({"data":{"repository":{"refs":{"nodes":[],"pageInfo":{"hasNextPage":true}}}}}),
            json!({"data":{"repository":{"refs":{"nodes":[],"pageInfo":{"hasNextPage":true,"endCursor":"same"}}}}}),
        ] {
            assert!(read_with(
                dir.path().to_str().unwrap(),
                "origin",
                Forge::Github,
                |_, _, _, _| Ok(data.clone())
            )
            .is_err());
        }
        let empty = read_with(dir.path().to_str().unwrap(), "origin", Forge::Github, |_, _, _, _| Ok(json!({"data":{"repository":{"defaultBranchRef":null,"refs":{"nodes":[],"pageInfo":{"hasNextPage":false}}}}}))).unwrap();
        assert!(empty.branches.is_empty());
        assert!(empty.default_branch.is_none());
    }
}
