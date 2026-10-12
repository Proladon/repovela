import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLayout, launchDesktop, nativeWindow } from './desktop';

test('PR／MR：原生 IPC、CLI、遠端、分頁、失敗重試與專案隔離', async ({}, info) => {
  test.skip(process.platform !== 'win32', '僅適用 Windows／WebView2');
  const root = await mkdtemp(join(tmpdir(), 'repovela-requests-'));
  const repo = join(root, '中文 專案');
  const local = join(root, '本機專案');
  const bin = join(root, 'bin');
  for (const directory of [repo, local, bin]) await mkdir(directory);
  const git = (path: string, ...args: string[]) =>
    execFileSync('git', args, { cwd: path, windowsHide: true });
  for (const path of [repo, local]) git(path, 'init', '--initial-branch=main');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:team/repo.git');
  git(repo, 'remote', 'add', 'upstream', 'https://gitlab.example.com/group/sub/repo.git');
  const config = await readFile(join(repo, '.git/config'));
  const node = (number: number) => ({
    number,
    title: `原生 PR ${number}`,
    body: '第一行\n第二行 <script>不執行</script>',
    author: { login: '測試作者' },
    state: 'OPEN',
    isDraft: false,
    headRefName: 'feature/原生測試',
    baseRefName: 'main',
    updatedAt: '2026-10-12T08:00:00Z',
    url: `https://github.com/team/repo/pull/${number}`,
    labels: { nodes: [{ name: 'feature' }] },
  });
  const github = (nodes: unknown[], next: string | null) => ({
    data: {
      repository: {
        pullRequests: { nodes, pageInfo: { hasNextPage: !!next, endCursor: next } },
      },
    },
  });
  const gitlab = (number: number) => ({
    iid: number,
    title: `原生 MR ${number}`,
    description: 'GitLab 說明',
    author: { username: 'dev' },
    state: 'opened',
    draft: false,
    source_branch: 'feature/mr',
    target_branch: 'main',
    updated_at: '2026-10-12T08:00:00Z',
    web_url: `https://gitlab.example.com/group/sub/repo/-/merge_requests/${number}`,
    labels: ['feature'],
  });
  const fixtures: Record<string, unknown> = {
    'github-meta.json': {
      number: 0,
      title: '原生 PR 0',
      body: '第一行\n第二行',
      user: { login: '測試作者' },
      state: 'open',
      draft: false,
      merged: false,
      node_id: 'PR_0',
      head: { sha: 'a'.repeat(40), ref: 'feature/原生測試' },
      base: { ref: 'main' },
      updated_at: '2026-10-12T08:00:00Z',
      html_url: 'https://github.com/team/repo/pull/0',
      labels: [],
      mergeable_state: 'clean',
    },
    'gitlab-meta.json': { ...gitlab(0), sha: 'a'.repeat(40), detailed_merge_status: 'mergeable' },
    'github-files.json': [
      {
        filename: 'src/search.ts',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1 +1 @@\n-old\n+new',
      },
    ],
    'gitlab-files.json': [
      {
        new_path: 'src/search.ts',
        old_path: 'src/search.ts',
        diff: '@@ -1 +1 @@\n-old\n+new',
        renamed_file: false,
        new_file: false,
        deleted_file: false,
      },
    ],
    'github-created-list.json': github([node(33), node(1)], null),
    'github-open.json': github(
      Array.from({ length: 30 }, (_, i) => node(i + 1)),
      'next',
    ),
    'github-next.json': github([node(30), node(31)], null),
    'github-merged.json': github([{ ...node(32), title: '已合併 PR', state: 'MERGED' }], null),
    'gitlab-open.json': Array.from({ length: 30 }, (_, i) => gitlab(i + 1)),
    'gitlab-next.json': [gitlab(31)],
  };
  for (const [name, data] of Object.entries(fixtures))
    await writeFile(join(root, name), JSON.stringify(data));
  // 僅替換外部 CLI 的網路回應；Vue、Tauri IPC、Rust 遠端解析與 CLI 程序皆實際執行。
  const source = join(root, 'FixtureCli.cs');
  await writeFile(
    source,
    `using System;
using System.IO;
using System.Text;
using System.Diagnostics;
class FixtureCli {
  static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    string root = Environment.GetEnvironmentVariable("REPOVELA_PR_FIXTURES");
    string arguments = String.Join("\\n", args);
    File.AppendAllText(Path.Combine(root, "calls.txt"), arguments + "\\n---\\n");
    if (arguments.Contains("states:[CLOSED]")) { Console.Error.WriteLine("fixture: please log in"); return 1; }
    bool gitlab = Process.GetCurrentProcess().MainModule.FileName.EndsWith("glab.exe");
    string endpoint = args[1];
    string method = "GET";
    for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--method") method = args[i + 1];
    string[] parts = endpoint.Split('?')[0].Split('/');
    int number = 0;
    if (!Int32.TryParse(parts[parts.Length - 1], out number) && parts.Length > 1) Int32.TryParse(parts[parts.Length - 2], out number);
    string prefix = gitlab ? "gitlab" : "github";
    string stateFile = Path.Combine(root, prefix + "-" + number + "-state.txt");
    if (method != "GET" && endpoint != "graphql") {
      if (endpoint.EndsWith("/merge")) { File.WriteAllText(stateFile, "merged"); Console.Write(gitlab ? "{\\"state\\":\\"merged\\"}" : "{\\"merged\\":true}"); return 0; }
      if (number == 0) { File.WriteAllText(Path.Combine(root, "created.txt"), "yes"); Console.Write(gitlab ? "{\\"iid\\":33}" : "{\\"number\\":33}"); return 0; }
      if (arguments.Contains("state=closed") || arguments.Contains("state_event=close")) File.WriteAllText(stateFile, "closed");
      if (arguments.Contains("state=open") || arguments.Contains("state_event=reopen")) File.WriteAllText(stateFile, "open");
      Console.Write("{\\"id\\":5}"); return 0;
    }
    if (endpoint.Contains("/files?") || endpoint.Contains("/diffs?")) { Console.Write(File.ReadAllText(Path.Combine(root, prefix + "-files.json"), Encoding.UTF8)); return 0; }
    if (number > 0) {
      string meta = File.ReadAllText(Path.Combine(root, prefix + "-meta.json"), Encoding.UTF8);
      meta = meta.Replace(gitlab ? "\\"iid\\":0" : "\\"number\\":0", (gitlab ? "\\"iid\\":" : "\\"number\\":") + number).Replace("原生 PR 0", "原生 PR " + number).Replace("原生 MR 0", "原生 MR " + number);
      string state = File.Exists(stateFile) ? File.ReadAllText(stateFile) : number == 32 ? "merged" : "open";
      if (state != "open") meta = meta.Replace(gitlab ? "\\"state\\":\\"opened\\"" : "\\"state\\":\\"open\\"", "\\"state\\":\\"" + state + "\\"");
      if (!gitlab && state == "merged") meta = meta.Replace("\\"merged\\":false", "\\"merged\\":true");
      Console.Write(meta); return 0;
    }
    string file = gitlab ? (arguments.Contains("page=2") ? "gitlab-next.json" : "gitlab-open.json")
      : arguments.Contains("cursor=next") ? "github-next.json"
      : arguments.Contains("states:[MERGED]") ? "github-merged.json" : "github-open.json";
    if (!gitlab && file == "github-open.json" && File.Exists(Path.Combine(root, "created.txt"))) file = "github-created-list.json";
    Console.Write(File.ReadAllText(Path.Combine(root, file), Encoding.UTF8));
    return 0;
  }
}`,
  );
  execFileSync(
    join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
    ['/nologo', '/target:exe', `/out:${join(bin, 'gh.exe')}`, source],
    { windowsHide: true },
  );
  await copyFile(join(bin, 'gh.exe'), join(bin, 'glab.exe'));
  const desktop = await launchDesktop(info.outputPath('profile'), info, {
    PATH: `${bin};${process.env.PATH ?? ''}`,
    REPOVELA_PR_FIXTURES: root,
  });
  const { page } = desktop;
  page.setDefaultTimeout(10_000);
  try {
    for (const path of [local, repo]) {
      await page.getByRole('button', { name: '貼上專案路徑' }).click();
      await page.getByRole('textbox', { name: '專案路徑' }).fill(path);
      await page.getByRole('dialog').getByRole('button', { name: '加入專案', exact: true }).click();
      await expect(page.locator('.history-empty')).toBeVisible();
      if (path === local) {
        await expect(page.getByRole('button', { name: '瀏覽 PR／MR', exact: true })).toBeDisabled();
        await page.keyboard.press('Control+w');
      }
    }
    await page.getByRole('button', { name: '瀏覽 PR／MR', exact: true }).click();
    const modal = page.getByRole('region', { name: 'PR／MR', exact: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(modal.getByRole('heading', { name: '原生 PR 1', exact: true })).toBeVisible();
    await expect(modal.locator('.request-item')).toHaveCount(30);
    await modal.getByRole('button', { name: '載入更多 PR' }).click();
    await expect(modal.locator('.request-item')).toHaveCount(31);
    await modal.getByRole('tab', { name: 'Changes' }).click();
    await expect(modal.locator('.changes-diff')).toContainText('+new');
    await modal.getByRole('tab', { name: '概覽' }).click();
    await modal.getByRole('button', { name: '留言', exact: true }).click();
    await modal.getByRole('textbox', { name: 'PR／MR 操作內容' }).fill('原生留言\n第二行');
    await modal.getByRole('button', { name: '確認留言', exact: true }).click();
    await expect(modal.getByText('PR／MR 操作已完成。')).toBeVisible();
    await modal.getByRole('button', { name: '核准', exact: true }).click();
    await modal.getByRole('button', { name: '確認核准', exact: true }).click();
    await expect(modal.getByText('PR／MR 操作已完成。')).toBeVisible();
    await page
      .locator('.toolbar')
      .getByRole('button', { name: '建立 PR／MR', exact: true })
      .click();
    await modal.getByRole('textbox', { name: 'PR／MR 標題' }).fill('原生建立 PR');
    await modal.getByRole('textbox', { name: 'PR／MR 來源分支' }).fill('feature/create');
    await modal.getByRole('textbox', { name: 'PR／MR 說明' }).fill('建立說明');
    await modal.getByRole('button', { name: '確認建立', exact: true }).click();
    await expect(modal.getByText('已建立 #33。')).toBeVisible();
    await expect(modal.getByRole('heading', { name: '原生 PR 33', exact: true })).toBeVisible();
    await modal.getByRole('combobox', { name: 'PR／MR 狀態' }).selectOption('merged');
    await expect(modal.getByRole('heading', { name: '已合併 PR' })).toBeVisible();
    await modal.getByRole('combobox', { name: 'PR／MR 狀態' }).selectOption('closed');
    await expect(modal.getByRole('alert')).toContainText('gh auth login --hostname github.com');
    await modal.getByRole('button', { name: '重試' }).click();
    await expect(modal.getByRole('alert')).toContainText('fixture: please log in');
    await modal.getByRole('combobox', { name: 'PR／MR 狀態' }).selectOption('open');
    await page.locator('.toolbar').getByRole('button', { name: 'PR／MR 來源設定' }).click();
    await page
      .locator('.toolbar')
      .getByRole('combobox', { name: 'PR／MR 遠端' })
      .selectOption('upstream');
    await expect(modal.getByRole('heading', { name: '原生 MR 1', exact: true })).toBeVisible();
    await modal.getByRole('button', { name: '載入更多 MR' }).click();
    await expect(modal.locator('.request-item')).toHaveCount(31);
    await modal.getByRole('textbox', { name: '搜尋已載入 PR／MR' }).fill('!31');
    await expect(modal.getByRole('heading', { name: '原生 MR 31' })).toBeVisible();
    await modal.getByRole('tab', { name: 'Changes' }).click();
    await expect(modal.locator('.changes-diff')).toContainText('+new');
    await nativeWindow(desktop.pid, 'resize', 1000, 640);
    const separator = modal.getByRole('separator', { name: '調整 PR／MR 清單寬度' });
    await expect(separator).toHaveAttribute('aria-valuenow', '210');
    const handle = (await separator.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + 80);
    await page.mouse.up();
    await expect(separator).toHaveAttribute('aria-valuenow', '290');
    await separator.focus();
    await separator.press('ArrowLeft');
    await expect(separator).toHaveAttribute('aria-valuenow', '274');
    const filesSeparator = modal.getByRole('separator', { name: '調整 Changes 檔案清單寬度' });
    await expect(filesSeparator).toHaveAttribute('aria-valuenow', '170');
    const filesHandle = (await filesSeparator.boundingBox())!;
    await page.mouse.move(filesHandle.x + filesHandle.width / 2, filesHandle.y + 100);
    await page.mouse.down();
    await page.mouse.move(filesHandle.x + filesHandle.width / 2 + 40, filesHandle.y + 100);
    await page.mouse.up();
    await expect(filesSeparator).toHaveAttribute('aria-valuenow', '210');
    await filesSeparator.focus();
    await filesSeparator.press('ArrowLeft');
    await expect(filesSeparator).toHaveAttribute('aria-valuenow', '194');
    await expect(separator).toHaveAttribute('aria-valuenow', '274');
    await expect(modal.locator('.changes-diff')).toContainText('+new');
    await assertLayout(page, ['.toolbar', '.requests-page', '.request-browser', '.request-detail']);
    await page.screenshot({ path: info.outputPath('change-requests.png') });
    await modal.getByRole('tab', { name: '概覽' }).click();
    await modal.getByRole('button', { name: '合併', exact: true }).click();
    await modal.getByRole('combobox', { name: 'PR／MR 合併方式' }).selectOption('squash');
    await modal.getByRole('button', { name: '確認合併', exact: true }).click();
    await expect(modal.getByText('PR／MR 操作已完成。')).toBeVisible();
    await page.getByRole('button', { name: 'Git 歷史', exact: true }).click();
    await expect(modal).toBeHidden();
    await page.locator('.project-open').filter({ hasText: '本機專案' }).click();
    await expect(page.getByRole('button', { name: '瀏覽 PR／MR', exact: true })).toBeDisabled();
    const calls = await readFile(join(root, 'calls.txt'), 'utf8');
    expect(calls).toContain('projects/group%2Fsub%2Frepo/merge_requests?scope=all&state=opened');
    expect(calls).toContain('gitlab.example.com');
    expect(calls).toContain('cursor=next');
    expect(calls).toContain('body=原生留言\n第二行');
    expect(calls).toContain('commit_id=' + 'a'.repeat(40));
    expect(calls).toContain('sha=' + 'a'.repeat(40));
    expect(calls).toContain('squash=true');
    expect(calls).toContain('head=feature/create');
    expect(calls).not.toContain('mutation');
    expect(await readFile(join(repo, '.git/config'))).toEqual(config);
    expect(desktop.errors).toEqual([]);
  } finally {
    await desktop.stop();
  }
});
