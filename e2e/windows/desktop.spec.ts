import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFixtures } from '../../scripts/validation-fixtures.ts';
import { assertLayout, indexHash, launchDesktop, nativeWindow } from './desktop';

test('正式 Tauri：原生視窗、唯讀 IPC、WebView2 排版與重啟還原', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const config = JSON.parse(await readFile(resolve('src-tauri/tauri.conf.json'), 'utf8'));
  const capabilities = JSON.parse(
    await readFile(resolve('src-tauri/capabilities/default.json'), 'utf8'),
  );
  const window = config.app.windows[0];
  expect(window.label).toBe('main');
  expect(capabilities.windows).toContain(window.label);
  expect(capabilities.permissions).toContain('dialog:allow-open');
  expect(config.build.frontendDist).toBe('../dist');
  const sizes = [
    { width: window.width as number, height: window.height as number },
    { width: window.minWidth as number, height: window.minHeight as number },
  ];
  // 非 Git 資料夾必須放在工作樹之外，否則 libgit2 會向上找到本專案。
  const fixtures = createFixtures();
  const hashes = await Promise.all([indexHash(fixtures.a), indexHash(fixtures.b)]);
  await info.attach('fixtures', {
    body: JSON.stringify(fixtures, null, 2),
    contentType: 'application/json',
  });
  const profile = info.outputPath('webview2-profile');
  const desktop = await launchDesktop(profile, info);
  let active = desktop;
  const evidence: unknown[] = [];
  const capture = async (page: Page, name: string, selectors: string[]) => {
    await assertLayout(page, selectors);
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, animations: 'disabled', caret: 'hide' });
    await info.attach(name, { path, contentType: 'image/png' });
  };
  const resize = async (width: number, height: number) => {
    const state = await nativeWindow(active.pid, 'resize', width, height);
    evidence.push(state);
    expect(state).toMatchObject({
      title: window.title,
      visible: true,
      minimized: false,
      width,
      height,
    });
    await expect
      .poll(() => active.page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual({ width, height });
  };
  const paste = async (path: string) => {
    await active.page.getByRole('button', { name: '貼上專案路徑' }).click();
    const input = active.page.getByRole('textbox', { name: '專案路徑' });
    await expect(input).toBeFocused();
    await input.fill(path);
    await active.page
      .getByRole('dialog')
      .getByRole('button', { name: '加入專案', exact: true })
      .click();
  };
  try {
    const initial = await nativeWindow(desktop.pid);
    evidence.push(initial);
    expect(initial).toMatchObject({
      title: window.title,
      visible: true,
      minimized: false,
      width: window.width,
      height: window.height,
    });
    await expect(desktop.page.locator('.demo-banner')).toHaveCount(0);
    for (const size of sizes) {
      await resize(size.width, size.height);
      await capture(desktop.page, `${size.width}-welcome`, [
        '.sidebar',
        '.onboarding',
        '.primary-button',
      ]);
    }
    await paste(fixtures.invalid);
    await expect(desktop.page.getByRole('alert')).toBeVisible();
    await expect(desktop.page.getByRole('tab')).toHaveCount(0);
    await desktop.page.keyboard.press('Escape');
    await desktop.page.getByRole('button', { name: '關閉提示' }).click();
    // 實際 IPC 從子目錄找到 Git 根目錄。
    await paste(fixtures.subdirectory);
    await expect(
      desktop.page.getByRole('heading', { name: '驗證紀錄 25', exact: true }),
    ).toBeVisible();
    await expect(
      desktop.page.getByRole('tab', { name: '專案 A 空白', exact: true }),
    ).toHaveAttribute('title', fixtures.a);
    await desktop.page.keyboard.press('Control+w');
    await paste(fixtures.a);
    await expect(desktop.page.locator('.project-item')).toHaveCount(1);
    await expect(
      desktop.page.getByRole('heading', { name: '驗證紀錄 25', exact: true }),
    ).toBeVisible();
    await desktop.page.keyboard.press('Control+w');
    await paste(fixtures.b);
    await expect(
      desktop.page.getByRole('heading', { name: '驗證紀錄 25', exact: true }),
    ).toBeVisible();
    await desktop.page.locator('.project-open').filter({ hasText: '專案 A 空白' }).click();
    await expect(desktop.page.getByRole('tab')).toHaveCount(2);

    for (const size of sizes) {
      const page = desktop.page;
      await resize(size.width, size.height);
      await page.locator(`#commit-${fixtures.head}`).click();
      await expect(page.getByRole('heading', { name: '驗證紀錄 25', exact: true })).toBeVisible();
      await capture(page, `${size.width}-history`, [
        '.sidebar',
        '.tabs',
        '.toolbar',
        '.history-panel',
        '.detail-panel',
        '.status-bar',
      ]);
      await page.locator('.branch-picker > button').click();
      await expect(page.getByRole('textbox', { name: '搜尋分支' })).toBeFocused();
      await capture(page, `${size.width}-branches`, ['.branch-menu']);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+f');
      await expect(page.getByRole('textbox', { name: '搜尋 commit' })).toBeFocused();
      await page.getByRole('textbox', { name: '搜尋 commit' }).fill('驗證紀錄 24');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: '驗證紀錄 24', exact: true })).toBeVisible();
      await capture(page, `${size.width}-search`, ['.history-panel', '.detail-panel']);
      await page.getByRole('button', { name: '清除搜尋' }).click();
      await page.locator('.detail-panel .file-row').first().click();
      await expect(page.locator('.diff-code')).toContainText('第 24 版');
      await capture(page, `${size.width}-diff`, ['.detail-panel', '.diff-heading', '.diff-scroll']);
      const scroll = await page.locator('.diff-scroll').evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
      });
      expect(scroll).toBeGreaterThan(0);
      await page.getByRole('button', { name: '返回檔案清單' }).click();
      await page.locator('#commit-worktree').click();
      await expect(page.getByRole('heading', { name: '尚未提交的變更' })).toBeVisible();
      await expect(page.locator('.detail-panel')).toContainText('未追蹤.txt');
      await capture(page, `${size.width}-worktree`, ['.history-panel', '.detail-panel']);
      await page.getByRole('button', { name: '專案 A 空白 專案選單', exact: true }).click();
      await capture(page, `${size.width}-project-menu`, ['.project-menu']);
      await page.getByRole('button', { name: '重新命名', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '專案名稱' })).toBeFocused();
      await capture(page, `${size.width}-rename`, [
        '.modal',
        '.modal-input',
        '.modal .primary-button',
      ]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '快捷鍵與關於' }).click();
      await capture(page, `${size.width}-help`, ['.modal', '.shortcuts']);
      await page.keyboard.press('Escape');
    }
    await desktop.page.keyboard.press('Control+Tab');
    await expect(desktop.page.getByRole('tab', { name: '專案 B', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await desktop.page.keyboard.press('Control+Shift+Tab');
    await expect(desktop.page.getByRole('heading', { name: '尚未提交的變更' })).toBeVisible();
    evidence.push(await nativeWindow(desktop.pid, 'minimize'));
    expect(await nativeWindow(desktop.pid)).toMatchObject({ minimized: true });
    evidence.push(await nativeWindow(desktop.pid, 'restore'));
    expect(await nativeWindow(desktop.pid)).toMatchObject({ visible: true, minimized: false });
    expect(desktop.errors).toEqual([]);
    await desktop.stop(true);
    // 關閉真正的原生程序，再使用同一測試 profile 啟動，並非 page.reload()。
    active = await launchDesktop(profile, info);
    await expect(active.page.getByRole('tab')).toHaveCount(2);
    await expect(
      active.page.getByRole('tab', { name: '專案 A 空白', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(active.page.getByRole('heading', { name: '尚未提交的變更' })).toBeVisible();
    await capture(active.page, 'restart', ['.sidebar', '.tabs', '.history-panel', '.detail-panel']);
    expect(active.errors).toEqual([]);
    expect(await Promise.all([indexHash(fixtures.a), indexHash(fixtures.b)])).toEqual(hashes);
    await active.stop(true);
  } catch (error) {
    const path = info.outputPath('failure.png');
    await active.page
      .screenshot({ path })
      .then(() => info.attach('failure', { path, contentType: 'image/png' }))
      .catch(() => {});
    throw error;
  } finally {
    await info.attach('native-windows', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
    await active.stop();
  }
});
