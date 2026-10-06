import { expect, test, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('專案拖拉排序與重開還原；雙擊 commit、分支標籤與分支列表 Checkout', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-project-interactions-'));
  const config = join(root, 'global.gitconfig');
  const hooks = join(root, 'hooks');
  await writeFile(config, '');
  await mkdir(hooks);
  const environment = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config };
  const git = (path: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...environment },
    }).trim();
  const paths: string[] = [];
  for (const name of ['A', 'B', 'C', 'D']) {
    const path = join(root, `專案 ${name}`);
    await mkdir(path);
    git(path, 'init', '--initial-branch=main');
    git(path, 'config', 'user.name', '桌面驗證');
    git(path, 'config', 'user.email', 'test@example.invalid');
    git(path, 'config', 'commit.gpgsign', 'false');
    git(path, 'config', 'core.autocrlf', 'false');
    git(path, 'config', 'core.hooksPath', hooks);
    await writeFile(join(path, 'file.txt'), 'base\n');
    git(path, 'add', '.');
    git(path, 'commit', '-m', 'base');
    git(path, 'branch', 'dev');
    git(path, 'remote', 'add', 'origin', 'unused-offline-remote');
    git(path, 'update-ref', 'refs/remotes/origin/release', git(path, 'rev-parse', 'HEAD'));
    await writeFile(join(path, 'file.txt'), 'latest\n');
    git(path, 'commit', '-am', 'latest');
    paths.push(path);
  }
  const profile = info.outputPath('profile');
  let desktop = await launchDesktop(profile, info, environment);
  let page = desktop.page;
  page.setDefaultTimeout(10_000);
  const project = (name: string) =>
    page.locator('.project-library .project-open').filter({ hasText: `專案 ${name}` });
  const order = () => page.locator('.project-open').allTextContents();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('repovela-session-v1')!));
  const drag = async (source: Locator, target: Locator, placement: 'before' | 'after') => {
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.project-item')).every(
        (element) => getComputedStyle(element).transform === 'none',
      ),
    );
    const sourceName = await source.textContent();
    const targetName = await target.textContent();
    const sourcePin = await source.locator('xpath=../..').getAttribute('data-pinned');
    const targetSection = target.locator('xpath=../..');
    const targetPin = await targetSection.getAttribute('data-pinned');
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      to.x + to.width / 2,
      to.y + (placement === 'before' ? 2 : to.height - 2),
      { steps: 8 },
    );
    if (sourcePin === targetPin)
      await expect
        .poll(async () => {
          const names = await targetSection.locator('.project-open').allTextContents();
          const sourceIndex = names.indexOf(sourceName!);
          const targetIndex = names.indexOf(targetName!);
          return (
            sourceIndex >= 0 &&
            targetIndex >= 0 &&
            (placement === 'before' ? sourceIndex < targetIndex : sourceIndex > targetIndex)
          );
        })
        .toBe(true);
    await page.mouse.up();
  };
  const pin = async (name: string) => {
    await page.getByRole('button', { name: `專案 ${name} 專案選單` }).click();
    await page.getByRole('button', { name: '釘選專案', exact: true }).click();
  };
  const finishCheckout = async () => {
    await page.getByRole('button', { name: '執行 Checkout', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('Git 操作已完成');
    await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '關閉提示' }).click();
  };
  try {
    for (const path of paths) {
      await page.getByRole('button', { name: '貼上專案路徑' }).click();
      await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
      await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'latest', exact: true })).toBeVisible();
      if (path !== paths.at(-1)) await page.keyboard.press('Control+w');
    }
    for (const name of ['A', 'B', 'C', 'D']) await project(name).click();
    const before = await saved();
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await drag(project('D'), project('A'), 'before');
    await expect.poll(order).toEqual(['專案 D', '專案 A', '專案 B', '專案 C']);
    expect((await saved()).tabs).toEqual(before.tabs);
    expect((await saved()).active).toBe(before.active);
    await pin('A');
    await pin('B');
    await drag(project('B'), project('A'), 'before');
    await drag(project('C'), project('D'), 'before');
    await expect.poll(order).toEqual(['專案 B', '專案 A', '專案 C', '專案 D']);
    await drag(project('B'), project('D'), 'after');
    await expect.poll(order).toEqual(['專案 B', '專案 A', '專案 C', '專案 D']);
    await drag(project('C'), project('D'), 'after');
    await expect.poll(order).toEqual(['專案 B', '專案 A', '專案 D', '專案 C']);
    expect((await saved()).active).toBe(before.active);
    for (const path of paths) expect(git(path, 'branch', '--show-current')).toBe('main');
    await assertLayout(page, ['.sidebar', '.project-library']);
    await page.screenshot({ path: info.outputPath('project-order.png') });
    expect(desktop.errors).toEqual([]);
    await desktop.stop(true);
    desktop = await launchDesktop(profile, info, environment);
    page = desktop.page;
    page.setDefaultTimeout(10_000);
    await expect.poll(order).toEqual(['專案 B', '專案 A', '專案 D', '專案 C']);
    await expect(page.getByRole('tab', { name: '專案 D', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'latest', exact: true })).toBeVisible();

    const path = paths[3];
    const base = git(path, 'rev-parse', 'dev');
    const latest = git(path, 'rev-parse', 'main');
    const dev = page.locator(`#commit-${base} .branch-badge`).filter({ hasText: /^dev$/ });
    await dev.click();
    expect(git(path, 'branch', '--show-current')).toBe('main');
    await dev.dblclick();
    await expect(page.getByRole('alert')).toContainText('Git 操作已完成');
    expect(git(path, 'branch', '--show-current')).toBe('dev');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '關閉提示' }).click();

    await page.locator('.branch-picker > button').click();
    await page
      .locator('.branch-list')
      .getByRole('button', { name: 'origin/release 遠端', exact: true })
      .dblclick();
    await expect(page.getByLabel('Checkout 目標')).toHaveValue('remote:origin/release');
    await expect(page.getByLabel('本機分支名稱')).toHaveValue('release');
    await finishCheckout();
    expect(git(path, 'branch', '--show-current')).toBe('release');
    expect(git(path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/release');

    await page.locator(`#commit-${latest}`).dblclick();
    await expect(page.getByLabel('Checkout 目標')).toHaveValue('branch:main');
    await assertLayout(page, ['.commit-action-dialog']);
    await page.screenshot({ path: info.outputPath('double-click-checkout.png') });
    await finishCheckout();
    expect(git(path, 'branch', '--show-current')).toBe('main');
    expect(git(path, 'rev-parse', 'HEAD')).toBe(latest);
    expect(git(path, 'status', '--porcelain')).toBe('');
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
