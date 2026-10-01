import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Layers3,
  MoreHorizontal,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { api, chooseProjects, demo, native } from './api';
import { Detail } from './Detail';
import { Graph } from './Graph';
import { emptySession, restoreSession, sessionReducer, STORAGE_KEY } from './session';
import type { Snapshot } from './types';

const displayDate = (date: string) =>
  new Date(date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });

export default function App() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, () => {
    try {
      return restoreSession(localStorage.getItem(demo ? `${STORAGE_KEY}-demo` : STORAGE_KEY));
    } catch {
      return emptySession;
    }
  });
  const [resource, setResource] = useState<{
    key: string;
    data?: Snapshot;
    error?: string;
    loading: boolean;
  }>({ key: '', loading: false });
  const [refresh, setRefresh] = useState(0);
  const [projectSearch, setProjectSearch] = useState('');
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [pathDialog, setPathDialog] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const [projectMenu, setProjectMenu] = useState<string | null>(null);
  const [rename, setRename] = useState<{ path: string; name: string } | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const [help, setHelp] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const tab = session.tabs.find((t) => t.path === session.active);
  const project = session.projects.find((p) => p.path === session.active);
  const key = tab ? `${tab.path}:${tab.remotes}:${tab.limit}` : '';
  const snapshot = resource.key === key ? resource.data : undefined;
  const error = resource.key === key ? resource.error : undefined;
  const loading = !!tab && (resource.key !== key || resource.loading);
  const query = tab ? (queries[tab.path] ?? '') : '';
  const queryLower = query.trim().toLowerCase();
  const matches =
    snapshot?.rows
      .filter(
        (r) =>
          r.commit &&
          (!queryLower ||
            [r.commit.message, r.commit.author, r.commit.oid, ...r.branches, ...r.tags].some((v) =>
              v.toLowerCase().includes(queryLower),
            )),
      )
      .map((r) => r.commit!.oid) ?? [];

  useEffect(() => {
    try {
      localStorage.setItem(demo ? `${STORAGE_KEY}-demo` : STORAGE_KEY, JSON.stringify(session));
    } catch {
      setMessage('無法儲存分頁狀態，請確認應用程式資料空間。');
    }
  }, [session]);

  useEffect(() => {
    if (!tab) return;
    let live = true;
    setResource((prev) => ({ key, data: prev.key === key ? prev.data : undefined, loading: true }));
    api
      .repository(tab.path, tab.remotes, tab.limit)
      .then((data) => {
        if (live) setResource({ key, data, loading: false });
      })
      .catch((err) => {
        if (live) setResource({ key, error: String(err), loading: false });
      });
    return () => {
      live = false;
    };
  }, [key, refresh, tab?.path, tab?.remotes, tab?.limit]);

  useEffect(() => {
    if (!tab || !snapshot) return;
    if (tab.selection === 'worktree') return;
    if (tab.selection && snapshot.rows.some((r) => r.commit?.oid === tab.selection)) return;
    const selection =
      snapshot.headOid && snapshot.rows.some((r) => r.commit?.oid === snapshot.headOid)
        ? snapshot.headOid
        : (snapshot.rows.find((r) => r.commit)?.commit?.oid ??
          (snapshot.workingFiles.length ? 'worktree' : null));
    if (selection !== tab.selection)
      dispatch({ type: 'tab', path: tab.path, patch: { selection } });
  }, [snapshot, tab]);

  useEffect(() => {
    if (!tab) return;
    const onFocus = () => setRefresh((r) => r + 1);
    const interval = setInterval(() => {
      if (!document.hidden) onFocus();
    }, 30000);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [tab?.path]);

  useEffect(() => {
    const pane = historyRef.current;
    if (pane && tab) pane.scrollTop = scrollPositions.current[tab.path] ?? 0;
    setBranchMenu(false);
    setProjectMenu(null);
  }, [tab?.path, !!snapshot]);

  const select = useCallback(
    (oid: string, scroll = false) => {
      if (!tab) return;
      dispatch({ type: 'tab', path: tab.path, patch: { selection: oid } });
      if (scroll)
        requestAnimationFrame(() => {
          document.getElementById(`commit-${oid}`)?.scrollIntoView({ block: 'nearest' });
        });
    },
    [tab?.path],
  );

  const addPaths = async (paths: string[]) => {
    setAdding(true);
    const errors: string[] = [];
    for (const path of paths) {
      try {
        dispatch({ type: 'add', project: await api.openProject(path.trim()) });
      } catch (e) {
        errors.push(`${path}：${String(e)}`);
      }
    }
    setAdding(false);
    if (errors.length) setMessage(errors.join('\n'));
    else {
      setPathDialog(false);
      setInputPath('');
    }
  };
  const addProject = async () => {
    if (!native && !demo) {
      setMessage('請以 Tauri 桌面版啟動，才能讀取電腦上的 Git 專案。');
      return;
    }
    if (demo) {
      setInputPath(session.projects.length ? 'demo://另一個專案' : 'demo://keifu');
      setPathDialog(true);
      return;
    }
    try {
      const paths = await chooseProjects();
      if (paths.length) await addPaths(paths);
    } catch (e) {
      setMessage(String(e));
    }
  };

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const editing =
        e.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void addProject();
      }
      if (modifier && e.key.toLowerCase() === 'w' && tab) {
        e.preventDefault();
        dispatch({ type: 'close', path: tab.path });
      }
      if (modifier && e.key === 'Tab' && session.tabs.length) {
        e.preventDefault();
        const i = session.tabs.findIndex((t) => t.path === session.active);
        dispatch({
          type: 'activate',
          path: session.tabs[
            (i + (e.shiftKey ? -1 : 1) + session.tabs.length) % session.tabs.length
          ].path,
        });
      }
      if (modifier && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('history-search')?.focus();
      }
      if (e.key === 'Escape') {
        setBranchMenu(false);
        setProjectMenu(null);
        setPathDialog(false);
        setRename(null);
        setHelp(false);
      }
      if (
        !editing &&
        !modifier &&
        !e.altKey &&
        tab &&
        snapshot &&
        !help &&
        !pathDialog &&
        !rename
      ) {
        if (e.key.toLowerCase() === 'r') setRefresh((r) => r + 1);
        if (e.key === '@' && snapshot.headOid) select(snapshot.headOid, true);
        if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          const commits = snapshot.rows.flatMap((r) => (r.commit ? [r.commit.oid] : []));
          const i = commits.indexOf(tab.selection ?? '');
          const next =
            commits[
              Math.max(
                0,
                Math.min(commits.length - 1, i + (e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1)),
              )
            ];
          if (next) select(next, true);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  const visibleProjects = session.projects.filter((p) =>
    `${p.name} ${p.path}`.toLowerCase().includes(projectSearch.toLowerCase()),
  );
  const renderProject = (p: (typeof session.projects)[number]) => (
    <div className={`project-item ${p.path === session.active ? 'active' : ''}`} key={p.path}>
      <button
        className="project-open"
        title={p.path}
        onClick={() => dispatch({ type: 'open', path: p.path })}
      >
        <FolderGit2 size={17} />
        <span>{p.name}</span>
        {p.pinned && <Pin size={11} />}
      </button>
      <button
        className="project-more icon-button"
        aria-label={`${p.name} 專案選單`}
        onClick={() => setProjectMenu(projectMenu === p.path ? null : p.path)}
      >
        <MoreHorizontal size={15} />
      </button>
      {projectMenu === p.path && (
        <>
          <div className="dismiss" onClick={() => setProjectMenu(null)} />
          <div className="project-menu popover">
            <button
              onClick={() => {
                dispatch({ type: 'pin', path: p.path });
                setProjectMenu(null);
              }}
            >
              {p.pinned ? '取消釘選' : '釘選專案'}
            </button>
            <button
              onClick={() => {
                setRename({ path: p.path, name: p.name });
                setProjectMenu(null);
              }}
            >
              重新命名
            </button>
            <button
              onClick={() => {
                setInputPath(p.path);
                setMessage(p.path);
                setProjectMenu(null);
              }}
            >
              查看路徑
            </button>
            <button
              className="minus"
              onClick={() => {
                dispatch({ type: 'remove', path: p.path });
                setProjectMenu(null);
              }}
            >
              從清單移除
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={22} />
          </div>
          <div>
            <strong>Repovela</strong>
            <small>讓專案各就各位</small>
          </div>
        </div>
        <button className="add-project" onClick={() => void addProject()} disabled={adding}>
          <Plus size={16} />
          {adding ? '加入中…' : '加入專案'}
          <kbd>Ctrl O</kbd>
        </button>
        <label className="project-search">
          <Search size={14} />
          <input
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            placeholder="搜尋專案"
            aria-label="搜尋專案"
          />
        </label>
        <div className="project-library">
          {visibleProjects.some((p) => p.pinned) && (
            <>
              <div className="library-label">
                <Pin size={12} />
                已釘選
              </div>
              {visibleProjects.filter((p) => p.pinned).map(renderProject)}
            </>
          )}
          <div className="library-label">
            <FolderOpen size={12} />
            專案<span>{visibleProjects.filter((p) => !p.pinned).length}</span>
          </div>
          {visibleProjects.filter((p) => !p.pinned).map(renderProject)}
          {!session.projects.length && (
            <p className="library-empty">
              加入常用的 Git 專案，
              <br />
              下次開啟就能接著看。
            </p>
          )}
          {!!session.projects.length && !visibleProjects.length && (
            <p className="library-empty">找不到符合的專案。</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          本機・唯讀
          <button
            className="icon-button"
            title="快捷鍵與關於"
            aria-label="快捷鍵與關於"
            onClick={() => setHelp(true)}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="tabs" role="tablist" aria-label="專案分頁">
          {session.tabs.map((t) => (
            <div className={`tab ${session.active === t.path ? 'selected' : ''}`} key={t.path}>
              <button
                role="tab"
                aria-selected={session.active === t.path}
                title={t.path}
                onClick={() => dispatch({ type: 'activate', path: t.path })}
              >
                <FolderGit2 size={14} />
                <span>{session.projects.find((p) => p.path === t.path)?.name}</span>
              </button>
              <button
                className="tab-close icon-button"
                aria-label={`關閉 ${session.projects.find((p) => p.path === t.path)?.name} 分頁`}
                onClick={() => dispatch({ type: 'close', path: t.path })}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            className="new-tab icon-button"
            title="加入專案"
            aria-label="加入專案分頁"
            onClick={() => void addProject()}
          >
            <Plus size={17} />
          </button>
          <span className="tab-spacer" />
          <span className="session-label">{demo ? '展示模式' : '自動還原分頁'}</span>
        </div>
        {demo && <div className="demo-banner">展示模式：範例資料僅供預覽，不會讀取你的電腦。</div>}
        {tab && project ? (
          <>
            <div className="toolbar">
              <div className="repo-title">
                <FolderGit2 size={20} />
                <div>
                  <h1>{project.name}</h1>
                  <span title={project.path}>{project.path}</span>
                </div>
              </div>
              <div className="toolbar-actions">
                <div className="branch-picker">
                  <button
                    className="soft-button"
                    onClick={() => setBranchMenu(!branchMenu)}
                    disabled={!snapshot}
                  >
                    <GitBranch size={14} />
                    <span>{snapshot?.head ?? '尚無 commit'}</span>
                    <ChevronDown size={13} />
                  </button>
                  {branchMenu && snapshot && (
                    <>
                      <div className="dismiss" onClick={() => setBranchMenu(false)} />
                      <div className="branch-menu popover">
                        <label>
                          <Search size={14} />
                          <input
                            autoFocus
                            value={branchQuery}
                            onChange={(e) => setBranchQuery(e.target.value)}
                            placeholder="跳至分支（不切換分支）"
                            aria-label="搜尋分支"
                          />
                        </label>
                        <div className="branch-list">
                          {snapshot.branches
                            .filter((b) => b.name.toLowerCase().includes(branchQuery.toLowerCase()))
                            .map((b) => (
                              <button
                                key={b.name}
                                onClick={() => {
                                  if (snapshot.rows.some((r) => r.commit?.oid === b.oid))
                                    select(b.oid, true);
                                  else
                                    setMessage(
                                      '這個分支位於已載入的歷史範圍之外，請先載入更多紀錄。',
                                    );
                                  setBranchMenu(false);
                                }}
                              >
                                <GitBranch size={13} />
                                <span>{b.name}</span>
                                <small>{b.isHead ? 'HEAD' : b.isRemote ? '遠端' : ''}</small>
                              </button>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button
                  className={`soft-button refresh-button ${loading ? 'refreshing' : ''}`}
                  onClick={() => setRefresh((r) => r + 1)}
                  disabled={loading}
                  title="重新整理（R）"
                >
                  <RefreshCw size={14} />
                  <span>重新整理</span>
                </button>
              </div>
            </div>
            <div className="repo-meta">
              <span>
                <GitBranch size={12} />
                {snapshot?.branches.filter((b) => !b.isRemote).length ?? '—'} 個本機分支
              </span>
              <span>
                <GitCommitHorizontal size={13} />
                {snapshot?.commitCount ?? '—'} 筆 commit
              </span>
              {snapshot?.upstream && (
                <span title={snapshot.upstream}>
                  <ArrowUp size={12} />
                  {snapshot.ahead}
                  <ArrowDown size={12} />
                  {snapshot.behind}
                </span>
              )}
              <span className="meta-spacer" />
              <label>
                <input
                  type="checkbox"
                  checked={tab.remotes}
                  onChange={(e) =>
                    dispatch({ type: 'tab', path: tab.path, patch: { remotes: e.target.checked } })
                  }
                />
                顯示遠端分支
              </label>
            </div>
            {error ? (
              <div className="main-empty">
                <FolderGit2 size={38} />
                <h2>專案暫時無法讀取</h2>
                <p className="error-text">{error}</p>
                <button className="primary-button" onClick={() => setRefresh((r) => r + 1)}>
                  重新嘗試
                </button>
              </div>
            ) : !snapshot ? (
              <div className="main-empty">
                <div className="spinner" />
                <p>正在讀取 Git 歷史…</p>
              </div>
            ) : (
              <div className="workspace">
                <section className="history-panel" aria-label="Git 歷史">
                  <div className="panel-heading">
                    <span>Commit 歷史</span>
                    <span className="subtle">所有分支</span>
                  </div>
                  <label className="history-search">
                    <Search size={15} />
                    <input
                      id="history-search"
                      placeholder="搜尋訊息、作者、SHA 或分支"
                      aria-label="搜尋 commit"
                      value={query}
                      onChange={(e) => setQueries((q) => ({ ...q, [tab.path]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && matches.length) {
                          const i = matches.indexOf(tab.selection ?? '');
                          select(
                            matches[(i + (e.shiftKey ? -1 : 1) + matches.length) % matches.length],
                            true,
                          );
                        }
                      }}
                    />
                    {query ? (
                      <>
                        <small>{matches.length} 筆</small>
                        <button
                          className="icon-button"
                          aria-label="清除搜尋"
                          onClick={() => setQueries((q) => ({ ...q, [tab.path]: '' }))}
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <kbd>Ctrl F</kbd>
                    )}
                  </label>
                  <div
                    className="history-scroll"
                    ref={historyRef}
                    onScroll={(e) => {
                      scrollPositions.current[tab.path] = e.currentTarget.scrollTop;
                    }}
                  >
                    <button
                      id="commit-worktree"
                      className={`working-row ${tab.selection === 'worktree' ? 'selected' : ''}`}
                      onClick={() => select('worktree')}
                    >
                      <div className="worktree-icon">
                        <Layers3 size={17} />
                      </div>
                      <div>
                        <strong>工作區</strong>
                        <span>
                          {snapshot.workingFiles.length
                            ? `${snapshot.workingFiles.length} 個檔案尚未提交`
                            : '工作目錄乾淨'}
                        </span>
                      </div>
                      <span className="count">{snapshot.workingFiles.length}</span>
                    </button>
                    <div className="history-table">
                      {snapshot.rows.map((row, i) =>
                        row.commit ? (
                          <button
                            id={`commit-${row.commit.oid}`}
                            key={row.commit.oid}
                            className={`commit-row ${tab.selection === row.commit.oid ? 'selected' : ''} ${queryLower && !matches.includes(row.commit.oid) ? 'dimmed' : ''} ${queryLower && matches.includes(row.commit.oid) ? 'search-match' : ''}`}
                            onClick={() => select(row.commit!.oid)}
                          >
                            <Graph cells={row.cells} lanes={snapshot.maxLane} connector={false} />
                            <div className="commit-text">
                              <div className="commit-subject">
                                {row.isHead && <span className="head-badge">HEAD</span>}
                                {row.branches.map((b) => (
                                  <span className="branch-badge" key={b}>
                                    {b}
                                  </span>
                                ))}
                                {row.tags.map((t) => (
                                  <span className="tag-badge" key={t}>
                                    {t}
                                  </span>
                                ))}
                                <strong title={row.commit.message}>
                                  {row.commit.message || '（無 commit 訊息）'}
                                </strong>
                              </div>
                              <div className="commit-caption">
                                <span>{row.commit.author}</span>
                                <code>{row.commit.shortId}</code>
                                <time dateTime={row.commit.date}>
                                  {displayDate(row.commit.date)}
                                </time>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <div className="connector-row" key={`connector-${i}`}>
                            <Graph cells={row.cells} lanes={snapshot.maxLane} connector />
                          </div>
                        ),
                      )}
                    </div>
                    {!snapshot.commitCount && (
                      <div className="history-empty">
                        <GitCommitHorizontal size={27} />
                        <p>這個專案還沒有 commit。</p>
                      </div>
                    )}
                    {snapshot.hasMore && (
                      <button
                        className="load-more"
                        disabled={tab.limit >= 5000 || loading}
                        onClick={() =>
                          dispatch({
                            type: 'tab',
                            path: tab.path,
                            patch: { limit: Math.min(tab.limit + 500, 5000) },
                          })
                        }
                      >
                        {tab.limit >= 5000 ? '已顯示前 5,000 筆紀錄' : '載入更多紀錄'}
                      </button>
                    )}
                  </div>
                </section>
                <Detail
                  key={tab.path}
                  path={tab.path}
                  selection={tab.selection}
                  snapshot={snapshot}
                  revision={refresh}
                />
              </div>
            )}
            <footer className="status-bar">
              <span className="status-dot" />
              <span>{loading ? '正在更新…' : error ? '讀取失敗' : '已同步本機資料'}</span>
              <span className="meta-spacer" />
              <span>j / k 瀏覽</span>
              <span>@ 跳至 HEAD</span>
              <span>Ctrl Tab 切換專案</span>
            </footer>
          </>
        ) : (
          <div className="onboarding">
            <div className="onboarding-graphic">
              <div className="orbit one" />
              <div className="orbit two" />
              <div className="welcome-icon">
                <FolderGit2 size={40} />
              </div>
              <span className="floating-node n1" />
              <span className="floating-node n2" />
              <span className="floating-node n3" />
            </div>
            <span className="eyebrow">YOUR REPOSITORIES, TOGETHER</span>
            <h1>所有專案，一個工作空間。</h1>
            <p>
              把常用的 Git 專案放進來，用分頁自在切換。
              <br />
              重新開啟時，從上次停下的地方繼續。
            </p>
            <button className="primary-button" onClick={() => void addProject()}>
              <Plus size={17} />
              {session.projects.length ? '加入其他專案' : '加入第一個專案'}
            </button>
            {!!session.projects.length && (
              <button
                className="text-button"
                onClick={() =>
                  session.projects.forEach((p) => dispatch({ type: 'open', path: p.path }))
                }
              >
                開啟所有專案
              </button>
            )}
            <button className="text-button" onClick={() => setPathDialog(true)}>
              貼上專案路徑
            </button>
            <div className="welcome-features">
              <span>
                <FolderOpen size={15} />
                專案收藏
              </span>
              <span>
                <Layers3 size={15} />
                多專案分頁
              </span>
              <span>
                <GitBranch size={15} />
                清晰的 Git 圖譜
              </span>
            </div>
          </div>
        )}
      </main>
      {message && (
        <div className="toast" role="alert">
          <pre>{message}</pre>
          <button className="icon-button" aria-label="關閉提示" onClick={() => setMessage('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {(pathDialog || rename || help) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setPathDialog(false);
            setRename(null);
            setHelp(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={help ? '快捷鍵與關於' : rename ? '重新命名專案' : '加入專案'}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="關閉對話框"
              onClick={() => {
                setPathDialog(false);
                setRename(null);
                setHelp(false);
              }}
            >
              <X size={18} />
            </button>
            {help ? (
              <>
                <span className="eyebrow">REPOVELA · 0.1.0</span>
                <h2>鍵盤也能自在瀏覽</h2>
                <div className="shortcuts">
                  {[
                    ['Ctrl / ⌘ O', '加入專案'],
                    ['Ctrl / ⌘ W', '關閉目前分頁'],
                    ['Ctrl / ⌘ Tab', '下一個專案'],
                    ['Ctrl / ⌘ Shift Tab', '上一個專案'],
                    ['Ctrl / ⌘ F', '搜尋 commit'],
                    ['Enter / Shift Enter', '下一筆 / 上一筆搜尋結果'],
                    ['j / k 或 ↑ / ↓', '選擇 commit'],
                    ['@', '跳至 HEAD'],
                    ['R', '重新整理'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span>{v}</span>
                      <kbd>{k}</kbd>
                    </div>
                  ))}
                </div>
                <p className="subtle">
                  衍生自 trasta298/keifu（MIT）。
                  <br />
                  分頁與專案清單自動儲存於本機。
                </p>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rename) {
                    dispatch({ type: 'rename', ...rename });
                    setRename(null);
                  } else if (native || demo) void addPaths([inputPath]);
                  else setMessage('請以 Tauri 桌面版啟動後再加入專案。');
                }}
              >
                <span className="eyebrow">{rename ? 'PROJECT NAME' : 'ADD REPOSITORY'}</span>
                <h2>{rename ? '重新命名專案' : '加入 Git 專案'}</h2>
                <p className="subtle">
                  {rename ? '名稱只會影響專案清單。' : '輸入專案的完整資料夾路徑。'}
                </p>
                <input
                  className="modal-input"
                  autoFocus
                  required
                  aria-label={rename ? '專案名稱' : '專案路徑'}
                  value={rename ? rename.name : inputPath}
                  onChange={(e) =>
                    rename
                      ? setRename({ ...rename, name: e.target.value })
                      : setInputPath(e.target.value)
                  }
                  placeholder={rename ? '專案名稱' : 'C:\\Projects\\my-project'}
                />
                <button className="primary-button" disabled={adding} type="submit">
                  {rename ? '儲存名稱' : adding ? '加入中…' : '加入專案'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
