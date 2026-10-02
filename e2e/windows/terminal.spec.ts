import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('桌面終端機：真實 shell、中文、隔離工作階段、Ctrl+C 與清理', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-terminal-'));
  const paths = [join(root, '中文專案 空白'), join(root, '另一個專案')];
  for (const path of paths) {
    await mkdir(path);
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: path, windowsHide: true });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Terminal test',
        '-c',
        'user.email=terminal@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=',
        'commit',
        '--allow-empty',
        '-m',
        'terminal fixture',
      ],
      { cwd: path, windowsHide: true },
    );
  }
  const desktop = await launchDesktop(info.outputPath('profile'), info, {
    COMSPEC: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'),
  });
  const { page } = desktop;
  let shutdownPids: string[] = [];
  const shellPids = () =>
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${desktop.pid} AND Name = 'cmd.exe'" | ForEach-Object { $_.ProcessId }`,
      ],
      { encoding: 'utf8', windowsHide: true },
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const panel = () => page.locator('.terminal-panel:visible');
  const output = () => panel().locator('.xterm-rows');
  async function command(text: string) {
    await panel().getByRole('textbox', { name: '終端機輸入' }).focus();
    await page.keyboard.insertText(text);
    await page.keyboard.press('Enter');
  }
  async function add(path: string) {
    await page.getByRole('button', { name: '貼上專案路徑' }).click();
    await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
    await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: path.split(/[\\/]/).pop()!, exact: true }),
    ).toBeVisible();
  }
  try {
    await add(paths[0]);
    await page.keyboard.press('Control+w');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await add(paths[1]);
    await page.getByRole('button', { name: '中文專案 空白', exact: true }).click();
    await page.getByRole('button', { name: '開啟／隱藏終端機' }).click();
    await expect(panel().locator('.terminal-status')).toHaveText('cmd.exe');
    await expect(output()).toContainText(paths[0]);
    await command('chcp 65001');
    await command('echo 中文輸出測試');
    await expect(output()).toContainText('中文輸出測試');
    await command('echo 中文輸出測試> "terminal-result.txt"');
    await expect
      .poll(async () => readFile(join(paths[0], 'terminal-result.txt'), 'utf8').catch(() => ''))
      .toContain('中文輸出測試');
    await command('set REPOVELA_TERMINAL_VALUE=first');
    await command('echo SESSION-%REPOVELA_TERMINAL_VALUE%');
    await expect(output()).toContainText('SESSION-first');
    await command('git checkout -b terminal-branch');
    await expect(output()).toContainText("Switched to a new branch 'terminal-branch'");
    await panel().getByRole('button', { name: '重新整理 Git 狀態' }).click();
    await expect(page.locator('.branch-picker > button')).toContainText('terminal-branch');
    await page.keyboard.press('Control+Backquote');
    await expect(page.locator('.terminal-panel:visible')).toHaveCount(0);
    await page.keyboard.press('Control+Backquote');
    await expect(panel().locator('.terminal-status')).toHaveText('cmd.exe');
    await command('echo STILL-%REPOVELA_TERMINAL_VALUE%');
    await expect(output()).toContainText('STILL-first');
    await page.getByRole('tab', { name: '另一個專案', exact: true }).click();
    await page.getByRole('button', { name: '開啟／隱藏終端機' }).click();
    await expect(panel().locator('.terminal-status')).toHaveText('cmd.exe');
    await expect(output()).toContainText(paths[1]);
    await expect.poll(shellPids).toHaveLength(2);
    await command('if not defined REPOVELA_TERMINAL_VALUE echo SESSION-ISOLATED');
    await expect(output()).toContainText('SESSION-ISOLATED');
    await page.getByRole('tab', { name: '中文專案 空白', exact: true }).click();
    await command('echo BACK-%REPOVELA_TERMINAL_VALUE%');
    await expect(output()).toContainText('BACK-first');
    await command('ping -t 127.0.0.1');
    await expect(output()).toContainText('127.0.0.1');
    await page.keyboard.press('Control+c');
    await command('echo INTERRUPT-OK> interrupt-result.txt');
    await expect
      .poll(async () => readFile(join(paths[0], 'interrupt-result.txt'), 'utf8').catch(() => ''))
      .toContain('INTERRUPT-OK');
    const before = await panel().boundingBox();
    const separator = panel().getByRole('separator', { name: '調整終端機高度' });
    await separator.focus();
    await page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => (await panel().boundingBox())!.height)
      .toBeGreaterThan(before!.height);
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    await assertLayout(page, [
      '.terminal-panel:visible',
      '.terminal-panel:visible .terminal-host',
      '.workspace',
    ]);
    await command('echo RESIZED-OK');
    await expect(output()).toContainText('RESIZED-OK');
    await command('exit 7');
    await expect(panel().locator('.terminal-status')).toHaveText('已結束（7）');
    await panel().getByRole('button', { name: '重新啟動終端機' }).click();
    await expect(panel().locator('.terminal-status')).toHaveText('cmd.exe');
    await command('if not defined REPOVELA_TERMINAL_VALUE echo RESTART-CLEAN');
    await expect(output()).toContainText('RESTART-CLEAN');
    await page.screenshot({ path: info.outputPath('terminal.png') });
    await info.attach('terminal', {
      path: info.outputPath('terminal.png'),
      contentType: 'image/png',
    });
    await expect(page.locator('.status-bar [role="status"]')).toHaveText('已同步本機資料');
    const metaBeforeClose = await page.locator('.repo-meta').boundingBox();
    // 暫停刷新回覆，確保捕捉關閉面板後「讀取中」的版面。
    await page.evaluate(() => {
      const testWindow = window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args?: unknown, options?: unknown) => Promise<unknown>;
        };
        releaseTerminalRefresh: () => void;
      };
      const internals = testWindow.__TAURI_INTERNALS__;
      const original = internals.invoke;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      internals.invoke = async (command, args, options) => {
        const result = await original.call(internals, command, args, options);
        if (command === 'read_repository') await gate;
        return result;
      };
      testWindow.releaseTerminalRefresh = () => {
        internals.invoke = original;
        release();
      };
    });
    await panel().getByRole('button', { name: '結束終端機' }).click();
    await expect(page.locator('.status-bar [role="status"]')).toHaveText('正在更新…');
    await expect(page.locator('#git-operation-status')).toBeHidden();
    expect(await page.locator('.repo-meta').boundingBox()).toEqual(metaBeforeClose);
    const historyWhileRefreshing = await page.locator('.history-panel').boundingBox();
    await page.screenshot({ path: info.outputPath('terminal-closed-refresh.png') });
    await info.attach('terminal-closed-refresh', {
      path: info.outputPath('terminal-closed-refresh.png'),
      contentType: 'image/png',
    });
    await page.evaluate(() =>
      (window as unknown as { releaseTerminalRefresh: () => void }).releaseTerminalRefresh(),
    );
    await expect(page.locator('.status-bar [role="status"]')).toHaveText('已同步本機資料');
    expect(await page.locator('.history-panel').boundingBox()).toEqual(historyWhileRefreshing);
    await expect(page.locator('.terminal-panel')).toHaveCount(1);
    await expect.poll(shellPids).toHaveLength(1);
    await page.getByRole('button', { name: '關閉 另一個專案 分頁' }).click();
    await expect(page.locator('.terminal-panel')).toHaveCount(0);
    await expect.poll(shellPids).toHaveLength(0);
    await page.getByRole('button', { name: '開啟／隱藏終端機' }).click();
    await expect(panel().locator('.terminal-status')).toHaveText('cmd.exe');
    shutdownPids = shellPids();
    expect(shutdownPids).toHaveLength(1);
    expect(desktop.errors).toEqual([]);
    await writeFile(
      info.outputPath('terminal-verified.txt'),
      '已驗證真實 Windows ConPTY 與 xterm.js。\n',
    );
  } finally {
    await desktop.stop(true);
  }
  for (const pid of shutdownPids) {
    expect(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty ProcessId`,
        ],
        { windowsHide: true, encoding: 'utf8' },
      ).trim(),
    ).toBe('');
  }
});
