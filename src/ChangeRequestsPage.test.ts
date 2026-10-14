// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import ChangeRequestsPage from './ChangeRequestsPage.vue';
import { detectForge } from './changeRequests';
import type { ChangeRequest, ChangeRequestPage } from './types';

const mocked = vi.hoisted(() => ({
  read: vi.fn(),
  website: vi.fn(),
  detail: vi.fn(),
  changes: vi.fn(),
  action: vi.fn(),
  branches: vi.fn(),
}));
vi.mock('./api', () => ({
  demo: false,
  native: true,
  api: {
    changeRequests: mocked.read,
    requestDetail: mocked.detail,
    requestChanges: mocked.changes,
    requestAction: mocked.action,
    requestBranches: mocked.branches,
  },
  openRepositoryWebsite: mocked.website,
}));
const props = {
  active: true,
  path: '/a',
  name: '專案 A',
  remotes: [
    { name: 'upstream', url: 'https://gitlab.com/group/sub/repo.git' },
    { name: 'origin', url: 'git@github.com:team/repo.git' },
  ],
};
const item = (number = 7, title = '加入搜尋'): ChangeRequest => ({
  number,
  title,
  author: 'alice',
  state: 'open',
  draft: true,
  body: '<script>alert(1)</script>\n原始說明',
  sourceBranch: 'feature/search',
  targetBranch: 'main',
  updatedAt: '2026-10-12T08:00:00Z',
  url: `https://github.com/team/repo/pull/${number}`,
  labels: ['feature'],
});
function deferred() {
  let resolve!: (page: ChangeRequestPage) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ChangeRequestPage>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocked.read.mockResolvedValue({ items: [item()], nextCursor: null });
  mocked.website.mockResolvedValue(undefined);
  mocked.detail.mockImplementation(async (_path, _remote, _provider, number) => {
    const page = (await mocked.read.mock.results.at(-1)?.value) as ChangeRequestPage;
    return {
      request: page?.items.find((request) => request.number === number) ?? item(number),
      headOid: 'a'.repeat(40),
      mergeStatus: 'clean',
    };
  });
  mocked.changes.mockResolvedValue({ files: [], headOid: 'a'.repeat(40), nextCursor: null });
  mocked.action.mockResolvedValue('操作已完成');
  mocked.branches.mockResolvedValue({ branches: ['main', 'feature/new'], defaultBranch: 'main' });
});
afterEach(cleanup);

it('選擇 origin、顯示內容與草稿，說明當成文字並使用網站 opener', async () => {
  render(ChangeRequestsPage, { props });
  await screen.findByRole('heading', { name: '加入搜尋' });
  expect(mocked.read).toHaveBeenCalledExactlyOnceWith('/a', 'origin', 'github', 'open', null);
  expect(screen.getByText('feature/search')).toBeTruthy();
  expect(screen.getByText('原始說明', { exact: false }).textContent).toContain('<script>');
  expect(document.querySelector('.request-body script')).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: '在網站開啟 PR' }));
  expect(mocked.website).toHaveBeenCalledExactlyOnceWith('https://github.com/team/repo/pull/7');
});

it('切換遠端與狀態使用正確參數，舊回應不會覆蓋目前清單', async () => {
  const old = deferred();
  mocked.read.mockReturnValueOnce(old.promise);
  render(ChangeRequestsPage, { props });
  await fireEvent.click(screen.getByRole('button', { name: 'PR／MR 來源設定' }));
  await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 遠端' }), 'upstream');
  await screen.findByRole('heading', { name: '加入搜尋' });
  expect(mocked.read).toHaveBeenLastCalledWith('/a', 'upstream', 'gitlab', 'open', null);
  mocked.read.mockResolvedValue({
    items: [{ ...item(8, '已合併變更'), state: 'merged' }],
    nextCursor: null,
  });
  await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 狀態' }), 'merged');
  await screen.findByRole('heading', { name: '已合併變更' });
  old.resolve({ items: [item(99, '過期回應')], nextCursor: 'old' });
  await waitFor(() => expect(screen.queryByText('過期回應')).toBeNull());
  expect(mocked.read).toHaveBeenLastCalledWith('/a', 'upstream', 'gitlab', 'merged', null);
  expect(screen.queryByRole('button', { name: '載入更多 MR' })).toBeNull();
});

it('載入更多保留選取、去重並可依作者與分支搜尋', async () => {
  mocked.read.mockResolvedValueOnce({ items: [item()], nextCursor: 'next' }).mockResolvedValueOnce({
    items: [item(), { ...item(8, '修正布局'), author: 'bob', sourceBranch: 'fix/layout' }],
    nextCursor: null,
  });
  render(ChangeRequestsPage, { props });
  await screen.findByRole('heading', { name: '加入搜尋' });
  await fireEvent.click(screen.getByRole('button', { name: '載入更多 PR' }));
  await screen.findByText('已載入 2 筆');
  expect(screen.getByRole('heading', { name: '加入搜尋' })).toBeTruthy();
  expect(mocked.read).toHaveBeenLastCalledWith('/a', 'origin', 'github', 'open', 'next');
  await fireEvent.update(screen.getByRole('textbox', { name: '搜尋已載入 PR／MR' }), 'bob');
  await screen.findByRole('heading', { name: '修正布局' });
  await fireEvent.update(
    screen.getByRole('textbox', { name: '搜尋已載入 PR／MR' }),
    'feature/search',
  );
  await screen.findByRole('heading', { name: '加入搜尋' });
  await fireEvent.update(screen.getByRole('textbox', { name: '搜尋已載入 PR／MR' }), '不存在');
  expect(screen.getByText('已載入的項目沒有符合搜尋條件。')).toBeTruthy();
});

it('載入失敗可重試，載入更多失敗仍保留原清單與游標', async () => {
  mocked.read
    .mockRejectedValueOnce(new Error('請先登入 gh'))
    .mockResolvedValueOnce({ items: [item()], nextCursor: 'next' })
    .mockRejectedValueOnce(new Error('網路中斷'))
    .mockResolvedValueOnce({ items: [item(8, '第二頁')], nextCursor: null });
  const view = render(ChangeRequestsPage, { props });
  await screen.findByRole('button', { name: '重試' });
  expect(view.emitted('error')?.at(-1)).toEqual(['Error: 請先登入 gh']);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/請先登入 gh/)).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: '重試' }));
  await screen.findByRole('heading', { name: '加入搜尋' });
  await fireEvent.click(screen.getByRole('button', { name: '載入更多 PR' }));
  await screen.findByRole('button', { name: '重試' });
  expect(view.emitted('error')?.at(-1)).toEqual(['Error: 網路中斷']);
  expect(screen.getByRole('heading', { name: '加入搜尋' })).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: '重試' }));
  await screen.findByText('已載入 2 筆');
  expect(mocked.read).toHaveBeenLastCalledWith('/a', 'origin', 'github', 'open', 'next');
});

it('載入期間不允許重複重新整理，卸載後忽略晚到回應', async () => {
  const request = deferred();
  mocked.read.mockReturnValue(request.promise);
  const view = render(ChangeRequestsPage, { props });
  expect(screen.getByRole('button', { name: '重新整理 PR／MR' }).hasAttribute('disabled')).toBe(
    true,
  );
  view.unmount();
  request.resolve({ items: [item()], nextCursor: null });
  await Promise.resolve();
  expect(view.emitted('error')).toBeUndefined();
  expect(screen.queryByRole('region', { name: 'PR／MR' })).toBeNull();
});

it('未知主機須手動選擇平台，空結果與 opener 錯誤清楚顯示', async () => {
  const view = render(ChangeRequestsPage, {
    props: {
      ...props,
      remotes: [{ name: 'origin', url: 'ssh://git@code.example.com/team/repo.git' }],
    },
  });
  expect(mocked.read).not.toHaveBeenCalled();
  expect(screen.getByText('請選擇這個遠端使用的 GitHub 或 GitLab 平台。')).toBeTruthy();
  await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 平台' }), 'github');
  await screen.findByRole('heading', { name: '加入搜尋' });
  mocked.website.mockRejectedValue(new Error('開啟失敗'));
  await fireEvent.click(screen.getByRole('button', { name: '在網站開啟 PR' }));
  await waitFor(() =>
    expect(view.emitted('error')?.at(-1)).toEqual(['無法開啟網站：Error: 開啟失敗']),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  mocked.read.mockResolvedValue({ items: [], nextCursor: null });
  await fireEvent.click(screen.getByRole('button', { name: '重新整理 PR／MR' }));
  await screen.findByText('沒有開啟中的 PR。');
});

it('整頁沒有 dialog、焦點圈限或 Escape 關閉行為', async () => {
  render(ChangeRequestsPage, { props });
  await screen.findByRole('heading', { name: '加入搜尋' });
  expect(screen.queryByRole('dialog')).toBeNull();
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  screen.getByRole('combobox', { name: 'PR／MR 狀態' }).dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  await fireEvent.keyDown(screen.getByRole('region', { name: 'PR／MR' }), {
    key: 'Escape',
  });
  expect(screen.getByRole('region', { name: 'PR／MR' })).toBeTruthy();
});

it('Changes 讀取所選 PR 的 commit 並顯示 diff 與行號', async () => {
  mocked.changes.mockResolvedValue({
    headOid: 'a'.repeat(40),
    nextCursor: null,
    files: [
      {
        path: 'src/search.ts',
        previousPath: null,
        kind: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -4 +4 @@\n-old\n+new',
        truncated: false,
      },
    ],
  });
  render(ChangeRequestsPage, { props });
  await screen.findByText('可合併 · aaaaaaaaaaaa');
  await fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
  await waitFor(() =>
    expect(
      screen.getByText(
        (_content, element) =>
          !!element?.classList.contains('diff-text') && element.textContent === '+new',
      ),
    ).toBeTruthy(),
  );
  expect(mocked.changes).toHaveBeenCalledExactlyOnceWith(
    '/a',
    'origin',
    'github',
    7,
    'a'.repeat(40),
    null,
  );
  expect(screen.getAllByText('4')).toHaveLength(2);
});

it('留言需填寫且確認才送出，執行期間禁止改選遠端和重複操作', async () => {
  let complete!: (result: string) => void;
  mocked.action.mockReturnValue(
    new Promise<string>((resolve) => {
      complete = resolve;
    }),
  );
  const view = render(ChangeRequestsPage, { props });
  await screen.findByRole('button', { name: '留言' });
  await fireEvent.click(screen.getByRole('button', { name: '留言' }));
  expect(mocked.action).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '確認留言' }).hasAttribute('disabled')).toBe(true);
  await fireEvent.update(
    screen.getByRole('textbox', { name: 'PR／MR 操作內容' }),
    '第一行\n第二行',
  );
  await fireEvent.click(screen.getByRole('button', { name: '確認留言' }));
  expect(mocked.action).toHaveBeenCalledExactlyOnceWith(
    '/a',
    'origin',
    'github',
    expect.objectContaining({
      operation: 'comment',
      number: 7,
      expectedHead: 'a'.repeat(40),
      expectedState: 'open',
      message: '第一行\n第二行',
    }),
  );
  expect(screen.getByRole('button', { name: 'PR／MR 來源設定' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(view.emitted('busy')?.[0]).toEqual([true]);
  complete('留言已送出');
  await screen.findByText('留言已送出');
  await waitFor(() => expect(view.emitted('busy')?.at(-1)).toEqual([false]));
});

it('合併顯示方向與明確確認，使用所選方式與已查看的 commit', async () => {
  mocked.read.mockResolvedValue({ items: [{ ...item(), draft: false }], nextCursor: null });
  render(ChangeRequestsPage, { props });
  await screen.findByRole('button', { name: '合併' });
  await fireEvent.click(screen.getByRole('button', { name: '合併' }));
  expect(screen.getByText('feature/search → main。執行後會合併遠端分支。')).toBeTruthy();
  expect(mocked.action).not.toHaveBeenCalled();
  await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 合併方式' }), 'squash');
  await fireEvent.click(screen.getByRole('button', { name: '確認合併' }));
  await screen.findByText('操作已完成');
  expect(mocked.action).toHaveBeenCalledExactlyOnceWith(
    '/a',
    'origin',
    'github',
    expect.objectContaining({
      operation: 'merge',
      mergeMethod: 'squash',
      expectedHead: 'a'.repeat(40),
    }),
  );
});

it('建立使用頁內表單且只建立遠端請求，失敗保留輸入並提示核對', async () => {
  mocked.action.mockRejectedValue(new Error('權限不足'));
  const view = render(ChangeRequestsPage, { props });
  await screen.findByRole('heading', { name: '加入搜尋' });
  await fireEvent.click(screen.getByRole('button', { name: '建立 PR／MR' }));
  await screen.findByRole('textbox', { name: 'PR／MR 標題' });
  expect(screen.queryByRole('dialog')).toBeNull();
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 標題' }), '新功能');
  await screen.findAllByRole('option', { name: 'feature/new' });
  await fireEvent.update(screen.getByRole('combobox', { name: 'PR／MR 來源分支' }), 'feature/new');
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 說明' }), '建立說明');
  await fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
  await waitFor(() =>
    expect(view.emitted('error')?.at(-1)).toEqual([
      'Error: 權限不足\n請重新整理核對遠端結果後再執行，避免重複送出。',
    ]),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect((screen.getByRole('textbox', { name: 'PR／MR 標題' }) as HTMLInputElement).value).toBe(
    '新功能',
  );
  expect(mocked.action).toHaveBeenCalledExactlyOnceWith('/a', 'origin', 'github', {
    operation: 'create',
    title: '新功能',
    sourceBranch: 'feature/new',
    targetBranch: 'main',
    message: '建立說明',
    draft: true,
  });
});

it('GitLab 提供撤銷核准，草稿禁止合併，最新資料失敗時禁止操作', async () => {
  mocked.read.mockResolvedValue({ items: [{ ...item(), draft: false }], nextCursor: null });
  const view = render(ChangeRequestsPage, { props: { ...props, remotes: [props.remotes[0]!] } });
  await screen.findByRole('button', { name: '撤銷核准' });
  expect(screen.queryByRole('button', { name: '要求修改' })).toBeNull();
  mocked.detail.mockRejectedValueOnce(new Error('網路中斷'));
  await fireEvent.click(screen.getByRole('button', { name: '重新整理 PR／MR' }));
  await screen.findByRole('button', { name: '重試內容' });
  expect(view.emitted('error')?.at(-1)).toEqual(['Error: 網路中斷']);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '合併' }).hasAttribute('disabled')).toBe(true);
});

it('偵測公開平台，自架 GitHub 與未知主機讓使用者選擇', () => {
  expect(detectForge('https://github.com/team/repo')).toBe('github');
  expect(detectForge('https://gitlab.com/team/repo')).toBe('gitlab');
  expect(detectForge('https://gitlab.example.com/team/sub/repo')).toBe('gitlab');
  expect(detectForge('https://code.example.com/team/repo')).toBe('');
});
