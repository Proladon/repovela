import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('桌面 Git 操作：暫存、取消暫存、提交、分支與本機遠端', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-operations-'));
  const path = join(root, '中文專案 空白');
  const remote = join(root, 'remote.git');
  const hooks = join(root, 'hooks');
  const globalConfig = join(root, 'global.gitconfig');
  await mkdir(path);
  await mkdir(hooks);
  await writeFile(globalConfig, '');
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig },
    }).trim();
  git(path, 'init', '--initial-branch=main');
  git(path, 'config', 'user.name', '桌面測試');
  git(path, 'config', 'user.email', 'test@example.invalid');
  git(path, 'config', 'commit.gpgsign', 'false');
  git(path, 'config', 'core.autocrlf', 'false');
  git(path, 'config', 'core.hooksPath', hooks);
  git(root, 'init', '--bare', remote);
  git(path, 'remote', 'add', 'origin', remote);
  await writeFile(join(path, 'file.txt'), 'base\n');
  git(path, 'add', '.');
  git(path, 'commit', '-m', 'base');
  await writeFile(join(path, 'file.txt'), 'staged\n');
  git(path, 'add', 'file.txt');
  await writeFile(join(path, 'file.txt'), 'unstaged\n');
  await writeFile(join(path, '新檔.txt'), 'new\n');
  const desktop = await launchDesktop(info.outputPath('profile'), info);
  const page = desktop.page;
  const finish = async () => {
    await expect(page.getByRole('alert')).toContainText('Git 操作已完成');
    await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '關閉提示' }).click();
  };
  try {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await page.getByRole('button', { name: /工作區 2 個檔案尚未提交/ }).click();
    await page
      .getByRole('button', { name: '取消暫存 file.txt', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: '取消暫存', exact: true }).click();
    await finish();
    expect(git(path, 'diff', '--cached', '--name-only')).toBe('');
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('unstaged\n');
    await page
      .getByRole('button', { name: '暫存 新檔.txt', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: '暫存', exact: true }).click();
    await finish();
    await page.getByRole('textbox', { name: '提交訊息' }).fill('桌面提交');
    await page.getByRole('button', { name: '提交已暫存變更' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '提交已暫存變更' }).click();
    await finish();
    expect(git(path, 'log', '-1', '--format=%s')).toBe('桌面提交');
    expect(git(path, 'show', 'HEAD:file.txt')).toBe('base');
    expect(git(path, 'show', 'HEAD:新檔.txt')).toBe('new');
    await expect(page.getByRole('textbox', { name: '提交訊息' })).toHaveValue('');
    await page.locator('.working-row').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '全部暫存', exact: true }).click();
    await finish();
    await page.getByRole('textbox', { name: '提交訊息' }).fill('更新 file');
    await page.getByRole('button', { name: '提交已暫存變更' }).click();
    await finish();
    await page.getByRole('button', { name: '分支操作', exact: true }).click();
    await page.getByLabel('建立並切換分支').fill('feature/test');
    await page.getByRole('button', { name: '建立分支', exact: true }).click();
    await finish();
    expect(git(path, 'branch', '--show-current')).toBe('feature/test');
    await page.getByRole('button', { name: 'Push', exact: true }).click();
    await finish();
    expect(git(path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/feature/test');
    expect(git(remote, 'rev-parse', 'refs/heads/feature/test')).toBe(
      git(path, 'rev-parse', 'HEAD'),
    );
    await page.locator('.git-actions').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Fetch', exact: true }).click();
    await finish();
    await page.getByRole('button', { name: 'Pull', exact: true }).click();
    await finish();
    await page.locator('.branch-picker > button').click();
    await page
      .locator('.branch-list')
      .getByRole('button', { name: 'main', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: '切換分支', exact: true }).click();
    await finish();
    expect(git(path, 'branch', '--show-current')).toBe('main');
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await assertLayout(page, ['.git-actions', '.commit-form', '.detail-panel']);
    await page.getByRole('button', { name: '分支操作', exact: true }).click();
    await assertLayout(page, ['.git-branch-menu']);
    await page.keyboard.press('Escape');
    for (const name of ['Fetch', 'Pull', 'Push', '分支操作', '重新整理']) {
      const button = page.getByRole('button', { name, exact: true });
      expect(await button.textContent()).toBe('');
      await expect(button).toHaveAttribute('title', new RegExp(name));
    }
    // The workspace menu near the lower/right edge must remain inside the viewport.
    await page.locator('.working-row').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.working-row')).toBeFocused();
    await page.locator('.detail-scroll').click({ button: 'right', position: { x: 350, y: 325 } });
    await assertLayout(page, ['.context-menu']);
    const screenshot = info.outputPath('git-operations.png');
    await page.screenshot({ path: screenshot });
    await info.attach('git-operations', { path: screenshot, contentType: 'image/png' });
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
