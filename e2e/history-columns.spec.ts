import { expect, test } from '@playwright/test';

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
      const timeHeading = (await heading('時間').boundingBox())!;
      const authorHeading = (await heading('作者').boundingBox())!;
      const rows = page.locator('.commit-row');
      for (let i = 0; i < 3; i++) {
        const row = (await rows.nth(i).boundingBox())!;
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
        expect(row.height).toBe(52);
      }
      const connector = page.locator('.connector-row').first();
      const cells = connector.locator('.connector-cell');
      const timeConnector = (await cells.nth(1).boundingBox())!;
      const authorConnector = (await cells.nth(2).boundingBox())!;
      expect(timeConnector.x).toBeCloseTo(timeHeading.x, 0);
      expect(authorConnector.x).toBeCloseTo(authorHeading.x, 0);
      expect(timeConnector.height).toBe(18);
      expect(authorConnector.height).toBe(18);
    };
    await checkAlignment();
    await expect(page.locator('.commit-row.selected .commit-time small')).toHaveText(
      /^\d{2}:\d{2}$/,
    );

    for (const label of ['作者', '時間', 'Commit 訊息', '圖譜']) {
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
  });
}
