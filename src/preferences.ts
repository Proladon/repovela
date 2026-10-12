export interface Preferences {
  version: 1;
  followBranchColor: boolean;
  followTagColor: boolean;
  highlightHead: boolean;
  highlightSelectedLine: boolean;
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  density: 'comfortable' | 'compact';
  dateFormat: 'short' | 'full';
  use24HourTime: boolean;
  showColumnDividers: boolean;
  defaultRemotes: boolean;
  defaultCommitLimit: number;
  sidebarWidth: number;
  requestListWidth: number | null;
  changesListWidth: number | null;
}

export const PREFERENCES_KEY = 'repovela-preferences-v1';
export const defaultPreferences: Preferences = {
  version: 1,
  followBranchColor: false,
  followTagColor: false,
  highlightHead: true,
  highlightSelectedLine: true,
  fontFamily: '',
  codeFontFamily: 'Cascadia Code',
  fontSize: 13,
  density: 'comfortable',
  dateFormat: 'short',
  use24HourTime: true,
  showColumnDividers: true,
  defaultRemotes: true,
  defaultCommitLimit: 500,
  sidebarWidth: 216,
  requestListWidth: null,
  changesListWidth: null,
};

export function restorePreferences(raw: string | null): Preferences {
  const result = { ...defaultPreferences };
  try {
    const saved: unknown = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1)
      return result;
    const data = saved as Record<string, unknown>;
    for (const key of [
      'followBranchColor',
      'followTagColor',
      'highlightHead',
      'highlightSelectedLine',
      'use24HourTime',
      'showColumnDividers',
      'defaultRemotes',
    ] as const) {
      if (typeof data[key] === 'boolean') result[key] = data[key];
    }
    for (const key of ['fontFamily', 'codeFontFamily'] as const) {
      if (typeof data[key] === 'string')
        result[key] = data[key]
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, 120);
    }
    if (typeof data.fontSize === 'number' && Number.isFinite(data.fontSize))
      result.fontSize = Math.max(11, Math.min(20, Math.round(data.fontSize)));
    if (typeof data.sidebarWidth === 'number' && Number.isFinite(data.sidebarWidth))
      result.sidebarWidth = Math.max(180, Math.min(480, Math.round(data.sidebarWidth)));
    if (typeof data.requestListWidth === 'number' && Number.isFinite(data.requestListWidth))
      result.requestListWidth = Math.max(210, Math.min(1000, Math.round(data.requestListWidth)));
    if (typeof data.changesListWidth === 'number' && Number.isFinite(data.changesListWidth))
      result.changesListWidth = Math.max(170, Math.min(1000, Math.round(data.changesListWidth)));
    if (data.density === 'compact' || data.density === 'comfortable') result.density = data.density;
    if (data.dateFormat === 'short' || data.dateFormat === 'full')
      result.dateFormat = data.dateFormat;
    if ([500, 1000, 2000, 5000].includes(data.defaultCommitLimit as number))
      result.defaultCommitLimit = data.defaultCommitLimit as number;
    return result;
  } catch {
    return result;
  }
}

export function fontStack(name: string, fallback: string) {
  return name.trim() ? `${JSON.stringify(name.trim())}, ${fallback}` : fallback;
}
