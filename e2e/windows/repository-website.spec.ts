import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('repo 網站：真實遠端設定、選擇遠端、切換專案與 HTTP(S) opener 範圍', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-repo-website-'));
  const paths = [join(root, '有遠端 repo'), join(root, '本機 repo')];
  const git = (path: string, ...args: string[]) =>
    execFileSync('git', args, { cwd: path, encoding: 'utf8', windowsHide: true }).trim();
  for (const path of paths) {
    await mkdir(path);
    git(path, 'init', '--initial-branch=main');
  }
  git(paths[0], 'remote', 'add', 'origin', 'git@github.com:example/repo.git');
  git(paths[0], 'remote', 'add', 'upstream', 'https://gitlab.example.com/team/repo.git');
  const before = await readFile(join(paths[0], '.git/config'));
  const desktop = await launchDesktop(info.outputPath('profile'), info);
  const { page } = desktop;
  page.setDefaultTimeout(10_000);
  try {
    for (const path of paths) {
      await page.getByRole('button', { name: '貼上專案路徑' }).click();
      await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
      await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
      await expect(page.locator('.history-empty')).toBeVisible();
      if (path === paths[0]) await page.keyboard.press('Control+w');
    }
    const button = page.getByRole('button', { name: '開啟 repo 網站', exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', '此專案沒有可開啟的遠端 repo 網址');
    await page.locator('.project-open').filter({ hasText: '有遠端 repo' }).click();
    await expect(button).toBeEnabled();
    const denied = await page.evaluate(async () => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (command: string, args: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      try {
        await internals.invoke('plugin:opener|open_url', { url: 'file:///repo', with: null });
        return '';
      } catch (error) {
        return String(error);
      }
    });
    expect(denied).toMatch(/not allowed|denied/i);
    expect(denied).not.toMatch(/command not found|unknown command/i);
    // 只攔截最後的網站開啟呼叫，避免測試啟動使用者的預設瀏覽器。
    await page.evaluate(async () => {
      const testWindow = window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args?: unknown, options?: unknown) => Promise<unknown>;
          convertFileSrc: (path: string, protocol: string) => string;
        };
        websiteRequests: unknown[];
      };
      testWindow.websiteRequests = [];
      const internals = testWindow.__TAURI_INTERNALS__;
      const openerAddress = internals.convertFileSrc('plugin:opener|open_url', 'ipc');
      const originalFetch = window.fetch.bind(window);
      const intercepted: typeof fetch = async (input, init) => {
        const address = input instanceof Request ? input.url : String(input);
        if (address === openerAddress) {
          testWindow.websiteRequests.push(JSON.parse(String(init?.body)));
          return new Response('null', {
            headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
          });
        }
        return originalFetch(input, init);
      };
      window.fetch = intercepted;
      if (window.fetch !== intercepted)
        throw new Error('無法攔截網站 opener；停止測試以避免開啟瀏覽器。');
      // 使用原生 scope 已拒絕的協定測試攔截，失敗也不會開啟瀏覽器。
      await internals.invoke('plugin:opener|open_url', { url: 'file:///interception-probe' });
      if (testWindow.websiteRequests.length !== 1) throw new Error('網站 opener 攔截未生效。');
      testWindow.websiteRequests = [];
    });
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await button.click();
    await expect(page.getByRole('menuitem')).toHaveText(['origin', 'upstream']);
    await assertLayout(page, ['.toolbar', '.context-menu']);
    await page.screenshot({ path: info.outputPath('repository-website.png') });
    await page.getByRole('menuitem', { name: 'origin', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { websiteRequests: unknown[] }).websiteRequests),
      )
      .toEqual([{ url: 'https://github.com/example/repo' }]);
    await button.click();
    await page.getByRole('menuitem', { name: 'upstream', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { websiteRequests: unknown[] }).websiteRequests),
      )
      .toEqual([
        { url: 'https://github.com/example/repo' },
        { url: 'https://gitlab.example.com/team/repo' },
      ]);
    await page.getByRole('checkbox', { name: '顯示遠端分支' }).uncheck();
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByRole('menuitem', { name: 'origin', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await readFile(join(paths[0], '.git/config'))).toEqual(before);
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
