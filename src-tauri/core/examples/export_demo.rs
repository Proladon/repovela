//! Generate an explicit browser demo from real Git data; never changes the input repo.
use repovela_core::{read_commit, read_patch, read_repository};
use std::collections::BTreeMap;

fn main() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    let source = args.get(1).expect("source repository path");
    let destination = args.get(2).expect("destination JSON path");
    let mut snapshot = read_repository(source, true, 35)?;
    let mut details = BTreeMap::new();
    let mut patches = BTreeMap::new();
    for row in &snapshot.rows {
        let Some(commit) = &row.commit else { continue };
        let detail = read_commit(source, &commit.oid)?;
        for file in detail.files.iter().take(4) {
            let patch = read_patch(source, Some(&commit.oid), &file.path, "commit")?;
            patches.insert(format!("{}:{}", commit.oid, file.path), patch);
        }
        details.insert(commit.oid.clone(), detail);
    }
    snapshot.project.path = "demo://keifu".into();
    snapshot.project.name = "keifu".into();
    snapshot.has_more = false;
    snapshot.working_files.clear();
    std::fs::write(
        destination,
        serde_json::to_string(&serde_json::json!({
            "snapshot": snapshot, "details": details, "patches": patches
        }))?,
    )?;
    Ok(())
}
