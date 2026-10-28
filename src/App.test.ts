// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { flushPromises } from '@vue/test-utils';
import type { Commit, CommitDetail, CommitOperation, FilePatch, Snapshot } from './types';
import { STORAGE_KEY } from './session';
import { defaultPreferences, PREFERENCES_KEY } from './preferences';

// 原生視窗控制由 Windows 整合測試驗證，jsdom 僅測試專案互動。
vi.mock('./WindowTitlebar.vue', () => ({ default: { render: () => null } }));

const mocked = vi.hoisted(() => ({
  operate: vi.fn(),
  autoFetch: vi.fn(),
  repository: vi.fn(),
  commit: vi.fn(),
  patch: vi.fn(),
  choose: vi.fn(),
  open: vi.fn(),
  trust: vi.fn(),
  fonts: vi.fn(),
  website: vi.fn(),
  requests: vi.fn(),
  requestDetail: vi.fn(),
  requestChanges: vi.fn(),
  requestBranches: vi.fn(),
  requestAction: vi.fn(),
}));
vi.mock('./api', () => ({
  native: true,
  demo: false,
  chooseProjects: mocked.choose,
  listSystemFonts: mocked.fonts,
  openRepositoryWebsite: mocked.website,
  api: {
    operate: mocked.operate,
    autoFetch: mocked.autoFetch,
    repository: mocked.repository,
    commit: mocked.commit,
    patch: mocked.patch,
    openProject: mocked.open,
    trustProject: mocked.trust,
    changeRequests: mocked.requests,
    requestDetail: mocked.requestDetail,
    requestChanges: mocked.requestChanges,
    requestBranches: mocked.requestBranches,
    requestAction: mocked.requestAction,
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  vi.clearAllMocks();
  mocked.fonts.mockResolvedValue(['Arial', '自訂安裝字體']);
  mocked.website.mockResolvedValue(undefined);
  mocked.requests.mockResolvedValue({ items: [], nextCursor: null });
  mocked.requestBranches.mockResolvedValue({
    branches: ['main', 'feature'],
    defaultBranch: 'main',
  });
  mocked.operate.mockResolvedValue('ok');
  mocked.autoFetch.mockResolvedValue(undefined);
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
  mocked.trust.mockImplementation(async (path: string) => ({ path, name: '信任專案' }));
  mocked.choose.mockResolvedValue(['/a', '/b']);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

describe('桌面分頁與瀏覽互動', () => {
  it('先顯示本機歷史，背景 Fetch 後更新對應分頁', async () => {
    saveProjects();
    let finish!: () => void;
    mocked.autoFetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let fetched = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: fetched && path === '/a' ? 'updated' : 'main',
      remotes: path === '/a' ? [{ name: 'origin', url: 'https://example.com/a.git' }] : [],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.autoFetch).toHaveBeenCalledWith('/a');
    expect(mocked.repository).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('tab', { name: /專案 B/ }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    fetched = true;
    finish();
    await waitFor(() =>
      expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(2),
    );
    expect(mocked.autoFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '加入專案管理' })).toBeTruthy();
  });

  it('背景 Fetch 失敗時保留本機歷史並提示', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: [{ name: 'origin', url: 'https://example.com/a.git' }],
    }));
    mocked.autoFetch.mockRejectedValue(new Error('無法連線'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await screen.findByText(/自動 Fetch 失敗.*無法連線/);
    expect(screen.getByRole('heading', { name: '初始版本' })).toBeTruthy();
    expect(mocked.autoFetch).toHaveBeenCalledTimes(1);
  });

  it('Fetch 完成時，較早開始的重新讀取不能覆蓋新資料', async () => {
    saveProjects();
    let finishFetch!: () => void;
    let finishOldRead!: (value: Snapshot) => void;
    mocked.autoFetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishFetch = resolve;
        }),
    );
    const withRemote = () => ({
      ...snapshot('/a'),
      remotes: [{ name: 'origin', url: 'https://example.com/a.git' }],
    });
    mocked.repository
      .mockImplementationOnce(async () => withRemote())
      .mockImplementationOnce(
        () =>
          new Promise<Snapshot>((resolve) => {
            finishOldRead = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        const data = withRemote();
        data.rows[0].commit = { ...data.rows[0].commit!, message: '更新後的歷史' };
        return data;
      });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    finishFetch();
    await waitFor(() => expect(mocked.repository).toHaveBeenCalledTimes(3));
    finishOldRead(withRemote());
    await flushPromises();
    expect(screen.getByText('更新後的歷史')).toBeTruthy();
  });
  it('偏好設定即時套用 toast 位置、保存秒數、可預覽兩種類型及重設', async () => {
    const view = render(App);
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    const settings = screen.getByRole('dialog', { name: '偏好設定' });
    await fireEvent.update(
      within(settings).getByRole('combobox', { name: 'Toast 顯示位置' }),
      'top-center',
    );
    await fireEvent.update(
      within(settings).getByRole('combobox', { name: 'Toast 自動關閉秒數' }),
      '8',
    );
    await fireEvent.click(within(settings).getByRole('button', { name: '預覽手動關閉' }));
    expect(document.querySelector('.toast-host')?.classList.contains('toast-top-center')).toBe(
      true,
    );
    expect(document.querySelector('.toast')?.getAttribute('data-dismissal')).toBe('manual');
    await fireEvent.click(within(settings).getByRole('button', { name: '預覽自動關閉' }));
    expect(document.querySelectorAll('.toast')).toHaveLength(2);
    expect(screen.getByText('8 秒後自動關閉')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toMatchObject({
      toastPosition: 'top-center',
      toastDuration: 8,
    });
    view.unmount();
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    expect(
      (screen.getByRole('combobox', { name: 'Toast 顯示位置' }) as HTMLSelectElement).value,
    ).toBe('top-center');
    expect(
      (screen.getByRole('combobox', { name: 'Toast 自動關閉秒數' }) as HTMLSelectElement).value,
    ).toBe('8');
    await fireEvent.click(screen.getByRole('button', { name: '還原預設設定' }));
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toMatchObject({
      toastPosition: 'bottom-right',
      toastDuration: 5,
    });
  });
  it('PR／MR 錯誤統一顯示於可關閉的 toast，重試與建立輸入仍保留', async () => {
    saveProjects();
    const request = {
      number: 7,
      title: '遠端 PR',
      body: '',
      author: 'dev',
      state: 'open',
      draft: false,
      sourceBranch: 'feature',
      targetBranch: 'main',
      updatedAt: '2026-10-12T08:00:00Z',
      url: 'https://github.com/team/repo/pull/7',
      labels: [],
    };
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: [{ name: 'origin', url: 'https://github.com/team/repo.git' }],
    }));
    mocked.requests
      .mockRejectedValueOnce(new Error('清單讀取失敗'))
      .mockResolvedValue({ items: [request], nextCursor: null });
    mocked.requestDetail
      .mockRejectedValueOnce(new Error('內容讀取失敗'))
      .mockResolvedValue({ request, headOid: 'a'.repeat(40), mergeStatus: 'clean' });
    mocked.requestAction.mockRejectedValueOnce(new Error('target_branch does not exist'));
    mocked.requestChanges.mockRejectedValueOnce(new Error('Changes 讀取失敗'));
    mocked.website.mockRejectedValueOnce(new Error('網站開啟失敗'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '瀏覽 PR／MR' }));
    const page = screen.getByRole('region', { name: 'PR／MR' });
    const expectToast = async (text: string) => {
      const toast = await screen.findByRole('alert');
      expect(toast.classList.contains('toast')).toBe(true);
      expect(toast.textContent).toContain(text);
      expect(within(page).queryByRole('alert')).toBeNull();
      expect(page.textContent).not.toContain(text);
      await fireEvent.click(within(toast).getByRole('button', { name: '關閉提示' }));
      expect(screen.queryByRole('alert')).toBeNull();
    };
    await expectToast('清單讀取失敗');
    await fireEvent.click(screen.getByRole('button', { name: '重試' }));
    await expectToast('內容讀取失敗');
    await fireEvent.click(screen.getByRole('button', { name: '重試內容' }));
    await screen.findByRole('button', { name: '留言' });
    await fireEvent.click(screen.getByRole('button', { name: '建立 PR／MR' }));
    await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 標題' }), '新功能');
    await waitFor(() => expect(mocked.requestBranches).toHaveBeenCalled());
    await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 來源分支' }), 'feature');
    await fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
    await expectToast('target_branch does not exist');
    expect((screen.getByRole('textbox', { name: 'PR／MR 標題' }) as HTMLInputElement).value).toBe(
      '新功能',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '取消建立' }).hasAttribute('disabled')).toBe(false),
    );
    await fireEvent.click(screen.getByRole('button', { name: '取消建立' }));
    await screen.findByRole('button', { name: '留言' });
    await fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    await expectToast('Changes 讀取失敗');
    await fireEvent.click(screen.getByRole('tab', { name: '概覽' }));
    await fireEvent.click(screen.getByRole('button', { name: '在網站開啟 PR' }));
    await expectToast('網站開啟失敗');
  });
  it('遠端操作期間可切換專案，但不卸載原頁或允許關閉進行中的專案', async () => {
    saveProjects();
    const request = {
      number: 7,
      title: '遠端 PR',
      body: '',
      author: 'dev',
      state: 'open',
      draft: false,
      sourceBranch: 'feature',
      targetBranch: 'main',
      updatedAt: '2026-10-12T08:00:00Z',
      url: 'https://github.com/team/repo/pull/7',
      labels: [],
    };
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: path === '/a' ? [{ name: 'origin', url: 'https://github.com/team/repo.git' }] : [],
    }));
    mocked.requests.mockResolvedValue({ items: [request], nextCursor: null });
    mocked.requestDetail.mockResolvedValue({
      request,
      headOid: 'a'.repeat(40),
      mergeStatus: 'clean',
    });
    let complete!: (message: string) => void;
    mocked.requestAction.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '瀏覽 PR／MR' }));
    await fireEvent.click(await screen.findByRole('button', { name: '留言' }));
    await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 操作內容' }), '留言');
    await fireEvent.click(screen.getByRole('button', { name: '確認留言' }));
    expect(screen.getByRole('button', { name: '建立 PR／MR' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(mocked.requests).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '建立 PR／MR' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '關閉 專案 A 分頁' }));
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(screen.getByRole('button', { name: 'Git 歷史' }).hasAttribute('disabled')).toBe(true);
    complete('留言已送出');
    await screen.findByText('留言已送出');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Git 歷史' }).hasAttribute('disabled')).toBe(false),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Git 歷史' }));
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.requestAction).toHaveBeenCalledTimes(1);
  });
  it('PR／MR 切換整頁、保留側邊欄，返回歷史與切換專案不混用', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: path === '/a' ? [{ name: 'origin', url: 'git@github.com:team/a.git' }] : [],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '瀏覽 PR／MR' }));
    await screen.findByRole('region', { name: 'PR／MR' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '專案 A' })).toBeTruthy();
    expect(mocked.requests).toHaveBeenCalledExactlyOnceWith('/a', 'origin', 'github', 'open', null);
    const create = within(document.querySelector('.toolbar') as HTMLElement).getByRole('button', {
      name: '建立 PR／MR',
    });
    await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false));
    await fireEvent.click(create);
    await fireEvent.update(
      await screen.findByRole('textbox', { name: 'PR／MR 標題' }),
      '專案 A 的建立草稿',
    );
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    expect(screen.queryByRole('button', { name: '建立 PR／MR' })).toBeNull();
    await fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    expect(
      ((await screen.findByRole('textbox', { name: 'PR／MR 標題' })) as HTMLInputElement).value,
    ).toBe('專案 A 的建立草稿');
    await fireEvent.click(screen.getByRole('button', { name: 'Git 歷史' }));
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(screen.getByRole('button', { name: '瀏覽 PR／MR' }).hasAttribute('disabled')).toBe(true);
    expect(mocked.operate).not.toHaveBeenCalled();
  });
  it('側邊欄可用鍵盤調整、保存與重設，視窗縮小時保留主區空間', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const separator = screen.getByRole('separator', { name: '調整側邊欄寬度' });
    await fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('232');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).sidebarWidth).toBe(232);
    await fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator.getAttribute('aria-valuenow')).toBe('216');
    await fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    await fireEvent.dblClick(separator);
    expect(separator.getAttribute('aria-valuenow')).toBe('216');
    vi.stubGlobal('innerWidth', 800);
    await fireEvent.resize(window);
    expect(separator.getAttribute('aria-valuenow')).toBe('200');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).sidebarWidth).toBe(216);
    expect(mocked.operate).not.toHaveBeenCalled();
  });
  it('建立、改名與移除群組會保存，不改變專案與目前分頁', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '建立群組' }));
    await fireEvent.update(screen.getByRole('textbox', { name: '群組名稱' }), '工作');
    await fireEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).groups[0].name).toBe('工作');
    await fireEvent.click(screen.getByRole('button', { name: '工作 群組選單' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '重新命名群組' }));
    await fireEvent.update(screen.getByRole('textbox', { name: '群組名稱' }), '個人');
    await fireEvent.click(screen.getByRole('button', { name: '儲存群組名稱' }));
    await fireEvent.click(screen.getByRole('button', { name: '個人 群組選單' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '移除群組（保留專案）' }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.groups).toEqual([]);
    expect(saved.projects).toHaveLength(2);
    expect(saved.active).toBe('/a');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(mocked.repository).toHaveBeenCalledTimes(1);
  });
  it('折疊會隱藏群組專案，搜尋會顯示結果且清除後保留折疊狀態', async () => {
    saveProjects();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    saved.groups = [{ id: 'work', name: '工作', collapsed: true }];
    saved.projects[0].groupId = 'work';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(screen.queryByRole('button', { name: '專案 A' })).toBeNull();
    await fireEvent.update(screen.getByRole('textbox', { name: '搜尋專案' }), '專案 A');
    expect(screen.getByRole('button', { name: '專案 A' })).toBeTruthy();
    await fireEvent.update(screen.getByRole('textbox', { name: '搜尋專案' }), '');
    expect(screen.queryByRole('button', { name: '專案 A' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '展開 工作 群組' }));
    expect(screen.getByRole('button', { name: '專案 A' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '折疊 工作 群組' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).groups[0].collapsed).toBe(true);
    expect(screen.getByRole('tab', { name: '專案 A' }).getAttribute('aria-selected')).toBe('true');
  });
  it('Stash 儲存訊息與未追蹤選項，刷新清單並保留視窗', async () => {
    saveProjects();
    let saved = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      workingFiles: saved
        ? []
        : [{ path: 'new.txt', staged: false, unstaged: true, untracked: true, conflict: false }],
      stashes: saved
        ? [
            {
              index: 0,
              oid: 'c'.repeat(40),
              message: 'On main: 我的暫存',
              date: '2026-10-06T08:00:00Z',
            },
          ]
        : [],
    }));
    mocked.operate.mockImplementation(async () => {
      saved = true;
      return 'saved';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById('commit-worktree')!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Stash' }));
    const dialog = screen.getByRole('dialog', { name: 'Stash' });
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Stash 訊息（可留空）'));
    const button = within(dialog).getByRole('button', { name: '儲存 Stash' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await fireEvent.click(within(dialog).getByLabelText('包含未追蹤檔案'));
    await fireEvent.update(within(dialog).getByLabelText('Stash 訊息（可留空）'), ' 我的暫存 ');
    await fireEvent.click(button);
    await within(dialog).findByRole('option', { name: /我的暫存/ });
    expect(mocked.operate).toHaveBeenCalledExactlyOnceWith('/a', {
      operation: 'stashPush',
      message: '我的暫存',
      includeUntracked: true,
      expectedHead: commits[0].oid,
      expectedBranch: 'refs/heads/main',
    });
    expect(within(dialog).queryByLabelText('Stash 訊息（可留空）')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '儲存 Stash' })).toBeNull();
    expect(within(dialog).getByText('目前工作區沒有可儲存的變更。')).toBeTruthy();
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Stash Apply 保留項目，Pop 使用所選項目與暫存選項', async () => {
    saveProjects();
    let stashes = [
      { index: 0, oid: 'c'.repeat(40), message: '第一份暫存', date: '2026-10-06T08:00:00Z' },
      { index: 1, oid: 'd'.repeat(40), message: '第二份暫存', date: '2026-10-05T08:00:00Z' },
    ];
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      stashes,
      workingFiles: [
        { path: 'file.txt', staged: false, unstaged: true, untracked: false, conflict: false },
      ],
    }));
    mocked.operate.mockImplementation(async (_path, request) => {
      if (request.operation === 'stashPop')
        stashes = stashes.filter((stash) => stash.oid !== request.stashOid);
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.getElementById('commit-worktree')!);
    await fireEvent.contextMenu(document.querySelector('.working-file-actions')!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Stash 工作區…' }));
    const dialog = screen.getByRole('dialog', { name: 'Stash' });
    await fireEvent.click(within(dialog).getByRole('option', { name: /第二份暫存/ }));
    await fireEvent.click(within(dialog).getByRole('button', { name: '套用 Stash' }));
    await waitFor(() =>
      expect(
        (within(dialog).getByRole('button', { name: '套用 Stash' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(within(dialog).getAllByRole('option')).toHaveLength(2);
    expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
      operation: 'stashApply',
      stashIndex: 1,
      stashOid: 'd'.repeat(40),
      restoreIndex: true,
      expectedHead: commits[0].oid,
      expectedBranch: 'refs/heads/main',
    });
    await fireEvent.click(within(dialog).getByLabelText('一併還原暫存狀態'));
    await fireEvent.click(within(dialog).getByRole('button', { name: '還原並移除 Stash' }));
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(1));
    expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
      operation: 'stashPop',
      stashIndex: 1,
      stashOid: 'd'.repeat(40),
      restoreIndex: false,
      expectedHead: commits[0].oid,
      expectedBranch: 'refs/heads/main',
    });
  });

  it('Stash 刪除需確認，可取消，失敗保留目標與錯誤並可重試', async () => {
    saveProjects();
    let exists = true;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      stashes: exists
        ? [{ index: 0, oid: 'c'.repeat(40), message: '重要暫存', date: '2026-10-06T08:00:00Z' }]
        : [],
    }));
    mocked.operate.mockRejectedValueOnce(new Error('Stash 清單已變更'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.getElementById('commit-worktree')!);
    await fireEvent.contextMenu(document.querySelector('.detail-scroll')!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Stash' }));
    const dialog = screen.getByRole('dialog', { name: 'Stash' });
    await fireEvent.click(within(dialog).getByRole('button', { name: '刪除 Stash' }));
    expect(mocked.operate).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole('button', { name: '取消刪除' }));
    expect(within(dialog).getByRole('option', { name: /重要暫存/ })).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: '刪除 Stash' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: '確認刪除 Stash' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toContain('Stash 清單已變更'),
    );
    await waitFor(() =>
      expect(
        (within(dialog).getByRole('button', { name: '確認刪除 Stash' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    mocked.operate.mockImplementation(async () => {
      exists = false;
      return 'ok';
    });
    await fireEvent.click(within(dialog).getByRole('button', { name: '確認刪除 Stash' }));
    await within(dialog).findByText('目前沒有 Stash。');
    expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
      operation: 'stashDrop',
      stashIndex: 0,
      stashOid: 'c'.repeat(40),
    });
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Stash Pop 失敗顯示錯誤，衝突時保留清單並禁止再次套用', async () => {
    saveProjects();
    let conflict = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      stashes: [
        { index: 0, oid: 'c'.repeat(40), message: '衝突暫存', date: '2026-10-06T08:00:00Z' },
      ],
      workingFiles: conflict
        ? [{ path: 'file.txt', staged: false, unstaged: true, untracked: false, conflict: true }]
        : [],
    }));
    let fail!: (error: Error) => void;
    mocked.operate.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
    const dialog = screen.getByRole('dialog', { name: 'Stash' });
    const pop = within(dialog).getByRole('button', { name: '還原並移除 Stash' });
    await fireEvent.click(pop);
    await fireEvent.click(pop);
    expect(mocked.operate).toHaveBeenCalledTimes(1);
    expect(
      (within(dialog).getByRole('button', { name: '關閉 Stash' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    conflict = true;
    fail(new Error('CONFLICT: Stash 保留'));
    await within(dialog).findByText(/CONFLICT: Stash 保留/);
    await within(dialog).findByText('工作區有衝突，請先解決衝突並暫存檔案。');
    expect(within(dialog).getAllByRole('option')).toHaveLength(1);
    expect(
      (within(dialog).getByRole('button', { name: '套用 Stash' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('repo 網站按鈕開啟 SSH 遠端對應網站，切換專案使用各自的網址', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: [{ name: 'origin', url: `git@github.com:team/${path.slice(1)}.git` }],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const button = screen.getByRole('button', { name: '開啟 repo 網站' });
    expect(button.getAttribute('title')).toContain('https://github.com/team/a');
    await fireEvent.click(button);
    expect(mocked.website).toHaveBeenLastCalledWith('https://github.com/team/a');
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(button);
    expect(mocked.website).toHaveBeenLastCalledWith('https://github.com/team/b');
    expect(mocked.operate).not.toHaveBeenCalled();
  });
  it('多個遠端時先選擇 repo，略過只有本機路徑的遠端', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: [
        { name: 'origin', url: 'https://github.com/team/fork.git' },
        { name: 'upstream', url: 'ssh://git@gitlab.example.com/team/repo.git' },
        { name: 'local', url: 'C:/repo.git' },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '開啟 repo 網站' }));
    expect(mocked.website).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'origin',
      'upstream',
    ]);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'upstream' }));
    expect(mocked.website).toHaveBeenCalledWith('https://gitlab.example.com/team/repo');
  });
  it('沒有網站遠端時停用 repo 按鈕並提供原因', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const button = screen.getByRole('button', { name: '開啟 repo 網站' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('此專案沒有可開啟的遠端 repo 網址');
    await fireEvent.click(button);
    expect(mocked.website).not.toHaveBeenCalled();
  });
  it('開啟網站失敗顯示錯誤且可重試', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      remotes: [{ name: 'origin', url: 'https://github.com/team/repo.git' }],
    }));
    mocked.website.mockRejectedValueOnce(new Error('browser unavailable'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const button = screen.getByRole('button', { name: '開啟 repo 網站' });
    await fireEvent.click(button);
    await screen.findByText('無法開啟 repo 網站：Error: browser unavailable');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.click(button);
    expect(mocked.website).toHaveBeenCalledTimes(2);
  });
  it('單擊 commit 只選取，雙擊開啟 Checkout 並沿用目標與 HEAD 檢查', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const row = document.getElementById(`commit-${commits[1].oid}`)!;
    await fireEvent.click(row);
    expect(screen.queryByRole('dialog')).toBeNull();
    await fireEvent.dblClick(row);
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe('detached');
    expect(mocked.operate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'checkout',
        oid: commits[1].oid,
        expectedHead: commits[0].oid,
        expectedBranch: 'refs/heads/main',
      }),
    );
  });
  it('雙擊同一 commit 上的分支標籤，只切換指定分支且不開啟 commit 對話框', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        ...snapshot(path).branches,
        { name: 'dev', oid: commits[1].oid, isHead: false, isRemote: false },
        { name: 'release', oid: commits[1].oid, isHead: false, isRemote: false },
      ],
      rows: snapshot(path).rows.map((row, i) =>
        i === 1 ? { ...row, branches: ['dev', 'release'] } : row,
      ),
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.dblClick(
      document.querySelectorAll(`#commit-${commits[1].oid} .branch-badge`)[1],
    );
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'switchBranch',
        branch: 'release',
      }),
    );
    expect(mocked.operate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('分支選單的第一次 click 保留目標，雙擊遠端指定正確追蹤分支', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        ...snapshot(path).branches,
        {
          name: 'origin/dev',
          localName: 'dev',
          oid: commits[1].oid,
          isHead: false,
          isRemote: true,
        },
        {
          name: 'origin/release',
          localName: 'release',
          oid: commits[1].oid,
          isHead: false,
          isRemote: true,
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    const branch = within(document.querySelector('.branch-list') as HTMLElement).getByRole(
      'button',
      { name: 'origin/release 遠端' },
    );
    await fireEvent.click(branch, { detail: 1 });
    expect(branch.isConnected).toBe(true);
    await fireEvent.click(branch, { detail: 2 });
    await fireEvent.dblClick(branch);
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe(
      'remote:origin/release',
    );
    expect((screen.getByLabelText('本機分支名稱') as HTMLInputElement).value).toBe('release');
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'checkout',
        oid: commits[1].oid,
        branch: 'release',
        remoteBranch: 'origin/release',
        expectedHead: commits[0].oid,
        expectedBranch: 'refs/heads/main',
      }),
    );
  });
  it('有進行中的 Git 操作時，雙擊不執行 Checkout', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      operationState: 'merge',
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.dblClick(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.dblClick(document.querySelector('.branch-badge')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.operate).not.toHaveBeenCalled();
  });
  it('選取 commit 會標亮整條線與 connector，切換 commit 時更新整條線', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      maxLane: 1,
      rows: [
        {
          ...snapshot(path).rows[0],
          cells: [
            { kind: 'commit', color: 9, secondary: 9 },
            { kind: 'empty', color: 0, secondary: 0 },
            { kind: 'pipe', color: 1, secondary: 1 },
          ],
        },
        {
          commit: null,
          branches: [],
          tags: [],
          isHead: false,
          cells: [
            { kind: 'pipe', color: 9, secondary: 9 },
            { kind: 'empty', color: 0, secondary: 0 },
            { kind: 'pipe', color: 1, secondary: 1 },
          ],
        },
        {
          ...snapshot(path).rows[1],
          cells: [
            { kind: 'pipe', color: 9, secondary: 9 },
            { kind: 'empty', color: 0, secondary: 0 },
            { kind: 'commit', color: 1, secondary: 1 },
          ],
        },
      ],
    }));
    const { container } = render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const lines = () =>
      Array.from(container.querySelectorAll('.graph-svg')).map((graph) =>
        Array.from(graph.querySelectorAll('.graph-stroke')).findIndex((group) =>
          group.querySelector('.graph-line-highlight'),
        ),
      );
    expect(lines()).toEqual([2, 2, 2]);
    await fireEvent.click(document.getElementById(`commit-${commits[0].oid}`)!);
    expect(lines()).toEqual([0, 0, 0]);
    await fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(lines()).toEqual([2, 2, 2]);
  });

  it.each([1, 2, 8])('commit 整列右鍵僅提供一個同步入口，有 %s 個遠端標籤', async (count) => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'main', oid: commits[1].oid, isHead: true, isRemote: false },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
        ...Array.from({ length: count - 1 }, (_, index) => ({
          name: `upstream${index}/main`,
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        })),
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    expect(screen.getAllByRole('menuitem', { name: /同步本機分支/ })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    const remote = count === 1 ? 'origin/main' : `upstream${count - 2}/main`;
    if (count > 1) {
      const source = screen.getByLabelText('同步來源（遠端分支）') as HTMLSelectElement;
      expect(source.value).toBe('');
      expect(source.options).toHaveLength(count + 1);
      expect(
        (screen.getByRole('button', { name: '執行同步本機分支' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(mocked.operate).not.toHaveBeenCalled();
      await fireEvent.update(source, remote);
    } else expect(screen.queryByLabelText('同步來源（遠端分支）')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toContain(`同步方向：${remote} → main`);
    await fireEvent.click(screen.getByRole('button', { name: '執行同步本機分支' }));
    expect(mocked.operate).toHaveBeenCalledWith(
      '/a',
      expect.objectContaining({
        operation: 'syncBranch',
        remoteBranch: remote,
        oid: commits[0].oid,
        branch: 'main',
        expectedLocalOid: commits[1].oid,
      }),
    );
  });

  it('切換同步來源會重新選取對應本機分支，避免沿用上一個目標', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'main', oid: commits[1].oid, isHead: true, isRemote: false },
        { name: 'master', oid: commits[1].oid, isHead: false, isRemote: false },
        {
          name: 'alias',
          oid: commits[1].oid,
          isHead: false,
          isRemote: false,
          upstream: 'origin/main',
        },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
        {
          name: 'origin/master',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'master',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    const source = screen.getByLabelText('同步來源（遠端分支）');
    const target = screen.getByLabelText('同步目標（本機分支）') as HTMLSelectElement;
    await fireEvent.update(source, 'origin/master');
    expect(target.value).toBe('master');
    await fireEvent.update(target, 'main');
    await fireEvent.update(source, 'origin/main');
    expect(target.value).toBe('alias');
    expect(screen.getByRole('dialog').textContent).toContain('同步方向：origin/main → alias');
    await fireEvent.click(screen.getByRole('button', { name: '執行同步本機分支' }));
    expect(mocked.operate).toHaveBeenCalledWith(
      '/a',
      expect.objectContaining({
        remoteBranch: 'origin/main',
        branch: 'alias',
        expectedLocalOid: commits[1].oid,
        oid: commits[0].oid,
      }),
    );
  });

  it('不是遠端 tip 的 commit 整列右鍵不提供遠端同步', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        ...snapshot(path).branches,
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    expect(screen.queryByRole('menuitem', { name: /同步本機分支/ })).toBeNull();
  });

  it.each([false, true])('遠端右鍵同步本機分支，是否為目前分支：%s', async (isHead) => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: isHead ? 'master' : 'dev',
      headOid: isHead ? commits[1].oid : commits[0].oid,
      branches: [
        { name: 'master', oid: commits[1].oid, isHead, isRemote: false },
        { name: 'dev', oid: commits[0].oid, isHead: !isHead, isRemote: false },
        {
          name: 'origin/master',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'master',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/master 遠端' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    const dialog = screen.getByRole('dialog', { name: '同步本機分支' });
    expect((screen.getByLabelText('同步目標（本機分支）') as HTMLSelectElement).value).toBe(
      'master',
    );
    expect(dialog.textContent).toContain('同步方向：origin/master → master');
    expect(dialog.textContent).toContain(
      isHead ? '會更新目前分支、暫存區與工作目錄' : '保留目前 Checkout 與工作目錄',
    );
    expect(mocked.operate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: '執行同步本機分支' }));
    expect(mocked.operate).toHaveBeenCalledWith('/a', {
      operation: 'syncBranch',
      branch: 'master',
      remoteBranch: 'origin/master',
      oid: commits[0].oid,
      expectedLocalOid: commits[1].oid,
      expectedHead: isHead ? commits[1].oid : commits[0].oid,
      expectedBranch: `refs/heads/${isHead ? 'master' : 'dev'}`,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('同步優先使用追蹤上游的本機別名，取消與快捷鍵不會寫入', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'main', oid: commits[0].oid, isHead: true, isRemote: false },
        {
          name: 'local-release',
          oid: commits[1].oid,
          isHead: false,
          isRemote: false,
          upstream: 'origin/main',
        },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/main 遠端' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    expect((screen.getByLabelText('同步目標（本機分支）') as HTMLSelectElement).value).toBe(
      'local-release',
    );
    await fireEvent.keyDown(window, { key: 'm' });
    expect(screen.queryByRole('menu')).toBeNull();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('同遠端有多個追蹤分支需選擇；已同步或目前工作區髒時停用執行', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        {
          name: 'dirty',
          oid: commits[1].oid,
          isHead: true,
          isRemote: false,
          upstream: 'origin/main',
        },
        {
          name: 'alias',
          oid: commits[1].oid,
          isHead: false,
          isRemote: false,
          upstream: 'origin/main',
        },
        { name: 'synced', oid: commits[0].oid, isHead: false, isRemote: false },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
      workingFiles: [
        { path: 'dirty.txt', staged: false, unstaged: true, untracked: false, conflict: false },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/main 遠端' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    const target = screen.getByLabelText('同步目標（本機分支）');
    const execute = screen.getByRole('button', { name: '執行同步本機分支' }) as HTMLButtonElement;
    expect((target as HTMLSelectElement).value).toBe('');
    expect(execute.disabled).toBe(true);
    await fireEvent.update(target, 'dirty');
    expect(execute.disabled).toBe(true);
    expect(screen.getByText('請先提交或處理目前工作區變更。')).toBeTruthy();
    await fireEvent.update(target, 'synced');
    expect(execute.disabled).toBe(true);
    expect(screen.getByText('本機分支已同步至此遠端紀錄。')).toBeTruthy();
    await fireEvent.update(target, 'alias');
    expect(execute.disabled).toBe(false);
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('無本機分支時遠端同步停用，指引先建立追蹤分支', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/main 遠端' }));
    const item = screen.getByRole('menuitem', {
      name: '同步本機分支至此遠端…',
    }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toContain('建立本機追蹤分支');
  });

  it('同步失敗保留對話框，操作期間禁止重複且切換分頁取消', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'main', oid: commits[1].oid, isHead: true, isRemote: false },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    let reject!: (error: Error) => void;
    mocked.operate.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/main 遠端' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '同步本機分支至此遠端…' }));
    const execute = screen.getByRole('button', { name: '執行同步本機分支' }) as HTMLButtonElement;
    await fireEvent.click(execute);
    expect(execute.disabled).toBe(true);
    await fireEvent.click(execute);
    expect(mocked.operate).toHaveBeenCalledTimes(1);
    reject(new Error('本機分支有獨有提交或歷史已分歧'));
    await screen.findByText(/歷史已分歧/);
    expect(screen.getByRole('dialog', { name: '同步本機分支' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each(['main', 'master', 'origin/master', 'upstream/main'])(
    '快速 focus %s，保留目前分支與工作區',
    async (name) => {
      saveProjects();
      mocked.repository.mockImplementation(async (path: string) => ({
        ...snapshot(path),
        head: 'dev',
        branches: [
          { name: 'dev', oid: commits[1].oid, isHead: true, isRemote: false },
          {
            name,
            oid: commits[0].oid,
            isHead: false,
            isRemote: name.includes('/'),
            localName: name.split('/').at(-1),
          },
        ],
      }));
      render(App);
      await screen.findByRole('heading', { name: '初始版本' });
      const button = screen.getByRole('button', { name: '跳至 master/main' });
      expect(button.title).toContain(name);
      await fireEvent.click(button);
      await fireEvent.click(screen.getByRole('menuitem', { name: `跳至 ${name}` }));
      await screen.findByRole('heading', { name: '加入專案管理' });
      await waitFor(() => expect(document.activeElement?.id).toBe(`commit-${commits[0].oid}`));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      expect(screen.getByRole('button', { name: 'dev' })).toBeTruthy();
      expect(mocked.operate).not.toHaveBeenCalled();
      expect(mocked.repository).toHaveBeenCalledTimes(1);
    },
  );

  it('main／master 與遠端可明確選擇，M 及工具列右鍵都可跳轉', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'main', oid: commits[0].oid, isHead: true, isRemote: false },
        { name: 'master', oid: commits[1].oid, isHead: false, isRemote: false },
        {
          name: 'origin/main',
          oid: commits[1].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      '跳至 main',
      '跳至 master',
      '跳至 origin/main',
      '跳至目前 checkout',
    ]);
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 main' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.keyDown(window, { key: 'm' });
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 master' }));
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.querySelector('.toolbar')!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 main' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('M 清除搜尋並跳至主分支，輸入框內打字不觸發', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const search = screen.getByRole('textbox', { name: '搜尋 commit' });
    await fireEvent.update(search, '無結果');
    await fireEvent.keyDown(search, { key: 'm' });
    expect(screen.getByRole('heading', { name: '初始版本' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'M' });
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(document.getElementById(`commit-${commits[0].oid}`)?.classList.contains('dimmed')).toBe(
      false,
    );
  });

  it.each(['dev', 'feature/main', null])(
    '跳至目前 checkout（%s）會清除搜尋、定位 HEAD 且不修改 Git',
    async (head) => {
      saveProjects();
      mocked.repository.mockImplementation(async (path: string) => ({
        ...snapshot(path),
        head,
        branches: head
          ? [
              { name: head, oid: commits[0].oid, isHead: true, isRemote: false },
              ...(head === 'dev'
                ? [{ name: 'master', oid: commits[1].oid, isHead: false, isRemote: false }]
                : []),
            ]
          : [],
      }));
      render(App);
      await screen.findByRole('heading', { name: '初始版本' });
      const search = screen.getByRole('textbox', { name: '搜尋 commit' });
      await fireEvent.update(search, '初始版本');
      await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
      await fireEvent.click(screen.getByRole('menuitem', { name: '跳至目前 checkout' }));
      await screen.findByRole('heading', { name: '加入專案管理' });
      await waitFor(() => expect(document.activeElement?.id).toBe(`commit-${commits[0].oid}`));
      expect((search as HTMLInputElement).value).toBe('');
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      await fireEvent.click(document.getElementById(`commit-${commits[1].oid}`)!);
      await fireEvent.contextMenu(document.querySelector('.toolbar')!);
      await fireEvent.click(screen.getByRole('menuitem', { name: '跳至目前 checkout' }));
      await screen.findByRole('heading', { name: '加入專案管理' });
      expect(mocked.operate).not.toHaveBeenCalled();
      expect(mocked.repository).toHaveBeenCalledTimes(1);
    },
  );

  it('尚無 commit 時停用目前 checkout 的跳轉', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: null,
      headOid: null,
      branches: [],
      rows: [],
      commitCount: 0,
    }));
    render(App);
    await screen.findByText('這個專案還沒有 commit。');
    expect(
      (screen.getByRole('button', { name: '跳至 master/main' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await fireEvent.contextMenu(document.querySelector('.toolbar')!);
    expect(
      (screen.getByRole('menuitem', { name: '跳至目前 checkout' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('沒有主分支時仍可跳至 checkout，不誤認 feature/main', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        { name: 'feature/main', oid: commits[0].oid, isHead: true, isRemote: false },
        {
          name: 'origin/feature/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'feature/main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(
      (screen.getByRole('button', { name: '跳至 master/main' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByRole('heading', { name: '初始版本' })).toBeTruthy();
    await fireEvent.contextMenu(document.querySelector('.toolbar')!);
    expect(
      (screen.getByRole('menuitem', { name: '跳至 master/main' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('較舊的 master 自動載入歷史後捲動及 focus', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string, _remote: boolean, limit: number) => ({
      ...snapshot(path),
      branches: [{ name: 'master', oid: commits[1].oid, isHead: false, isRemote: false }],
      rows: snapshot(path).rows.slice(0, limit < 1000 ? 1 : 2),
      hasMore: limit < 1000,
    }));
    render(App);
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 master' }));
    await screen.findByRole('heading', { name: '初始版本' });
    await waitFor(() => expect(document.activeElement?.id).toBe(`commit-${commits[1].oid}`));
    expect(mocked.repository).toHaveBeenLastCalledWith('/a', true, 1000);
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('主分支超出歷史上限時停止讀取並提示', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [{ name: 'master', oid: commits[1].oid, isHead: false, isRemote: false }],
      rows: snapshot(path).rows.slice(0, 1),
      hasMore: true,
    }));
    render(App);
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 master' }));
    await screen.findByText(/無法跳至 master.*5,000/);
    expect(mocked.repository.mock.calls.map((call) => call[2])).toEqual([
      500, 1000, 2000, 4000, 5000,
    ]);
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('跳轉載入失敗會結束並允許重新整理重試', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string, _remote: boolean, limit: number) => {
      if (limit > 500) throw new Error('read failed');
      return {
        ...snapshot(path),
        branches: [{ name: 'master', oid: commits[1].oid, isHead: false, isRemote: false }],
        rows: snapshot(path).rows.slice(0, 1),
        hasMore: true,
      };
    });
    render(App);
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 master' }));
    await screen.findByText(/無法跳至 master.*read failed/);
    expect(mocked.repository).toHaveBeenCalledTimes(2);
    mocked.repository.mockImplementation(async (path: string) => snapshot(path));
    await fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await screen.findByRole('button', { name: '跳至 master/main' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 main' }));
    await waitFor(() => expect(document.activeElement?.id).toBe(`commit-${commits[0].oid}`));
  });

  it('切換專案取消尚未完成的主分支跳轉', async () => {
    saveProjects();
    let resolve!: (data: Snapshot) => void;
    mocked.repository.mockImplementation((path: string, _remote: boolean, limit: number) =>
      path === '/a' && limit > 500
        ? new Promise<Snapshot>((done) => {
            resolve = done;
          })
        : Promise.resolve({
            ...snapshot(path),
            branches: [{ name: 'master', oid: commits[1].oid, isHead: false, isRemote: false }],
            rows: path === '/a' ? snapshot(path).rows.slice(0, 1) : snapshot(path).rows,
            hasMore: true,
          }),
    );
    render(App);
    await screen.findByRole('heading', { name: '加入專案管理' });
    await fireEvent.click(screen.getByRole('button', { name: '跳至 master/main' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '跳至 master' }));
    await fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    resolve(snapshot('/a'));
    await flushPromises();
    expect(screen.queryByRole('heading', { name: '初始版本' })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tabs.find((t: { path: string }) => t.path === '/b').selection).toBe(
      commits[0].oid,
    );
  });

  it.each([
    ['新增 Tag…', 'Tag 名稱'],
    ['建立分支…', '分支名稱'],
  ])('只有遠端分支的 commit 上 %s 不會套用 Checkout 分支名稱', async (label, field) => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: 'HEAD',
      branches: [
        {
          name: 'origin/release/2.102',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'release/2.102',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect((screen.getByLabelText(field) as HTMLInputElement).value).toBe('');
  });

  it('只有遠端分支時 Checkout 建立本機追蹤分支，切到 master 後合併最新 release', async () => {
    saveProjects();
    let state = 'detached';
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: state === 'detached' ? 'HEAD' : state === 'release' ? 'release/2.102' : 'master',
      headOid: state === 'master' ? commits[1].oid : commits[0].oid,
      branches: [
        {
          name: 'origin/release/2.102',
          oid: commits[0].oid,
          isRemote: true,
          isHead: false,
          localName: 'release/2.102',
        },
        {
          name: 'origin/master',
          oid: commits[1].oid,
          isRemote: true,
          isHead: false,
          localName: 'master',
        },
        ...(state !== 'detached'
          ? [
              {
                name: 'release/2.102',
                oid: commits[0].oid,
                isRemote: false,
                isHead: state === 'release',
              },
            ]
          : []),
        ...(state === 'master'
          ? [{ name: 'master', oid: commits[1].oid, isRemote: false, isHead: true }]
          : []),
      ],
    }));
    mocked.operate.mockImplementation(async (_path, request) => {
      if (request.operation === 'checkout')
        state = request.branch === 'master' ? 'master' : 'release';
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Checkout…' }));
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe(
      'remote:origin/release/2.102',
    );
    expect((screen.getByLabelText('本機分支名稱') as HTMLInputElement).value).toBe('release/2.102');
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('button', { name: 'release/2.102' });
    expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
      operation: 'checkout',
      oid: commits[0].oid,
      branch: 'release/2.102',
      remoteBranch: 'origin/release/2.102',
      expectedHead: commits[0].oid,
      expectedBranch: 'HEAD',
    });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '合併至目前分支…' }));
    expect(screen.getByText('合併方向：origin/master → release/2.102')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '取消操作' }));
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Checkout…' }));
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe(
      'remote:origin/master',
    );
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('button', { name: 'master' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '合併至目前分支…' }));
    expect(screen.getByText('合併方向：release/2.102 → master')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '執行 合併至目前分支' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
        operation: 'merge',
        oid: commits[0].oid,
        mode: 'auto',
        expectedHead: commits[1].oid,
        expectedBranch: 'refs/heads/master',
      }),
    );
  });

  it('遠端 Checkout 同名本機分支已存在時，必須選新名稱，不覆寫既有分支', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: 'master',
      headOid: commits[1].oid,
      branches: [
        { name: 'master', oid: commits[1].oid, isHead: true, isRemote: false },
        {
          name: 'origin/master',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'master',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Checkout…' }));
    const button = screen.getByRole('button', { name: '執行 Checkout' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await fireEvent.update(screen.getByLabelText('本機分支名稱'), 'master');
    expect(button.disabled).toBe(true);
    expect(mocked.operate).not.toHaveBeenCalled();
    await fireEvent.update(screen.getByLabelText('本機分支名稱'), 'master-test');
    expect(button.disabled).toBe(false);
    await fireEvent.click(button);
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
        operation: 'checkout',
        oid: commits[0].oid,
        branch: 'master-test',
        remoteBranch: 'origin/master',
        expectedHead: commits[1].oid,
        expectedBranch: 'refs/heads/master',
      }),
    );
  });

  it('擁有者錯誤需明確確認才信任；取消不加入專案', async () => {
    const path = 'K:\\Coding\\Repos\\新增資料夾';
    mocked.choose.mockResolvedValue([path]);
    mocked.open.mockRejectedValue({
      kind: 'ownership',
      path,
      message: 'Git 偵測到此專案的擁有者與目前使用者不同。',
    });
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '加入第一個專案' }));
    const dialog = await screen.findByRole('dialog', { name: '信任 Git 專案' });
    expect(within(dialog).getByText(path)).toBeTruthy();
    expect(within(dialog).getByText(/Git 全域信任清單/)).toBeTruthy();
    expect(mocked.trust).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab')).toBeNull();
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.trust).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('信任後加入原專案，失敗可重試，執行中不重複送出', async () => {
    const path = 'K:\\Coding\\Repos\\新增資料夾';
    mocked.choose.mockResolvedValue([path]);
    mocked.open.mockRejectedValue({ kind: 'ownership', path, message: '擁有者不同。' });
    mocked.trust.mockRejectedValueOnce(new Error('無法儲存 Git 信任設定'));
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '加入第一個專案' }));
    const dialog = await screen.findByRole('dialog', { name: '信任 Git 專案' });
    const button = within(dialog).getByRole('button', { name: '信任並加入專案' });
    await fireEvent.click(button);
    await screen.findByText(/無法儲存 Git 信任設定/);
    expect(screen.getByRole('dialog', { name: '信任 Git 專案' })).toBeTruthy();
    let finish!: (project: { path: string; name: string }) => void;
    mocked.trust.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(mocked.trust).toHaveBeenCalledTimes(2);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '信任 Git 專案' })).toBeTruthy();
    finish({ path, name: '信任專案' });
    await screen.findByRole('tab', { name: /信任專案/ });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.trust).toHaveBeenLastCalledWith(path);
    expect(mocked.repository).toHaveBeenCalledWith(path, true, 500);
  });

  it('多專案加入時保留正常專案，逐一確認擁有者錯誤且不處理一般錯誤', async () => {
    mocked.choose.mockResolvedValue(['/a', '/unsafe-one', '/invalid', '/unsafe-two']);
    mocked.open.mockImplementation(async (path: string) => {
      if (path.startsWith('/unsafe')) throw { kind: 'ownership', path, message: '擁有者不同。' };
      if (path === '/invalid') throw new Error('找不到 Git 儲存庫');
      return { path, name: '正常專案' };
    });
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '加入第一個專案' }));
    await screen.findByRole('tab', { name: /正常專案/ });
    const dialog = await screen.findByRole('dialog', { name: '信任 Git 專案' });
    expect(within(dialog).getByText('/unsafe-one')).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: '取消加入' }));
    expect(
      within(screen.getByRole('dialog', { name: '信任 Git 專案' })).getByText('/unsafe-two'),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '信任並加入專案' }));
    await screen.findByRole('tab', { name: /信任專案/ });
    expect(mocked.trust).toHaveBeenCalledExactlyOnceWith('/unsafe-two');
  });

  it.each<[string, string, string, Record<string, string>]>([
    ['merge', '合併至目前分支…', '合併至目前分支', { mode: 'auto' }],
    ['rebase', '將目前分支 Rebase 到此 Commit…', 'Rebase 目前分支', {}],
    ['reset', '將目前分支 Reset 到此 Commit…', 'Reset 目前分支', { mode: 'soft' }],
  ])('Checkout 到較新的 dev 後，可對 main 執行 %s', async (operation, label, title, extra) => {
    saveProjects();
    let onDev = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: onDev ? 'dev' : 'main',
      headOid: onDev ? commits[0].oid : commits[1].oid,
      branches: [
        { name: 'main', oid: commits[1].oid, isHead: !onDev, isRemote: false },
        { name: 'dev', oid: commits[0].oid, isHead: onDev, isRemote: false },
      ],
    }));
    mocked.operate.mockImplementation(async (_path, request) => {
      if (request.operation === 'checkout') onDev = request.branch === 'dev';
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Checkout…' }));
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe('branch:dev');
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('button', { name: 'dev' });
    expect(mocked.operate).toHaveBeenCalledWith('/a', {
      operation: 'checkout',
      oid: commits[0].oid,
      branch: 'dev',
      expectedHead: commits[1].oid,
      expectedBranch: 'refs/heads/main',
    });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    const item = screen.getByRole('menuitem', { name: String(label) }) as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    await fireEvent.click(item);
    await fireEvent.click(screen.getByRole('button', { name: `執行 ${title}` }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenLastCalledWith('/a', {
        operation,
        oid: commits[1].oid,
        expectedHead: commits[0].oid,
        expectedBranch: 'refs/heads/dev',
        ...extra,
      }),
    );
  });

  it('Checkout 多個本機分支時要求選擇，也可明確進入 Detached HEAD', async () => {
    saveProjects();
    let detached = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      head: detached ? 'HEAD' : 'main',
      headOid: detached ? commits[1].oid : commits[0].oid,
      branches: [
        { name: 'main', oid: commits[0].oid, isHead: !detached, isRemote: false },
        { name: 'dev', oid: commits[1].oid, isHead: false, isRemote: false },
        { name: 'other', oid: commits[1].oid, isHead: false, isRemote: false },
      ],
    }));
    mocked.operate.mockImplementation(async () => {
      detached = true;
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Checkout…' }));
    expect((screen.getByLabelText('Checkout 目標') as HTMLSelectElement).value).toBe('');
    expect(
      (screen.getByRole('button', { name: '執行 Checkout' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await fireEvent.update(screen.getByLabelText('Checkout 目標'), 'detached');
    await fireEvent.click(screen.getByRole('button', { name: '執行 Checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('button', { name: 'Detached HEAD · bbbbbbb' });
    expect(mocked.operate).toHaveBeenCalledWith('/a', {
      operation: 'checkout',
      oid: commits[1].oid,
      expectedHead: commits[0].oid,
      expectedBranch: 'refs/heads/main',
    });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    for (const label of [
      '合併至目前分支…',
      '將目前分支 Rebase 到此 Commit…',
      '將目前分支 Reset 到此 Commit…',
    ]) {
      const item = screen.getByRole('menuitem', { name: label }) as HTMLButtonElement;
      expect(item.disabled).toBe(true);
      expect(item.title).toContain('Detached HEAD');
    }
  });

  it.each<[CommitOperation, string, string]>([
    ['addTag', '新增 Tag…', '新增 Tag'],
    ['createBranch', '建立分支…', '建立分支'],
    ['checkout', 'Checkout…', 'Checkout'],
    ['cherryPick', 'Cherry-pick…', 'Cherry-pick'],
    ['revert', 'Revert…', 'Revert'],
    ['merge', '合併至目前分支…', '合併至目前分支'],
    ['rebase', '將目前分支 Rebase 到此 Commit…', 'Rebase 目前分支'],
    ['reset', '將目前分支 Reset 到此 Commit…', 'Reset 目前分支'],
  ])('Commit 選單 %s 操作使用目標 hash，送出前不執行 Git', async (operation, label, title) => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: label }));
    const dialog = screen.getByRole('dialog', { name: title });
    expect(mocked.operate).not.toHaveBeenCalled();
    if (operation === 'addTag') {
      await fireEvent.update(within(dialog).getByLabelText('Tag 名稱'), 'v1');
      await fireEvent.update(within(dialog).getByLabelText('Tag 註解（可留空）'), '說明');
    }
    if (operation === 'createBranch')
      await fireEvent.update(within(dialog).getByLabelText('分支名稱'), 'from-selected');
    await fireEvent.click(within(dialog).getByRole('button', { name: `執行 ${title}` }));
    const extra =
      operation === 'addTag'
        ? { tag: 'v1', message: '說明' }
        : operation === 'createBranch'
          ? { branch: 'from-selected', checkout: false }
          : operation === 'reset'
            ? { mode: 'soft' }
            : operation === 'merge'
              ? { mode: 'auto' }
              : {};
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation,
        oid: commits[1].oid,
        expectedHead: commits[0].oid,
        expectedBranch: 'refs/heads/main',
        ...extra,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('複製 commit hash 與標題使用右鍵點到的 commit', async () => {
    saveProjects();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '複製完整 commit hash' }));
    expect(writeText).toHaveBeenLastCalledWith(commits[0].oid);
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[0].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '複製 Commit 標題' }));
    expect(writeText).toHaveBeenLastCalledWith(commits[0].message);
  });

  it('Reset Hard 說明捨棄變更，取消或切換分頁不執行操作', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '將目前分支 Reset 到此 Commit…' }));
    await fireEvent.update(screen.getByLabelText('Reset 模式'), 'hard');
    expect(screen.getByText(/Hard Reset 會移動目前分支/)).toBeTruthy();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.operate).not.toHaveBeenCalled();
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '建立分支…' }));
    await fireEvent.click(screen.getByRole('tab', { name: /專案 B/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('Tag 操作失敗保留名稱並顯示錯誤', async () => {
    saveProjects();
    mocked.operate.mockRejectedValue(new Error('Tag already exists'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    await fireEvent.click(screen.getByRole('menuitem', { name: '新增 Tag…' }));
    await fireEvent.update(screen.getByLabelText('Tag 名稱'), 'v1');
    await fireEvent.click(screen.getByRole('button', { name: '執行 新增 Tag' }));
    await screen.findByText(/Tag already exists/);
    expect((screen.getByLabelText('Tag 名稱') as HTMLInputElement).value).toBe('v1');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('衝突後停用歷史操作，暫存解決內容後可繼續', async () => {
    saveProjects();
    let resolved = false;
    let continued = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      operationState: continued ? 'clean' : 'merge',
      workingFiles: continued
        ? []
        : [
            {
              path: 'conflict.txt',
              staged: resolved,
              unstaged: !resolved,
              conflict: !resolved,
              untracked: false,
            },
          ],
    }));
    mocked.operate.mockImplementation(async (_path, request) => {
      if (request.operation === 'stage') resolved = true;
      if (request.operation === 'continueOperation') continued = true;
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(
      (screen.getByRole('button', { name: '繼續目前操作' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await fireEvent.contextMenu(document.getElementById(`commit-${commits[1].oid}`)!);
    expect(
      (screen.getByRole('menuitem', { name: 'Cherry-pick…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await fireEvent.click(document.querySelector('.working-row')!);
    await fireEvent.click(screen.getByRole('button', { name: '暫存 conflict.txt' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '繼續目前操作' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await fireEvent.click(screen.getByRole('button', { name: '繼續目前操作' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', { operation: 'continueOperation' }),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: '繼續目前操作' })).toBeNull());
  });
  it('檔案右鍵選單區分暫存區域，沿用同一個操作並關閉選單', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      workingFiles: [
        { path: 'partial.txt', staged: true, unstaged: true, untracked: false, conflict: false },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.working-row')!);
    const unstage = screen.getByRole('button', { name: '取消暫存 partial.txt' });
    await fireEvent.contextMenu(unstage);
    expect(screen.getByRole('menuitem', { name: '取消暫存' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '暫存' })).toBeNull();
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(unstage);
    await fireEvent.contextMenu(screen.getByRole('button', { name: '暫存 partial.txt' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '暫存' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'stage',
        files: ['partial.txt'],
      }),
    );
    expect(screen.queryByRole('menu')).toBeNull();
    await fireEvent.contextMenu(screen.getByRole('textbox', { name: '提交訊息' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('右鍵選單支援鍵盤移動、外部點擊關閉與切換專案隔離', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.querySelector('.repo-title')!, {
      clientX: 400,
      clientY: 150,
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '重新整理' })),
    );
    const menu = screen.getByRole('menu');
    expect((screen.getByRole('menuitem', { name: 'Pull' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Fetch' }));
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Push' }));
    expect(screen.getByRole('heading', { name: '初始版本' })).toBeTruthy();
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    await fireEvent.contextMenu(document.querySelector('.working-row')!);
    await fireEvent.click(screen.getByRole('tab', { name: /專案 B/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(mocked.operate).not.toHaveBeenCalled();
  });

  it('分支右鍵選單可切換本機分支與 Checkout 遠端分支，HEAD 停用切換', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      branches: [
        ...snapshot(path).branches,
        { name: 'feature/test', oid: commits[1].oid, isHead: false, isRemote: false },
        {
          name: 'origin/main',
          oid: commits[0].oid,
          isHead: false,
          isRemote: true,
          localName: 'main',
        },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.contextMenu(document.querySelector('.branch-badge')!);
    expect((screen.getByRole('menuitem', { name: '切換分支' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await fireEvent.click(document.querySelector('.branch-picker > button')!);
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'origin/main 遠端' }));
    expect(
      (screen.getByRole('menuitem', { name: 'Checkout 遠端分支…' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'feature/test' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: '切換分支' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'switchBranch',
        branch: 'feature/test',
      }),
    );
  });

  it('Git 操作按鈕只顯示圖示，保留 tooltip 與無障礙名稱', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    for (const name of ['Fetch', 'Pull', 'Push', '分支操作', '重新整理']) {
      const button = screen.getByRole('button', { name });
      expect(button.textContent?.trim()).toBe('');
      expect(button.getAttribute('title')).toContain(name);
      expect(button.querySelector('svg')).not.toBeNull();
    }
  });
  it('執行操作時右鍵選單停用寫入，無法重複觸發', async () => {
    saveProjects();
    let finish!: (value: string) => void;
    mocked.operate.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await fireEvent.contextMenu(document.querySelector('.git-actions')!);
    const item = screen.getByRole('menuitem', { name: 'Fetch' });
    expect((item as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(item);
    expect(mocked.operate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menu')));
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    finish('ok');
    await flushPromises();
  });
  it('暫存後更新工作區，提交僅傳送訊息，成功後清空輸入', async () => {
    saveProjects();
    let staged = false;
    let committed = false;
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      workingFiles: committed
        ? []
        : [{ path: '中文.txt', staged, unstaged: !staged, untracked: !staged, conflict: false }],
    }));
    mocked.operate.mockImplementation(async (_path, request) => {
      if (request.operation === 'stage') staged = true;
      if (request.operation === 'commit') committed = true;
      return 'ok';
    });
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.working-row')!);
    await fireEvent.click(screen.getByRole('button', { name: '暫存 中文.txt' }));
    await screen.findByRole('button', { name: '取消暫存 中文.txt' });
    expect(mocked.operate).toHaveBeenCalledWith('/a', { operation: 'stage', files: ['中文.txt'] });
    await fireEvent.update(screen.getByRole('textbox', { name: '提交訊息' }), '我的提交');
    await fireEvent.click(screen.getByRole('button', { name: '提交已暫存變更' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'commit',
        message: '我的提交',
      }),
    );
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: '提交訊息' }) as HTMLTextAreaElement).value).toBe(
        '',
      ),
    );
    expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(3);
  });

  it('提交失敗保留訊息，顯示錯誤並重新讀取工作區', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      workingFiles: [
        { path: 'file.txt', staged: true, unstaged: false, untracked: false, conflict: false },
      ],
    }));
    mocked.operate.mockRejectedValue(new Error('pre-commit hook failed'));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.working-row')!);
    await fireEvent.update(screen.getByRole('textbox', { name: '提交訊息' }), '保留訊息');
    await fireEvent.click(screen.getByRole('button', { name: '提交已暫存變更' }));
    await screen.findByText(/pre-commit hook failed/);
    expect((screen.getByRole('textbox', { name: '提交訊息' }) as HTMLTextAreaElement).value).toBe(
      '保留訊息',
    );
    await waitFor(() =>
      expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(2),
    );
  });

  it('操作期間禁止重複執行，切換專案後仍更新原專案', async () => {
    saveProjects();
    let finish!: (value: string) => void;
    mocked.operate.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const fetch = screen.getByRole('button', { name: 'Fetch' });
    await fireEvent.click(fetch);
    expect((fetch as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(fetch);
    expect(mocked.operate).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('tab', { name: /專案 B/ }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    finish('ok');
    await screen.findByText('專案 A：Git 操作已完成。');
    await waitFor(() =>
      expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(2),
    );
    expect(mocked.repository.mock.calls.filter(([path]) => path === '/b')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '加入專案管理' })).toBeTruthy();
    await flushPromises();
    await fireEvent.click(screen.getByRole('tab', { name: /專案 A/ }));
    await screen.findByRole('heading', { name: '初始版本' });
    expect(mocked.repository.mock.calls.filter(([path]) => path === '/a')).toHaveLength(2);
  });

  it('分支操作建立分支並刷新 HEAD', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '分支操作' }));
    await fireEvent.keyDown(screen.getByRole('button', { name: '分支操作' }), { key: 'Escape' });
    expect(screen.queryByLabelText('建立並切換分支')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '分支操作' }));
    await fireEvent.update(screen.getByLabelText('建立並切換分支'), 'feature/test');
    await fireEvent.click(screen.getByRole('button', { name: '建立分支' }));
    await waitFor(() =>
      expect(mocked.operate).toHaveBeenCalledWith('/a', {
        operation: 'createBranch',
        branch: 'feature/test',
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText('建立並切換分支')).toBeNull());
  });
  it('整條線高亮可關閉並保存，重開後可重新啟用且保留 commit 選取', async () => {
    saveProjects();
    const app = render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(document.querySelector('.graph-glow')).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /^選取 commit 時高亮整條線/ }));
    await fireEvent.click(screen.getByRole('button', { name: '關閉偏好設定' }));
    expect(document.querySelector('.graph-glow, .graph-node-highlight')).toBeNull();
    expect(document.querySelector('.graph-head-node')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).highlightSelectedLine).toBe(false);
    expect(document.querySelector('.commit-row.selected')?.id).toBe(`commit-${commits[1].oid}`);

    app.unmount();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(document.querySelector('.graph-glow, .graph-node-highlight')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    const toggle = screen.getByRole('checkbox', {
      name: /^選取 commit 時高亮整條線/,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await fireEvent.click(toggle);
    await fireEvent.click(screen.getByRole('button', { name: '關閉偏好設定' }));
    expect(document.querySelector('.graph-glow')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).highlightSelectedLine).toBe(true);
    expect(document.querySelector('.commit-row.selected')?.id).toBe(`commit-${commits[1].oid}`);
  });

  it('偏好設定即時切換標籤配色與 HEAD 樣式，重設不改動已開啟分頁', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    const settings = screen.getByRole('dialog', { name: '偏好設定' });
    await waitFor(() => {
      for (const id of ['ui-fonts', 'code-fonts']) {
        expect(
          Array.from(settings.querySelectorAll(`#${id} option`), (option) =>
            option.getAttribute('value'),
          ),
        ).toEqual(['', 'Arial', '自訂安裝字體', 'Cascadia Code']);
      }
    });
    const history = screen.getByRole('region', { name: 'Git 歷史' });
    expect((history.closest('.main-content') as HTMLElement).style.display).not.toBe('none');
    expect(history.closest('.main')?.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(
      within(settings).getByRole('button', { name: '關閉偏好設定' }),
    );
    await fireEvent.click(
      within(settings).getByRole('checkbox', { name: /^分支標籤跟隨分支線顏色/ }),
    );
    await fireEvent.click(within(settings).getByRole('checkbox', { name: /^醒目顯示 HEAD 節點/ }));
    await fireEvent.click(within(settings).getByRole('button', { name: '關閉偏好設定' }));
    expect(screen.queryByRole('dialog', { name: '偏好設定' })).toBeNull();
    expect(history.closest('.main')?.hasAttribute('inert')).toBe(false);
    expect(history.querySelector('.branch-badge.follows-line')).not.toBeNull();
    expect(history.querySelector('.graph-head-node')).toBeNull();
    expect(history.querySelector('[aria-current="true"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).followBranchColor).toBe(true);
    await fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    await fireEvent.click(screen.getByRole('button', { name: '還原預設設定' }));
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual(defaultPreferences);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(history.querySelector('.branch-badge.follows-line')).toBeNull();
    expect(history.querySelector('.graph-head-node')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).tabs[0].selection).toBe(commits[1].oid);
  });

  it('系統字體讀取失敗保留已儲存字體，重新開啟後可切換完整清單', async () => {
    mocked.fonts.mockRejectedValueOnce(new Error('font enumeration failed'));
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ ...defaultPreferences, fontFamily: '已儲存字體' }),
    );
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    await screen.findByText('無法載入系統字體，請重新開啟偏好設定再試。');
    const uiFont = screen.getByRole('combobox', { name: '介面字體' }) as HTMLSelectElement;
    expect(uiFont.value).toBe('已儲存字體');
    await fireEvent.click(screen.getByRole('button', { name: '關閉偏好設定' }));
    await fireEvent.click(screen.getByRole('button', { name: '偏好設定' }));
    await waitFor(() => expect(document.querySelectorAll('#ui-fonts option')).toHaveLength(5));
    expect(screen.queryByText('無法載入系統字體，請重新開啟偏好設定再試。')).toBeNull();
    const reopenedUiFont = screen.getByRole('combobox', { name: '介面字體' }) as HTMLSelectElement;
    expect(reopenedUiFont.value).toBe('已儲存字體');
    await fireEvent.update(reopenedUiFont, 'Arial');
    expect(Array.from(reopenedUiFont.options, (option) => option.value)).toContain('自訂安裝字體');
    await fireEvent.update(reopenedUiFont, '自訂安裝字體');
    expect(Array.from(reopenedUiFont.options, (option) => option.value)).toContain('Arial');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).fontFamily).toBe('自訂安裝字體');
    expect(mocked.fonts).toHaveBeenCalledTimes(2);
  });

  it('載入已儲存的外觀設定，新分頁使用瀏覽預設值，既有分頁保留原設定', async () => {
    saveProjects();
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        ...defaultPreferences,
        fontSize: 18,
        density: 'compact',
        defaultRemotes: false,
        defaultCommitLimit: 1000,
      }),
    );
    mocked.choose.mockResolvedValue(['/c']);
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    expect(document.querySelector('.commit-row .graph-svg')?.getAttribute('height')).toBe('39');
    expect(mocked.repository).toHaveBeenCalledWith('/a', true, 500);
    await fireEvent.click(screen.getByRole('button', { name: /加入專案 Ctrl O/ }));
    await waitFor(() => expect(mocked.repository).toHaveBeenCalledWith('/c', false, 1000));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tabs.find((t: { path: string }) => t.path === '/a').limit).toBe(500);
  });

  it('HEAD 節點持續醒目顯示，瀏覽其他 commit 不會移動標記，重新整理會跟隨 checkout', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const history = screen.getByRole('region', { name: 'Git 歷史' });
    const headRow = history.querySelector(`#commit-${commits[0].oid}`)!;
    const otherRow = history.querySelector(`#commit-${commits[1].oid}`)!;
    expect(headRow.querySelector('.graph-head-node')).not.toBeNull();
    expect(headRow.getAttribute('aria-current')).toBe('true');
    expect(otherRow.classList.contains('selected')).toBe(true);
    expect(otherRow.querySelector('.graph-head-node')).toBeNull();

    await fireEvent.click(headRow);
    await fireEvent.click(otherRow);
    expect(history.querySelectorAll('.graph-head-node')).toHaveLength(1);
    expect(headRow.querySelector('.graph-head-node')).not.toBeNull();

    mocked.repository.mockImplementation(async (path: string) => {
      const data = snapshot(path);
      data.headOid = commits[1].oid;
      data.head = null;
      data.rows = data.rows.map((row) => ({ ...row, isHead: row.commit?.oid === commits[1].oid }));
      return data;
    });
    await fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await waitFor(() => expect(otherRow.querySelector('.graph-head-node')).not.toBeNull());
    expect(headRow.querySelector('.graph-head-node')).toBeNull();
    expect(otherRow.getAttribute('aria-current')).toBe('true');
    expect(history.querySelectorAll('.graph-head-node')).toHaveLength(1);
  });

  it('Git 歷史頂端不畫餘線，下一筆 commit 保留來自上一列的連線', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    const history = screen.getByRole('region', { name: 'Git 歷史' });
    const graphs = history.querySelectorAll('.commit-row .graph-svg');
    expect(graphs[0].querySelector('path')?.getAttribute('d')).toBe('M18 16 V32');
    expect(graphs[1].querySelector('path')?.getAttribute('d')).toBe('M18 0 V32');
  });

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
    await fireEvent.click(screen.getByRole('button', { name: /初始版本.*作者 B/ }));
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
    await fireEvent.click(screen.getByRole('button', { name: /加入專案管理.*作者 A/ }));
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

  it('commit 檔案的變更類型依 kind 套用對應的 class', async () => {
    saveProjects();
    const latest = detail(commits[0].oid);
    latest.files = (['Added', 'Modified', 'Deleted', 'Renamed'] as const).map((kind) => ({
      path: `${kind}.ts`,
      kind,
      insertions: 1,
      deletions: 0,
      binary: false,
    }));
    latest.totalFiles = latest.files.length;
    mocked.commit.mockResolvedValue(latest);
    render(App);
    const panel = await screen.findByRole('region', { name: '詳細資訊' });
    await within(panel).findByRole('button', { name: /Added.ts/ });
    const kinds = Array.from(panel.querySelectorAll('.file-kind')).map((el) => [
      el.textContent,
      el.className,
    ]);
    expect(kinds).toEqual([
      ['A', 'file-kind kind-added'],
      ['M', 'file-kind kind-modified'],
      ['D', 'file-kind kind-deleted'],
      ['R', 'file-kind kind-renamed'],
    ]);
  });

  it('工作區檔案標籤依衝突、新增、變更套用對應的 class', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => ({
      ...snapshot(path),
      workingFiles: [
        { path: 'c.txt', staged: false, unstaged: true, untracked: false, conflict: true },
        { path: 'n.txt', staged: false, unstaged: true, untracked: true, conflict: false },
        { path: 'm.txt', staged: false, unstaged: true, untracked: false, conflict: false },
      ],
    }));
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(document.querySelector('.working-row')!);
    const panel = await screen.findByRole('region', { name: '詳細資訊' });
    await within(panel).findAllByRole('button', { name: /c.txt/ });
    const labels = Array.from(panel.querySelectorAll('.file-row small')).map((el) => [
      el.textContent,
      el.className,
    ]);
    expect(labels).toEqual([
      ['衝突', 'kind-conflicted'],
      ['新增', 'kind-added'],
      ['變更', 'kind-modified'],
    ]);
  });

  it.each(['隱藏終端機', '結束終端機'])('%s 更新 Git 資料時不插入進度區塊', async (name) => {
    saveProjects();
    render(App, {
      global: {
        stubs: {
          TerminalPanel: {
            emits: ['hide', 'close'],
            template: `<section><button @click="$emit('hide')">隱藏終端機</button><button @click="$emit('close')">結束終端機</button></section>`,
          },
        },
      },
    });
    await screen.findByRole('heading', { name: '初始版本' });
    await fireEvent.click(screen.getByRole('button', { name: '開啟／隱藏終端機' }));
    let finish!: (data: Snapshot) => void;
    mocked.repository.mockImplementationOnce(
      () =>
        new Promise<Snapshot>((resolve) => {
          finish = resolve;
        }),
    );
    await fireEvent.click(screen.getByRole('button', { name }));
    await screen.findByText('正在更新…');
    expect(document.getElementById('git-operation-status')?.textContent?.trim()).toBe('');
    expect(screen.queryByText('正在執行 Git 操作…')).toBeNull();
    expect((screen.getByRole('button', { name: 'Fetch' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('region', { name: 'Git 歷史' })).toBeTruthy();
    finish(snapshot('/a'));
    await screen.findByText('已同步本機資料');
    expect((screen.getByRole('button', { name: 'Fetch' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('Git 操作進度顯示在既有底部狀態列', async () => {
    saveProjects();
    render(App);
    await screen.findByRole('heading', { name: '初始版本' });
    let finish!: (result: string) => void;
    mocked.operate.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    const progress = await screen.findByText('正在執行 Git 操作…');
    expect(progress.closest('.status-bar')).toBeTruthy();
    expect(document.getElementById('git-operation-status')?.textContent?.trim()).toBe('');
    finish('ok');
    await screen.findByText('專案 A：Git 操作已完成。');
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
