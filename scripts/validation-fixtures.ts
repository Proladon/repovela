import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export function createFixtures(parent = join(tmpdir(), 'repovela-validation')) {
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(resolve(parent), 'fixtures-'));
  const globalConfig = join(root, 'empty.gitconfig');
  const hooks = join(root, 'empty-hooks');
  writeFileSync(globalConfig, '');
  mkdirSync(hooks);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_AUTHOR_NAME: '驗證作者',
    GIT_AUTHOR_EMAIL: 'validation@example.invalid',
    GIT_COMMITTER_NAME: '驗證作者',
    GIT_COMMITTER_EMAIL: 'validation@example.invalid',
    GIT_AUTHOR_DATE: '2026-10-01T08:00:00+08:00',
    GIT_COMMITTER_DATE: '2026-10-01T08:00:00+08:00',
  };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${hooks}`,
        ...args,
      ],
      { cwd, env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  const a = join(root, '專案 A 空白');
  const b = join(root, '專案 B');
  for (const path of [a, b]) {
    mkdirSync(path);
    git(path, 'init', '--initial-branch=main');
    for (let i = 1; i <= 25; i++) {
      writeFileSync(join(path, 'README.md'), `第 ${i} 版\n${'很長的 diff 內容 '.repeat(100)}\n`);
      git(path, 'add', 'README.md');
      git(path, 'commit', '-m', `驗證紀錄 ${String(i).padStart(2, '0')}`);
    }
    git(path, 'branch', 'feature/排版');
    git(path, 'tag', 'validation-v1');
    writeFileSync(join(path, 'README.md'), '已暫存內容\n');
    git(path, 'add', 'README.md');
    writeFileSync(join(path, 'README.md'), '未暫存內容\n');
    writeFileSync(join(path, '未追蹤.txt'), '未追蹤內容\n');
    mkdirSync(join(path, '子目錄'));
  }
  const invalid = join(root, '不是 Git 專案');
  mkdirSync(invalid);
  const fixtures = {
    root,
    a,
    b,
    invalid,
    subdirectory: join(a, '子目錄'),
    head: git(a, 'rev-parse', 'HEAD'),
  };
  writeFileSync(join(root, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  return fixtures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixtures = createFixtures();
  mkdirSync(resolve('.validation'), { recursive: true });
  writeFileSync(resolve('.validation/fixtures.json'), JSON.stringify(fixtures, null, 2));
  console.log(JSON.stringify(fixtures, null, 2));
}
