import { expect, test } from '@playwright/test';
import { PREFERENCES_KEY } from '../src/preferences';
import { STORAGE_KEY } from '../src/session';

for (const viewport of [
  { width: 1360, height: 880 },
  { width: 1000, height: 640 },
]) {
  test(`${viewport.width}px 偏好設定即時套用、保存、還原與新分頁預設值`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const fontSize = viewport.width === 1000 ? 20 : 18;
    const rowHeight = Math.round((44 * fontSize) / 13);
    const connectorHeight = Math.round((18 * fontSize) / 13);
    await page.goto('/?demo');
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    const settings = page.getByRole('region', { name: '偏好設定' });
    await expect(settings.getByRole('heading', { name: '偏好設定' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '偏好設定', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill('demo://keifu');
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.locator('.commit-row.selected')).toBeVisible();

    await page.keyboard.press('Control+,');
    await expect(page.getByRole('region', { name: 'Git 歷史' })).toBeHidden();
    await settings.getByRole('checkbox', { name: /^分支標籤跟隨分支線顏色/ }).check();
    await settings.getByRole('checkbox', { name: /^Git 標籤跟隨分支線顏色/ }).check();
    await settings.getByRole('checkbox', { name: /^醒目顯示 HEAD 節點/ }).uncheck();
    await settings.getByLabel('介面字體', { exact: true }).fill('Consolas');
    await settings.getByLabel('程式碼字體', { exact: true }).fill('Courier New');
    const fontSizeInput = settings.getByRole('spinbutton', { name: '字體大小', exact: true });
    await fontSizeInput.press('Control+A');
    await fontSizeInput.pressSequentially(String(fontSize));
    await expect(fontSizeInput).toHaveValue(String(fontSize));
    await settings.getByRole('combobox', { name: '列表密度', exact: true }).selectOption('compact');
    await settings.getByRole('combobox', { name: '日期格式', exact: true }).selectOption('full');
    await settings.getByRole('checkbox', { name: '使用 24 小時制', exact: true }).uncheck();
    await settings.getByRole('checkbox', { name: '顯示欄位分隔線', exact: true }).uncheck();
    await settings.getByRole('checkbox', { name: '預設顯示遠端分支', exact: true }).uncheck();
    await settings
      .getByRole('combobox', { name: '首次載入 commit 數量', exact: true })
      .selectOption('1000');
    await page.locator('.preferences-scroll').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: testInfo.outputPath('preferences.png') });
    await settings.getByRole('button', { name: '返回工作區' }).click();

    const head = page.locator('.commit-row[aria-current="true"]');
    const author = head.locator('.commit-author');
    const circle = head.locator('circle').last();
    const color = await circle.evaluate((element) => getComputedStyle(element).fill);
    expect(
      await head
        .locator('.branch-badge')
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe(color);
    expect(
      await head
        .locator('.tag-badge')
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe(color);
    await expect(page.locator('.graph-head-node')).toHaveCount(0);
    expect((await head.boundingBox())!.height).toBe(rowHeight);
    await expect(head.locator('.graph-svg')).toHaveAttribute('height', String(rowHeight));
    const rowBounds = (await head.boundingBox())!;
    const captionBounds = (await head.locator('.commit-caption').boundingBox())!;
    expect(captionBounds.y + captionBounds.height).toBeLessThanOrEqual(
      rowBounds.y + rowBounds.height,
    );
    expect(await author.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
      'Consolas',
    );
    expect(
      await head
        .locator('.commit-caption code')
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain('Courier New');
    expect(
      await author.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeCloseTo((11 * fontSize) / 13, 1);
    expect(await author.evaluate((element) => getComputedStyle(element).borderLeftColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    await expect(head.locator('.commit-time > span')).toHaveText(/^2026\/\d{2}\/\d{2}$/);
    await expect(head.locator('.commit-time small')).toHaveText(/^(上午|下午)/);
    const connector = page.locator('.connector-row').first();
    expect((await connector.boundingBox())!.height).toBe(connectorHeight);
    await expect(connector.locator('.graph-svg')).toHaveAttribute(
      'height',
      String(connectorHeight),
    );
    await page.getByRole('button', { name: '關閉詳細資訊' }).click();
    await page.screenshot({ path: testInfo.outputPath('customized-history.png') });

    await page.reload();
    await expect(
      page.locator('.commit-row[aria-current="true"] .branch-badge.follows-line').first(),
    ).toBeVisible();
    expect((await head.boundingBox())!.height).toBe(rowHeight);
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    await expect(settings.getByRole('spinbutton', { name: '字體大小', exact: true })).toHaveValue(
      String(fontSize),
    );
    await expect(settings.getByLabel('介面字體', { exact: true })).toHaveValue('Consolas');
    await settings.getByRole('button', { name: '返回工作區' }).click();
    await page.locator('.add-project').click();
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.getByRole('tab', { name: '另一個專案' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const tabs = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).tabs,
      `${STORAGE_KEY}-demo`,
    );
    expect(tabs.find((tab: { path: string }) => tab.path === 'demo://另一個專案')).toMatchObject({
      remotes: false,
      limit: 1000,
    });
    expect(tabs.find((tab: { path: string }) => tab.path === 'demo://keifu')).toMatchObject({
      remotes: true,
      limit: 500,
    });

    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    await settings.getByRole('button', { name: '還原預設設定' }).click();
    await expect(settings.getByRole('spinbutton', { name: '字體大小', exact: true })).toHaveValue(
      '13',
    );
    await expect(settings.getByLabel('介面字體', { exact: true })).toHaveValue('');
    await settings.getByRole('button', { name: '返回工作區' }).click();
    await expect(page.locator('.graph-head-node')).toHaveCount(1);
    await expect(page.locator('.branch-badge.follows-line')).toHaveCount(0);
    expect((await head.boundingBox())!.height).toBe(52);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).fontSize,
        `${PREFERENCES_KEY}-demo`,
      ),
    ).toBe(13);
    await page.reload();
    await expect(page.locator('.graph-head-node')).toBeVisible();
    expect((await head.boundingBox())!.height).toBe(52);
  });
}
