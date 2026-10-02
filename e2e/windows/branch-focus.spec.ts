import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, indexHash, launchDesktop, nativeWindow } from './desktop';

test('主分支快速 focus：遠端選擇、M、右鍵、自動載入舊歷史且不修改 Git', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-branch-focus-'));
  const path = join(root, '主分支 空白');
  const config = join(root, 'global.gitconfig');
  await mkdir(path);
  await writeFile(config, '');
  const environment = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config };
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...environment },
    }).trim();
  git('init', '--initial-branch=dev');
  git('config', 'core.autocrlf', 'false');
  let stream = '';
  for (let i = 1; i <= 520; i++) {
    const subject = `history ${i}`;
    const content = `content ${i}\n`;
    const time = 1_700_000_000 + i;
    stream += `commit refs/heads/dev\ncommitter Focus Test <test@example.invalid> ${time} +0000\ndata ${Buffer.byteLength(subject)}\n${subject}\nM 100644 inline file.txt\ndata ${Buffer.byteLength(content)}\n${content}\n`;
  }
  execFileSync('git', ['fast-import', '--quiet'], {
    cwd: path,
    input: stream,
    windowsHide: true,
    env: { ...process.env, ...environment },
  });
  git('reset', '--hard', 'dev');
  const latest = git('rev-parse', 'HEAD');
  const base = git('rev-list', '--max-parents=0', 'HEAD');
  git('remote', 'add', 'origin', 'unused-offline-remote');
  git('update-ref', 'refs/remotes/origin/master', base);
  git('update-ref', 'refs/remotes/origin/main', latest);
  const before = {
    head: git('symbolic-ref', 'HEAD'),
    refs: git('show-ref'),
    index: await indexHash(path),
    content: await readFile(join(path, 'file.txt'), 'utf8'),
    config: await readFile(join(path, '.git/config'), 'utf8'),
  };
  const desktop = await launchDesktop(info.outputPath('profile'), info, environment);
  const page = desktop.page;
  page.setDefaultTimeout(10_000);
  try {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    const focus = page.getByRole('button', { name: '跳至 master/main', exact: true });
    await expect(focus).toBeEnabled();
    await expect(page.locator(`#commit-${base}`)).toHaveCount(0);
    await focus.click();
    await expect(
      page.getByRole('menuitem', { name: '跳至 origin/master', exact: true }),
    ).toBeVisible();
    await assertLayout(page, ['.context-menu', '.toolbar-actions']);
    await page.screenshot({ path: info.outputPath('primary-branch-menu.png') });
    await page.getByRole('menuitem', { name: '跳至 origin/master', exact: true }).click();
    const baseRow = page.locator(`#commit-${base}`);
    await expect(baseRow).toBeFocused();
    await expect(baseRow).toHaveClass(/selected/);
    await expect(baseRow).toBeInViewport();
    await expect(page.getByRole('button', { name: 'dev', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('focused-master.png') });
    await focus.click();
    await page.getByRole('menuitem', { name: '跳至目前 checkout', exact: true }).click();
    await expect(page.locator(`#commit-${latest}`)).toBeFocused();
    await expect(page.locator(`#commit-${latest}`)).toHaveClass(/selected/);
    await expect(page.locator(`#commit-${latest}`)).toBeInViewport();
    await page.keyboard.press('m');
    await page.getByRole('menuitem', { name: '跳至 origin/main', exact: true }).click();
    await expect(page.locator(`#commit-${latest}`)).toBeFocused();
    await page.locator('.toolbar').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '跳至 origin/master', exact: true }).click();
    await expect(baseRow).toBeFocused();
    await page.locator('.toolbar').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '跳至目前 checkout', exact: true }).click();
    await expect(page.locator(`#commit-${latest}`)).toBeFocused();
    expect({
      head: git('symbolic-ref', 'HEAD'),
      refs: git('show-ref'),
      index: await indexHash(path),
      content: await readFile(join(path, 'file.txt'), 'utf8'),
      config: await readFile(join(path, '.git/config'), 'utf8'),
    }).toEqual(before);
    expect(desktop.errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    throw error;
  } finally {
    await desktop.stop();
  }
});
