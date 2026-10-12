// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import RequestChanges from './RequestChanges.vue';
import { parseRequestPatch } from './changeRequests';
import type { RequestChanges as Changes, RequestFile } from './types';
const mocked = vi.hoisted(() => ({ changes: vi.fn() }));
vi.mock('./api', () => ({ api: { requestChanges: mocked.changes } }));
const props = {
  path: '/a',
  remote: 'origin',
  provider: 'github' as const,
  number: 1,
  headOid: 'a'.repeat(40),
  revision: 0,
};
const file = (path = 'file.ts'): RequestFile => ({
  path,
  previousPath: null,
  kind: 'modified',
  additions: 1,
  deletions: 1,
  patch: '@@ -1 +1 @@\n-old\n+new',
  truncated: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocked.changes.mockResolvedValue({ files: [file()], headOid: props.headOid, nextCursor: null });
});
afterEach(cleanup);
it('解析多個 hunk、零行數、新增刪除與缺少結尾換行提示', () => {
  const lines = parseRequestPatch(
    '@@ -1,2 +1,2 @@\n context\n-old\n+new\n\\ No newline at end of file\n@@ -0,0 +9 @@\n+added',
  );
  expect(lines[1]).toMatchObject({ oldLine: 1, newLine: 1 });
  expect(lines[2]).toMatchObject({ oldLine: 2, newLine: null, kind: '-' });
  expect(lines[3]).toMatchObject({ oldLine: null, newLine: 2, kind: '+' });
  expect(lines[4]).toMatchObject({ oldLine: null, newLine: null, kind: 'meta' });
  expect(lines[6]).toMatchObject({ oldLine: null, newLine: 9 });
});
it('分頁失敗保留選取與游標，重試後去重且不重設所選檔案', async () => {
  mocked.changes
    .mockResolvedValueOnce({ files: [file()], headOid: props.headOid, nextCursor: '2' })
    .mockRejectedValueOnce(new Error('網路中斷'))
    .mockResolvedValueOnce({
      files: [file(), file('other.ts')],
      headOid: props.headOid,
      nextCursor: null,
    });
  render(RequestChanges, { props });
  await screen.findByText('+new');
  await fireEvent.click(screen.getByRole('button', { name: '載入更多檔案' }));
  await screen.findByRole('alert');
  expect(screen.getByText('+new')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: '重試 Changes' }));
  await waitFor(() => expect(document.querySelectorAll('.changes-file')).toHaveLength(2));
  expect(mocked.changes).toHaveBeenLastCalledWith('/a', 'origin', 'github', 1, props.headOid, '2');
  expect(screen.getByText('+new')).toBeTruthy();
});
it('新 PR 載入後忽略舊 diff 回應，二進位與截斷檔案明確顯示', async () => {
  let resolve!: (value: Changes) => void;
  mocked.changes
    .mockReturnValueOnce(
      new Promise<Changes>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce({
      files: [{ ...file('image.png'), patch: null, truncated: true }],
      headOid: props.headOid,
      nextCursor: null,
    });
  const view = render(RequestChanges, { props });
  await view.rerender({ ...props, number: 2 });
  await screen.findByText('二進位檔、僅重新命名或平台未提供文字 diff；可在網站查看。');
  expect(screen.getByText('平台或大小限制僅提供部分 diff，可在網站查看完整內容。')).toBeTruthy();
  resolve({ files: [file('stale.ts')], headOid: props.headOid, nextCursor: null });
  await waitFor(() => expect(screen.queryByText('stale.ts')).toBeNull());
});
