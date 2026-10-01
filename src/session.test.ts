import { describe, expect, it } from 'vitest';
import { emptySession, restoreSession, sessionReducer } from './session';

describe('多專案 session', () => {
  it('以儲存庫路徑去重，保留已開啟分頁的狀態', () => {
    let state = sessionReducer(emptySession, {
      type: 'add',
      project: { path: 'C:\\Projects\\App', name: 'App' },
    });
    state = sessionReducer(state, {
      type: 'tab',
      path: state.active!,
      patch: { selection: 'abc123', remotes: false },
    });
    state = sessionReducer(state, {
      type: 'add',
      project: { path: 'c:/projects/app/', name: 'Duplicate' },
    });
    expect(state.projects).toHaveLength(1);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].selection).toBe('abc123');
    expect(state.tabs[0].remotes).toBe(false);
  });
  it('各分頁的 commit、遠端與載入範圍獨立儲存，重開能還原', () => {
    let state = sessionReducer(emptySession, {
      type: 'add',
      project: { path: '/projects/a', name: 'A' },
    });
    state = sessionReducer(state, {
      type: 'tab',
      path: '/projects/a',
      patch: { selection: 'oid-a', limit: 1000 },
    });
    state = sessionReducer(state, { type: 'add', project: { path: '/projects/b', name: 'B' } });
    state = sessionReducer(state, {
      type: 'tab',
      path: '/projects/b',
      patch: { selection: 'worktree', remotes: false },
    });
    expect(restoreSession(JSON.stringify(state))).toEqual(state);
  });
  it('關閉分頁保留專案；移除專案不會留下無效 active', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    state = sessionReducer(state, { type: 'add', project: { path: '/b', name: 'B' } });
    state = sessionReducer(state, { type: 'close', path: '/b' });
    expect(state.active).toBe('/a');
    expect(state.projects).toHaveLength(2);
    state = sessionReducer(state, { type: 'remove', path: '/a' });
    expect(state.active).toBeNull();
    expect(state.tabs).toHaveLength(0);
    expect(state.projects.map((p) => p.path)).toEqual(['/b']);
  });
  it('釘選和重新命名不影響分頁路徑', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    state = sessionReducer(state, { type: 'pin', path: '/a' });
    state = sessionReducer(state, { type: 'rename', path: '/a', name: '  開發專案  ' });
    expect(state.projects[0]).toEqual({ path: '/a', name: '開發專案', pinned: true });
    expect(state.tabs[0].path).toBe('/a');
  });
  it('損壞或過期 session 不會讓應用程式啟動失敗', () => {
    expect(restoreSession('{')).toEqual(emptySession);
    expect(restoreSession('{"version":2}')).toEqual(emptySession);
    const state = restoreSession(
      JSON.stringify({
        version: 1,
        projects: [{ path: '/a', name: 'A' }, null],
        tabs: [{ path: '/missing' }, { path: '/a', limit: 999999 }],
        active: '/missing',
      }),
    );
    expect(state.projects).toHaveLength(1);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].limit).toBe(5000);
    expect(state.active).toBe('/a');
  });
});
