import type { Forge, PatchLine } from './types';

export function detectForge(url: string): Forge | '' {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'github.com') return 'github';
  if (host === 'gitlab.com' || host.startsWith('gitlab.')) return 'gitlab';
  return '';
}

export const requestStateLabel = {
  open: '開啟中',
  merged: '已合併',
  closed: '已關閉',
  locked: '處理中',
};

export function parseRequestPatch(patch: string): PatchLine[] {
  let oldLine: number | null = null;
  let newLine: number | null = null;
  return patch.split('\n').map((text): PatchLine => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: 'hunk', oldLine: null, newLine: null, text };
    }
    if (oldLine === null || newLine === null || text.startsWith('\\') || !/^[ +\-]/.test(text))
      return { kind: 'meta', oldLine: null, newLine: null, text };
    if (text.startsWith('+')) return { kind: '+', oldLine: null, newLine: newLine++, text };
    if (text.startsWith('-')) return { kind: '-', oldLine: oldLine++, newLine: null, text };
    return { kind: 'context', oldLine: oldLine++, newLine: newLine++, text };
  });
}
