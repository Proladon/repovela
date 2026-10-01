import { useEffect, useState } from 'react';
import { Check, ChevronLeft, Copy, FileCode2, Files, GitCommitHorizontal } from 'lucide-react';
import { api } from './api';
import type { CommitDetail, FilePatch, Snapshot } from './types';

export function Detail({
  path,
  selection,
  snapshot,
  revision,
}: {
  path: string;
  selection: string | null;
  snapshot: Snapshot;
  revision: number;
}) {
  const [detail, setDetail] = useState<{ key: string; data?: CommitDetail; error?: string }>({
    key: '',
  });
  const [file, setFile] = useState<{ path: string; area: string } | null>(null);
  const [patch, setPatch] = useState<{ key: string; data?: FilePatch; error?: string }>({
    key: '',
  });
  const [copied, setCopied] = useState(false);
  const worktree = selection === 'worktree';
  const detailKey = `${path}:${selection}`;
  const patchKey = `${detailKey}:${file?.area}:${file?.path}:${revision}`;

  useEffect(() => {
    let live = true;
    setFile(null);
    setCopied(false);
    if (selection && !worktree) {
      setDetail({ key: detailKey });
      api
        .commit(path, selection)
        .then((data) => {
          if (live) setDetail({ key: detailKey, data });
        })
        .catch((error) => {
          if (live) setDetail({ key: detailKey, error: String(error) });
        });
    }
    return () => {
      live = false;
    };
  }, [path, selection, worktree, detailKey]);

  useEffect(() => {
    if (!file || !selection) return;
    let live = true;
    setPatch({ key: patchKey });
    api
      .patch(path, worktree ? null : selection, file.path, file.area)
      .then((data) => {
        if (live) setPatch({ key: patchKey, data });
      })
      .catch((error) => {
        if (live) setPatch({ key: patchKey, error: String(error) });
      });
    return () => {
      live = false;
    };
  }, [file, patchKey, path, selection, worktree]);

  const current = detail.key === detailKey ? detail : { key: detailKey };
  const currentPatch = patch.key === patchKey ? patch : { key: patchKey };
  const commit = current.data?.commit;
  const copy = async () => {
    if (!commit) return;
    try {
      await navigator.clipboard.writeText(commit.oid);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!selection)
    return (
      <section className="detail-panel">
        <div className="detail-empty">
          <GitCommitHorizontal size={36} />
          <p>選擇一筆 commit，查看詳細資訊。</p>
        </div>
      </section>
    );
  return (
    <section className="detail-panel" aria-label="詳細資訊">
      <div className="panel-heading">
        <span>{file ? '檔案差異' : worktree ? '工作區變更' : 'Commit 詳細資訊'}</span>
        <span className="subtle">{worktree ? '唯讀' : commit?.shortId}</span>
      </div>
      {file ? (
        <>
          <div className="diff-heading">
            <button
              className="icon-button"
              title="返回檔案清單"
              aria-label="返回檔案清單"
              onClick={() => setFile(null)}
            >
              <ChevronLeft size={17} />
            </button>
            <FileCode2 size={15} />
            <span title={file.path}>{file.path}</span>
            <small>
              {file.area === 'staged' ? '已暫存' : file.area === 'unstaged' ? '未暫存' : 'commit'}
            </small>
          </div>
          {currentPatch.error ? (
            <div className="inline-error" role="alert">
              {currentPatch.error}
            </div>
          ) : !currentPatch.data ? (
            <div className="loading">讀取 diff…</div>
          ) : (
            <div className="diff-scroll">
              {currentPatch.data.binary ? (
                <div className="detail-empty">
                  <Files size={28} />
                  <p>二進位檔案無法顯示文字差異。</p>
                </div>
              ) : currentPatch.data.lines.length === 0 ? (
                <p className="empty-note">沒有文字差異，可能只有檔案權限或類型變更。</p>
              ) : (
                <div className="diff-code">
                  {currentPatch.data.lines.map((line, i) => (
                    <div
                      className={`diff-line ${line.kind === '+' ? 'addition' : line.kind === '-' ? 'deletion' : line.kind === 'H' ? 'hunk' : ''}`}
                      key={i}
                    >
                      <span className="line-number">{line.oldLine}</span>
                      <span className="line-number">{line.newLine}</span>
                      <span className="line-sign">
                        {['+', '-'].includes(line.kind) ? line.kind : ' '}
                      </span>
                      <code>{line.text || ' '}</code>
                    </div>
                  ))}
                </div>
              )}
              {currentPatch.data.truncated && (
                <div className="notice">diff 超過顯示上限（1 MB 或 10,000 行），已截斷顯示。</div>
              )}
            </div>
          )}
        </>
      ) : worktree ? (
        <div className="detail-scroll">
          <div className="commit-summary">
            <span className="eyebrow">WORKING TREE</span>
            <h2>尚未提交的變更</h2>
            <p className="subtle">{snapshot.workingFiles.length} 個檔案・瀏覽不會修改專案</p>
          </div>
          {(['staged', 'unstaged'] as const).map((area) => {
            const files = snapshot.workingFiles.filter((f) => f[area]);
            return (
              <div className="file-section" key={area}>
                <div className="section-heading">
                  <span>{area === 'staged' ? '已暫存' : '未暫存與未追蹤'}</span>
                  <span className="count">{files.length}</span>
                </div>
                {files.length ? (
                  files.map((f) => (
                    <button
                      className="file-row"
                      key={f.path}
                      onClick={() => setFile({ path: f.path, area })}
                    >
                      <FileCode2 size={15} />
                      <span title={f.path}>{f.path}</span>
                      <small className={f.conflict ? 'minus' : 'subtle'}>
                        {f.conflict ? '衝突' : f.untracked ? '新增' : '變更'}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="empty-note">沒有{area === 'staged' ? '已暫存' : '未暫存'}的變更</p>
                )}
              </div>
            );
          })}
        </div>
      ) : current.error ? (
        <div className="inline-error" role="alert">
          {current.error}
        </div>
      ) : !commit ? (
        <div className="loading">讀取 commit…</div>
      ) : (
        <div className="detail-scroll">
          <div className="commit-summary">
            <span className="eyebrow">COMMIT</span>
            <h2>{commit.message}</h2>
            <div className="author-line">
              <div className="avatar">{commit.author.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{commit.author}</strong>
                <span className="subtle">{new Date(commit.date).toLocaleString('zh-TW')}</span>
              </div>
            </div>
            <div className="metadata">
              <span>SHA</span>
              <button className="hash-copy" onClick={copy} title="複製完整 commit hash">
                <code>{commit.shortId}</code>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <span>父 commit</span>
              <code>
                {commit.parents.length
                  ? commit.parents.map((p) => p.slice(0, 7)).join(', ')
                  : '初始 commit'}
              </code>
            </div>
            {commit.fullMessage.trim() !== commit.message.trim() && (
              <pre className="commit-body">
                {commit.fullMessage.split('\n').slice(1).join('\n').trim()}
              </pre>
            )}
          </div>
          <div className="file-section">
            <div className="section-heading">
              <span>變更的檔案</span>
              <span className="count">{current.data!.totalFiles}</span>
              <span className="diff-totals">
                <span className="plus">
                  +{current.data!.files.reduce((n, f) => n + f.insertions, 0)}
                </span>
                <span className="minus">
                  −{current.data!.files.reduce((n, f) => n + f.deletions, 0)}
                </span>
              </span>
            </div>
            {current.data!.files.map((f) => (
              <button
                className="file-row"
                key={f.path}
                onClick={() => setFile({ path: f.path, area: 'commit' })}
              >
                <span
                  className={`file-kind ${f.kind === 'Added' ? 'plus' : f.kind === 'Deleted' ? 'minus' : ''}`}
                >
                  {f.kind.slice(0, 1)}
                </span>
                <span title={f.path}>{f.path}</span>
                {f.binary ? (
                  <small>二進位</small>
                ) : (
                  <small>
                    <span className="plus">+{f.insertions}</span>{' '}
                    <span className="minus">−{f.deletions}</span>
                  </small>
                )}
              </button>
            ))}
            {current.data!.totalFiles > current.data!.files.length && (
              <p className="notice">僅顯示前 1,000 個變更檔案。</p>
            )}
            {!current.data!.files.length && (
              <p className="empty-note">這筆 commit 沒有檔案變更。</p>
            )}
            {commit.parents.length > 1 && (
              <p className="empty-note">Merge commit 的差異以第一個父 commit 為基準。</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
