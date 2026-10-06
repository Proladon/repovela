import type { Project } from './types';

export interface SavedProject extends Project {
  pinned: boolean;
  groupId?: string;
}
export interface ProjectGroup {
  id: string;
  name: string;
  collapsed: boolean;
}
export interface Tab {
  path: string;
  selection: string | null;
  remotes: boolean;
  limit: number;
}
export interface Session {
  version: 1;
  groups: ProjectGroup[];
  projects: SavedProject[];
  tabs: Tab[];
  active: string | null;
}
export const emptySession: Session = {
  version: 1,
  groups: [],
  projects: [],
  tabs: [],
  active: null,
};
export const STORAGE_KEY = 'repovela-session-v1';

export function pathKey(path: string) {
  const value = path.replace(/\\/g, '/').replace(/\/$/, '');
  return /^([a-z]:|\/\/)/i.test(value) ? value.toLowerCase() : value;
}

export type Action =
  | { type: 'add'; project: Project }
  | { type: 'open' | 'activate' | 'close' | 'remove' | 'pin'; path: string }
  | { type: 'rename'; path: string; name: string }
  | { type: 'reorder'; paths: string[] }
  | { type: 'reorderGroups'; ids: string[] }
  | { type: 'createGroup' | 'renameGroup'; id: string; name: string }
  | { type: 'toggleGroup' | 'removeGroup'; id: string }
  | { type: 'moveProject'; path: string; groupId: string | null; beforePath?: string }
  | { type: 'tab'; path: string; patch: Partial<Omit<Tab, 'path'>> };

export function sessionReducer(state: Session, action: Action): Session {
  switch (action.type) {
    case 'reorderGroups': {
      const ordered = action.ids.map((id) => state.groups.find((group) => group.id === id));
      if (
        ordered.length < 2 ||
        ordered.some((group) => !group) ||
        new Set(ordered).size !== ordered.length
      )
        return state;
      const selected = new Set(ordered);
      let index = 0;
      return {
        ...state,
        groups: state.groups.map((group) => (selected.has(group) ? ordered[index++]! : group)),
      };
    }
    case 'createGroup':
    case 'renameGroup': {
      const name = action.name.trim();
      if (
        !name ||
        !action.id ||
        state.groups.some(
          (group) => group.id !== action.id && group.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return state;
      if (action.type === 'createGroup') {
        if (state.groups.some((group) => group.id === action.id)) return state;
        return { ...state, groups: [...state.groups, { id: action.id, name, collapsed: false }] };
      }
      return {
        ...state,
        groups: state.groups.map((group) => (group.id === action.id ? { ...group, name } : group)),
      };
    }
    case 'toggleGroup':
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.id ? { ...group, collapsed: !group.collapsed } : group,
        ),
      };
    case 'removeGroup':
      return {
        ...state,
        groups: state.groups.filter((group) => group.id !== action.id),
        projects: state.projects.map((project) => {
          if (project.groupId !== action.id) return project;
          const ungrouped = { ...project };
          delete ungrouped.groupId;
          return ungrouped;
        }),
      };
  }
  if (action.type === 'reorder') {
    const ordered = action.paths.map((path) =>
      state.projects.find((p) => pathKey(p.path) === pathKey(path)),
    );
    if (
      ordered.length < 2 ||
      ordered.some((p) => !p) ||
      new Set(ordered).size !== ordered.length ||
      ordered.some(
        (p) =>
          (p!.groupId ?? null) !== (ordered[0]!.groupId ?? null) ||
          (!p!.groupId && p!.pinned !== ordered[0]!.pinned),
      )
    )
      return state;
    const selected = new Set(ordered);
    let index = 0;
    const projects = state.projects.map((p) => (selected.has(p) ? ordered[index++]! : p));
    return { ...state, projects };
  }
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
    case 'moveProject': {
      if (
        !existing ||
        (action.groupId !== null && !state.groups.some((group) => group.id === action.groupId))
      )
        return state;
      const projects = state.projects.filter((project) => project !== existing);
      const sameSection = (project: SavedProject) =>
        (project.groupId ?? null) === action.groupId &&
        (action.groupId !== null || project.pinned === existing.pinned);
      const before = action.beforePath
        ? projects.find((project) => pathKey(project.path) === pathKey(action.beforePath!))
        : undefined;
      if (action.beforePath && (!before || !sameSection(before))) return state;
      const moved = { ...existing };
      if (action.groupId === null) delete moved.groupId;
      else moved.groupId = action.groupId;
      const index = before
        ? projects.indexOf(before)
        : projects.reduce(
            (last, project, index) => (sameSection(project) ? index + 1 : last),
            projects.length,
          );
      projects.splice(index, 0, moved);
      return { ...state, projects };
    }
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
    const groups: ProjectGroup[] = [];
    if ('groups' in saved && Array.isArray(saved.groups)) {
      for (const group of saved.groups) {
        if (
          !group ||
          typeof group.id !== 'string' ||
          !group.id ||
          typeof group.name !== 'string' ||
          !group.name.trim() ||
          groups.some((item) => item.id === group.id)
        )
          continue;
        groups.push({ id: group.id, name: group.name.trim(), collapsed: group.collapsed === true });
      }
    }
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
      const project: SavedProject = { path: p.path, name: p.name, pinned: p.pinned === true };
      if (typeof p.groupId === 'string' && groups.some((group) => group.id === p.groupId))
        project.groupId = p.groupId;
      projects.push(project);
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
    return { version: 1, groups, projects, tabs, active: active ?? tabs[0]?.path ?? null };
  } catch {
    return emptySession;
  }
}
