import { expect, test } from '@playwright/test';
import tauriConfig from '../../src-tauri/tauri.conf.json' with { type: 'json' };
import { launchDesktop, nativeWindow } from './desktop';

test('原生版本與更新檢查 IPC，重開設定保留結果', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const desktop = await launchDesktop(info.outputPath('webview2-profile'), info);
  try {
    const { page } = desktop;
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '偏好設定' });
    const updates = settings.getByRole('region', { name: '版本與更新' });
    await expect(updates.getByText(`v${tauriConfig.version}`, { exact: true })).toBeVisible();
    await expect(settings.getByText(/無法讀取已安裝版本/)).toHaveCount(0);
    const check = updates.getByRole('button', { name: '檢查更新', exact: true });
    await expect(check).toBeEnabled();
    await check.click();
    await expect(check).toBeEnabled({ timeout: 45_000 });
    const result = await updates.getByRole('status').textContent();
    const alert = updates.getByRole('alert');
    const error = (await alert.count()) ? await alert.textContent() : '';
    if (error) {
      expect(error).toContain('無法檢查更新');
      expect(error).not.toMatch(
        /not allowed|command not found|permission|unknown variant|invalid args/i,
      );
      expect(result).not.toContain('最新版本');
    } else {
      expect(result).toMatch(/目前已是最新版本|有新版本/);
    }
    await page.screenshot({ path: info.outputPath('updates-desktop.png') });
    await settings.getByRole('button', { name: '關閉偏好設定' }).click();
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    await expect(updates.getByRole('status')).toHaveText(result!);
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await expect(updates.getByRole('heading', { name: '版本與更新' })).toBeVisible();
    await expect(check).toBeVisible();
    await page.screenshot({ path: info.outputPath('updates-desktop-small.png') });
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
