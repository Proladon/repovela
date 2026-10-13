import { expect, test } from '@playwright/test';

for (const width of [1360, 1000]) {
  test(`${width}px Markdown 說明與 Shiki 高亮保留 diff 結構`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const body = [
      '# 功能說明',
      '**重點**、*斜體*、~~刪除~~ 與 `inline code`。',
      '',
      '| 欄位 | 值 |',
      '| --- | --- |',
      '| 語言 | TypeScript |',
      '',
      '- [x] 已完成',
      '- [ ] 待辦',
      '',
      '> 引用內容',
      '',
      '```ts',
      'const answer: number = 42;',
      `const long = "${'long code '.repeat(80)}";`,
      '```',
      '',
      '```unknown',
      '<script>alert("unsafe")</script>',
      '```',
      '',
      '註腳[^note]',
      '',
      '[^note]: 補充說明',
      '',
      '<script>alert("unsafe")</script>',
    ].join('\n');
    const request = {
      number: 1,
      title: '**功能** `preview`',
      body,
      author: 'tester',
      state: 'open',
      draft: false,
      sourceBranch: 'feature/markdown',
      targetBranch: 'main',
      updatedAt: '2026-10-13T08:00:00Z',
      url: 'https://github.com/team/repo/pull/1',
      labels: [],
    };
    const changes = {
      headOid: 'a'.repeat(40),
      nextCursor: null,
      files: [
        {
          path: 'src/code.ts',
          previousPath: null,
          kind: 'modified',
          additions: 1,
          deletions: 1,
          truncated: false,
          patch: '@@ -1 +1 @@\n-const answer = 0;\n+const answer = 42;',
        },
      ],
    };
    await page.route('**/src/demo-change-requests.ts', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `const request = ${JSON.stringify(request)};
        export function demoChangeRequests() { return { items: [request], nextCursor: null }; }
        export function demoRequestDetail() { return { request, headOid: '${'a'.repeat(40)}', mergeStatus: 'clean' }; }
        export function demoRequestChanges() { return ${JSON.stringify(changes)}; }`,
      }),
    );
    await page.setViewportSize({ width, height: 880 });
    await page.goto('/?demo');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    // Git diff 也使用相同的高亮服務。
    const detail = page.getByRole('region', { name: '詳細資訊' });
    await detail.locator('.file-row').first().click();
    await expect(detail.locator('.diff-line code span[style*="color"]').first()).toBeVisible();
    await page.getByRole('button', { name: '瀏覽 PR／MR', exact: true }).click();
    const view = page.getByRole('region', { name: 'PR／MR', exact: true });
    await expect(view.getByRole('heading', { name: '功能 preview' })).toBeVisible();
    await expect(view.locator('.request-item')).not.toContainText('>');
    const content = view.locator('.request-body');
    await expect(content.getByRole('heading', { name: '功能說明' })).toBeVisible();
    await expect(content.locator('table td')).toHaveCount(2);
    await expect(content.getByRole('checkbox')).toHaveCount(2);
    await expect(content.getByRole('checkbox').first()).toBeChecked();
    await expect(content.locator('pre.shiki')).toHaveCount(2);
    expect(
      await content
        .locator('pre')
        .first()
        .evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
    await expect(content.locator('script')).toHaveCount(0);
    const colors = await content
      .locator('pre')
      .first()
      .locator('span[style]')
      .evaluateAll(
        (elements) => new Set(elements.map((element) => (element as HTMLElement).style.color)).size,
      );
    expect(colors).toBeGreaterThan(1);
    const noteLink = content.locator('.footnote-ref a');
    await noteLink.click();
    await expect(content.locator('.footnote-item')).toBeVisible();
    await page.screenshot({ path: info.outputPath('markdown.png') });
    await view.getByRole('tab', { name: 'Changes' }).click();
    await expect(view.locator('.changes-diff .addition .diff-text')).toHaveText(
      '+const answer = 42;',
    );
    await expect(
      view.locator('.changes-diff .addition span[style*="color"]').first(),
    ).toBeVisible();
    await expect(view.locator('.changes-diff .addition .line-number').last()).toHaveText('1');
    expect(await page.locator('.app-shell').evaluate((element) => element.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}
