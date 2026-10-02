import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launchDesktop } from './desktop';

test('偏好設定列出 Windows 已安裝字體，介面與程式碼字體共用完整清單', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; $collection = [System.Drawing.Text.InstalledFontCollection]::new(); try { ConvertTo-Json -InputObject @($collection.Families | ForEach-Object { @{ name = $_.Name; englishName = $_.GetName(1033) } }) -Compress } finally { $collection.Dispose() }',
    ],
    { windowsHide: true, timeout: 15_000 },
  );
  const expectedFonts = JSON.parse(stdout.trim()) as { name: string; englishName: string }[];
  expect(expectedFonts.length).toBeGreaterThan(6);
  const desktop = await launchDesktop(info.outputPath('webview2-profile'), info);
  try {
    const { page } = desktop;
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '偏好設定' });
    await expect.poll(() => settings.locator('#ui-fonts option').count()).toBeGreaterThan(6);
    const uiFonts = await settings
      .locator('#ui-fonts option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
      );
    const codeFonts = await settings
      .locator('#code-fonts option')
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
      );
    expect(codeFonts).toEqual(uiFonts);
    expect(new Set(uiFonts).size).toBe(uiFonts.length);
    const installedFonts = new Set(uiFonts.map((font) => font.toLowerCase()));
    // .NET 與 DirectWrite 的顯示語系可能不同，同一家族的本地或英文名稱都有效。
    expect(
      expectedFonts.filter(
        (font) =>
          !installedFonts.has(font.name.toLowerCase()) &&
          !installedFonts.has(font.englishName.toLowerCase()),
      ),
    ).toEqual([]);
    for (const field of ['介面字體', '程式碼字體']) {
      const select = settings.getByRole('combobox', { name: field, exact: true });
      await select.selectOption(uiFonts[0]);
      await expect(select.locator('option')).toHaveCount(uiFonts.length + 1);
      await select.selectOption(uiFonts.at(-1)!);
      await expect(select).toHaveValue(uiFonts.at(-1)!);
      await expect(select.locator('option')).toHaveCount(uiFonts.length + 1);
    }
    await settings.getByLabel('介面字體', { exact: true }).selectOption(uiFonts[0]);
    await settings.getByRole('button', { name: '關閉偏好設定' }).click();
    await page.getByRole('button', { name: '偏好設定', exact: true }).click();
    await expect(settings.getByLabel('介面字體', { exact: true })).toHaveValue(uiFonts[0]);
    await expect(settings.getByLabel('程式碼字體', { exact: true })).toHaveValue(uiFonts.at(-1)!);
    expect(desktop.errors).toEqual([]);
    await info.attach('system-fonts', {
      body: JSON.stringify({ expectedFonts, uiFonts }, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('preferences-system-fonts.png') });
  } finally {
    await desktop.stop();
  }
});
