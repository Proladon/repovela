import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('Commit 右鍵操作：Tag、分支、Checkout、Cherry-pick、Revert、Merge、Rebase、Reset', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-commit-actions-'));
  const path = join(root, '歷史操作 空白');
  const hooks = join(root, 'hooks');
  const global = join(root, 'global.gitconfig');
  await mkdir(path);
  await mkdir(hooks);
  await writeFile(global, '');
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: global },
    }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', '桌面驗證');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooks);
  await writeFile(join(path, 'base.txt'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('switch', '-c', 'feature');
  await writeFile(join(path, 'feature.txt'), 'feature\n');
  git('add', '.');
  git('commit', '-m', 'feature');
  const feature = git('rev-parse', 'HEAD');
  git('switch', 'main');
  await writeFile(join(path, 'main.txt'), 'main\n');
  git('add', '.');
  git('commit', '-m', 'main');
  const before = git('rev-parse', 'HEAD');
  git('switch', '-c', 'dev');
  await writeFile(join(path, 'dev.txt'), 'dev\n');
  git('add', '.');
  git('commit', '-m', 'newer dev');
  const dev = git('rev-parse', 'HEAD');
  git('switch', 'main');
  const desktop = await launchDesktop(info.outputPath('profile'), info);
  const page = desktop.page;
  page.setDefaultTimeout(10_000);
  const openMenu = async (oid: string) => {
    const row = page.locator(`#commit-${oid}`);
    await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await row.click({ button: 'right', timeout: 10_000 });
  };
  const open = async (oid: string, item: string) => {
    await test.step(`開啟 ${item} ${oid.slice(0, 7)}`, async () => {
      await openMenu(oid);
      await page.getByRole('menuitem', { name: item, exact: true }).click({ timeout: 10_000 });
      await expect(page.getByRole('dialog')).toBeVisible();
    });
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
    await openMenu(base);
    await assertLayout(page, ['.context-menu']);
    await expect(page.getByRole('menu')).toHaveCSS('position', 'fixed');
    for (const label of [
      '新增 Tag…',
      '建立分支…',
      'Checkout',
      'Cherry-pick…',
      'Revert…',
      '合併至目前分支…',
      '將目前分支 Rebase 到此 Commit…',
      '將目前分支 Reset 到此 Commit…',
      '複製完整 commit hash',
      '複製 Commit 標題',
    ]) {
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath('commit-context-menu.png') });
    await page.keyboard.press('Escape');
    await openMenu(dev);
    await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
    await finish('Checkout');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('dev');
    for (const [label, title] of [
      ['合併至目前分支…', '合併至目前分支'],
      ['將目前分支 Rebase 到此 Commit…', 'Rebase 目前分支'],
      ['將目前分支 Reset 到此 Commit…', 'Reset 目前分支'],
    ]) {
      await open(before, label);
      await expect(page.getByRole('dialog')).toContainText('目前位置：dev');
      await expect(page.getByRole('button', { name: `執行 ${title}`, exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '取消操作' }).click();
    }
    await openMenu(before);
    await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
    await finish('Checkout');
    await open(base, '新增 Tag…');
    await page.getByLabel('Tag 名稱').fill('v-base');
    await page.getByLabel('Tag 註解（可留空）').fill('標籤註解');
    await assertLayout(page, ['.commit-action-dialog']);
    await finish('新增 Tag');
    expect(git('rev-parse', 'v-base^{commit}')).toBe(base);
    await open(base, '建立分支…');
    await page.getByLabel('分支名稱', { exact: true }).fill('from-base');
    await finish('建立分支');
    expect(git('rev-parse', 'from-base')).toBe(base);
    expect(git('rev-parse', 'HEAD')).toBe(before);
    await openMenu(base);
    await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
    await finish('Checkout');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('from-base');
    await openMenu(before);
    await page.getByRole('menuitem', { name: 'Checkout', exact: true }).click();
    await finish('Checkout');
    await open(feature, 'Cherry-pick…');
    await finish('Cherry-pick');
    const picked = git('rev-parse', 'HEAD');
    expect(await readFile(join(path, 'feature.txt'), 'utf8')).toBe('feature\n');
    await open(picked, 'Revert…');
    await finish('Revert');
    expect(git('ls-tree', '--name-only', 'HEAD')).not.toContain('feature.txt');
    await open(feature, '合併至目前分支…');
    await page.getByLabel('Merge 模式').selectOption('noFf');
    await finish('合併至目前分支');
    const merged = git('rev-parse', 'HEAD');
    expect(git('rev-list', '--parents', '-1', 'HEAD').split(' ')).toHaveLength(3);
    await open(base, '建立分支…');
    await page.getByLabel('分支名稱', { exact: true }).fill('rebase-test');
    await page.getByLabel('建立後切換至此分支').check();
    await finish('建立分支');
    await open(merged, '將目前分支 Rebase 到此 Commit…');
    await finish('Rebase 目前分支');
    expect(git('rev-parse', 'HEAD')).toBe(merged);
    for (const mode of ['soft', 'mixed', 'hard']) {
      await open(base, '將目前分支 Reset 到此 Commit…');
      await page.getByLabel('Reset 模式').selectOption(mode);
      if (mode === 'hard') {
        await expect(page.getByRole('dialog')).toContainText('捨棄');
        await writeFile(join(path, 'base.txt'), 'discarded\n');
        await page.screenshot({ path: info.outputPath('reset-hard-dialog.png') });
      }
      await finish('Reset 目前分支');
      expect(git('rev-parse', 'HEAD')).toBe(base);
    }
    expect(await readFile(join(path, 'base.txt'), 'utf8')).toBe('base\n');
    expect(desktop.errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    throw error;
  } finally {
    await desktop.stop();
  }
});
