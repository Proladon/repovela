// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import RequestCreate from './RequestCreate.vue';
import type { RequestBranches } from './types';
const branches = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ api: { requestBranches: branches } }));
const props = {
  path: '/a',
  remote: 'origin',
  provider: 'github' as const,
  initialSource: 'feature/new',
  busy: false,
  run: vi.fn(),
};
const source = () => screen.getByRole('combobox', { name: 'PR／MR 來源分支' }) as HTMLSelectElement;
const target = () => screen.getByRole('combobox', { name: 'PR／MR 目標分支' }) as HTMLSelectElement;
const submit = () => screen.getByRole('button', { name: '確認建立' }) as HTMLButtonElement;
beforeEach(() => {
  vi.resetAllMocks();
  branches.mockResolvedValue({ branches: ['develop', 'feature/new'], defaultBranch: 'develop' });
  props.run.mockResolvedValue(false);
});
afterEach(cleanup);

it('讀取所選遠端，預選目前與預設分支，禁止同分支與執行中送出', async () => {
  const view = render(RequestCreate, { props });
  await waitFor(() => expect(target().value).toBe('develop'));
  expect(branches).toHaveBeenCalledExactlyOnceWith('/a', 'origin', 'github');
  expect(source().value).toBe('feature/new');
  expect([...source().options].map((option) => option.value)).toEqual([
    '',
    'develop',
    'feature/new',
  ]);
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 標題' }), '新功能');
  await fireEvent.update(target(), 'feature/new');
  expect(submit().disabled).toBe(true);
  await fireEvent.click(submit());
  expect(props.run).not.toHaveBeenCalled();
  await fireEvent.update(target(), 'develop');
  await fireEvent.click(submit());
  expect(props.run).toHaveBeenCalledExactlyOnceWith({
    operation: 'create',
    title: '新功能',
    message: '',
    sourceBranch: 'feature/new',
    targetBranch: 'develop',
    draft: true,
  });
  expect(source().value).toBe('feature/new');
  await view.rerender({ ...props, busy: true });
  expect(source().disabled).toBe(true);
  expect(target().disabled).toBe(true);
});

it('載入期間停用選單，切換遠端忽略舊回應與舊錯誤', async () => {
  let reject!: (error: Error) => void;
  branches.mockReturnValueOnce(
    new Promise<RequestBranches>((_resolve, fail) => {
      reject = fail;
    }),
  );
  const view = render(RequestCreate, { props });
  expect(source().disabled).toBe(true);
  expect(target().disabled).toBe(true);
  await view.rerender({ ...props, remote: 'upstream', provider: 'gitlab' });
  await waitFor(() => expect(target().value).toBe('develop'));
  reject(new Error('過期失敗'));
  await Promise.resolve();
  expect(view.emitted('error')).toBeUndefined();
  expect(target().value).toBe('develop');
  expect(branches).toHaveBeenLastCalledWith('/a', 'upstream', 'gitlab');
});

it('讀取失敗送出 toast 事件，保留標題並可重試', async () => {
  branches.mockRejectedValueOnce(new Error('登入失敗'));
  const view = render(RequestCreate, { props });
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 標題' }), '保留草稿');
  await screen.findByRole('button', { name: '重試讀取分支' });
  expect(view.emitted('error')?.at(-1)).toEqual(['無法讀取遠端分支：Error: 登入失敗']);
  expect(screen.queryByText(/登入失敗/)).toBeNull();
  expect(submit().disabled).toBe(true);
  await fireEvent.click(screen.getByRole('button', { name: '重試讀取分支' }));
  await waitFor(() => expect(target().value).toBe('develop'));
  expect((screen.getByRole('textbox', { name: 'PR／MR 標題' }) as HTMLInputElement).value).toBe(
    '保留草稿',
  );
});

it('空遠端不提供本機分支或硬編碼 main，禁止建立', async () => {
  branches.mockResolvedValue({ branches: [], defaultBranch: null });
  render(RequestCreate, { props });
  await screen.findByText('所選遠端沒有可用分支。');
  expect(source().value).toBe('');
  expect(target().value).toBe('');
  expect(source().disabled).toBe(true);
  expect(submit().disabled).toBe(true);
});

it('卸載後不送出晚到的分支錯誤', async () => {
  let reject!: (error: Error) => void;
  branches.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const view = render(RequestCreate, { props });
  view.unmount();
  reject(new Error('晚到失敗'));
  await Promise.resolve();
  expect(view.emitted('error')).toBeUndefined();
});
