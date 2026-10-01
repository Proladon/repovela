import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { CommitDetail, FilePatch, Project, Snapshot } from './types';

export const native = isTauri();
export const demo =
  !native && import.meta.env.DEV && new URLSearchParams(location.search).has('demo');

async function demoData() {
  return (await import('./demo-data.json')).default as unknown as {
    snapshot: Snapshot;
    details: Record<string, CommitDetail>;
    patches: Record<string, FilePatch>;
  };
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!demo) return invoke<T>(command, args);
  const data = await demoData();
  if (command === 'open_project') {
    if (!String(args.path).startsWith('demo://'))
      throw new Error('展示模式請使用 demo://keifu 或 demo://另一個專案；本機專案請使用桌面版。');
    return { path: args.path, name: String(args.path).split('//')[1] } as T;
  }
  if (command === 'read_repository') {
    const snapshot = structuredClone(data.snapshot);
    snapshot.project = { path: String(args.path), name: String(args.path).split('//')[1] };
    if (!args.includeRemotes) {
      snapshot.branches = snapshot.branches.filter((b) => !b.isRemote);
      snapshot.rows = snapshot.rows.map((r) => ({
        ...r,
        branches: r.branches.filter(
          (b) => !data.snapshot.branches.some((x) => x.name === b && x.isRemote),
        ),
      }));
    }
    return snapshot as T;
  }
  if (command === 'read_commit') return data.details[String(args.oid)] as T;
  if (command === 'read_patch') {
    const patch = data.patches[`${args.oid}:${args.file}`];
    if (!patch)
      throw new Error('展示資料只包含各筆 commit 的前四個檔案 diff；桌面版可讀取所有檔案。');
    return patch as T;
  }
  throw new Error('未知的展示操作');
}

export async function chooseProjects(): Promise<string[]> {
  const selected = await open({ directory: true, multiple: true, title: '加入 Git 專案' });
  return selected ? (Array.isArray(selected) ? selected : [selected]) : [];
}

export const api = {
  openProject: (path: string) => call<Project>('open_project', { path }),
  repository: (path: string, includeRemotes: boolean, limit: number) =>
    call<Snapshot>('read_repository', { path, includeRemotes, limit }),
  commit: (path: string, oid: string) => call<CommitDetail>('read_commit', { path, oid }),
  patch: (path: string, oid: string | null, file: string, area: string) =>
    call<FilePatch>('read_patch', { path, oid, file, area }),
};
