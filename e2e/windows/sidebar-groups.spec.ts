import { expect, test, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, indexHash, launchDesktop, nativeWindow } from './desktop';

test('側邊欄調整與群組：群組排序、折疊／空群組拖入、移出、釘選、搜尋及重開還原', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-sidebar-groups-'));
  const config = join(root, 'gitconfig');
  const hooks = join(root, 'hooks');
  await writeFile(config, '');
  await mkdir(hooks);
  const environment = { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
  const git = (path: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...environment },
    }).trim();
  const paths: string[] = [];
  for (const name of ['A', 'B', 'C']) {
    const path = join(root, `專案 ${name}`);
    await mkdir(path);
    git(path, 'init', '--initial-branch=main');
    git(path, 'config', 'user.name', 'Fixture');
    git(path, 'config', 'user.email', 'test@example.invalid');
    git(path, 'config', 'commit.gpgsign', 'false');
    git(path, 'config', 'core.autocrlf', 'false');
    git(path, 'config', 'core.hooksPath', hooks);
    await writeFile(join(path, 'file.txt'), `${name}\n`);
    git(path, 'add', '.');
    git(path, 'commit', '-m', `${name} head`);
    paths.push(path);
  }
  const hashes = await Promise.all(paths.map(indexHash));
  const heads = paths.map((path) => git(path, 'rev-parse', 'HEAD'));
  const profile = info.outputPath('profile');
  let desktop = await launchDesktop(profile, info, environment);
  let page = desktop.page;
  page.setDefaultTimeout(10_000);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('repovela-session-v1')!));
  const group = (name: string) =>
    page.locator('.project-group').filter({
      has: page.locator('.group-toggle > span').filter({ hasText: new RegExp(`^${name}$`) }),
    });
  const project = (name: string) =>
    page.locator('.project-open').filter({ hasText: `專案 ${name}` });
  const drag = async (
    source: Locator,
    target: Locator,
    placement: 'before' | 'after' | 'center' = 'center',
  ) => {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.project-item')).every(
        (element) => getComputedStyle(element).transform === 'none',
      ),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      to.x + to.width / 2,
      to.y + (placement === 'before' ? 2 : placement === 'after' ? to.height - 2 : to.height / 2),
      { steps: 12 },
    );
    await expect(
      target
        .locator(
          'xpath=ancestor-or-self::*[contains(@class,"project-group") or contains(@class,"project-section")][1]',
        )
        .locator('.project-ghost'),
    ).toBeVisible();
    await page.mouse.up();
  };
  const create = async (name: string) => {
    await page.getByRole('button', { name: '建立群組', exact: true }).click();
    await page.getByRole('textbox', { name: '群組名稱' }).fill(name);
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await expect(group(name)).toBeVisible();
  };
  const groupOrder = () =>
    page.locator('.project-sections > .project-group .group-toggle > span').allTextContents();
  const dragGroup = async (
    sourceName: string,
    targetName: string,
    placement: 'before' | 'after',
    expected: string[],
    expectedSaved = expected,
  ) => {
    const source = group(sourceName).locator('.group-toggle');
    const target = group(targetName);
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.project-group')).every(
        (element) => getComputedStyle(element).transform === 'none',
      ),
    );
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      to.x + to.width / 2,
      to.y + (placement === 'before' ? 2 : to.height - 2),
      { steps: 12 },
    );
    await expect.poll(groupOrder).toEqual(expected);
    await page.mouse.up();
    await expect
      .poll(async () => (await saved()).groups.map((item: { name: string }) => item.name))
      .toEqual(expectedSaved);
  };
  try {
    for (const path of paths) {
      await page.getByRole('button', { name: '貼上專案路徑' }).click();
      await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
      await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
      await expect(page.locator('.commit-row')).toHaveCount(1);
      if (path !== paths.at(-1)) await page.keyboard.press('Control+w');
    }
    for (const name of ['A', 'B', 'C']) await project(name).click();
    const before = await saved();
    const separator = page.getByRole('separator', { name: '調整側邊欄寬度', exact: true });
    const bounds = (await separator.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 104, bounds.y + 100, { steps: 10 });
    await page.mouse.up();
    await expect(separator).toHaveAttribute('aria-valuenow', '320');
    await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.width).toBe(320);
    await separator.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '336');
    await separator.dblclick();
    await expect(separator).toHaveAttribute('aria-valuenow', '216');
    for (let i = 0; i < 6; i++) await separator.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '312');

    await create('工作');
    await create('其他');
    await dragGroup('其他', '工作', 'before', ['其他', '工作']);
    await dragGroup('其他', '工作', 'after', ['工作', '其他']);
    const workId = (await saved()).groups.find((item: { name: string }) => item.name === '工作').id;
    const otherId = (await saved()).groups.find(
      (item: { name: string }) => item.name === '其他',
    ).id;
    await group('工作').locator('.group-toggle').click();
    await drag(project('A'), group('工作').locator('.group-toggle'));
    await expect
      .poll(
        async () =>
          (await saved()).projects.find((item: { path: string }) => item.path === paths[0]).groupId,
      )
      .toBe(workId);
    await expect(project('A')).toHaveCount(0);
    await group('工作').locator('.group-toggle').click();
    await expect(group('工作').locator('.project-open')).toHaveText(['專案 A']);
    await drag(project('B'), project('A'), 'after');
    await expect(group('工作').locator('.project-open')).toHaveText(['專案 A', '專案 B']);
    await drag(project('B'), project('A'), 'before');
    await expect(group('工作').locator('.project-open')).toHaveText(['專案 B', '專案 A']);
    await drag(project('C'), group('其他').locator('.group-toggle'));
    await expect
      .poll(
        async () =>
          (await saved()).projects.find((item: { path: string }) => item.path === paths[2]).groupId,
      )
      .toBe(otherId);
    await group('其他').locator('.group-toggle').click();
    await drag(project('A'), group('其他').locator('.group-toggle'));
    await expect
      .poll(
        async () =>
          (await saved()).projects.find((item: { path: string }) => item.path === paths[0]).groupId,
      )
      .toBe(otherId);
    await group('其他').locator('.group-toggle').click();
    await expect(group('其他').locator('.project-open')).toHaveText(['專案 C', '專案 A']);
    await drag(project('A'), page.locator('.project-section[data-pinned="false"]'));
    await expect
      .poll(
        async () =>
          (await saved()).projects.find((item: { path: string }) => item.path === paths[0])
            .groupId ?? null,
      )
      .toBeNull();
    await page.getByRole('button', { name: '專案 B 專案選單' }).click();
    await page.getByRole('button', { name: '釘選專案', exact: true }).click();
    await drag(project('B'), page.locator('.project-section[data-pinned="true"]'));
    const moved = (await saved()).projects.find((item: { path: string }) => item.path === paths[1]);
    expect(moved.pinned).toBe(true);
    expect(moved.groupId).toBeUndefined();
    expect((await saved()).tabs).toEqual(before.tabs);
    expect((await saved()).active).toBe(before.active);

    await group('其他').locator('.group-toggle').click();
    const projectsBeforeGroupSort = (await saved()).projects;
    await dragGroup('其他', '工作', 'before', ['其他', '工作']);
    await expect(group('其他').locator('.group-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect((await saved()).projects).toEqual(projectsBeforeGroupSort);
    expect((await saved()).tabs).toEqual(before.tabs);
    expect((await saved()).active).toBe(before.active);
    await create('其他備用');
    await page.getByRole('textbox', { name: '搜尋專案' }).fill('其他');
    await dragGroup(
      '其他備用',
      '其他',
      'before',
      ['其他備用', '其他'],
      ['其他備用', '工作', '其他'],
    );
    await page.getByRole('textbox', { name: '搜尋專案' }).fill('');
    await expect.poll(groupOrder).toEqual(['其他備用', '工作', '其他']);
    await page.getByRole('textbox', { name: '搜尋專案' }).fill('專案 C');
    await expect(project('C')).toBeVisible();
    await page.getByRole('textbox', { name: '搜尋專案' }).fill('');
    await expect(project('C')).toHaveCount(0);
    await page.getByRole('button', { name: '工作 群組選單' }).click();
    await page.getByRole('menuitem', { name: '重新命名群組' }).click();
    await page.getByRole('textbox', { name: '群組名稱' }).fill('服務');
    await page.getByRole('button', { name: '儲存群組名稱' }).click();
    await expect(group('服務')).toBeVisible();
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.width).toBe(312);
    await assertLayout(page, ['.sidebar', '.project-library', '.main']);
    await page.screenshot({ path: info.outputPath('sidebar-groups.png') });
    expect(desktop.errors).toEqual([]);
    await desktop.stop(true);
    desktop = await launchDesktop(profile, info, environment);
    page = desktop.page;
    page.setDefaultTimeout(10_000);
    await expect(page.getByRole('separator', { name: '調整側邊欄寬度' })).toHaveAttribute(
      'aria-valuenow',
      '312',
    );
    await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.width).toBe(312);
    await expect(group('其他').locator('.group-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(groupOrder).toEqual(['其他備用', '服務', '其他']);
    await expect(project('C')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '專案 C', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: '其他 群組選單' }).click();
    await page.getByRole('menuitem', { name: '移除群組（保留專案）' }).click();
    await expect(project('C')).toBeVisible();
    await expect(group('其他')).toHaveCount(0);
    expect((await saved()).projects).toHaveLength(3);
    expect((await saved()).tabs).toHaveLength(3);
    for (let i = 0; i < paths.length; i++) {
      expect(git(paths[i], 'rev-parse', 'HEAD')).toBe(heads[i]);
      expect(await indexHash(paths[i])).toBe(hashes[i]);
      expect(await readFile(join(paths[i], 'file.txt'), 'utf8')).toBe(`${['A', 'B', 'C'][i]}\n`);
    }
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
