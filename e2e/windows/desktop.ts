import { chromium, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { release } from 'node:os';

const execute = promisify(execFile);
export const executable = resolve(
  process.env.REPOVELA_EXE ?? 'src-tauri/target/release/repovela.exe',
);

export async function indexHash(path: string) {
  return createHash('sha256')
    .update(await readFile(resolve(path, '.git/index')))
    .digest('hex');
}

export async function nativeWindow(pid: number, action = 'inspect', width = 1360, height = 880) {
  const { stdout } = await execute(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolve('scripts/native-window.ps1'),
      '-ProcessId',
      String(pid),
      '-Action',
      action,
      '-Width',
      String(width),
      '-Height',
      String(height),
    ],
    { windowsHide: true, timeout: 15_000 },
  );
  return JSON.parse(stdout.trim()) as {
    pid: number;
    title: string;
    visible: boolean;
    minimized: boolean;
    dpi: number;
    width: number;
    height: number;
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('無法取得 CDP port'));
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

export async function launchDesktop(profile: string, info: TestInfo) {
  await access(executable);
  await mkdir(profile, { recursive: true });
  const port = await freePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(executable, [], {
    windowsHide: true,
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
    },
    stdio: 'ignore',
  });
  let launchError: Error | undefined;
  child.on('error', (error) => {
    launchError = error;
  });
  let browser: Browser | undefined;
  const stop = async (graceful = false) => {
    if (graceful && child.exitCode === null && child.pid) {
      await nativeWindow(child.pid, 'close');
      await expect.poll(() => child.exitCode, { timeout: 10_000 }).not.toBeNull();
      expect(child.exitCode).toBe(0);
    }
    await browser?.close().catch(() => {});
    if (child.exitCode === null && child.pid) {
      // 僅結束此次啟動的 PID 與其 WebView2 子程序，不影響使用者開啟的 Repovela。
      await execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
      }).catch(() => {});
    }
  };
  try {
    await expect
      .poll(
        async () => {
          if (launchError) throw launchError;
          if (child.exitCode !== null) throw new Error(`桌面程序提前結束：${child.exitCode}`);
          try {
            return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) }))
              .ok;
          } catch {
            return false;
          }
        },
        { timeout: 30_000, message: '等待正式版 WebView2 CDP；請確認 WebView2 Runtime 已安裝' },
      )
      .toBe(true);
    browser = await chromium.connectOverCDP(endpoint);
    let page: Page | undefined;
    await expect
      .poll(() => {
        page = browser!
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => new URL(candidate.url()).hostname === 'tauri.localhost');
        return !!page;
      })
      .toBe(true);
    const currentPage = page!;
    const errors: string[] = [];
    currentPage.on('pageerror', (error) => errors.push(error.message));
    currentPage.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await expect(currentPage.locator('.app-shell')).toBeVisible();
    await info.attach('runtime', {
      body: JSON.stringify(
        {
          executable,
          executableSha256: createHash('sha256')
            .update(await readFile(executable))
            .digest('hex'),
          node: process.version,
          os: release(),
          arch: process.arch,
          pid: child.pid,
          webview2: browser.version(),
          profile,
          url: currentPage.url(),
          userAgent: await currentPage.evaluate(() => navigator.userAgent),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    return { page: currentPage, pid: child.pid!, errors, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function assertLayout(page: Page, selectors: string[]) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        innerWidth,
        innerHeight,
      })),
    )
    .toEqual({
      width: await page.evaluate(() => innerWidth),
      height: await page.evaluate(() => innerHeight),
      innerWidth: await page.evaluate(() => innerWidth),
      innerHeight: await page.evaluate(() => innerHeight),
    });
  for (const selector of selectors) {
    const element = page.locator(selector);
    await expect(element).toBeVisible();
    const bounds = await element.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(bounds, selector).not.toBeNull();
    expect(bounds!.width, selector).toBeGreaterThan(0);
    expect(bounds!.height, selector).toBeGreaterThan(0);
    expect(bounds!.x, selector).toBeGreaterThanOrEqual(-1);
    expect(bounds!.y, selector).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  }
}
