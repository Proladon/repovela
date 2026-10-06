use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use git2::{ErrorCode, Repository};
use serde::Serialize;

#[derive(Serialize)]
pub struct StashEntry {
    pub index: usize,
    pub oid: String,
    pub message: String,
    pub date: String,
}

pub(crate) fn list(repo: &Repository) -> Result<Vec<StashEntry>> {
    match repo.find_reference("refs/stash") {
        Ok(_) => {}
        Err(error) if error.code() == ErrorCode::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    }
    let reflog = repo.reflog("refs/stash").context("無法讀取 Stash 清單。")?;
    Ok(reflog
        .iter()
        .enumerate()
        .map(|(index, entry)| StashEntry {
            index,
            oid: entry.id_new().to_string(),
            message: entry.message().unwrap_or("未命名 Stash").to_owned(),
            date: DateTime::<Utc>::from_timestamp(entry.committer().when().seconds(), 0)
                .map(|date| date.to_rfc3339())
                .unwrap_or_default(),
        })
        .collect())
}

pub(crate) fn target(repo: &Repository, index: Option<usize>, oid: Option<&str>) -> Result<String> {
    let index = index.context("請選擇 Stash。")?;
    let oid = oid.context("請選擇 Stash。")?;
    if oid.len() != 40 || git2::Oid::from_str(oid).is_err() {
        bail!("Stash hash 無效。");
    }
    if !list(repo)?
        .iter()
        .any(|entry| entry.index == index && entry.oid == oid)
    {
        bail!("Stash 清單已變更，請重新整理並重新選擇。");
    }
    Ok(format!("stash@{{{index}}}"))
}
