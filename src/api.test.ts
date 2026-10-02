// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
const core = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
vi.mock('@tauri-apps/api/core', () => core);
import { chooseProjects, listSystemFonts } from './api';

beforeEach(() => vi.resetAllMocks());

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
