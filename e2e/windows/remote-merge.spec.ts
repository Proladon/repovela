import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('遠端分支 Checkout：建立本機追蹤分支，再將最新 release 合併進 master', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-remote-merge-'));
  const path = join(root, '遠端追蹤 空白');
  const hooks = join(root, 'hooks');
  const config = join(root, 'global.gitconfig');
  await mkdir(path);
  await mkdir(hooks);
  await writeFile(config, '');
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config },
    }).trim();
  git('init', '--initial-branch=master');
  git('config', 'user.name', '桌面驗證');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooks);
  await writeFile(join(path, 'file.txt'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'master base');
  const base = git('rev-parse', 'HEAD');
  await writeFile(join(path, 'file.txt'), 'latest\n');
  git('commit', '-am', 'latest release');
  const latest = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', 'unused-offline-remote');
  git('update-ref', 'refs/remotes/origin/master', base);
  git('update-ref', 'refs/remotes/origin/release/2.102', latest);
  git('switch', '--detach', latest);
  git('branch', '-D', 'master');
  const desktop = await launchDesktop(info.outputPath('profile'), info);
  const page = desktop.page;
  page.setDefaultTimeout(10_000);
  const menu = async (oid: string, badge = false) => {
    const row = page.locator(`#commit-${oid}`);
    await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await (badge ? row.locator('.branch-badge') : row).click({ button: 'right' });
  };
  const finish = async (title: string) => {
    if (title !== 'Checkout')
      await page.getByRole('button', { name: `執行 ${title}`, exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Git 操作已完成');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '關閉提示' }).click();
  };
  try {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await expect(
      page.getByRole('button', { name: `Detached HEAD · ${latest.slice(0, 7)}`, exact: true }),
    ).toBeVisible();
    await menu(base);
    await expect(
      page.getByRole('menuitem', { name: '合併至目前分支…', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await menu(latest);
    await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
    await finish('Checkout');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('release/2.102');
    expect(git('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/release/2.102');
    await menu(base);
    await page.getByRole('menuitem', { name: '合併至目前分支…', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('合併方向：origin/master → release/2.102');
    await page.getByRole('button', { name: '取消操作' }).click();
    await menu(base, true);
    await page.getByRole('menuitem', { name: 'Checkout 遠端分支', exact: true }).click();
    await finish('Checkout');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('master');
    expect(git('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/master');
    await menu(latest);
    await page.getByRole('menuitem', { name: '合併至目前分支…', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('合併方向：release/2.102 → master');
    await assertLayout(page, ['.commit-action-dialog']);
    await page.screenshot({ path: info.outputPath('merge-into-master.png') });
    await finish('合併至目前分支');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('master');
    expect(git('rev-parse', 'HEAD')).toBe(latest);
    expect(git('rev-parse', 'origin/master')).toBe(base);
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('latest\n');
    expect(desktop.errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    throw error;
  } finally {
    await desktop.stop();
  }
});
