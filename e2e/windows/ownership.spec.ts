import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('擁有者不符：取消不寫設定，確認僅信任此專案並可讀取無遠端儲存庫', async ({}, info) => {
  const path = process.env.REPOVELA_OWNER_FIXTURE;
  test.skip(
    process.platform !== 'win32' || !path,
    '需以 REPOVELA_OWNER_FIXTURE 指定擁有者不同的測試儲存庫',
  );
  const repoPath = path!;
  const fingerprint = async (file: string) => {
    try {
      return createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const head = await fingerprint(join(repoPath, '.git', 'HEAD'));
  const index = await fingerprint(join(repoPath, '.git', 'index'));
  const localConfig = await fingerprint(join(repoPath, '.git', 'config'));
  const callerGitHome = process.env.HOME ?? process.env.USERPROFILE;
  const callerConfig =
    process.env.GIT_CONFIG_GLOBAL ??
    (callerGitHome ? join(callerGitHome, '.gitconfig') : undefined);
  const callerConfigBefore = callerConfig ? await fingerprint(callerConfig) : undefined;
  const gitHome = info.outputPath('isolated-git-home');
  const xdg = join(gitHome, '.config');
  const config = join(gitHome, '.gitconfig');
  await mkdir(join(xdg, 'git'), { recursive: true });
  await writeFile(config, '');
  await writeFile(join(xdg, 'git', 'config'), '');
  // HOME is the child's isolated Git home; the caller's settings remain unchanged.
  const desktop = await launchDesktop(info.outputPath('profile'), info, {
    HOME: gitHome,
    XDG_CONFIG_HOME: xdg,
    GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_NOSYSTEM: '1',
  });
  const page = desktop.page;
  page.setDefaultTimeout(10_000);
  const add = async () => {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(repoPath);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '信任 Git 專案' })).toBeVisible();
  };
  try {
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await add();
    await assertLayout(page, ['.commit-action-dialog']);
    await page.screenshot({ path: info.outputPath('ownership-dialog.png') });
    await page.getByRole('button', { name: '取消加入' }).click();
    expect(await readFile(config, 'utf8')).toBe('');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await add();
    await page.getByRole('button', { name: '信任並加入專案' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.locator('.status-bar')).toContainText('已同步本機資料');
    const settings = await readFile(config, 'utf8');
    expect(settings).toContain(repoPath.replaceAll('\\', '/'));
    expect(settings).not.toContain('directory = *');
    expect(await fingerprint(join(repoPath, '.git', 'HEAD'))).toBe(head);
    expect(await fingerprint(join(repoPath, '.git', 'index'))).toBe(index);
    expect(await fingerprint(join(repoPath, '.git', 'config'))).toBe(localConfig);
    if (callerConfig) expect(await fingerprint(callerConfig)).toBe(callerConfigBefore);
    expect(desktop.errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    throw error;
  } finally {
    await desktop.stop();
  }
});
