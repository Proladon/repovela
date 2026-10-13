// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderMarkdown, renderHighlightedMarkdown } from './markdown';
import { highlightPatch, languageForPath } from './syntaxHighlight';
import { parseRequestPatch } from './changeRequests';
import type { PatchLine } from './types';

function fragment(html: string) {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

it('渲染標題、格式、表格、巢狀清單、勾選清單、引用、圖片與註腳', () => {
  const element = fragment(
    renderMarkdown(
      `
# 標題
**粗體** *斜體* ~~刪除~~ \`code\`

| 欄位 | 值 |
| --- | --- |
| A | B |

- [x] 完成
- [ ] 待辦
  - 子項目

> 引用

![圖片](https://example.com/image.png)

註腳[^note]

[^note]: 補充說明
`,
      false,
      'document-a',
    ),
  );
  expect(element.querySelector('h1')?.textContent).toBe('標題');
  expect(element.querySelector('strong')?.textContent).toBe('粗體');
  expect(element.querySelector('s')?.textContent).toBe('刪除');
  expect(element.querySelectorAll('td')).toHaveLength(2);
  expect(element.querySelectorAll('li')).toHaveLength(4);
  expect(element.querySelectorAll('input:disabled')).toHaveLength(2);
  expect(element.querySelectorAll('input:checked')).toHaveLength(1);
  expect(element.querySelector('blockquote')?.textContent).toContain('引用');
  expect(element.querySelector('img')?.getAttribute('src')).toBe('https://example.com/image.png');
  expect(element.querySelector('.footnotes')?.textContent).toContain('補充說明');
  expect(element.querySelector('.footnote-ref a')?.getAttribute('href')).toContain('document-a');
});

function normalizedPatch(patch: string) {
  return parseRequestPatch(patch).map((line) => ({
    ...line,
    text: ['+', '-', 'context'].includes(line.kind) ? line.text.slice(1) : line.text,
  }));
}

it('Vue diff 使用完整來源，script／template／style 的零散 hunk 都與整份檔案高亮一致', async () => {
  const { getHighlighter, loadLanguage } = await import('./syntaxHighlight');
  await loadLanguage('vue');
  const source = [
    '<script setup lang="ts">',
    'import { ref } from "vue";',
    '',
    '',
    'const count = ref<number>(42);',
    '',
    '',
    '</script>',
    '<template>',
    '<div>',
    '',
    '',
    '  <button @click="count++">{{ count }}</button>',
    '',
    '',
    '</div>',
    '</template>',
    '<style scoped>',
    '.button {',
    '',
    '',
    '  color: red;',
    '',
    '',
    '}',
    '</style>',
  ].join('\n');
  const lines = normalizedPatch(
    [
      '@@ -5 +5 @@',
      '-const count = ref<number>(0);',
      '+const count = ref<number>(42);',
      '@@ -13 +13 @@',
      '-  <button @click="count--">{{ count }}</button>',
      '+  <button @click="count++">{{ count }}</button>',
      '@@ -22 +22 @@',
      '-  color: blue;',
      '+  color: red;',
    ].join('\n'),
  );
  const html = await highlightPatch(lines, 'App.vue', { newSource: source });
  const highlighter = await getHighlighter();
  const colors = (html: string) =>
    Array.from(fragment(html).querySelectorAll('span')).flatMap((span) =>
      Array.from(span.textContent ?? '')
        .filter((char) => char.trim())
        .map((char) => [char, span.style.color]),
    );
  const oldSource = source
    .replace('ref<number>(42)', 'ref<number>(0)')
    .replace('count++', 'count--')
    .replace('color: red', 'color: blue');
  for (const [index, content, row] of [
    [1, oldSource, 4],
    [2, source, 4],
    [4, oldSource, 12],
    [5, source, 12],
    [7, oldSource, 21],
    [8, source, 21],
  ] as const) {
    const expected = fragment(
      highlighter.codeToHtml(content, { lang: 'vue', theme: 'github-dark' }),
    ).querySelectorAll('.line')[row];
    expect(colors(html[index])).toEqual(colors(expected.innerHTML));
    expect(new Set(colors(html[index]).map(([, color]) => color)).size).toBeGreaterThan(1);
    expect(fragment(html[index]).textContent).toBe(lines[index].text);
  }
});

it('Vue 來源重建處理插入、刪除、重新排列與零行 hunk，刪除行保留原語法上下文', async () => {
  const lines = normalizedPatch(
    '@@ -0,0 +1,2 @@\n+<!-- added -->\n+\n@@ -5 +6,0 @@\n-const removed = "old";\n@@ -8,0 +10 @@\n+const added = 42;',
  );
  const oldSource = '<script setup lang="ts">\n\n\n\nconst removed = "old";\n\n\n\n</script>';
  const newSource =
    '<!-- added -->\n\n<script setup lang="ts">\n\n\n\n\n\n\nconst added = 42;\n</script>';
  const fromNew = await highlightPatch(lines, 'App.vue', { newSource });
  const both = await highlightPatch(lines, 'App.vue', { oldSource, newSource });
  const fromOld = await highlightPatch(lines, 'App.vue', { oldSource });
  expect(fromNew).toEqual(both);
  expect(fromOld).toEqual(both);
  expect(fragment(fromNew[4]).querySelectorAll('span').length).toBeGreaterThan(1);
  const removedLines: PatchLine[] = oldSource
    .split('\n')
    .map((text, index) => ({ kind: '-', text, oldLine: index + 1, newLine: null }));
  const removed = await highlightPatch(removedLines, 'App.vue', { newSource: '' });
  expect(
    new Set(
      Array.from(fragment(removed[4]).querySelectorAll('span')).map((span) => span.style.color),
    ).size,
  ).toBeGreaterThan(1);
});

it('Vue SCSS 區塊按需載入內嵌語言，不會退回一般文字', async () => {
  const source =
    '<style lang="scss" scoped>\n\n\n\n$accent: red;\n.card { color: $accent; }\n</style>';
  const lines = normalizedPatch('@@ -5 +5 @@\n-$accent: blue;\n+$accent: red;');
  const html = await highlightPatch(lines, 'App.vue', { newSource: source });
  const { getHighlighter } = await import('./syntaxHighlight');
  expect((await getHighlighter()).getLoadedLanguages()).toContain('scss');
  expect(
    new Set(Array.from(fragment(html[2]).querySelectorAll('span')).map((span) => span.style.color))
      .size,
  ).toBeGreaterThan(1);
  expect(fragment(html[2]).textContent).toBe('$accent: red;');
});

it('Vue PR 的 CRLF diff 與來源仍可依行號正確高亮', async () => {
  const source = '<script setup lang="ts">\n\n\n\nconst answer = 42;\n</script>';
  const patch = '@@ -5 +5 @@\n-const answer = 0;\n+const answer = 42;';
  const expected = await highlightPatch(normalizedPatch(patch), 'App.vue', { newSource: source });
  const actual = await highlightPatch(normalizedPatch(patch.replaceAll('\n', '\r\n')), 'App.vue', {
    newSource: source.replaceAll('\n', '\r\n'),
  });
  expect(actual).toEqual(expected);
  expect(fragment(actual[2]).textContent).toBe('const answer = 42;');
});

it('自動連結網址並阻擋 HTML 與危險連結，行內渲染不產生巢狀連結', () => {
  const content =
    '<img src=x onerror=alert(1)> <script>alert(1)</script> [惡意](javascript:alert(1)) https://example.com';
  const element = fragment(renderMarkdown(content));
  expect(element.querySelector('img, script')).toBeNull();
  expect(element.textContent).toContain('<script>');
  expect(element.querySelectorAll('a')).toHaveLength(1);
  expect(element.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  const inline = fragment(
    renderMarkdown(
      '**標題** [連結](https://example.com) ![替代文字](https://example.com/image.png)',
      true,
    ),
  );
  expect(inline.querySelector('a, img, p')).toBeNull();
  expect(inline.querySelector('strong')?.textContent).toBe('標題');
  expect(inline.textContent).toContain('替代文字');
});

it('Shiki 支援語言別名與後續載入的語言，保留未知語言及 HTML 原始碼', async () => {
  const element = fragment(
    await renderHighlightedMarkdown(
      '```TS title=sample\nconst answer: number = 42;\n```\n\n```unknown-language\n<script>alert(1)</script>\n```',
    ),
  );
  expect(element.querySelector('pre.shiki code span[style*="color"]')).toBeTruthy();
  expect(element.querySelectorAll('pre')).toHaveLength(2);
  expect(element.querySelector('script')).toBeNull();
  expect(element.textContent).toContain('<script>alert(1)</script>');
  const python = fragment(
    await renderHighlightedMarkdown('```py\ndef greet():\n    return "hello"\n```'),
  );
  expect(python.querySelectorAll('span[style*="color"]').length).toBeGreaterThan(1);
  const plain = fragment(
    await renderHighlightedMarkdown('```\nplain <text>\n```\n\n    indented <code>'),
  );
  expect(plain.querySelectorAll('pre code')).toHaveLength(2);
  expect(plain.textContent).toContain('indented <code>');
});

it('diff 依檔名選擇語言、保留行號與文字，舊版多行註解不影響新版語法', async () => {
  const patch = parseRequestPatch(
    '@@ -1,2 +1,2 @@\n-/* old comment\n+const answer = 42;\n value\n@@ -9 +9 @@\n-old\n+const html = "<script>";',
  );
  const lines = patch.map((line) => ({
    ...line,
    text: ['+', '-', 'context'].includes(line.kind) ? line.text.slice(1) : line.text,
  }));
  const html = await highlightPatch(lines, 'file.ts');
  expect(html).toHaveLength(lines.length);
  html.forEach((line, index) => expect(fragment(line).textContent).toBe(lines[index].text));
  expect(html[0]).not.toContain('<span');
  expect(fragment(html[2]).querySelector('span')?.getAttribute('style')).not.toBe(
    fragment(html[1]).querySelector('span')?.getAttribute('style'),
  );
  expect(fragment(html[6]).querySelector('script')).toBeNull();
  expect(languageForPath('src/App.vue')).toBe('vue');
  expect(languageForPath('Dockerfile.dev')).toBe('dockerfile');
  expect(languageForPath('Cargo.lock')).toBe('toml');
  expect(languageForPath('C:\\repo\\script.ps1')).toBe('powershell');
  expect(
    await highlightPatch(
      [{ kind: '+', text: '<unknown>', oldLine: null, newLine: 1 }],
      'file.unknown',
    ),
  ).toEqual(['&lt;unknown&gt;']);
});
