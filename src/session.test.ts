import { describe, expect, it } from 'vitest';
import { emptySession, restoreSession, sessionReducer } from './session';

describe('多專案 session', () => {
  it('分頁排序保留選取與內容，重開後還原，並拒絕無效排序', () => {
    let state = emptySession;
    for (const name of ['A', 'B', 'C'])
      state = sessionReducer(state, { type: 'add', project: { path: `/${name}`, name } });
    state = sessionReducer(state, { type: 'tab', path: '/A', patch: { selection: 'commit' } });
    const before = state;
    state = sessionReducer(state, { type: 'reorderTabs', paths: ['/C', '/A', '/B'] });
    expect(state.tabs.map((tab) => tab.path)).toEqual(['/C', '/A', '/B']);
    expect(state.tabs[1].selection).toBe('commit');
    expect(state.active).toBe(before.active);
    expect(state.projects).toBe(before.projects);
    expect(restoreSession(JSON.stringify(state))).toEqual(state);
    for (const paths of [['/A'], ['/A', '/A', '/C'], ['/A', '/B', '/missing']])
      expect(sessionReducer(state, { type: 'reorderTabs', paths })).toBe(state);
  });
  it('群組排序保留成員、折疊與分頁，重開還原順序', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    for (const id of ['one', 'two', 'three'])
      state = sessionReducer(state, { type: 'createGroup', id, name: id });
    state = sessionReducer(state, { type: 'moveProject', path: '/a', groupId: 'two' });
    state = sessionReducer(state, { type: 'toggleGroup', id: 'two' });
    const before = state;
    state = sessionReducer(state, { type: 'reorderGroups', ids: ['three', 'one', 'two'] });
    expect(state.groups.map((group) => group.id)).toEqual(['three', 'one', 'two']);
    expect(state.groups[2].collapsed).toBe(true);
    expect(state.projects).toBe(before.projects);
    expect(state.tabs).toBe(before.tabs);
    expect(state.active).toBe(before.active);
    expect(restoreSession(JSON.stringify(state))).toEqual(state);
  });
  it('搜尋中群組排序保留隱藏群組位置，拒絕重複及無效目標', () => {
    let state = emptySession;
    for (const id of ['one', 'hidden', 'two'])
      state = sessionReducer(state, { type: 'createGroup', id, name: id });
    state = sessionReducer(state, { type: 'reorderGroups', ids: ['two', 'one'] });
    expect(state.groups.map((group) => group.id)).toEqual(['two', 'hidden', 'one']);
    for (const ids of [['one', 'one'], ['one', 'missing'], ['missing', 'two'], ['one'], []])
      expect(sessionReducer(state, { type: 'reorderGroups', ids })).toBe(state);
  });
  it('群組可建立、改名與折疊，重開保留專案分組與分頁', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    const tabs = state.tabs;
    state = sessionReducer(state, { type: 'createGroup', id: 'work', name: ' 工作 ' });
    state = sessionReducer(state, { type: 'moveProject', path: '/a', groupId: 'work' });
    state = sessionReducer(state, { type: 'renameGroup', id: 'work', name: '開發' });
    state = sessionReducer(state, { type: 'toggleGroup', id: 'work' });
    expect(state.groups).toEqual([{ id: 'work', name: '開發', collapsed: true }]);
    expect(state.projects[0].groupId).toBe('work');
    expect(state.tabs).toBe(tabs);
    expect(state.active).toBe('/a');
    expect(restoreSession(JSON.stringify(state))).toEqual(state);
  });
  it('可移入另一群組、插入指定位置及移出，保留釘選與選取', () => {
    let state = emptySession;
    for (const name of ['A', 'B', 'C'])
      state = sessionReducer(state, { type: 'add', project: { path: `/${name}`, name } });
    for (const id of ['one', 'two'])
      state = sessionReducer(state, { type: 'createGroup', id, name: id });
    state = sessionReducer(state, { type: 'pin', path: '/A' });
    state = sessionReducer(state, { type: 'moveProject', path: '/A', groupId: 'one' });
    state = sessionReducer(state, { type: 'moveProject', path: '/B', groupId: 'two' });
    state = sessionReducer(state, {
      type: 'moveProject',
      path: '/A',
      groupId: 'two',
      beforePath: '/B',
    });
    expect(state.projects.filter((p) => p.groupId === 'two').map((p) => p.path)).toEqual([
      '/A',
      '/B',
    ]);
    state = sessionReducer(state, { type: 'reorder', paths: ['/B', '/A'] });
    expect(state.projects.filter((p) => p.groupId === 'two').map((p) => p.path)).toEqual([
      '/B',
      '/A',
    ]);
    state = sessionReducer(state, { type: 'moveProject', path: '/A', groupId: null });
    expect(state.projects.find((p) => p.path === '/A')).toEqual({
      path: '/A',
      name: 'A',
      pinned: true,
    });
    expect(state.active).toBe('/C');
  });
  it('移除群組只移出專案，不移除專案或分頁', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    state = sessionReducer(state, { type: 'createGroup', id: 'one', name: 'One' });
    state = sessionReducer(state, { type: 'moveProject', path: '/a', groupId: 'one' });
    const tabs = state.tabs;
    state = sessionReducer(state, { type: 'removeGroup', id: 'one' });
    expect(state.groups).toHaveLength(0);
    expect(state.projects).toEqual([{ path: '/a', name: 'A', pinned: false }]);
    expect(state.tabs).toBe(tabs);
    expect(state.active).toBe('/a');
  });
  it('拒絕無效群組、重複名稱與跨區排序', () => {
    let state = sessionReducer(emptySession, { type: 'add', project: { path: '/a', name: 'A' } });
    state = sessionReducer(state, { type: 'add', project: { path: '/b', name: 'B' } });
    state = sessionReducer(state, { type: 'createGroup', id: 'one', name: 'One' });
    state = sessionReducer(state, { type: 'moveProject', path: '/a', groupId: 'one' });
    expect(sessionReducer(state, { type: 'createGroup', id: 'two', name: ' one ' })).toBe(state);
    expect(sessionReducer(state, { type: 'moveProject', path: '/a', groupId: 'missing' })).toBe(
      state,
    );
    expect(
      sessionReducer(state, {
        type: 'moveProject',
        path: '/a',
        groupId: null,
        beforePath: '/missing',
      }),
    ).toBe(state);
    expect(sessionReducer(state, { type: 'reorder', paths: ['/b', '/a'] })).toBe(state);
  });
  it('舊 session 與無效群組資料可還原，孤立專案回到未分組', () => {
    const state = restoreSession(
      JSON.stringify({
        version: 1,
        groups: [
          null,
          { id: 'good', name: 'Good', collapsed: true },
          { id: 'good', name: 'Duplicate' },
          { id: '', name: 'Invalid' },
        ],
        projects: [
          { path: '/a', name: 'A', groupId: 'missing' },
          { path: '/b', name: 'B', groupId: 'good' },
        ],
        tabs: [],
        active: null,
      }),
    );
    expect(state.groups).toEqual([{ id: 'good', name: 'Good', collapsed: true }]);
    expect(state.projects[0].groupId).toBeUndefined();
    expect(state.projects[1].groupId).toBe('good');
    expect(
      restoreSession(JSON.stringify({ version: 1, projects: [], tabs: [], active: null })).groups,
    ).toEqual([]);
  });
  it('拖拉可向前或向後排序，重開保留順序與分頁狀態', () => {
    let state = emptySession;
    for (const name of ['A', 'B', 'C'])
      state = sessionReducer(state, { type: 'add', project: { path: `C:/${name}`, name } });
    const tabs = state.tabs;
    state = sessionReducer(state, {
      type: 'reorder',
      paths: ['c:/c/', 'C:/A', 'C:/B'],
    });
    expect(state.projects.map((p) => p.name)).toEqual(['C', 'A', 'B']);
    state = sessionReducer(state, {
      type: 'reorder',
      paths: ['C:/A', 'C:/B', 'C:/C'],
    });
    expect(state.projects.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(state.tabs).toBe(tabs);
    expect(state.active).toBe('C:/C');
    expect(restoreSession(JSON.stringify(state))).toEqual(state);
  });
  it('釘選群組可排序，跨群組、重複與無效目標不改變清單', () => {
    let state = emptySession;
    for (const name of ['A', 'B', 'C'])
      state = sessionReducer(state, { type: 'add', project: { path: `/${name}`, name } });
    state = sessionReducer(state, { type: 'pin', path: '/A' });
    state = sessionReducer(state, { type: 'pin', path: '/C' });
    state = sessionReducer(state, {
      type: 'reorder',
      paths: ['/C', '/A'],
    });
    expect(state.projects.filter((p) => p.pinned).map((p) => p.name)).toEqual(['C', 'A']);
    for (const paths of [
      ['/C', '/B'],
      ['/C', '/C'],
      ['/C', '/missing'],
      ['/missing', '/A'],
    ])
      expect(sessionReducer(state, { type: 'reorder', paths })).toBe(state);
  });
  it('搜尋結果排序只交換可見專案，保留被篩選專案的位置', () => {
    let state = emptySession;
    for (const name of ['A', 'B', 'C', 'D'])
      state = sessionReducer(state, { type: 'add', project: { path: `/${name}`, name } });
    state = sessionReducer(state, { type: 'reorder', paths: ['/D', '/A'] });
    expect(state.projects.map((p) => p.name)).toEqual(['D', 'B', 'C', 'A']);
  });
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
