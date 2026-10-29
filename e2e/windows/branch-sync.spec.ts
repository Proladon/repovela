import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, indexHash, launchDesktop, nativeWindow } from './desktop';

test('遠端右鍵同步：快轉其他本機分支、目前分支與拒絕分歧', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-branch-sync-'));
  const path = join(root, '同步測試 中文');
  const config = join(root, 'global.gitconfig');
  const hooks = join(root, 'hooks');
  await mkdir(path);
  await mkdir(hooks);
  await writeFile(config, '');
  const environment = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config };
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...environment },
    }).trim();
  git('init', '--initial-branch=master');
  git('config', 'user.name', 'Sync Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooks);
  await writeFile(join(path, 'file.txt'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'old master');
  const base = git('rev-parse', 'HEAD');
  git('branch', 'local-copy');
  git('switch', '-c', 'dev');
  await writeFile(join(path, 'file.txt'), 'latest\n');
  git('commit', '-am', 'new remote');
  const latest = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', 'unused-offline-remote');
  git('update-ref', 'refs/remotes/origin/master', latest);
  for (let i = 0; i < 7; i++) git('update-ref', `refs/remotes/origin/feature/shared-${i}`, latest);
  const beforeIndex = await indexHash(path);
  const beforeConfig = await readFile(join(path, '.git/config'), 'utf8');
  const desktop = await launchDesktop(info.outputPath('profile'), info, environment);
  const page = desktop.page;
  page.setDefaultTimeout(10_000);
  const openSync = async (useBadge = false) => {
    await expect(page.getByRole('button', { name: '重新整理', exact: true })).toBeEnabled();
    const row = page.locator(`#commit-${latest}`);
    await row.evaluate((element) => {
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'center' });
    });
    const target = useBadge
      ? row.locator('.branch-badge').filter({ hasText: /^origin\/master$/ })
      : row;
    await target.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await target.click({ button: 'right' });
    if (!useBadge) {
      await expect(page.getByRole('menuitem', { name: 'Checkout', exact: true })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /同步本機分支/ })).toHaveCount(1);
      await assertLayout(page, ['.context-menu']);
      await page.screenshot({ path: info.outputPath('commit-row-sync-menu.png') });
    }
    await page.getByRole('menuitem', { name: '同步本機分支至此遠端…', exact: true }).click();
    if (!useBadge) {
      const source = page.getByLabel('同步來源（遠端分支）');
      await expect(source).toHaveValue('');
      await expect(source.locator('option')).toHaveCount(9);
      await expect(page.getByRole('button', { name: '執行同步本機分支' })).toBeDisabled();
      await assertLayout(page, ['.sync-branch-dialog']);
      await source.selectOption('origin/master');
      await assertLayout(page, ['.sync-branch-dialog']);
      await page.screenshot({ path: info.outputPath('sync-remote-selection.png') });
    } else await expect(page.getByLabel('同步來源（遠端分支）')).toHaveCount(0);
  };
  const finish = async () => {
    await page.getByRole('button', { name: '執行同步本機分支', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'dev', exact: true })).toBeVisible();
    await openSync();
    await expect(page.getByLabel('同步目標（本機分支）')).toHaveValue('master');
    await expect(page.getByRole('dialog')).toContainText('同步方向：origin/master → master');
    await expect(page.getByRole('dialog')).toContainText('保留目前 Checkout');
    await assertLayout(page, ['.sync-branch-dialog']);
    await page.screenshot({ path: info.outputPath('sync-other-branch.png') });
    await finish();
    expect(git('rev-parse', 'master')).toBe(latest);
    expect(git('symbolic-ref', 'HEAD')).toBe('refs/heads/dev');
    expect(await indexHash(path)).toBe(beforeIndex);
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('latest\n');
    expect(await readFile(join(path, '.git/config'), 'utf8')).toBe(beforeConfig);
    await page.locator('.branch-picker > button').click();
    await page.getByRole('button', { name: 'local-copy', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '切換分支', exact: true }).click();
    await expect(page.getByRole('button', { name: 'local-copy', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '關閉提示' }).click();
    expect(git('rev-parse', 'HEAD')).toBe(base);
    await openSync(true);
    await expect(page.getByRole('button', { name: '執行同步本機分支' })).toBeDisabled();
    await page.getByLabel('同步目標（本機分支）').selectOption('local-copy');
    await expect(page.getByRole('dialog')).toContainText('會更新目前分支、暫存區與工作目錄');
    await page.screenshot({ path: info.outputPath('sync-current-branch.png') });
    await finish();
    expect(git('symbolic-ref', 'HEAD')).toBe('refs/heads/local-copy');
    expect(git('rev-parse', 'HEAD')).toBe(latest);
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('latest\n');
    expect(git('status', '--porcelain')).toBe('');
    git('switch', '-c', 'fork', base);
    await writeFile(join(path, 'file.txt'), 'fork\n');
    git('commit', '-am', 'local only');
    const fork = git('rev-parse', 'HEAD');
    await page.getByRole('button', { name: '重新整理', exact: true }).click();
    await expect(page.getByRole('button', { name: 'fork', exact: true })).toBeVisible();
    await openSync();
    await page.getByLabel('同步目標（本機分支）').selectOption('fork');
    await page.getByRole('button', { name: '執行同步本機分支', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('歷史已分歧');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(git('rev-parse', 'HEAD')).toBe(fork);
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('fork\n');
    expect(git('rev-parse', 'origin/master')).toBe(latest);
    expect(desktop.errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    throw error;
  } finally {
    await desktop.stop();
  }
});
