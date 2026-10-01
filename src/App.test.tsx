// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Commit, CommitDetail, Snapshot } from './types';
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
  it('一次加入多個專案，獨立切換並在重開時還原選取', async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /加入第一個專案/ }));
    await screen.findByRole('tab', { name: '專案 B' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await screen.findByRole('heading', { name: '加入專案管理' });
    fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await waitFor(() => expect(mocked.repository).toHaveBeenCalledWith('/a', true, 500));
    await screen.findByRole('heading', { name: '加入專案管理' });
    fireEvent.click(screen.getByRole('button', { name: /初始版本 作者 B/ }));
    await screen.findByRole('heading', { name: '初始版本' });
    fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    fireEvent.click(screen.getByRole('tab', { name: '專案 A' }));
    await screen.findByRole('heading', { name: '初始版本' });
    first.unmount();
    render(<App />);
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
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '專案 B' });
    await screen.findByRole('heading', { name: '加入專案管理' });
    const stale = snapshot('/a');
    stale.rows = [{ ...stale.rows[0], commit: { ...commits[0], message: '過期的資料' } }];
    await act(async () => {
      resolveA(stale);
    });
    expect(screen.queryByText('過期的資料')).toBeNull();
    expect(screen.getByRole('heading', { name: '專案 B' })).toBeTruthy();
  });

  it('專案讀取失敗仍可使用其他分頁', async () => {
    saveProjects();
    mocked.repository.mockImplementation(async (path: string) => {
      if (path === '/a') throw new Error('資料夾已移動');
      return snapshot(path);
    });
    render(<App />);
    await screen.findByText(/資料夾已移動/);
    fireEvent.click(screen.getByRole('tab', { name: '專案 B' }));
    await screen.findByRole('heading', { name: '加入專案管理' });
    expect(screen.queryByText(/資料夾已移動/)).toBeNull();
  });

  it('同一個部分暫存檔案可分別查看已暫存與未暫存 diff', async () => {
    saveProjects();
    const data = snapshot('/a');
    data.workingFiles = [
      { path: 'README.md', staged: true, unstaged: true, untracked: false, conflict: false },
    ];
    mocked.repository.mockResolvedValue(data);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /工作區 1 個檔案尚未提交/ }));
    const panel = screen.getByRole('region', { name: '詳細資訊' });
    const files = within(panel).getAllByRole('button', { name: /README.md 變更/ });
    expect(files).toHaveLength(2);
    fireEvent.click(files[0]);
    await screen.findByText('新的內容');
    expect(mocked.patch).toHaveBeenLastCalledWith('/a', null, 'README.md', 'staged');
    fireEvent.click(screen.getByRole('button', { name: '返回檔案清單' }));
    fireEvent.click(within(panel).getAllByRole('button', { name: /README.md 變更/ })[1]);
    await screen.findByText('新的內容');
    expect(mocked.patch).toHaveBeenLastCalledWith('/a', null, 'README.md', 'unstaged');
  });

  it('關閉分頁後，專案清單仍可重新開啟', async () => {
    saveProjects();
    render(<App />);
    await screen.findByRole('heading', { name: '初始版本' });
    fireEvent.click(screen.getByRole('button', { name: '關閉 專案 A 分頁' }));
    expect(screen.queryByRole('tab', { name: '專案 A' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '專案 A' }));
    await screen.findByRole('tab', { name: '專案 A' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
