import { expect, test } from '@playwright/test';

for (const width of [1360, 1000]) {
  test(`${width}px 詳細資訊面板可調整寬度、隱藏與重新開啟`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 880 });
    await page.goto('/?demo');
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();

    const panel = page.getByRole('region', { name: '詳細資訊' });
    const history = page.getByRole('region', { name: 'Git 歷史' });
    const separator = page.getByRole('separator', { name: '調整詳細資訊寬度' });
    await expect(panel.getByRole('heading')).toBeVisible();
    const panelWidth = async () => (await panel.boundingBox())!.width;
    const originalWidth = await panelWidth();
    const drag = async (delta: number) => {
      const handle = (await separator.boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + delta, handle.y + 100);
      await page.mouse.up();
      await expect(page.locator('.workspace')).not.toHaveClass(/resizing-detail/);
    };
    await drag(-80);
    expect(await panelWidth()).toBeCloseTo(originalWidth + 80, 0);
    await separator.focus();
    await separator.press('ArrowRight');
    expect(await panelWidth()).toBeCloseTo(originalWidth + 60, 0);
    await page.screenshot({ path: testInfo.outputPath('resized.png') });
    await drag(width);
    expect(await panelWidth()).toBeCloseTo(280, 0);
    await drag(-width);
    expect((await history.boundingBox())!.width).toBeCloseTo(320, 0);

    // 關閉再開啟時保留目前 diff 與調整過的寬度。
    await panel.locator('.file-row').first().click();
    await expect(panel.locator('.diff-code')).toBeVisible();
    const resizedWidth = await panelWidth();
    await page.getByRole('button', { name: '關閉詳細資訊' }).click();
    await expect(panel).toBeHidden();
    await expect(separator).toBeHidden();
    await expect(page.getByRole('button', { name: '顯示詳細資訊' })).toBeFocused();
    expect((await history.boundingBox())!.width).toBeCloseTo(
      (await page.locator('.workspace').boundingBox())!.width,
      0,
    );
    await page.screenshot({ path: testInfo.outputPath('hidden.png') });
    await page.getByRole('button', { name: '顯示詳細資訊' }).click();
    await expect(panel.locator('.diff-code')).toBeVisible();
    expect(await panelWidth()).toBeCloseTo(resizedWidth, 0);

    await page.getByRole('button', { name: '關閉詳細資訊' }).click();
    await page.locator('.commit-row.selected').click();
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: '關閉詳細資訊' }).click();
    await page.locator('#commit-worktree').click();
    await expect(panel.getByRole('heading', { name: '尚未提交的變更' })).toBeVisible();

    await page.setViewportSize({ width: 850, height: 640 });
    expect((await history.boundingBox())!.width).toBeGreaterThanOrEqual(319);
    expect(await panelWidth()).toBeGreaterThanOrEqual(280);
    expect(await page.locator('.app-shell').evaluate((el) => el.scrollWidth)).toBe(850);
  });
}
