// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { flushPromises } from '@vue/test-utils';
import type { Commit, CommitDetail, FilePatch, Snapshot } from './types';
import { STORAGE_KEY } from './session';

const mocked = vi.hoisted(() => ({
  repository: vi.fn(),
  commit: vi.fn(),
  patch: vi.fn(),
  choose: vi.fn(),
  open: vi.fn(),
}));
vi.mock('./api', () => ({
  native: true,
  demo: false,
  chooseProjects: mocked.choose,
  api: {
    repository: mocked.repository,
    commit: mocked.commit,
    patch: mocked.patch,
    openProject: mocked.open,
  },
}));

const commits: Commit[] = [
  {
    oid: 'a'.repeat(40),
    shortId: 'aaaaaaa',
    author: '作者 A',
    email: 'a@example.com',
    date: '2026-10-01T08:00:00+08:00',
    message: '加入專案管理',
    fullMessage: '加入專案管理',
    parents: ['b'.repeat(40)],
  },
  {
    oid: 'b'.repeat(40),
    shortId: 'bbbbbbb',
    author: '作者 B',
    email: 'b@example.com',
    date: '2026-09-30T08:00:00+08:00',
    message: '初始版本',
    fullMessage: '初始版本',
    parents: [],
  },
];

function snapshot(path: string): Snapshot {
  return {
    project: { path, name: path === '/a' ? '專案 A' : '專案 B' },
    head: 'main',
    headOid: commits[0].oid,
    branches: [{ name: 'main', oid: commits[0].oid, isHead: true, isRemote: false }],
    rows: commits.map((c, i) => ({
      commit: c,
      branches: i === 0 ? ['main'] : [],
      tags: [],
      isHead: i === 0,
      cells: [{ kind: 'commit', color: 9, secondary: 9 }],
    })),
    maxLane: 0,
    workingFiles: [],
    hasMore: false,
    commitCount: 2,
    upstream: null,
    ahead: 0,
    behind: 0,
  };
}
function detail(oid: string): CommitDetail {
  return {
    commit: commits.find((c) => c.oid === oid)!,
    files: [{ path: 'README.md', kind: 'Modified', insertions: 1, deletions: 1, binary: false }],
    totalFiles: 1,
  };
}
function saveProjects(active = '/a') {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      projects: [
        { path: '/a', name: '專案 A', pinned: true },
        { path: '/b', name: '專案 B', pinned: false },
      ],
      tabs: [
        { path: '/a', selection: commits[1].oid, remotes: true, limit: 500 },
        { path: '/b', selection: commits[0].oid, remotes: false, limit: 500 },
      ],
      active,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocked.repository.mockImplementation(async (path: string) => snapshot(path));
  mocked.commit.mockImplementation(async (_path: string, oid: string) => detail(oid));
  mocked.patch.mockResolvedValue({
    lines: [{ kind: '+', oldLine: null, newLine: 1, text: '新的內容' }],
    binary: false,
    truncated: false,
  });
  mocked.open.mockImplementation(async (path: string) => ({
    path,
    name: path === '/a' ? '專案 A' : '專案 B',
  }));
  mocked.choose.mockResolvedValue(['/a', '/b']);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('桌面分頁與瀏覽互動', () => {
  it('首次切換才載入各分頁，之後切換直接顯示快取的歷史', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.repository).toHaveBeenCalledExactlyOnceWith('/a', true, 500);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    const history = screen.getByRole('region', { name: 'Git 歷史' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(screen.getByRole('region', { name: 'Git 歷史' })).toBe(history);
    expect(screen.queryByText('正在讀取 Git 歷史…')).toBeNull();
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    expect(screen.queryByText('正在讀取 Git 歷史…')).toBeNull();
    expect(mocked.repository).toHaveBeenCalledTimes(2);
  });

  it('載入中切換分頁不會重複請求，背景完成後保留結果', async () => {
    saveProjects();
    let resolveA!: (value: Snapshot) => void;
    mocked.repository.mockImplementation((path: string) =>
      path === '/a'
        ? new Promise<Snapshot>((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(snapshot(path)),
    );
    render(App);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(mocked.repository).toHaveBeenCalledTimes(2);
    expect((screen.getByRole('button', { name: '重新整理' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    resolveA(snapshot('/a'));
    await flushPromises();
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(screen.queryByText('正在讀取 Git 歷史…')).toBeNull();
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.repository).toHaveBeenCalledTimes(2);
  });

  it('取得焦點與經過 60 秒都不會自動重新載入歷史', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      saveProjects();
      render(App);
      await screen.findByRole('heading', { name: '初始版本' });
      await fireEvent.focus(window);
      await vi.advanceTimersByTimeAsync(60000);
      await flushPromises();
      expect(mocked.repository).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('取消資料夾選擇器不會新增專案或變更目前分頁', async () => {
    saveProjects();
    mocked.choose.mockResolvedValue([]);
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const saved = localStorage.getItem(STORAGE_KEY);
    await fireEvent.click(screen.getByRole('button', { name: /加入專案 Ctrl O/ }));
    await flushPromises();
    expect(mocked.choose).toHaveBeenCalledOnce();
    expect(mocked.open).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('選擇器失敗後顯示錯誤，仍能再次加入專案', async () => {
    mocked.choose.mockRejectedValueOnce(new Error('資料夾選擇器失敗'));
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: /加入第一個專案/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('資料夾選擇器失敗');
    await fireEvent.click(screen.getByRole('button', { name: '關閉提示' }));
    await fireEvent.click(screen.getByRole('button', { name: /加入第一個專案/ }));
    await screen.findByRole('tab', { name: '專案 B' });
    expect(mocked.choose).toHaveBeenCalledTimes(2);
  });

  it('一次加入多個專案，獨立切換並在重開時還原選取', async () => {
    const first = render(App);
    await fireEvent.click(screen.getByRole('button', { name: /加入第一個專案/ }));
    await screen.findByRole('tab', { name: '專案 B' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await waitFor(() => expect(mocked.repository).toHaveBeenCalledWith('/a', true, 500));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: /初始版本 作者 B/ }));
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await screen.findByRole('heading', { name: '初始版本' });
    first.unmount();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(screen.getByRole('tab', { name: '專案 A' }).getAttribute('aria-selected')).toBe('true');
  });

  it('晚到的專案 A 回應不會覆蓋已切換的專案 B', async () => {
    saveProjects();
    let resolveA!: (value: Snapshot) => void;
    mocked.repository.mockImplementation((path: string) =>
      path === '/a'
        ? new Promise<Snapshot>((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(snapshot(path)),
    );
    render(App);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '專案 B' });
    await screen.findByRole('heading', { name: '加入專案管理' });
    const stale = snapshot('/a');
    stale.rows = [{ ...stale.rows[0], commit: { ...commits[0], message: '過期的資料' } }];
    resolveA(stale);
    await flushPromises();
    expect(screen.queryByText('過期的資料')).toBeNull();
    expect(screen.getByRole('heading', { name: '專案 B' })).toBeTruthy();
  });

  it('專案讀取失敗仍可使用其他分頁', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => {
      if (path === '/a') throw new Error('資料夾已移動');
      return snapshot(path);
    });
    render(App);
    await screen.findByText(/資料夾已移動/);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(screen.queryByText(/資料夾已移動/)).toBeNull();
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(screen.getByText(/資料夾已移動/)).toBeTruthy();
    expect(mocked.repository).toHaveBeenCalledTimes(2);
    mocked.repository.mockImplementation(async (path: string) => snapshot(path));
    await fireEvent.click(screen.getByRole('button', { name: '重新嘗試' }));
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.repository).toHaveBeenCalledTimes(3);
  });

  it('同一個部分暫存檔案可分別查看已暫存與未暫存 diff', async () => {
    saveProjects();
    const data = snapshot('/a');
    data.workingFiles = [
      { path: 'README.md', staged: true, unstaged: true, untracked: false, conflict: false },
    ];
    mocked.repository.mockResolvedValue(data);
    render(App);
    await fireEvent.click(await screen.findByRole('button', { name: /工作區 1 個檔案尚未提交/ }));
    const panel = screen.getByRole('region', { name: '詳細資訊' });
    const files = within(panel).getAllByRole('button', { name: /README.md 變更/ });
    expect(files).toHaveLength(2);
    await fireEvent.click(files[0]);
    await screen.findByText('新的內容');
    expect(mocked.patch).toHaveBeenLastCalledWith('/a', null, 'README.md', 'staged');
    await fireEvent.click(screen.getByRole('button', { name: '返回檔案清單' }));
    await fireEvent.click(within(panel).getAllByRole('button', { name: /README.md 變更/ })[1]);
    await screen.findByText('新的內容');
    expect(mocked.patch).toHaveBeenLastCalledWith('/a', null, 'README.md', 'unstaged');
  });

  it('關閉分頁後，專案清單仍可重新開啟', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '關閉 專案 A 分頁' }));
    expect(screen.queryByRole('tab', { name: '專案 A' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '專案 A' }));
    await screen.findByRole('tab', { name: '專案 A' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(2);
  });

  it('關閉後重開會忽略舊分頁尚未完成的請求', async () => {
    saveProjects();
    let resolveOld!: (value: Snapshot) => void;
    mocked.repository.mockImplementationOnce(
      () =>
        new Promise<Snapshot>((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '關閉 專案 A 分頁' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: '專案 A' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    const stale = snapshot('/a');
    stale.rows = [{ ...stale.rows[0], commit: { ...commits[0], message: '舊分頁的資料' } }];
    resolveOld(stale);
    await flushPromises();
    expect(screen.queryByText('舊分頁的資料')).toBeNull();
    expect(mocked.repository).toHaveBeenCalledTimes(3);
  });

  it('變更載入範圍會讀取新歷史，切回分頁沿用新的範圍', async () => {
    saveProjects();
    mocked.repository.mockImplementation(
      async (path: string, _remotes: boolean, limit: number) => ({
        ...snapshot(path),
        hasMore: limit < 1000,
      }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '載入更多紀錄' }));
    await screen.findByRole('region', { name: 'Git 歷史' });
    expect(mocked.repository).toHaveBeenLastCalledWith('/a', true, 1000);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(screen.queryByRole('button', { name: '載入更多紀錄' })).toBeNull();
    expect(mocked.repository).toHaveBeenCalledTimes(3);
  });

  it('搜尋、鍵盤選取與遠端顯示選項各自保留在分頁中', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const search = screen.getByRole('textbox', { name: '搜尋 commit' });
    await fireEvent.update(search, '加入');
    await fireEvent.keyDown(search, { key: 'Enter' });
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(search);
    await fireEvent.click(screen.getByRole('checkbox', { name: '顯示遠端分支' }));
    await waitFor(() => expect(mocked.repository).toHaveBeenLastCalledWith('/a', false, 500));
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect((screen.getByRole('textbox', { name: '搜尋 commit' }) as HTMLInputElement).value).toBe(
      '',
    );
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await screen.findByRole('heading', { name: '初始版本' });
    expect((screen.getByRole('textbox', { name: '搜尋 commit' }) as HTMLInputElement).value).toBe(
      '加入',
    );
    expect(
      (screen.getByRole('checkbox', { name: '顯示遠端分支' }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('取消釘選、改名與移除只更新專案清單，其他分頁仍可瀏覽', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '專案 A 專案選單' }));
    await fireEvent.click(screen.getByRole('button', { name: '取消釘選' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).projects[0].pinned).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: '專案 A 專案選單' }));
    await fireEvent.click(screen.getByRole('button', { name: '重新命名' }));
    const name = screen.getByRole('textbox', { name: '專案名稱' });
    expect(document.activeElement).toBe(name);
    await fireEvent.update(name, '主要專案');
    await fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    expect(screen.getByRole('tab', { name: '主要專案' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '主要專案 專案選單' }));
    await fireEvent.click(screen.getByRole('button', { name: '從清單移除' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(screen.queryByRole('tab', { name: '主要專案' })).toBeNull();
    expect(screen.getByRole('tab', { name: '專案 B' }).getAttribute('aria-selected')).toBe('true');
    expect(mocked.open).not.toHaveBeenCalled();
  });

  it('晚到的 commit 或 diff 回應不會覆蓋目前選取', async () => {
    saveProjects();
    let resolveCommit!: (value: CommitDetail) => void;
    const latest = detail(commits[0].oid);
    latest.files.push({
      path: 'test.ts',
      kind: 'Added',
      insertions: 1,
      deletions: 0,
      binary: false,
    });
    latest.totalFiles = 2;
    mocked.commit.mockImplementation((_path: string, oid: string) =>
      oid === commits[1].oid
        ? new Promise<CommitDetail>((resolve) => {
            resolveCommit = resolve;
          })
        : Promise.resolve(latest),
    );
    render(App);
    await waitFor(() => expect(mocked.commit).toHaveBeenCalledWith('/a', commits[1].oid));
    await fireEvent.click(screen.getByRole('button', { name: /加入專案管理 作者 A/ }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    resolveCommit(detail(commits[1].oid));
    await flushPromises();
    expect(screen.queryByRole('heading', { name: '初始版本' })).toBeNull();

    let resolvePatch!: (value: FilePatch) => void;
    mocked.patch.mockImplementation((_path: string, _oid: string, file: string) =>
      file === 'README.md'
        ? new Promise((resolve) => {
            resolvePatch = resolve;
          })
        : Promise.resolve({
            lines: [{ kind: '+', oldLine: null, newLine: 1, text: '目前的 diff' }],
            binary: false,
            truncated: false,
          }),
    );
    const panel = screen.getByRole('region', { name: '詳細資訊' });
    await fireEvent.click(within(panel).getByRole('button', { name: /README.md/ }));
    await fireEvent.click(screen.getByRole('button', { name: '返回檔案清單' }));
    await fireEvent.click(within(panel).getByRole('button', { name: /test.ts/ }));
    await screen.findByText('目前的 diff');
    resolvePatch({
      lines: [{ kind: '+', oldLine: null, newLine: 1, text: '過期的 diff' }],
      binary: false,
      truncated: false,
    });
    await flushPromises();
    expect(screen.queryByText('過期的 diff')).toBeNull();
    expect(screen.getByText('目前的 diff')).toBeTruthy();
  });

  it('手動重新整理只更新目前專案與已開啟的 diff，R 也可更新', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await screen.findByRole('heading', { name: '初始版本' });
    const panel = screen.getByRole('region', { name: '詳細資訊' });
    await fireEvent.click(within(panel).getByRole('button', { name: /README.md/ }));
    await screen.findByText('新的內容');
    const repositoryCalls = mocked.repository.mock.calls.length;
    const patchCalls = mocked.patch.mock.calls.length;
    await fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await waitFor(() =>
      expect(mocked.repository.mock.calls.length).toBeGreaterThan(repositoryCalls),
    );
    await waitFor(() => expect(mocked.patch.mock.calls.length).toBeGreaterThan(patchCalls));
    expect(mocked.repository).toHaveBeenLastCalledWith('/a', true, 500);
    expect(mocked.patch).toHaveBeenLastCalledWith('/a', commits[1].oid, 'README.md', 'commit');
    await screen.findByText('新的內容');
    await fireEvent.keyDown(window, { key: 'r' });
    await flushPromises();
    expect(mocked.repository).toHaveBeenCalledTimes(repositoryCalls + 2);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    expect(mocked.repository).toHaveBeenCalledTimes(repositoryCalls + 2);
  });
});
