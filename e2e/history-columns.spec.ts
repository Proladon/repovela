import { expect, test } from '@playwright/test';
import demoData from '../src/demo-data.json' with { type: 'json' };

for (const width of [1360, 1000]) {
  test(`${width}px 歷史欄位對齊並可拖曳調整、鍵盤調整與還原`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 880 });
    await page.goto('/?demo');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.locator('.commit-row.selected .commit-author')).toBeVisible();
    await page.getByRole('button', { name: '關閉詳細資訊' }).click();

    const heading = (label: string) =>
      page.locator('.history-column-heading').filter({ hasText: label });
    const checkAlignment = async () => {
      const hashHeading = (await heading('Hash').boundingBox())!;
      const timeHeading = (await heading('時間').boundingBox())!;
      const authorHeading = (await heading('作者').boundingBox())!;
      const rows = page.locator('.commit-row');
      for (let i = 0; i < 3; i++) {
        const row = (await rows.nth(i).boundingBox())!;
        const hash = (await rows.nth(i).locator('.commit-hash').boundingBox())!;
        expect(hash.x).toBeCloseTo(hashHeading.x, 0);
        expect(hash.width).toBeCloseTo(hashHeading.width, 0);
        const time = (await rows.nth(i).locator('.commit-time').boundingBox())!;
        const author = (await rows.nth(i).locator('.commit-author').boundingBox())!;
        expect(time.x).toBeCloseTo(timeHeading.x, 0);
        expect(author.x).toBeCloseTo(authorHeading.x, 0);
        expect(time.width).toBeCloseTo(timeHeading.width, 0);
        expect(author.width).toBeCloseTo(authorHeading.width, 0);
        expect(time.y).toBeCloseTo(row.y, 0);
        expect(author.y).toBeCloseTo(row.y, 0);
        expect(time.height).toBe(row.height);
        expect(author.height).toBe(row.height);
        expect(row.height).toBe(32);
      }
      const connector = page.locator('.connector-row').first();
      const cells = connector.locator('.connector-cell');
      const timeConnector = (await cells.nth(2).boundingBox())!;
      const hashConnector = (await cells.nth(1).boundingBox())!;
      expect(hashConnector.x).toBeCloseTo(hashHeading.x, 0);
      const authorConnector = (await cells.nth(3).boundingBox())!;
      expect(timeConnector.x).toBeCloseTo(timeHeading.x, 0);
      expect(authorConnector.x).toBeCloseTo(authorHeading.x, 0);
      expect(timeConnector.height).toBe(18);
      expect(authorConnector.height).toBe(18);
    };
    await checkAlignment();
    await expect(page.locator('.commit-row.selected .commit-time small')).toHaveText(
      /^\d{2}:\d{2}$/,
    );

    for (const label of ['作者', '時間', 'Hash', 'Commit 訊息', '圖譜']) {
      const handle = page.getByRole('separator', { name: `調整${label}欄寬` });
      const initialWidth = (await heading(label).boundingBox())!.width;
      await handle.scrollIntoViewIfNeeded();
      const bounds = (await handle.boundingBox())!;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 54, y);
      await page.mouse.up();
      expect((await heading(label).boundingBox())!.width).toBeCloseTo(initialWidth + 54, 0);
      await expect(page.locator('.column-resizer-active')).toHaveCount(0);
      await handle.focus();
      await handle.press('ArrowLeft');
      expect((await heading(label).boundingBox())!.width).toBeCloseTo(initialWidth + 38, 0);
      await checkAlignment();
      await handle.dblclick();
      expect((await heading(label).boundingBox())!.width).toBeCloseTo(initialWidth, 0);
    }
    await page.screenshot({ path: testInfo.outputPath('columns-aligned.png') });

    const authorHandle = page.getByRole('separator', { name: '調整作者欄寬' });
    const authorBounds = (await authorHandle.boundingBox())!;
    await page.mouse.move(authorBounds.x + 4, authorBounds.y + 16);
    await page.mouse.down();
    await page.mouse.move(authorBounds.x - width, authorBounds.y + 16);
    await page.mouse.up();
    expect((await heading('作者').boundingBox())!.width).toBe(90);
    await checkAlignment();
    await expect(page.locator('.graph-head-node')).toHaveCount(1);

    const graphHandle = page.getByRole('separator', { name: '調整圖譜欄寬' });
    await graphHandle.focus();
    for (let i = 0; i < 20; i++) await graphHandle.press('ArrowLeft');
    expect((await heading('圖譜').boundingBox())!.width).toBe(36);
    const graphCell = page.locator('.commit-row .graph-cell').first();
    expect(await graphCell.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await graphCell.evaluate((el) => getComputedStyle(el).overflowX)).toBe('hidden');
    await checkAlignment();
    await graphHandle.press('Home');
  });
}

for (const width of [1360, 1000]) {
  test(`${width}px 長分支與 tag 名稱完整顯示，維持單行與欄位對齊`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 880 });
    const data = structuredClone(demoData);
    const head = data.snapshot.rows.find((row) => row.isHead)!;
    head.branches = [
      'feature/191-adr-0009-desktop-history-layout',
      'origin/feature/191-adr-0009-desktop-history-layout',
    ];
    head.tags = ['release/2026-10-27-history-layout-preview'];
    await page.route('**/src/demo-data.json*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export default ${JSON.stringify(data)}`,
      }),
    );
    await page.goto('/?demo');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.locator('.commit-row.selected')).toBeVisible();

    const row = page.locator('.commit-row[aria-current="true"]');
    const checkLabels = async () => {
      const labels = row.locator('.branch-badge, .tag-badge');
      await expect(labels).toHaveText([...head.branches, ...head.tags]);
      const hash = (await row.locator('.commit-hash').boundingBox())!;
      const message = (await row.locator('.commit-text').boundingBox())!;
      const bounds = (await row.boundingBox())!;
      expect(bounds.height).toBe(32);
      await expect(row.locator('.graph-svg')).toHaveAttribute('height', '32');
      await expect(row.locator('.commit-hash')).toHaveText(head.commit!.shortId);
      for (const label of await labels.all()) {
        const box = (await label.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(message.x);
        expect(box.x + box.width).toBeLessThanOrEqual(hash.x);
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
        expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      const scroll = page.locator('.history-scroll');
      expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await scroll.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect(row.locator('.commit-author')).toBeInViewport({ ratio: 1 });
      const heading = page.locator('.history-column-heading').filter({ hasText: 'Hash' });
      expect((await heading.boundingBox())!.x).toBeCloseTo(
        (await row.locator('.commit-hash').boundingBox())!.x,
        0,
      );
    };
    await checkLabels();
    await page.getByRole('button', { name: '關閉詳細資訊' }).click();
    await checkLabels();
    const messageHandle = page.getByRole('separator', { name: '調整Commit 訊息欄寬' });
    await messageHandle.scrollIntoViewIfNeeded();
    const handleBounds = (await messageHandle.boundingBox())!;
    await page.mouse.move(handleBounds.x + 4, handleBounds.y + 16);
    await page.mouse.down();
    await page.mouse.move(handleBounds.x - width * 2, handleBounds.y + 16);
    await page.mouse.up();
    const messageHeading = page
      .locator('.history-column-heading')
      .filter({ hasText: 'Commit 訊息' });
    expect((await messageHeading.boundingBox())!.width).toBe(120);
    const messageCell = row.locator('.commit-text');
    expect((await messageCell.boundingBox())!.width).toBe(120);
    expect(await messageCell.evaluate((el) => getComputedStyle(el).overflowX)).toBe('clip');
    expect(await messageCell.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const hash = (await row.locator('.commit-hash').boundingBox())!;
    expect(hash.x).toBeCloseTo((await messageCell.boundingBox())!.x + 120, 0);
    await expect(row.locator('.branch-badge, .tag-badge')).toHaveText([
      ...head.branches,
      ...head.tags,
    ]);
    await messageHandle.dblclick();
    await checkLabels();
    await page.locator('.history-scroll').evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.screenshot({ path: testInfo.outputPath('full-reference-names.png') });
  });
}
