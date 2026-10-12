import { expect, test } from '@playwright/test';

for (const width of [1360, 1000]) {
  test(`${width}px PR／MR 整頁、Changes 與返回歷史`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto('/?demo');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await page.getByRole('button', { name: '瀏覽 PR／MR', exact: true }).click();
    const view = page.getByRole('region', { name: 'PR／MR', exact: true });
    await expect(view.getByRole('combobox', { name: 'PR／MR 遠端' })).toHaveCount(0);
    await expect(view.getByRole('combobox', { name: 'PR／MR 平台' })).toHaveCount(0);
    await expect(
      view.locator('.request-list-panel').getByRole('combobox', { name: 'PR／MR 狀態' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(view.getByRole('heading', { name: '新增專案 PR／MR 瀏覽' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'keifu', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: 'Git 歷史', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'keifu 專案選單', exact: true }).click();
    await expect(page.locator('.project-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.project-menu')).toBeHidden();
    await expect(view).toBeVisible();
    await view.getByRole('combobox', { name: 'PR／MR 狀態' }).selectOption('merged');
    await expect(view.getByRole('heading', { name: '改善遠端分支切換流程' })).toBeVisible();
    await view.getByRole('combobox', { name: 'PR／MR 狀態' }).selectOption('all');
    await page.keyboard.press('Control+f');
    await expect(view.getByRole('textbox', { name: '搜尋已載入 PR／MR' })).toBeFocused();
    await view.getByRole('textbox', { name: '搜尋已載入 PR／MR' }).fill('#39');
    await expect(view.getByRole('heading', { name: '支援更多搜尋條件' })).toBeVisible();
    await view.getByRole('tab', { name: 'Changes' }).click();
    await expect(view.locator('.changes-diff')).toContainText(
      '+  const normalized = query.trim();',
    );
    const separator = view.getByRole('separator', { name: '調整 PR／MR 清單寬度' });
    const panel = view.locator('.request-list-panel');
    const panelWidth = async () => (await panel.boundingBox())!.width;
    const originalWidth = await panelWidth();
    const handle = (await separator.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + 100);
    await page.mouse.up();
    await expect.poll(panelWidth).toBeCloseTo(originalWidth + 80, 0);
    await expect(view.locator('.request-browser')).not.toHaveClass(/resizing-request-list/);
    await separator.focus();
    await separator.press('ArrowLeft');
    await expect.poll(panelWidth).toBeCloseTo(originalWidth + 64, 0);
    const filesSeparator = view.getByRole('separator', { name: '調整 Changes 檔案清單寬度' });
    const filesWidth = async () => (await view.locator('.changes-files').boundingBox())!.width;
    const originalFilesWidth = await filesWidth();
    const filesHandle = (await filesSeparator.boundingBox())!;
    await page.mouse.move(filesHandle.x + filesHandle.width / 2, filesHandle.y + 100);
    await page.mouse.down();
    await page.mouse.move(filesHandle.x + filesHandle.width / 2 + 60, filesHandle.y + 100);
    await page.mouse.up();
    await expect.poll(filesWidth).toBeCloseTo(originalFilesWidth + 60, 0);
    await expect(view.locator('.request-changes')).not.toHaveClass(/resizing-changes-list/);
    await filesSeparator.focus();
    await filesSeparator.press('ArrowLeft');
    await filesSeparator.press('Shift+ArrowRight');
    await expect.poll(filesWidth).toBeCloseTo(originalFilesWidth + 48, 0);
    await expect.poll(panelWidth).toBeCloseTo(originalWidth + 64, 0);
    await filesSeparator.dblclick();
    await expect.poll(filesWidth).toBeCloseTo(originalFilesWidth, 0);
    await filesSeparator.press('End');
    await expect.poll(filesWidth).toBe(Number(await filesSeparator.getAttribute('aria-valuemax')));
    await expect
      .poll(async () => (await view.locator('.changes-content').boundingBox())!.width)
      .toBeGreaterThanOrEqual(230);
    await filesSeparator.press('Home');
    await expect.poll(filesWidth).toBeCloseTo(originalFilesWidth, 0);
    await filesSeparator.press('ArrowRight');
    const savedFilesWidth = await filesWidth();
    await view.getByRole('tab', { name: '概覽' }).click();
    await view.getByRole('tab', { name: 'Changes' }).click();
    await expect.poll(filesWidth).toBe(savedFilesWidth);
    await expect(view.locator('.changes-diff')).toContainText(
      '+  const normalized = query.trim();',
    );
    await page.screenshot({ path: info.outputPath('change-requests.png') });
    await separator.dblclick();
    await expect.poll(panelWidth).toBeCloseTo(originalWidth, 0);
    await separator.press('End');
    const preferredMaximum = Number(await separator.getAttribute('aria-valuemax'));
    await expect.poll(panelWidth).toBe(preferredMaximum);
    await expect.poll(filesWidth).toBeLessThanOrEqual(savedFilesWidth);
    await page.setViewportSize({ width: 850, height: 640 });
    await expect
      .poll(async () => (await view.locator('.request-detail').boundingBox())!.width)
      .toBeGreaterThanOrEqual(300);
    expect(await page.locator('.app-shell').evaluate((el) => el.scrollWidth)).toBe(850);
    await page.setViewportSize({ width, height: 640 });
    await expect.poll(panelWidth).toBe(preferredMaximum);
    await separator.press('Home');
    await expect.poll(panelWidth).toBeCloseTo(originalWidth, 0);
    await separator.press('ArrowRight');
    const savedWidth = await panelWidth();
    await expect.poll(filesWidth).toBe(savedFilesWidth);
    await view.getByRole('button', { name: /assets\/icon\.png/ }).click();
    await expect(
      view.getByText('二進位檔、僅重新命名或平台未提供文字 diff；可在網站查看。'),
    ).toBeVisible();
    await view.getByRole('tab', { name: '概覽' }).click();
    await expect(view.getByRole('button', { name: '留言', exact: true })).toBeDisabled();
    for (const selector of ['.toolbar', '.requests-page', '.request-browser', '.request-detail']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
    }
    await page.reload();
    await page.getByRole('button', { name: '瀏覽 PR／MR', exact: true }).click();
    await expect(view.getByRole('heading', { name: '新增專案 PR／MR 瀏覽' })).toBeVisible();
    await expect.poll(panelWidth).toBe(savedWidth);
    await view.getByRole('tab', { name: 'Changes' }).click();
    await expect.poll(filesWidth).toBe(savedFilesWidth);
    await page.getByRole('button', { name: 'Git 歷史', exact: true }).click();
    await expect(view).toBeHidden();
    await expect(page.getByRole('region', { name: 'Git 歷史', exact: true })).toBeVisible();
  });
}
