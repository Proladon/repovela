import type { Project } from './types';

export interface SavedProject extends Project {
  pinned: boolean;
}
export interface Tab {
  path: string;
  selection: string | null;
  remotes: boolean;
  limit: number;
}
export interface Session {
  version: 1;
  projects: SavedProject[];
  tabs: Tab[];
  active: string | null;
}
export const emptySession: Session = { version: 1, projects: [], tabs: [], active: null };
export const STORAGE_KEY = 'repovela-session-v1';

export function pathKey(path: string) {
  const value = path.replace(/\\/g, '/').replace(/\/$/, '');
  return /^([a-z]:|\/\/)/i.test(value) ? value.toLowerCase() : value;
}

export type Action =
  | { type: 'add'; project: Project }
  | { type: 'open' | 'activate' | 'close' | 'remove' | 'pin'; path: string }
  | { type: 'rename'; path: string; name: string }
  | { type: 'tab'; path: string; patch: Partial<Omit<Tab, 'path'>> };

export function sessionReducer(state: Session, action: Action): Session {
  const existing = state.projects.find(
    (p) => pathKey(p.path) === pathKey(action.type === 'add' ? action.project.path : action.path),
  );
  const path = existing?.path ?? (action.type === 'add' ? action.project.path : action.path);
  const open = (projects = state.projects): Session => ({
    ...state,
    projects,
    active: path,
    tabs: state.tabs.some((t) => t.path === path)
      ? state.tabs
      : [...state.tabs, { path, selection: null, remotes: true, limit: 500 }],
  });
  switch (action.type) {
    case 'add':
      return open(
        existing ? state.projects : [...state.projects, { ...action.project, pinned: false }],
      );
    case 'open':
      return existing ? open() : state;
    case 'activate':
      return state.tabs.some((t) => t.path === path) ? { ...state, active: path } : state;
    case 'close':
    case 'remove': {
      const index = state.tabs.findIndex((t) => t.path === path);
      const tabs = state.tabs.filter((t) => t.path !== path);
      const active =
        state.active === path ? (tabs[Math.max(0, index - 1)]?.path ?? null) : state.active;
      return {
        ...state,
        tabs,
        active,
        projects:
          action.type === 'remove' ? state.projects.filter((p) => p.path !== path) : state.projects,
      };
    }
    case 'pin':
      return {
        ...state,
        projects: state.projects.map((p) => (p.path === path ? { ...p, pinned: !p.pinned } : p)),
      };
    case 'rename':
      return action.name.trim()
        ? {
            ...state,
            projects: state.projects.map((p) =>
              p.path === path ? { ...p, name: action.name.trim() } : p,
            ),
          }
        : state;
    case 'tab':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.path === path ? { ...t, ...action.patch } : t)),
      };
  }
}

export function restoreSession(raw: string | null): Session {
  try {
    const saved: unknown = JSON.parse(raw ?? 'null');
    if (
      !saved ||
      typeof saved !== 'object' ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('projects' in saved) ||
      !Array.isArray(saved.projects) ||
      !('tabs' in saved) ||
      !Array.isArray(saved.tabs)
    )
      return emptySession;
    const projects: SavedProject[] = [];
    for (const p of saved.projects) {
      if (
        !p ||
        typeof p.path !== 'string' ||
        !p.path ||
        typeof p.name !== 'string' ||
        projects.some((x) => pathKey(x.path) === pathKey(p.path))
      )
        continue;
      projects.push({ path: p.path, name: p.name, pinned: p.pinned === true });
    }
    const tabs: Tab[] = [];
    for (const t of saved.tabs) {
      if (!t || typeof t.path !== 'string') continue;
      const path = projects.find((p) => pathKey(p.path) === pathKey(t.path))?.path;
      if (!path || tabs.some((t) => t.path === path)) continue;
      tabs.push({
        path,
        selection: typeof t.selection === 'string' ? t.selection : null,
        remotes: t.remotes !== false,
        limit:
          typeof t.limit === 'number' && Number.isFinite(t.limit)
            ? Math.max(500, Math.min(5000, t.limit))
            : 500,
      });
    }
    const active =
      'active' in saved && typeof saved.active === 'string'
        ? tabs.find((t) => pathKey(t.path) === pathKey(saved.active as string))?.path
        : null;
    return { version: 1, projects, tabs, active: active ?? tabs[0]?.path ?? null };
  } catch {
    return emptySession;
  }
}
