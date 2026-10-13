// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import MarkdownContent from './MarkdownContent.vue';
import RequestCreate from './RequestCreate.vue';
import * as markdown from './markdown';
const website = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ openRepositoryWebsite: website }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  website.mockReset();
});

it('保留宿主標籤與 class，內容變更後忽略過期的非同步渲染', async () => {
  let resolve!: (html: string) => void;
  vi.spyOn(markdown, 'renderHighlightedMarkdown')
    .mockReturnValueOnce(
      new Promise<string>((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce('<p><strong>新內容</strong></p>');
  const view = render(MarkdownContent, {
    props: { content: '舊內容' },
    attrs: { class: 'request-body', title: '說明' },
  });
  expect(document.querySelector('.request-body')?.getAttribute('title')).toBe('說明');
  await view.rerender({ content: '**新內容**' });
  resolve('<p>過期內容</p>');
  await waitFor(() =>
    expect(document.querySelector('.request-body strong')?.textContent).toBe('新內容'),
  );
  expect(screen.queryByText('過期內容')).toBeNull();
});

it('Markdown 連結使用網站 opener，失敗時顯示錯誤', async () => {
  website.mockRejectedValueOnce(new Error('開啟失敗'));
  render(MarkdownContent, { props: { content: '[文件](https://example.com/docs)' } });
  await fireEvent.click(screen.getByRole('link', { name: '文件' }));
  expect(website).toHaveBeenCalledExactlyOnceWith('https://example.com/docs');
  expect((await screen.findByRole('alert')).textContent).toContain('開啟失敗');
});

it('PR／MR 說明預覽渲染 Markdown，送出時仍保留原始語法', async () => {
  const run = vi.fn().mockResolvedValue(true);
  render(RequestCreate, { props: { busy: false, run } });
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 標題' }), '新增功能');
  await fireEvent.update(screen.getByRole('textbox', { name: 'PR／MR 來源分支' }), 'feature/new');
  await fireEvent.update(
    screen.getByRole('textbox', { name: 'PR／MR 說明' }),
    '**重點**\n\n- [x] 完成',
  );
  await fireEvent.click(screen.getByText('Markdown 預覽'));
  expect(document.querySelector('.markdown-preview strong')?.textContent).toBe('重點');
  await fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ message: '**重點**\n\n- [x] 完成' }));
});
