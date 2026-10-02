import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('自訂標題列：最大化、還原、最小化與關閉正式視窗', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
  expect(config.app.windows[0].decorations).toBe(false);
  expect(config.app.windows[0].shadow).toBe(true);
  const desktop = await launchDesktop(info.outputPath('webview2-profile'), info);
  try {
    const { page, pid } = desktop;
    await expect(page.getByRole('banner', { name: '視窗標題列' })).toBeVisible();
    const window = config.app.windows[0];
    for (const [width, height] of [
      [window.minWidth, window.minHeight],
      [window.width, window.height],
    ]) {
      await nativeWindow(pid, 'resize', width, height);
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height]);
      await assertLayout(page, ['.window-titlebar', '.sidebar', '.onboarding']);
      const sidebar = (await page.locator('.sidebar').boundingBox())!;
      const main = (await page.locator('.main').boundingBox())!;
      expect(main.x).toBe(sidebar.x + sidebar.width);
      await page.screenshot({ path: info.outputPath(`custom-titlebar-${width}.png`) });
    }
    await page.getByRole('button', { name: '最大化視窗', exact: true }).click();
    await expect.poll(async () => (await nativeWindow(pid)).maximized).toBe(true);
    await page.getByRole('button', { name: '還原視窗', exact: true }).click();
    await expect.poll(async () => (await nativeWindow(pid)).maximized).toBe(false);

    // Tauri 的拖曳區域會使用第二次 mousedown 切換最大化。
    // 直接送出第二次事件，避免第一下啟動 Windows 的原生拖曳迴圈。
    await page.locator('.window-drag-region').dispatchEvent('mousedown', { button: 0, detail: 2 });
    await expect.poll(async () => (await nativeWindow(pid)).maximized).toBe(true);
    await page.getByRole('button', { name: '還原視窗', exact: true }).click();
    await expect.poll(async () => (await nativeWindow(pid)).maximized).toBe(false);

    await page.getByRole('button', { name: '最小化視窗', exact: true }).click();
    await expect.poll(async () => (await nativeWindow(pid)).minimized).toBe(true);
    await nativeWindow(pid, 'restore');
    await expect.poll(async () => (await nativeWindow(pid)).minimized).toBe(false);
    expect(desktop.errors).toEqual([]);
    await page.getByRole('button', { name: '關閉視窗', exact: true }).click();
    await expect.poll(async () => page.isClosed()).toBe(true);
  } finally {
    await desktop.stop();
  }
});
