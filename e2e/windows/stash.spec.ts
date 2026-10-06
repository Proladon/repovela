import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('Stash：部分暫存與未追蹤檔案、Apply、Pop、確認刪除與衝突保留', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-stash-'));
  const path = join(root, '暫存 專案');
  const hooks = join(root, 'hooks');
  const config = join(root, 'global.gitconfig');
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
  git('init', '--initial-branch=main');
  git('config', 'user.name', '桌面驗證');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooks);
  await writeFile(join(path, 'file.txt'), 'base\n');
  await writeFile(join(path, '.gitignore'), 'ignored.txt\n');
  git('add', '.');
  git('commit', '-m', 'base');
  const head = git('rev-parse', 'HEAD');
  await writeFile(join(path, 'file.txt'), 'staged\n');
  git('add', 'file.txt');
  await writeFile(join(path, 'file.txt'), 'unstaged\n');
  await writeFile(join(path, '新檔案.txt'), 'new\n');
  await writeFile(join(path, 'ignored.txt'), 'keep\n');
  const desktop = await launchDesktop(info.outputPath('profile'), info, environment);
  const { page } = desktop;
  page.setDefaultTimeout(10_000);
  const dialog = page.getByRole('dialog', { name: 'Stash', exact: true });
  const waitForOperation = async () => {
    await expect(page.getByRole('alert').filter({ hasText: 'Git 操作已完成' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '關閉 Stash' })).toBeEnabled();
  };
  try {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'base', exact: true })).toBeVisible();
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await page.locator('#commit-worktree').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Stash', exact: true }).click();
    await expect(dialog.getByLabel('Stash 訊息（可留空）')).toBeFocused();
    await expect(dialog.getByText('目前沒有 Stash。')).toBeVisible();
    await dialog.getByLabel('Stash 訊息（可留空）').fill('第一份 中文暫存');
    await dialog.getByLabel('包含未追蹤檔案').check();
    await dialog.getByRole('button', { name: '儲存 Stash', exact: true }).click();
    await waitForOperation();
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByLabel('Stash 訊息（可留空）')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '儲存 Stash', exact: true })).toHaveCount(0);
    await expect(dialog.getByText('目前工作區沒有可儲存的變更。')).toBeVisible();
    expect(git('stash', 'list')).toContain('第一份 中文暫存');
    expect(git('status', '--porcelain')).toBe('');
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('base\n');
    expect(await readFile(join(path, 'ignored.txt'), 'utf8')).toBe('keep\n');
    await assertLayout(page, ['.toolbar', '.stash-dialog']);
    await page.screenshot({ path: info.outputPath('stash-list.png') });

    await dialog.getByRole('button', { name: '套用 Stash', exact: true }).click();
    await waitForOperation();
    expect(git('stash', 'list').split('\n')).toHaveLength(1);
    expect(git('show', ':file.txt')).toBe('staged');
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('unstaged\n');
    expect(await readFile(join(path, '新檔案.txt'), 'utf8')).toBe('new\n');
    expect(git('rev-parse', 'HEAD')).toBe(head);

    await dialog.getByRole('button', { name: '關閉 Stash' }).click();
    await page.locator('#commit-worktree').click();
    const fileRow = page
      .locator('.working-file-actions')
      .filter({ hasText: 'file.txt' })
      .first()
      .locator('.file-row');
    await fileRow.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await fileRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Stash 工作區…', exact: true }).click();
    await dialog.getByLabel('包含未追蹤檔案').check();
    await dialog.getByLabel('Stash 訊息（可留空）').fill('第二份 暫存');
    await dialog.getByRole('button', { name: '儲存 Stash', exact: true }).click();
    await waitForOperation();
    await expect(dialog.getByRole('option')).toHaveCount(2);
    await dialog.getByRole('option', { name: /第一份 中文暫存/ }).click();
    await dialog.getByRole('button', { name: '還原並移除 Stash', exact: true }).click();
    await waitForOperation();
    await expect(dialog.getByRole('option')).toHaveCount(1);
    expect(git('stash', 'list')).toContain('第二份 暫存');
    expect(git('stash', 'list')).not.toContain('第一份 中文暫存');
    expect(git('show', ':file.txt')).toBe('staged');
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('unstaged\n');

    await dialog.getByRole('button', { name: '刪除 Stash', exact: true }).click();
    await expect(dialog.getByText('刪除後將無法從 Stash 清單還原這份變更。')).toBeVisible();
    await dialog.getByRole('button', { name: '取消刪除' }).click();
    expect(git('stash', 'list')).toContain('第二份 暫存');
    await dialog.getByRole('button', { name: '刪除 Stash', exact: true }).click();
    await dialog.getByRole('button', { name: '確認刪除 Stash' }).click();
    await waitForOperation();
    await expect(dialog.getByText('目前沒有 Stash。')).toBeVisible();
    expect(git('stash', 'list')).toBe('');
    expect(git('show', ':file.txt')).toBe('staged');
    expect(await readFile(join(path, 'file.txt'), 'utf8')).toBe('unstaged\n');

    await writeFile(join(path, 'file.txt'), 'stashed conflict\n');
    await dialog.getByLabel('Stash 訊息（可留空）').fill('衝突時保留');
    await dialog.getByRole('button', { name: '儲存 Stash', exact: true }).click();
    await waitForOperation();
    const stashOid = git('rev-parse', 'refs/stash');
    await dialog.getByRole('button', { name: '關閉 Stash' }).click();
    await writeFile(join(path, 'file.txt'), 'advanced\n');
    git('add', 'file.txt');
    git('commit', '-m', 'advance');
    await page.getByRole('button', { name: '重新整理', exact: true }).click();
    await expect(page.locator('.branch-picker > button')).toContainText('main');
    await expect(page.getByRole('button', { name: '重新整理', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stash', exact: true }).click();
    await dialog.getByLabel('一併還原暫存狀態').uncheck();
    await dialog.getByRole('button', { name: '還原並移除 Stash', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('CONFLICT');
    await expect(dialog.getByText('工作區有衝突，請先解決衝突並暫存檔案。')).toBeVisible();
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: '套用 Stash', exact: true })).toBeDisabled();
    expect(git('rev-parse', 'refs/stash')).toBe(stashOid);
    expect(git('ls-files', '--unmerged')).not.toBe('');
    const conflict = await readFile(join(path, 'file.txt'), 'utf8');
    expect(conflict).toContain('advanced');
    expect(conflict).toContain('stashed conflict');
    await page.screenshot({ path: info.outputPath('stash-conflict.png') });
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
