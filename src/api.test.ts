// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
const core = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
const opener = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
vi.mock('@tauri-apps/api/core', () => core);
vi.mock('@tauri-apps/plugin-opener', () => opener);
import { api, chooseProjects, listSystemFonts, openRepositoryWebsite } from './api';

beforeEach(() => vi.resetAllMocks());

it('PR／MR 讀取明確指定專案、遠端、平台、狀態與游標', async () => {
  core.invoke.mockResolvedValue({ items: [], nextCursor: null });
  await api.changeRequests('/project', 'upstream', 'gitlab', 'merged', '2');
  expect(core.invoke).toHaveBeenCalledExactlyOnceWith('read_change_requests', {
    path: '/project',
    remote: 'upstream',
    provider: 'gitlab',
    state: 'merged',
    cursor: '2',
  });
});

it('Changes 與操作傳入遠端、編號和目前已查看的提交', async () => {
  core.invoke.mockResolvedValue({});
  await api.requestDetail('/a', 'upstream', 'github', 7);
  expect(core.invoke).toHaveBeenLastCalledWith('read_request_detail', {
    path: '/a',
    remote: 'upstream',
    provider: 'github',
    number: 7,
  });
  await api.requestChanges('/a', 'upstream', 'github', 7, 'a'.repeat(40), '2');
  expect(core.invoke).toHaveBeenLastCalledWith('read_request_changes', {
    path: '/a',
    remote: 'upstream',
    provider: 'github',
    number: 7,
    expectedHead: 'a'.repeat(40),
    cursor: '2',
  });
  const request = {
    operation: 'merge' as const,
    number: 7,
    expectedHead: 'a'.repeat(40),
    expectedState: 'open',
    expectedTarget: 'main',
    mergeMethod: 'squash' as const,
  };
  await api.requestAction('/a', 'upstream', 'github', request);
  expect(core.invoke).toHaveBeenLastCalledWith('operate_request', {
    path: '/a',
    remote: 'upstream',
    provider: 'github',
    request,
  });
});

it('使用原生 opener 開啟 repo 網站', async () => {
  await openRepositoryWebsite('https://github.com/team/repo');
  expect(opener.openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com/team/repo');
});

it('網站 opener 不接收本機路徑或其他協定', async () => {
  await expect(openRepositoryWebsite('file:///repo')).rejects.toThrow('HTTP 或 HTTPS');
  expect(opener.openUrl).not.toHaveBeenCalled();
});

it('從桌面後端取得完整系統字體清單', async () => {
  core.invoke.mockResolvedValue(['Arial', '自訂安裝字體']);
  await expect(listSystemFonts()).resolves.toEqual(['Arial', '自訂安裝字體']);
  expect(core.invoke).toHaveBeenCalledExactlyOnceWith('list_system_fonts');
});

it.each([
  [null, []],
  ['C:\\專案 空白\\repo', ['C:\\專案 空白\\repo']],
  [
    ['C:\\a', 'D:\\b'],
    ['C:\\a', 'D:\\b'],
  ],
])('正規化資料夾選擇器回傳值 %j', async (selected, expected) => {
  dialog.open.mockResolvedValue(selected);
  await expect(chooseProjects()).resolves.toEqual(expected);
  expect(dialog.open).toHaveBeenCalledExactlyOnceWith({
    directory: true,
    multiple: true,
    title: '加入 Git 專案',
  });
});

it('保留原生選擇器失敗訊息', async () => {
  dialog.open.mockRejectedValue(new Error('dialog denied'));
  await expect(chooseProjects()).rejects.toThrow('dialog denied');
});
