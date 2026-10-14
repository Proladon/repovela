import { expect, test } from '@playwright/test';
import { launchDesktop, nativeWindow } from './desktop';
import { PREFERENCES_KEY, toastPositions } from '../../src/preferences';

test('Toast：六種位置即時套用與保存、手動關閉、倒數與停留暫停', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const desktop = await launchDesktop(info.outputPath('profile'), info);
  try {
    const { page } = desktop;
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '偏好設定' });
    const position = settings.getByRole('combobox', { name: 'Toast 顯示位置' });
    await settings.getByRole('combobox', { name: 'Toast 自動關閉秒數' }).selectOption('3');
    await settings.getByRole('button', { name: '預覽手動關閉' }).click();
    const manual = page.locator('.toast[data-dismissal="manual"]');
    await expect(manual).toContainText('需手動關閉');
    for (const value of Object.keys(toastPositions)) {
      await position.selectOption(value);
      await expect(page.locator('.toast-host')).toHaveClass(`toast-host toast-${value}`);
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const bounds = (await page.locator('.toast-host').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(32);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 24);
      if (value.endsWith('left')) expect(bounds.x).toBeCloseTo(16, 0);
      if (value.endsWith('right'))
        expect(viewport.width - bounds.x - bounds.width).toBeCloseTo(16, 0);
      if (value.endsWith('center'))
        expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
      if (value.startsWith('top')) expect(bounds.y).toBeCloseTo(48, 0);
      else expect(viewport.height - bounds.y - bounds.height).toBeCloseTo(38, 0);
    }
    await position.selectOption('top-right');
    await page.mouse.move(0, 0);
    await settings.getByRole('button', { name: '預覽自動關閉' }).click();
    const automatic = page.locator('.toast[data-dismissal="auto"]');
    await automatic.hover();
    await expect(automatic).toContainText('已暫停');
    // 使用瀏覽器虛擬時鐘驗證完整倒數，不等待實際時間。
    const now = new Date();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.getTime() + 1000));
    await page.clock.runFor(6000);
    await expect(automatic).toBeVisible();
    await expect(manual).toBeVisible();
    await page.screenshot({ path: info.outputPath('toast-paused-and-manual.png') });
    await page.mouse.move(0, 0);
    await page.clock.runFor(4000);
    await expect(automatic).toHaveCount(0);
    await expect(manual).toBeVisible();
    await manual.getByRole('button', { name: '關閉提示' }).click();
    await expect(page.locator('.toast-host')).toHaveCount(0);
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PREFERENCES_KEY),
    ).toMatchObject({ toastPosition: 'top-right', toastDuration: 3 });
    await page.reload();
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    await expect(position).toHaveValue('top-right');
    await expect(settings.getByRole('combobox', { name: 'Toast 自動關閉秒數' })).toHaveValue('3');
    await nativeWindow(desktop.pid, 'resize', 1360, 880);
    await settings.getByRole('button', { name: '預覽自動關閉' }).click();
    await automatic.hover();
    await page.screenshot({ path: info.outputPath('toast-preferences.png') });
    await automatic.getByRole('button', { name: '關閉提示' }).click();
    await settings.getByRole('button', { name: '還原預設設定' }).click();
    await expect(position).toHaveValue('bottom-right');
    await expect(settings.getByRole('combobox', { name: 'Toast 自動關閉秒數' })).toHaveValue('5');
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
