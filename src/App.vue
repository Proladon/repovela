<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  Archive,
  CloudDownload,
  Copy,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitFork,
  Layers3,
  ListMinus,
  ListPlus,
  LocateFixed,
  PanelRightOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Tag as TagIcon,
  Text,
  Undo2,
  Search,
  Settings2,
  SquareTerminal,
  X,
} from 'lucide-vue-next';
import { api, chooseProjects, demo, native, openRepositoryWebsite } from './api';
import { repositoryWebLinks } from './repositoryUrl';
import Detail from './Detail.vue';
import WindowTitlebar from './WindowTitlebar.vue';
import TerminalPanel from './TerminalPanel.vue';
import GitActions from './GitActions.vue';
import ContextMenu from './ContextMenu.vue';
import CommitActionDialog from './CommitActionDialog.vue';
import SyncBranchDialog from './SyncBranchDialog.vue';
import StashDialog from './StashDialog.vue';
import ChangeRequestsPage from './ChangeRequestsPage.vue';
import TrustProjectDialog from './TrustProjectDialog.vue';
import { provideContextMenu, type MenuItem } from './contextMenu';
import ColumnHeading from './ColumnHeading.vue';
import PreferencesDialog from './Preferences.vue';
import { useAppUpdate } from './appUpdate';
import { defaultPreferences, fontStack, PREFERENCES_KEY, restorePreferences } from './preferences';
import { graphColor, selectedGraphLine, type GraphGlowRow } from './graph';
import Graph from './Graph.vue';
import ProjectLibrary from './ProjectLibrary.vue';
import { emptySession, restoreSession, sessionReducer, STORAGE_KEY } from './session';
import type { Action, Tab } from './session';
import type {
  Branch,
  Commit,
  CommitOperation,
  GitRequest,
  OwnershipIssue,
  Row,
  Snapshot,
} from './types';

const contextMenu = provideContextMenu();
const ownershipIssues = ref<OwnershipIssue[]>([]);
const ownershipIssue = computed(() => ownershipIssues.value[0]);
const trusting = ref(false);
const gitActions = ref<InstanceType<typeof GitActions> | null>(null);
const stashOpen = ref(false);
const requestPaths = ref<string[]>([]);
const requestBusyPaths = ref<string[]>([]);
const requestsOpen = computed(() => !!tab.value && requestPaths.value.includes(tab.value.path));
const requestTabs = computed(() =>
  session.value.tabs.filter((t) => requestPaths.value.includes(t.path)),
);
function requestBusy(path: string, busy: boolean) {
  requestBusyPaths.value = [
    ...requestBusyPaths.value.filter((p) => p !== path),
    ...(busy ? [path] : []),
  ];
}
function openRequests() {
  if (loading.value || !repositoryLinks.value.length || !tab.value) return;
  branchMenu.value = false;
  if (!requestsOpen.value) requestPaths.value.push(tab.value.path);
}
function openHistory() {
  if (!tab.value || requestBusyPaths.value.includes(tab.value.path)) return;
  requestPaths.value = requestPaths.value.filter((p) => p !== tab.value!.path);
}
const stashError = ref('');
function openStash() {
  if (!native || operating.value || loading.value) return;
  stashError.value = '';
  stashOpen.value = true;
}
async function operateStash(request: GitRequest) {
  stashError.value = '';
  const success = await operate(request);
  if (!success && stashOpen.value) stashError.value = message.value;
  return success;
}
const commitAction = shallowRef<{
  path: string;
  operation: CommitOperation;
  commit: Commit;
  expectedHead: string;
  expectedBranch: string;
  checkoutRemote?: string;
} | null>(null);
const syncBranchAction = shallowRef<{
  path: string;
  remotes: Branch[];
  expectedHead: string;
  expectedBranch: string;
} | null>(null);

const storageKey = demo ? `${STORAGE_KEY}-demo` : STORAGE_KEY;
const updater = useAppUpdate(
  () => !operating.value && !adding.value && !trusting.value && !requestBusyPaths.value.length,
);
const preferencesStorageKey = demo ? `${PREFERENCES_KEY}-demo` : PREFERENCES_KEY;
const preferences = shallowRef(
  (() => {
    try {
      return restorePreferences(localStorage.getItem(preferencesStorageKey));
    } catch {
      return { ...defaultPreferences };
    }
  })(),
);
const session = shallowRef(
  (() => {
    try {
      return restoreSession(localStorage.getItem(storageKey));
    } catch {
      return emptySession;
    }
  })(),
);
const dispatch = (action: Action) => {
  if (
    (action.type === 'close' || action.type === 'remove') &&
    requestBusyPaths.value.includes(action.path)
  ) {
    message.value = '此專案正在執行 PR／MR 操作，請等操作完成後再關閉。';
    return;
  }
  let next = sessionReducer(session.value, action);
  if (action.type === 'add' || action.type === 'open') {
    next = {
      ...next,
      tabs: next.tabs.map((t) =>
        session.value.tabs.some((previous) => previous.path === t.path)
          ? t
          : {
              ...t,
              remotes: preferences.value.defaultRemotes,
              limit: preferences.value.defaultCommitLimit,
            },
      ),
    };
  }
  for (const previousTab of session.value.tabs) {
    if (!next.tabs.some((t) => t.path === previousTab.path)) {
      const remaining = new Map(resources.value);
      remaining.delete(previousTab.path);
      resources.value = remaining;
      requestPaths.value = requestPaths.value.filter((p) => p !== previousTab.path);
      terminalPaths.value = terminalPaths.value.filter((path) => path !== previousTab.path);
      visibleTerminalPaths.value = visibleTerminalPaths.value.filter(
        (path) => path !== previousTab.path,
      );
    }
  }
  session.value = next;
};
interface RepositoryResource {
  key: string;
  data?: Snapshot;
  error?: string;
  loading: boolean;
}
const resources = shallowRef(new Map<string, RepositoryResource>());
let disposed = false;
const refresh = ref(0);
const projectSearch = ref('');
const queries = ref<Record<string, string>>({});
const message = ref('');
const adding = ref(false);
const operating = ref(false);
const pathDialog = ref(false);
const inputPath = ref('');
const projectMenu = ref<string | null>(null);
const rename = ref<{ path: string; name: string } | null>(null);
const branchMenu = ref(false);
const branchQuery = ref('');
let branchClickTimer: ReturnType<typeof setTimeout> | undefined;
watch(branchMenu, (open) => {
  if (!open) clearTimeout(branchClickTimer);
});
const primaryBranchButton = ref<HTMLButtonElement | null>(null);
const pendingBranchFocus = shallowRef<{ path: string; branch: Branch } | null>(null);
const help = ref(false);
const settingsOpen = ref(false);
const settingsButton = ref<HTMLButtonElement | null>(null);
const terminalPaths = ref<string[]>([]);
const visibleTerminalPaths = ref<string[]>([]);
const terminalTabs = computed(() =>
  session.value.tabs.filter((t) => terminalPaths.value.includes(t.path)),
);
const terminalVisible = computed(
  () => !!tab.value && visibleTerminalPaths.value.includes(tab.value.path),
);
function toggleTerminal() {
  if (!native || !tab.value) return;
  const path = tab.value.path;
  if (terminalVisible.value) hideTerminal(path);
  else {
    if (!terminalPaths.value.includes(path)) terminalPaths.value = [...terminalPaths.value, path];
    visibleTerminalPaths.value = [...visibleTerminalPaths.value, path];
  }
}
function hideTerminal(path: string) {
  visibleTerminalPaths.value = visibleTerminalPaths.value.filter((p) => p !== path);
  refreshTerminalProject(path);
}
function closeTerminal(path: string) {
  hideTerminal(path);
  terminalPaths.value = terminalPaths.value.filter((p) => p !== path);
}
function refreshTerminalProject(path: string) {
  const target = session.value.tabs.find((t) => t.path === path);
  if (!target || operating.value) return;
  if (target.path === tab.value?.path) reloadRepository();
  else loadRepository(true, target);
}
const fontScale = computed(() => preferences.value.fontSize / 13);
const viewportWidth = ref(window.innerWidth);
const sidebarMaximum = computed(() => Math.max(180, Math.min(480, viewportWidth.value - 600)));
const sidebarWidth = computed(() =>
  Math.max(180, Math.min(sidebarMaximum.value, preferences.value.sidebarWidth)),
);
const resizingSidebar = ref(false);
let sidebarDrag: { pointerId: number; x: number; width: number } | null = null;
function setSidebarWidth(width: number) {
  preferences.value = {
    ...preferences.value,
    sidebarWidth: Math.round(Math.max(180, Math.min(sidebarMaximum.value, width))),
  };
}
function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0) return;
  sidebarDrag = { pointerId: event.pointerId, x: event.clientX, width: sidebarWidth.value };
  resizingSidebar.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  projectMenu.value = null;
}
function moveSidebarResize(event: PointerEvent) {
  if (sidebarDrag?.pointerId === event.pointerId)
    setSidebarWidth(sidebarDrag.width + event.clientX - sidebarDrag.x);
}
function stopSidebarResize() {
  sidebarDrag = null;
  resizingSidebar.value = false;
}
function resetSidebarWidth() {
  preferences.value = { ...preferences.value, sidebarWidth: defaultPreferences.sidebarWidth };
}
function resizeSidebarByKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Home') resetSidebarWidth();
  else setSidebarWidth(sidebarWidth.value + (event.key === 'ArrowRight' ? 16 : -16));
}
function updateViewportWidth() {
  viewportWidth.value = window.innerWidth;
}
const rowHeight = computed(() =>
  Math.max(44, Math.round((preferences.value.density === 'compact' ? 44 : 52) * fontScale.value)),
);
const connectorHeight = computed(() => Math.round(18 * fontScale.value));
const appearanceStyle = computed(() => ({
  '--sidebar-width': `${sidebarWidth.value}px`,
  '--font-scale': fontScale.value,
  '--ui-font-family': fontStack(
    preferences.value.fontFamily,
    "Inter, 'Segoe UI', 'Noto Sans TC', sans-serif",
  ),
  '--code-font-family': fontStack(preferences.value.codeFontFamily, 'Consolas, monospace'),
  '--commit-row-height': `${rowHeight.value}px`,
  '--connector-row-height': `${connectorHeight.value}px`,
  '--commit-text-padding':
    preferences.value.density === 'compact' ? '5px 12px 4px' : '9px 12px 6px',
}));
function branchStyle(row: Row) {
  return {
    '--branch-color': graphColor(row.cells.find((cell) => cell.kind === 'commit')?.color ?? 9),
  };
}
const historyRef = ref<HTMLDivElement | null>(null);
const workspaceRef = ref<HTMLDivElement | null>(null);
const detailVisible = ref(true);
const showDetailRef = ref<HTMLButtonElement | null>(null);
const detailWidth = ref(100 / 2.14);
const resizingDetail = ref(false);
let detailDrag: { pointerId: number; startX: number; startWidth: number } | null = null;
const scrollPositions: Record<string, number> = {};
const tab = computed(() => session.value.tabs.find((t) => t.path === session.value.active));
const project = computed(() => session.value.projects.find((p) => p.path === session.value.active));
const key = computed(() =>
  tab.value ? JSON.stringify([tab.value.path, tab.value.remotes, tab.value.limit]) : '',
);
const resource = computed(() => {
  const cached = tab.value ? resources.value.get(tab.value.path) : undefined;
  return cached?.key === key.value ? cached : undefined;
});
const snapshot = computed(() => resource.value?.data);
const repositoryLinks = computed(() => repositoryWebLinks(snapshot.value?.remotes));
const openingRepository = ref(false);
const repositoryWebsiteTitle = computed(() => {
  if (loading.value) return '正在讀取 repo 網址…';
  if (!repositoryLinks.value.length) return '此專案沒有可開啟的遠端 repo 網址';
  return repositoryLinks.value.length === 1
    ? `開啟 repo 網站：${repositoryLinks.value[0].url}`
    : '選擇要開啟的遠端 repo 網站';
});
async function openRepositoryLink(url: string) {
  if (openingRepository.value) return;
  openingRepository.value = true;
  try {
    await openRepositoryWebsite(url);
  } catch (error) {
    message.value = `無法開啟 repo 網站：${String(error)}`;
  } finally {
    openingRepository.value = false;
  }
}
function openRepositorySite(event: MouseEvent) {
  if (loading.value || openingRepository.value || !repositoryLinks.value.length) return;
  if (repositoryLinks.value.length === 1) {
    void openRepositoryLink(repositoryLinks.value[0].url);
    return;
  }
  contextMenu.open(
    event,
    repositoryLinks.value.map((remote) => ({
      label: remote.name,
      icon: ExternalLink,
      run: () => openRepositoryLink(remote.url),
    })),
  );
}
const highlightedGraph = computed(() =>
  preferences.value.highlightSelectedLine
    ? selectedGraphLine(snapshot.value?.rows ?? [], tab.value?.selection)
    : [],
);
const graphGlowRows = computed(() =>
  (snapshot.value?.rows ?? []).map((row, i): GraphGlowRow => ({
    cells: row.cells,
    previousCells: snapshot.value?.rows[i - 1]?.cells,
    highlightedCells: highlightedGraph.value[i] ?? [],
    height: row.commit ? rowHeight.value : connectorHeight.value,
  })),
);
const currentBranch = computed(() => snapshot.value?.branches.find((b) => b.isHead && !b.isRemote));
const primaryBranches = computed(() =>
  (snapshot.value?.branches ?? [])
    .filter((branch) => {
      const name = branch.isRemote
        ? (branch.localName ?? branch.name.slice(branch.name.indexOf('/') + 1))
        : branch.name;
      return name === 'main' || name === 'master';
    })
    .sort((a, b) => Number(a.isRemote) - Number(b.isRemote) || a.name.localeCompare(b.name)),
);
const primaryBranchTitle = computed(() =>
  primaryBranches.value.length
    ? `跳至 master/main 或目前 checkout（M）：${primaryBranches.value.map((b) => b.name).join('、')}`
    : '目前範圍沒有 master/main 分支；可開啟「顯示遠端分支」查看遠端紀錄',
);
const headLabel = computed(
  () =>
    currentBranch.value?.name ??
    (snapshot.value?.headOid
      ? `Detached HEAD · ${snapshot.value.headOid.slice(0, 7)}`
      : '尚無 commit'),
);
type HistoryColumn = 'graph' | 'message' | 'time' | 'author';
const columnWidths = ref<Record<HistoryColumn, number | null>>({
  graph: null,
  message: null,
  time: null,
  author: null,
});
const graphWidth = computed(() => ((snapshot.value?.maxLane ?? 0) + 1) * 20 + 16);
const historyColumns = computed(() => [
  {
    key: 'graph' as const,
    label: '圖譜',
    min: graphWidth.value,
    max: Math.max(600, graphWidth.value),
  },
  { key: 'message' as const, label: 'Commit 訊息', min: 120 * fontScale.value, max: 1600 },
  { key: 'time' as const, label: '時間', min: 72 * fontScale.value, max: 320 },
  { key: 'author' as const, label: '作者', min: 90 * fontScale.value, max: 480 },
]);
const historyTableStyle = computed(() => {
  const graph = Math.max(graphWidth.value, columnWidths.value.graph ?? graphWidth.value);
  const minMessage = 120 * fontScale.value;
  const message =
    columnWidths.value.message === null ? null : Math.max(minMessage, columnWidths.value.message);
  const defaultTime =
    (preferences.value.dateFormat === 'full' ? 120 : 80) +
    (preferences.value.use24HourTime ? 0 : 28);
  const time = Math.max(
    72 * fontScale.value,
    columnWidths.value.time ?? defaultTime * fontScale.value,
  );
  const author = Math.max(90 * fontScale.value, columnWidths.value.author ?? 112 * fontScale.value);
  return {
    '--history-columns': `${graph}px ${message === null ? `minmax(${minMessage}px, 1fr)` : `${message}px`} ${time}px ${author}px`,
    '--history-min-width': `${graph + (message ?? minMessage) + time + author + 21}px`,
  };
});
const error = computed(() => resource.value?.error);
const loading = computed(() => !!tab.value && (!resource.value || resource.value.loading));
watch([() => tab.value?.path, settingsOpen], () => {
  stashOpen.value = false;
  stashError.value = '';
  commitAction.value = null;
  syncBranchAction.value = null;
});
watch(
  () => snapshot.value?.operationState,
  (state) => {
    if (state && state !== 'clean') {
      commitAction.value = null;
      syncBranchAction.value = null;
    }
  },
);
watch([() => tab.value?.path, operating, loading, refresh, settingsOpen], () =>
  contextMenu.close(),
);
const query = computed(() => (tab.value ? (queries.value[tab.value.path] ?? '') : ''));
const queryLower = computed(() => query.value.trim().toLowerCase());
const matches = computed(
  () =>
    snapshot.value?.rows
      .filter(
        (r) =>
          r.commit &&
          (!queryLower.value ||
            [r.commit.message, r.commit.author, r.commit.oid, ...r.branches, ...r.tags].some((v) =>
              v.toLowerCase().includes(queryLower.value),
            )),
      )
      .map((r) => r.commit!.oid) ?? [],
);
const displayDate = (date: string) =>
  new Date(date).toLocaleDateString('zh-TW', {
    ...(preferences.value.dateFormat === 'full' ? { year: 'numeric' as const } : {}),
    month: '2-digit',
    day: '2-digit',
  });
const displayTime = (date: string) =>
  new Date(date).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !preferences.value.use24HourTime,
  });
const vAutofocus = { mounted: (element: HTMLInputElement) => element.focus() };
watch(
  preferences,
  (value) => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(value));
    } catch {
      message.value = '無法儲存偏好設定，設定僅在本次使用期間生效。';
    }
  },
  { immediate: true },
);
function openPreferences() {
  help.value = false;
  pathDialog.value = false;
  rename.value = null;
  branchMenu.value = false;
  projectMenu.value = null;
  settingsOpen.value = true;
}
async function closePreferences() {
  if (updater.state.phase === 'installing') return;
  settingsOpen.value = false;
  await nextTick();
  settingsButton.value?.focus();
}

watch(
  session,
  (value) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      message.value = '無法儲存分頁狀態，請確認應用程式資料空間。';
    }
  },
  { immediate: true },
);

function loadRepository(force = false, currentTab = tab.value) {
  if (!currentTab) return;
  const requestKey = JSON.stringify([currentTab.path, currentTab.remotes, currentTab.limit]);
  const stored = resources.value.get(currentTab.path);
  const cached = stored?.key === requestKey ? stored : undefined;
  if (cached && (!force || cached.loading)) return;
  const request: RepositoryResource = {
    key: requestKey,
    data: cached?.data,
    loading: true,
  };
  const store = (value: RepositoryResource) => {
    resources.value = new Map(resources.value).set(currentTab.path, value);
  };
  store(request);
  const isCurrent = () => !disposed && resources.value.get(currentTab.path) === request;
  api
    .repository(currentTab.path, currentTab.remotes, currentTab.limit)
    .then((data) => {
      if (isCurrent()) store({ key: request.key, data, loading: false });
    })
    .catch((err) => {
      if (isCurrent()) store({ key: request.key, error: String(err), loading: false });
    });
}
function reloadRepository() {
  if (loading.value || operating.value) return;
  refresh.value++;
  loadRepository(true);
}
async function operate(request: GitRequest): Promise<boolean> {
  const currentTab = tab.value;
  if (!currentTab || operating.value || loading.value || !native) return false;
  const name = project.value?.name ?? currentTab.path;
  operating.value = true;
  try {
    await api.operate(currentTab.path, request);
    message.value = `${name}：Git 操作已完成。`;
    return true;
  } catch (error) {
    message.value = `${name}：${String(error)}`;
    return false;
  } finally {
    // Refresh even after failure: hooks and remote operations can make partial changes.
    operating.value = false;
    const latestTab = session.value.tabs.find((t) => t.path === currentTab.path);
    if (!disposed && latestTab) {
      const cached = resources.value.get(currentTab.path);
      if (cached)
        resources.value = new Map(resources.value).set(currentTab.path, {
          ...cached,
          loading: false,
        });
      refresh.value++;
      loadRepository(true, latestTab);
    }
  }
}
watch(key, () => loadRepository(), { immediate: true, flush: 'sync' });

watch(
  [snapshot, tab],
  ([data, currentTab]) => {
    if (!currentTab || !data || currentTab.selection === 'worktree') return;
    if (currentTab.selection && data.rows.some((r) => r.commit?.oid === currentTab.selection))
      return;
    const selection =
      data.headOid && data.rows.some((r) => r.commit?.oid === data.headOid)
        ? data.headOid
        : (data.rows.find((r) => r.commit)?.commit?.oid ??
          (data.workingFiles.length ? 'worktree' : null));
    if (selection !== currentTab.selection)
      dispatch({ type: 'tab', path: currentTab.path, patch: { selection } });
  },
  { immediate: true },
);

watch(
  [() => tab.value?.path, () => !!snapshot.value],
  async () => {
    branchMenu.value = false;
    projectMenu.value = null;
    await nextTick();
    if (historyRef.value && tab.value)
      historyRef.value.scrollTop = scrollPositions[tab.value.path] ?? 0;
  },
  { flush: 'post' },
);

function select(oid: string, scroll = false) {
  if (!tab.value) return;
  pendingBranchFocus.value = null;
  detailVisible.value = true;
  dispatch({ type: 'tab', path: tab.value.path, patch: { selection: oid } });
  if (scroll)
    requestAnimationFrame(() => {
      document.getElementById(`commit-${oid}`)?.scrollIntoView({ block: 'nearest' });
    });
}
function resizeDetail(width: number) {
  const available = workspaceRef.value?.getBoundingClientRect().width;
  if (!available) return;
  const min = Math.min(280, available / 2);
  const max = available - Math.min(320, available / 2);
  detailWidth.value = (Math.max(min, Math.min(max, width)) / available) * 100;
}
function startDetailResize(event: PointerEvent) {
  if (event.button !== 0 || !workspaceRef.value) return;
  const handle = event.currentTarget as HTMLElement;
  detailDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: handle.parentElement!.getBoundingClientRect().width,
  };
  handle.setPointerCapture(event.pointerId);
  resizingDetail.value = true;
  event.preventDefault();
}
function moveDetailResize(event: PointerEvent) {
  if (detailDrag?.pointerId !== event.pointerId) return;
  resizeDetail(detailDrag.startWidth + detailDrag.startX - event.clientX);
}
function stopDetailResize() {
  detailDrag = null;
  resizingDetail.value = false;
}
async function closeDetail() {
  stopDetailResize();
  detailVisible.value = false;
  await nextTick();
  showDetailRef.value?.focus();
}
function resizeDetailByKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !workspaceRef.value) return;
  event.preventDefault();
  event.stopPropagation();
  const width = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect().width;
  resizeDetail(width + (event.key === 'ArrowLeft' ? 20 : -20));
}
function updateTab(patch: Partial<Omit<Tab, 'path'>>) {
  if (tab.value) dispatch({ type: 'tab', path: tab.value.path, patch });
}
function setQuery(value: string) {
  if (tab.value) queries.value[tab.value.path] = value;
}
function jumpSearch(e: KeyboardEvent) {
  if (e.key !== 'Enter' || !tab.value || !matches.value.length) return;
  const i = matches.value.indexOf(tab.value.selection ?? '');
  select(
    matches.value[(i + (e.shiftKey ? -1 : 1) + matches.value.length) % matches.value.length],
    true,
  );
}
function rememberScroll(e: Event) {
  if (tab.value) scrollPositions[tab.value.path] = (e.currentTarget as HTMLDivElement).scrollTop;
}
function jumpBranch(oid: string) {
  if (snapshot.value?.rows.some((r) => r.commit?.oid === oid)) select(oid, true);
  else message.value = '這個分支位於已載入的歷史範圍之外，請先載入更多紀錄。';
  branchMenu.value = false;
}
function clickBranch(event: MouseEvent, branch: Branch) {
  clearTimeout(branchClickTimer);
  if (event.detail === 0) {
    jumpBranch(branch.oid);
    return;
  }
  const path = tab.value?.path;
  // 保留選單直到雙擊判定結束，避免第一次 click 移除第二次點擊的目標。
  branchClickTimer = setTimeout(() => {
    if (branchMenu.value && tab.value?.path === path) jumpBranch(branch.oid);
  }, 500);
}
function finishBranchFocus() {
  const pending = pendingBranchFocus.value;
  if (!pending) return;
  if (tab.value?.path !== pending.path) {
    pendingBranchFocus.value = null;
    return;
  }
  if (loading.value) return;
  const data = snapshot.value;
  if (error.value || !data) {
    pendingBranchFocus.value = null;
    message.value = `無法跳至 ${pending.branch.name}：${error.value ?? '無法讀取歷史'}`;
    return;
  }
  if (data.rows.some((row) => row.commit?.oid === pending.branch.oid)) {
    pendingBranchFocus.value = null;
    select(pending.branch.oid);
    requestAnimationFrame(() => {
      if (tab.value?.path !== pending.path || tab.value.selection !== pending.branch.oid) return;
      const row = document.getElementById(`commit-${pending.branch.oid}`);
      row?.scrollIntoView({ block: 'center' });
      row?.focus({ preventScroll: true });
    });
  } else if (data.hasMore && tab.value.limit < 5000) {
    updateTab({ limit: Math.min(tab.value.limit * 2, 5000) });
  } else {
    pendingBranchFocus.value = null;
    message.value = `無法跳至 ${pending.branch.name}：目標不在目前歷史範圍內（最多載入 5,000 筆）。`;
  }
}
watch([snapshot, loading, error, () => tab.value?.path], finishBranchFocus, { flush: 'post' });
function focusBranch(branch: Branch) {
  if (!tab.value || loading.value || operating.value) return;
  branchMenu.value = false;
  setQuery('');
  pendingBranchFocus.value = { path: tab.value.path, branch };
  finishBranchFocus();
}
function branchFocusItems(separatorBefore = false): MenuItem[] {
  const disabled = loading.value || operating.value;
  return [
    ...(primaryBranches.value.length
      ? primaryBranches.value.map((branch, index) => ({
          label: `跳至 ${branch.name}`,
          icon: LocateFixed,
          separatorBefore: separatorBefore && index === 0,
          disabled,
          run: () => focusBranch(branch),
        }))
      : [
          {
            label: '跳至 master/main',
            icon: LocateFixed,
            separatorBefore,
            disabled: true,
            disabledReason: primaryBranchTitle.value,
            run: () => {},
          },
        ]),
    {
      label: '跳至目前 checkout',
      icon: GitBranch,
      separatorBefore: true,
      disabled: disabled || !snapshot.value?.headOid,
      disabledReason: !snapshot.value?.headOid ? '目前沒有已 checkout 的 commit。' : undefined,
      run: () => {
        const data = snapshot.value;
        if (!data?.headOid) return;
        focusBranch({ name: headLabel.value, oid: data.headOid, isHead: true, isRemote: false });
      },
    },
  ];
}
function focusPrimaryBranch(event: MouseEvent) {
  if (loading.value || operating.value) return;
  branchMenu.value = false;
  contextMenu.open(event, branchFocusItems());
}
function openRepositoryMenu(event: MouseEvent) {
  const data = snapshot.value;
  const disabled = !native || operating.value || loading.value || !data;
  contextMenu.open(event, [
    {
      label: '重新整理',
      icon: RefreshCw,
      disabled: operating.value || loading.value,
      run: reloadRepository,
    },
    { label: 'Fetch', icon: CloudDownload, disabled, run: () => operate({ operation: 'fetch' }) },
    {
      label: 'Pull',
      icon: ArrowDown,
      disabled: disabled || !data?.upstream,
      run: () => operate({ operation: 'pull' }),
    },
    {
      label: 'Push',
      icon: ArrowUp,
      disabled: disabled || !data?.headOid,
      run: () => operate({ operation: 'push' }),
    },
    { label: '分支操作', icon: GitBranch, disabled, run: () => gitActions.value?.openBranches() },
    { label: 'Stash', icon: Archive, disabled, run: openStash },
    {
      label: '瀏覽 PR／MR',
      icon: GitPullRequest,
      disabled: loading.value || !repositoryLinks.value.length,
      run: openRequests,
    },
    ...branchFocusItems(true),
  ]);
}
async function composeCommit() {
  select('worktree');
  await nextTick();
  document.getElementById('commit-message')?.focus();
}
function openWorktreeMenu(event: MouseEvent) {
  const files = snapshot.value?.workingFiles ?? [];
  const disabled = !native || operating.value || loading.value;
  contextMenu.open(event, [
    { label: '查看工作區變更', icon: Layers3, run: () => select('worktree') },
    {
      label: '全部暫存',
      icon: ListPlus,
      disabled: disabled || !files.some((f) => f.unstaged),
      run: () =>
        operate({ operation: 'stage', files: files.filter((f) => f.unstaged).map((f) => f.path) }),
    },
    {
      label: '全部取消暫存',
      icon: ListMinus,
      disabled: disabled || !files.some((f) => f.staged),
      run: () =>
        operate({ operation: 'unstage', files: files.filter((f) => f.staged).map((f) => f.path) }),
    },
    { label: '撰寫提交訊息', icon: GitCommitHorizontal, disabled, run: composeCommit },
    { label: 'Stash', icon: Archive, disabled, separatorBefore: true, run: openStash },
  ]);
}
function syncBranchItem(remotes: Branch[]): MenuItem {
  const data = snapshot.value;
  const hasLocals = data?.branches.some((b) => !b.isRemote);
  const disabled =
    !native ||
    operating.value ||
    loading.value ||
    !hasLocals ||
    !data?.headOid ||
    (data.operationState ?? 'clean') !== 'clean';
  return {
    label: '同步本機分支至此遠端…',
    icon: ArrowDown,
    separatorBefore: true,
    disabled,
    disabledReason: !hasLocals ? '請先 Checkout 此遠端分支，建立本機追蹤分支。' : undefined,
    run: () => {
      const latest = snapshot.value;
      if (disabled || !tab.value || !latest?.headOid || operating.value || loading.value) return;
      branchMenu.value = false;
      syncBranchAction.value = {
        path: tab.value.path,
        remotes,
        expectedHead: latest.headOid,
        expectedBranch: currentBranch.value ? `refs/heads/${currentBranch.value.name}` : 'HEAD',
      };
    },
  };
}
function openBranchMenu(event: MouseEvent, name: string) {
  clearTimeout(branchClickTimer);
  const branch: Branch | undefined = snapshot.value?.branches.find((b) => b.name === name);
  if (!branch) return;
  const commit = snapshot.value?.rows.find((row) => row.commit?.oid === branch.oid)?.commit;
  contextMenu.open(event, [
    { label: '跳至分支紀錄', icon: GitBranch, run: () => jumpBranch(branch.oid) },
    {
      label: branch.isRemote ? 'Checkout 遠端分支…' : '切換分支',
      icon: ArrowLeftRight,
      disabled:
        !native ||
        operating.value ||
        loading.value ||
        branch.isHead ||
        (snapshot.value?.operationState ?? 'clean') !== 'clean' ||
        (branch.isRemote && !commit),
      disabledReason:
        branch.isRemote && !commit ? '請先載入更多紀錄，再 Checkout 此遠端分支。' : undefined,
      run: () => checkoutBranch(branch.name),
    },
    {
      label: '從目前 HEAD 建立分支',
      icon: GitBranchPlus,
      disabled: !native || operating.value || loading.value,
      run: () => {
        branchMenu.value = false;
        gitActions.value?.openBranches();
      },
    },
    ...(branch.isRemote ? [syncBranchItem([branch])] : []),
  ]);
}
function checkoutBranch(name: string) {
  clearTimeout(branchClickTimer);
  const data = snapshot.value;
  const branch = data?.branches.find((b) => b.name === name);
  if (
    !branch ||
    branch.isHead ||
    !native ||
    operating.value ||
    loading.value ||
    (data?.operationState ?? 'clean') !== 'clean'
  )
    return;
  branchMenu.value = false;
  if (branch.isRemote) {
    const commit = data?.rows.find((row) => row.commit?.oid === branch.oid)?.commit;
    if (commit) openCommitAction('checkout', commit, branch.name);
    else message.value = '請先載入更多紀錄，再 Checkout 此遠端分支。';
    return;
  }
  return operate({ operation: 'switchBranch', branch: branch.name });
}
function openCommitAction(operation: CommitOperation, commit: Commit, checkoutRemote?: string) {
  const data = snapshot.value;
  if (
    !tab.value ||
    !data?.headOid ||
    operating.value ||
    loading.value ||
    !native ||
    (data.operationState ?? 'clean') !== 'clean'
  )
    return;
  commitAction.value = {
    path: tab.value.path,
    operation,
    commit,
    expectedHead: data.headOid,
    checkoutRemote,
    expectedBranch: currentBranch.value ? `refs/heads/${currentBranch.value.name}` : 'HEAD',
  };
}
async function copyCommitText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    message.value = `無法複製：${String(error)}`;
  }
}
function openCommitMenu(event: MouseEvent, oid: string) {
  const commit = snapshot.value?.rows.find((row) => row.commit?.oid === oid)?.commit;
  if (!commit) return;
  const disabled =
    !native ||
    operating.value ||
    loading.value ||
    (snapshot.value?.operationState ?? 'clean') !== 'clean';
  const detached = !currentBranch.value;
  const remotes =
    snapshot.value?.branches.filter((branch) => branch.isRemote && branch.oid === oid) ?? [];
  const detachedReason = detached ? '目前為 Detached HEAD，請先切換至本機分支。' : undefined;
  contextMenu.open(event, [
    { label: '新增 Tag…', icon: TagIcon, disabled, run: () => openCommitAction('addTag', commit) },
    {
      label: '建立分支…',
      icon: GitBranchPlus,
      disabled,
      run: () => openCommitAction('createBranch', commit),
    },
    {
      label: 'Checkout…',
      icon: ArrowLeftRight,
      disabled,
      separatorBefore: true,
      run: () => openCommitAction('checkout', commit),
    },
    {
      label: 'Cherry-pick…',
      icon: GitCommitHorizontal,
      disabled: disabled || detached,
      disabledReason: detachedReason,
      run: () => openCommitAction('cherryPick', commit),
    },
    {
      label: 'Revert…',
      icon: RotateCcw,
      disabled: disabled || detached,
      disabledReason: detachedReason,
      run: () => openCommitAction('revert', commit),
    },
    {
      label: '合併至目前分支…',
      icon: GitMerge,
      disabled: disabled || detached,
      disabledReason: detachedReason,
      separatorBefore: true,
      run: () => openCommitAction('merge', commit),
    },
    {
      label: '將目前分支 Rebase 到此 Commit…',
      icon: GitFork,
      disabled: disabled || detached,
      disabledReason: detachedReason,
      run: () => openCommitAction('rebase', commit),
    },
    {
      label: '將目前分支 Reset 到此 Commit…',
      icon: Undo2,
      disabled: disabled || detached,
      disabledReason: detachedReason,
      run: () => openCommitAction('reset', commit),
    },
    ...(remotes.length ? [syncBranchItem(remotes)] : []),
    {
      label: '複製完整 commit hash',
      icon: Copy,
      separatorBefore: true,
      run: () => copyCommitText(oid),
    },
    { label: '複製 Commit 標題', icon: Text, run: () => copyCommitText(commit.message) },
    { label: '查看 Commit 詳細資訊', icon: GitCommitHorizontal, run: () => select(oid) },
  ]);
}
function loadMore() {
  if (tab.value) updateTab({ limit: Math.min(tab.value.limit + 500, 5000) });
}
async function addPaths(paths: string[]) {
  adding.value = true;
  const errors: string[] = [];
  for (const path of paths) {
    try {
      dispatch({ type: 'add', project: await api.openProject(path.trim()) });
    } catch (e) {
      if (isOwnershipIssue(e)) {
        if (!ownershipIssues.value.some((issue) => issue.path === e.path))
          ownershipIssues.value.push(e);
        pathDialog.value = false;
        contextMenu.close();
      } else errors.push(`${path}：${String(e)}`);
    }
  }
  adding.value = false;
  if (errors.length) message.value = errors.join('\n');
  else {
    pathDialog.value = false;
    inputPath.value = '';
  }
}
function isOwnershipIssue(error: unknown): error is OwnershipIssue {
  return (
    !!error &&
    typeof error === 'object' &&
    'kind' in error &&
    error.kind === 'ownership' &&
    'path' in error &&
    typeof error.path === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
async function trustProject() {
  const issue = ownershipIssue.value;
  if (!issue || trusting.value || adding.value) return;
  trusting.value = true;
  try {
    const project = await api.trustProject(issue.path);
    dispatch({ type: 'add', project });
    ownershipIssues.value.shift();
    inputPath.value = '';
    message.value = `${project.name}：已信任並加入專案。`;
  } catch (error) {
    message.value = `${issue.path}：${String(error)}`;
  } finally {
    trusting.value = false;
  }
}
async function addProject() {
  if (!native && !demo) {
    message.value = '請以 Tauri 桌面版啟動，才能讀取電腦上的 Git 專案。';
    return;
  }
  if (demo) {
    inputPath.value = session.value.projects.length ? 'demo://另一個專案' : 'demo://keifu';
    pathDialog.value = true;
    return;
  }
  try {
    const paths = await chooseProjects();
    if (paths.length) await addPaths(paths);
  } catch (e) {
    message.value = String(e);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (stashOpen.value) {
    if (e.key === 'Escape' && !operating.value && !loading.value) stashOpen.value = false;
    return;
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.code === 'Backquote' &&
    !settingsOpen.value &&
    !ownershipIssue.value &&
    !commitAction.value &&
    !syncBranchAction.value &&
    !pathDialog.value &&
    !help.value
  ) {
    e.preventDefault();
    toggleTerminal();
    return;
  }
  if (e.target instanceof HTMLElement && e.target.closest('.terminal-panel')) return;
  if (ownershipIssue.value) {
    if (e.key === 'Escape' && !trusting.value && !adding.value) ownershipIssues.value.shift();
    return;
  }
  if (syncBranchAction.value) {
    if (e.key === 'Escape' && !operating.value) syncBranchAction.value = null;
    return;
  }
  if (commitAction.value) {
    if (e.key === 'Escape' && !operating.value) commitAction.value = null;
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    if (settingsOpen.value) void closePreferences();
    else openPreferences();
    return;
  }
  if (settingsOpen.value) {
    if (e.key === 'Escape') {
      e.preventDefault();
      void closePreferences();
    }
    return;
  }
  const currentTab = tab.value;
  const data = snapshot.value;
  const editing =
    e.target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
  const modifier = e.ctrlKey || e.metaKey;
  if (modifier && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    void addProject();
  }
  if (modifier && e.key.toLowerCase() === 'w' && currentTab) {
    e.preventDefault();
    dispatch({ type: 'close', path: currentTab.path });
  }
  if (modifier && e.key === 'Tab' && session.value.tabs.length) {
    e.preventDefault();
    const i = session.value.tabs.findIndex((t) => t.path === session.value.active);
    dispatch({
      type: 'activate',
      path: session.value.tabs[
        (i + (e.shiftKey ? -1 : 1) + session.value.tabs.length) % session.value.tabs.length
      ].path,
    });
  }
  if (modifier && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (requestsOpen.value)
      document
        .querySelector<HTMLInputElement>(
          ".requests-page:not([aria-hidden='true']) .request-search input",
        )
        ?.focus();
    else document.getElementById('history-search')?.focus();
  }
  if (e.key === 'Escape') {
    branchMenu.value = false;
    projectMenu.value = null;
    pathDialog.value = false;
    rename.value = null;
    help.value = false;
  }
  if (requestsOpen.value) return;
  if (
    !editing &&
    !modifier &&
    !e.altKey &&
    currentTab &&
    data &&
    !help.value &&
    !pathDialog.value &&
    !rename.value
  ) {
    if (e.key.toLowerCase() === 'r') reloadRepository();
    if (e.key === '@' && data.headOid) select(data.headOid, true);
    if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      if (primaryBranches.value.length === 1) focusBranch(primaryBranches.value[0]);
      else primaryBranchButton.value?.click();
    }
    if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const commits = data.rows.flatMap((r) => (r.commit ? [r.commit.oid] : []));
      const i = commits.indexOf(currentTab.selection ?? '');
      const next =
        commits[
          Math.max(
            0,
            Math.min(commits.length - 1, i + (e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1)),
          )
        ];
      if (next) select(next, true);
    }
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', updateViewportWidth);
});
onUnmounted(() => {
  disposed = true;

  clearTimeout(branchClickTimer);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', updateViewportWidth);
  stopSidebarResize();
});
</script>

<template>
  <div
    class="app-shell"
    :style="appearanceStyle"
    :class="{
      'native-window': native,
      'hide-column-dividers': !preferences.showColumnDividers,
      'resizing-sidebar': resizingSidebar,
    }"
  >
    <WindowTitlebar v-if="native" @error="message = $event" />
    <aside class="sidebar" :inert="settingsOpen ? true : undefined">
      <div class="brand">
        <div class="brand-mark"><GitBranch :size="22" /></div>
        <div>
          <strong>{{ 'Repovela' }}</strong
          ><small>{{ '讓專案各就各位' }}</small>
        </div>
      </div>
      <button class="add-project" @click="() => void addProject()" :disabled="adding">
        <Plus :size="16" />{{ adding ? '加入中…' : '加入專案' }}<kbd>{{ 'Ctrl O' }}</kbd></button
      ><label class="project-search"
        ><Search :size="14" /><input
          :value="projectSearch"
          @input="(e) => (projectSearch = (e.target as HTMLInputElement).value)"
          placeholder="搜尋專案"
          aria-label="搜尋專案"
      /></label>
      <ProjectLibrary
        :session="session"
        :query="projectSearch"
        :menu-path="projectMenu"
        @action="dispatch"
        @toggle-menu="projectMenu = projectMenu === $event ? null : $event"
        @dismiss="projectMenu = null"
        @rename="rename = { path: $event.path, name: $event.name }"
        @path="
          inputPath = $event;
          message = $event;
        "
      />
      <div class="sidebar-bottom">
        <span class="status-dot" />{{ '本機・Git'
        }}<button
          ref="settingsButton"
          class="icon-button"
          title="偏好設定（Ctrl ,）"
          aria-label="偏好設定"
          @click="openPreferences"
        >
          <Settings2 :size="16" /></button
        ><button
          class="icon-button"
          title="快捷鍵與關於"
          aria-label="快捷鍵與關於"
          @click="() => (help = true)"
        >
          <CircleHelp :size="16" />
        </button>
      </div>
      <div
        class="sidebar-resizer"
        :class="{ active: resizingSidebar }"
        role="separator"
        aria-label="調整側邊欄寬度"
        aria-orientation="vertical"
        tabindex="0"
        :aria-valuenow="sidebarWidth"
        :aria-valuemin="180"
        :aria-valuemax="sidebarMaximum"
        title="拖曳調整側邊欄寬度，按兩下還原"
        @pointerdown="startSidebarResize"
        @pointermove="moveSidebarResize"
        @pointerup="stopSidebarResize"
        @pointercancel="stopSidebarResize"
        @lostpointercapture="stopSidebarResize"
        @keydown="resizeSidebarByKey"
        @dblclick="resetSidebarWidth"
      />
    </aside>
    <main class="main" :inert="settingsOpen ? true : undefined">
      <div class="main-content">
        <div class="tabs" role="tablist" aria-label="專案分頁">
          <template v-for="t in session.tabs" :key="t.path"
            ><div :class="`tab ${session.active === t.path ? 'selected' : ''}`">
              <button
                role="tab"
                :aria-selected="session.active === t.path"
                :title="t.path"
                @click="
                  () =>
                    dispatch({
                      type: 'activate',
                      path: t.path,
                    })
                "
              >
                <FolderGit2 :size="14" /><span>{{
                  session.projects.find((p) => p.path === t.path)?.name
                }}</span></button
              ><button
                class="tab-close icon-button"
                :aria-label="`關閉 ${session.projects.find((p) => p.path === t.path)?.name} 分頁`"
                @click="
                  () =>
                    dispatch({
                      type: 'close',
                      path: t.path,
                    })
                "
              >
                <X :size="13" />
              </button></div></template
          ><button
            class="new-tab icon-button"
            title="加入專案"
            aria-label="加入專案分頁"
            @click="() => void addProject()"
          >
            <Plus :size="17" /></button
          ><span class="tab-spacer" /><span class="session-label">{{
            demo ? '展示模式' : '自動還原分頁'
          }}</span>
        </div>
        <template v-if="demo"
          ><div class="demo-banner">
            {{ '展示模式：範例資料僅供預覽，不會讀取你的電腦。' }}
          </div></template
        ><template v-if="tab && project"
          ><div class="toolbar" @contextmenu="openRepositoryMenu">
            <div class="repo-title">
              <FolderGit2 :size="20" />
              <div>
                <h1>{{ project.name }}</h1>
                <span :title="project.path">{{ project.path }}</span>
              </div>
            </div>
            <div class="toolbar-actions">
              <button
                v-if="requestsOpen"
                class="soft-button"
                :disabled="requestBusyPaths.includes(tab.path)"
                @click="openHistory"
              >
                <GitCommitHorizontal :size="15" />Git 歷史
              </button>
              <div v-if="requestsOpen" id="request-toolbar" />
              <button
                class="soft-button icon-button git-icon-action"
                :disabled="loading || !repositoryLinks.length"
                :title="
                  repositoryLinks.length
                    ? '瀏覽專案的 PR／MR'
                    : '此專案沒有可瀏覽 PR／MR 的遠端網址'
                "
                aria-label="瀏覽 PR／MR"
                :aria-pressed="requestsOpen"
                @click="openRequests"
              >
                <GitPullRequest :size="15" />
              </button>
              <button
                class="soft-button icon-button git-icon-action"
                :disabled="loading || openingRepository || !repositoryLinks.length"
                :title="repositoryWebsiteTitle"
                aria-label="開啟 repo 網站"
                @click="openRepositorySite"
              >
                <ExternalLink :size="15" />
              </button>
              <button
                class="soft-button icon-button git-icon-action"
                :disabled="!native"
                :title="native ? '開啟／隱藏終端機（Ctrl / ⌘ `）' : '終端機請使用桌面版'"
                aria-label="開啟／隱藏終端機"
                :aria-pressed="terminalVisible"
                @click="toggleTerminal"
              >
                <SquareTerminal :size="15" />
              </button>
              <GitActions
                ref="gitActions"
                v-if="snapshot && !requestsOpen"
                :key="tab.path"
                :snapshot="snapshot"
                :busy="operating || loading"
                :operate="operate"
                @stash="openStash"
              />
              <button
                ref="primaryBranchButton"
                v-show="!requestsOpen"
                class="soft-button icon-button git-icon-action"
                @click="focusPrimaryBranch"
                :disabled="loading || operating || (!primaryBranches.length && !snapshot?.headOid)"
                :title="primaryBranches.length ? primaryBranchTitle : '跳至目前 checkout（M）'"
                aria-label="跳至 master/main"
                aria-haspopup="menu"
                :aria-expanded="contextMenu.state.value?.target === primaryBranchButton"
              >
                <LocateFixed :size="15" />
              </button>
              <div class="branch-picker" v-show="!requestsOpen">
                <button
                  class="soft-button"
                  @click="() => (branchMenu = !branchMenu)"
                  :disabled="!snapshot"
                >
                  <GitBranch :size="14" /><span>{{ headLabel }}</span
                  ><ChevronDown :size="13" /></button
                ><template v-if="branchMenu && snapshot"
                  ><div class="dismiss" @click="() => (branchMenu = false)" />
                  <div class="branch-menu popover">
                    <label
                      ><Search :size="14" /><input
                        v-autofocus
                        :value="branchQuery"
                        @input="(e) => (branchQuery = (e.target as HTMLInputElement).value)"
                        placeholder="跳至分支（不切換分支）"
                        aria-label="搜尋分支"
                    /></label>
                    <div class="branch-list">
                      <template
                        v-for="b in snapshot.branches.filter((b) =>
                          b.name.toLowerCase().includes(branchQuery.toLowerCase()),
                        )"
                        :key="b.name"
                        ><button
                          title="單擊跳至分支紀錄；雙擊 Checkout"
                          @click="clickBranch($event, b)"
                          @dblclick="checkoutBranch(b.name)"
                          @contextmenu="openBranchMenu($event, b.name)"
                        >
                          <GitBranch :size="13" /><span>{{ b.name }}</span
                          ><small>{{ b.isHead ? 'HEAD' : b.isRemote ? '遠端' : '' }}</small>
                        </button></template
                      >
                    </div>
                  </div></template
                >
              </div>
              <button
                :class="`soft-button icon-button git-icon-action refresh-button ${loading ? 'refreshing' : ''}`"
                v-show="!requestsOpen"
                @click="reloadRepository"
                :disabled="loading || operating"
                title="重新整理（R）"
                aria-label="重新整理"
              >
                <RefreshCw :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div id="git-operation-status" class="git-operation-status" />
          <div class="repo-meta" v-show="!requestsOpen">
            <span
              ><GitBranch :size="12" />{{
                snapshot?.branches.filter((b) => !b.isRemote).length ?? '—'
              }}<!---->{{ ' 個本機分支' }}</span
            ><span
              ><GitCommitHorizontal :size="13" />{{ snapshot?.commitCount ?? '—' }}<!---->{{
                ' 筆 commit'
              }}</span
            ><template v-if="snapshot?.upstream"
              ><span :title="snapshot.upstream"
                ><ArrowUp :size="12" />{{ snapshot.ahead }}<ArrowDown :size="12" />{{
                  snapshot.behind
                }}</span
              ></template
            ><span class="meta-spacer" /><label
              ><input
                type="checkbox"
                :checked="tab.remotes"
                @change="updateTab({ remotes: ($event.target as HTMLInputElement).checked })"
              />{{ '顯示遠端分支' }}</label
            >
          </div>
          <template v-if="error && !requestsOpen"
            ><div class="main-empty">
              <FolderGit2 :size="38" />
              <h2>{{ '專案暫時無法讀取' }}</h2>
              <p class="error-text">{{ error }}</p>
              <button class="primary-button" @click="reloadRepository" :disabled="loading">
                {{ '重新嘗試' }}
              </button>
            </div></template
          ><template v-else
            ><template v-if="!snapshot"
              ><div class="main-empty" v-show="!requestsOpen">
                <div class="spinner" />
                <p>{{ '正在讀取 Git 歷史…' }}</p>
              </div></template
            ><template v-else
              ><div
                ref="workspaceRef"
                v-show="!requestsOpen"
                class="workspace"
                :class="{ 'detail-hidden': !detailVisible, 'resizing-detail': resizingDetail }"
                :style="{ '--detail-width': `${detailWidth}%` }"
              >
                <section class="history-panel" aria-label="Git 歷史">
                  <label class="history-search"
                    ><Search :size="15" /><input
                      id="history-search"
                      placeholder="搜尋訊息、作者、SHA、分支或 tag"
                      aria-label="搜尋 commit"
                      :value="query"
                      @input="setQuery(($event.target as HTMLInputElement).value)"
                      @keydown="jumpSearch" /><template v-if="query"
                      ><small>{{ matches.length }}<!---->{{ ' 筆' }}</small
                      ><button class="icon-button" aria-label="清除搜尋" @click="setQuery('')">
                        <X :size="13" /></button></template
                    ><template v-else
                      ><kbd>{{ 'Ctrl F' }}</kbd></template
                    >
                    <button
                      v-if="!detailVisible"
                      ref="showDetailRef"
                      class="icon-button"
                      title="顯示詳細資訊"
                      aria-label="顯示詳細資訊"
                      aria-controls="commit-detail"
                      @click="detailVisible = true"
                    >
                      <PanelRightOpen :size="16" /></button
                  ></label>
                  <div class="history-scroll" ref="historyRef" @scroll="rememberScroll">
                    <button
                      id="commit-worktree"
                      :class="`working-row ${tab.selection === 'worktree' ? 'selected' : ''}`"
                      @click="() => select('worktree')"
                      @contextmenu="openWorktreeMenu"
                    >
                      <div class="worktree-icon"><Layers3 :size="17" /></div>
                      <div>
                        <strong>{{ '工作區' }}</strong
                        ><span>{{
                          snapshot.workingFiles.length
                            ? `${snapshot.workingFiles.length} 個檔案尚未提交`
                            : '工作目錄乾淨'
                        }}</span>
                      </div>
                      <span class="count">{{ snapshot.workingFiles.length }}</span>
                    </button>
                    <div class="history-table" :style="historyTableStyle">
                      <div class="history-columns">
                        <ColumnHeading
                          v-for="column in historyColumns"
                          :key="column.key"
                          :label="column.label"
                          :min="column.min"
                          :max="column.max"
                          @resize="columnWidths[column.key] = $event"
                          @reset="columnWidths[column.key] = null"
                        />
                      </div>
                      <template
                        v-for="(row, i) in snapshot.rows"
                        :key="row.commit ? row.commit.oid : `connector-${i}`"
                        ><template v-if="row.commit"
                          ><button
                            :id="`commit-${row.commit.oid}`"
                            :aria-current="row.isHead ? 'true' : undefined"
                            :class="`commit-row ${tab.selection === row.commit.oid ? 'selected' : ''} ${queryLower && !matches.includes(row.commit.oid) ? 'dimmed' : ''} ${queryLower && matches.includes(row.commit.oid) ? 'search-match' : ''}`"
                            @click="() => select(row.commit!.oid)"
                            title="雙擊 Checkout"
                            @dblclick="openCommitAction('checkout', row.commit!)"
                            @contextmenu="openCommitMenu($event, row.commit!.oid)"
                          >
                            <Graph
                              :cells="row.cells"
                              :previous-cells="snapshot.rows[i - 1]?.cells"
                              :highlighted-cells="highlightedGraph[i]"
                              :previous-glow="graphGlowRows[i - 1]"
                              :next-glow="graphGlowRows[i + 1]"
                              :lanes="snapshot.maxLane"
                              :connector="false"
                              :is-head="row.isHead && preferences.highlightHead"
                              :row-height="rowHeight"
                            />
                            <div class="commit-text">
                              <div class="commit-subject">
                                <template v-if="row.isHead"
                                  ><span class="head-badge">{{ 'HEAD' }}</span></template
                                ><template v-for="b in row.branches" :key="b"
                                  ><span
                                    class="branch-badge"
                                    :class="{ 'follows-line': preferences.followBranchColor }"
                                    :style="branchStyle(row)"
                                    title="雙擊 Checkout 此分支"
                                    @dblclick.stop="checkoutBranch(b)"
                                    @contextmenu="openBranchMenu($event, b)"
                                    >{{ b }}</span
                                  ></template
                                ><template v-for="t in row.tags" :key="t"
                                  ><span
                                    class="tag-badge"
                                    :class="{ 'follows-line': preferences.followTagColor }"
                                    :style="branchStyle(row)"
                                    >{{ t }}</span
                                  ></template
                                ><strong :title="row.commit.message">{{
                                  row.commit.message || '（無 commit 訊息）'
                                }}</strong>
                              </div>
                              <div class="commit-caption">
                                <code>{{ row.commit.shortId }}</code>
                              </div>
                            </div>
                            <time
                              class="commit-time"
                              :datetime="row.commit.date"
                              :title="new Date(row.commit.date).toLocaleString('zh-TW')"
                            >
                              <span>{{ displayDate(row.commit.date) }}</span>
                              <small>{{ displayTime(row.commit.date) }}</small>
                            </time>
                            <span
                              class="commit-author"
                              :title="`${row.commit.author} <${row.commit.email}>`"
                              ><span class="column-value">{{
                                row.commit.author || '（未提供作者）'
                              }}</span></span
                            >
                          </button></template
                        ><template v-else
                          ><div class="connector-row">
                            <Graph
                              :cells="row.cells"
                              :previous-cells="snapshot.rows[i - 1]?.cells"
                              :highlighted-cells="highlightedGraph[i]"
                              :previous-glow="graphGlowRows[i - 1]"
                              :next-glow="graphGlowRows[i + 1]"
                              :lanes="snapshot.maxLane"
                              :connector="true"
                              :connector-height="connectorHeight"
                            />
                            <span class="connector-cell" />
                            <span class="connector-cell" />
                            <span class="connector-cell" /></div></template
                      ></template>
                    </div>
                    <template v-if="!snapshot.commitCount"
                      ><div class="history-empty">
                        <GitCommitHorizontal :size="27" />
                        <p>{{ '這個專案還沒有 commit。' }}</p>
                      </div></template
                    ><template v-if="snapshot.hasMore"
                      ><button
                        class="load-more"
                        :disabled="tab.limit >= 5000 || loading"
                        @click="loadMore"
                      >
                        {{ tab.limit >= 5000 ? '已顯示前 5,000 筆紀錄' : '載入更多紀錄' }}
                      </button></template
                    >
                  </div>
                </section>
                <div v-show="detailVisible" class="detail-container" id="commit-detail">
                  <div
                    class="detail-resizer"
                    role="separator"
                    aria-label="調整詳細資訊寬度"
                    aria-orientation="vertical"
                    aria-controls="commit-detail"
                    :aria-valuenow="Math.round(detailWidth)"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                    :aria-valuetext="`${Math.round(detailWidth)}%`"
                    tabindex="0"
                    @pointerdown="startDetailResize"
                    @pointermove="moveDetailResize"
                    @pointerup="stopDetailResize"
                    @pointercancel="stopDetailResize"
                    @lostpointercapture="stopDetailResize"
                    @keydown="resizeDetailByKey"
                  />
                  <Detail
                    :key="tab.path"
                    :path="tab.path"
                    :selection="tab.selection"
                    :snapshot="snapshot"
                    :revision="refresh"
                    :busy="operating || loading"
                    :operate="operate"
                    @close="closeDetail"
                    @stash="openStash"
                  />
                </div>
              </div> </template
          ></template>
          <ChangeRequestsPage
            v-for="requestTab in requestTabs"
            :key="requestTab.path"
            v-show="requestTab.path === tab.path && requestsOpen"
            :path="requestTab.path"
            :name="
              session.projects.find((p) => p.path === requestTab.path)?.name ?? requestTab.path
            "
            :remotes="resources.get(requestTab.path)?.data?.remotes ?? []"
            :active="requestTab.path === tab.path && requestsOpen"
            :list-width="preferences.requestListWidth"
            :changes-width="preferences.changesListWidth"
            toolbar-target="#request-toolbar"
            @resize-list="preferences = { ...preferences, requestListWidth: $event }"
            @resize-changes="preferences = { ...preferences, changesListWidth: $event }"
            @busy="requestBusy(requestTab.path, $event)"
          />
          <TerminalPanel
            v-for="terminalTab in terminalTabs"
            :key="terminalTab.path"
            v-show="terminalTab.path === tab.path && terminalVisible"
            :path="terminalTab.path"
            :active="terminalTab.path === tab.path && terminalVisible && !settingsOpen"
            :font-family="fontStack(preferences.codeFontFamily, 'Consolas, monospace')"
            :font-size="preferences.fontSize"
            @hide="hideTerminal(terminalTab.path)"
            @close="closeTerminal(terminalTab.path)"
            @refresh="refreshTerminalProject(terminalTab.path)"
          />
          <footer class="status-bar">
            <span class="status-dot" /><span role="status">{{
              requestBusyPaths.includes(tab.path)
                ? '正在執行 PR／MR 操作…'
                : requestsOpen
                  ? 'PR／MR'
                  : operating
                    ? '正在執行 Git 操作…'
                    : loading
                      ? '正在更新…'
                      : error
                        ? '讀取失敗'
                        : '已同步本機資料'
            }}</span
            ><span class="meta-spacer" /><span v-if="!requestsOpen">{{ 'j / k 瀏覽' }}</span
            ><span v-if="!requestsOpen">{{ '@ 跳至 HEAD' }}</span
            ><span>{{ 'Ctrl Tab 切換專案' }}</span>
          </footer></template
        ><template v-else
          ><div class="onboarding">
            <div class="onboarding-graphic">
              <div class="orbit one" />
              <div class="orbit two" />
              <div class="welcome-icon"><FolderGit2 :size="40" /></div>
              <span class="floating-node n1" /><span class="floating-node n2" /><span
                class="floating-node n3"
              />
            </div>
            <span class="eyebrow">{{ 'YOUR REPOSITORIES, TOGETHER' }}</span>
            <h1>{{ '所有專案，一個工作空間。' }}</h1>
            <p>
              {{ '把常用的 Git 專案放進來，用分頁自在切換。' }}<br />{{
                '重新開啟時，從上次停下的地方繼續。'
              }}
            </p>
            <button class="primary-button" @click="() => void addProject()">
              <Plus :size="17" />{{
                session.projects.length ? '加入其他專案' : '加入第一個專案'
              }}</button
            ><template v-if="!!session.projects.length"
              ><button
                class="text-button"
                @click="
                  () =>
                    session.projects.forEach((p) =>
                      dispatch({
                        type: 'open',
                        path: p.path,
                      }),
                    )
                "
              >
                {{ '開啟所有專案' }}
              </button></template
            ><button class="text-button" @click="() => (pathDialog = true)">
              {{ '貼上專案路徑' }}
            </button>
            <div class="welcome-features">
              <span><FolderOpen :size="15" />{{ '專案收藏' }}</span
              ><span><Layers3 :size="15" />{{ '多專案分頁' }}</span
              ><span><GitBranch :size="15" />{{ '清晰的 Git 圖譜' }}</span>
            </div>
          </div></template
        >
      </div>
    </main>
    <PreferencesDialog
      v-if="settingsOpen"
      v-model="preferences"
      :updater="updater"
      @close="closePreferences"
      @reset="preferences = { ...defaultPreferences }"
    />
    <template v-if="message"
      ><div class="toast" role="alert">
        <pre>{{ message }}</pre>
        <button class="icon-button" aria-label="關閉提示" @click="() => (message = '')">
          <X :size="15" />
        </button></div></template
    ><template v-if="pathDialog || rename || help"
      ><div
        class="modal-backdrop"
        @click="
          () => {
            pathDialog = false;
            rename = null;
            help = false;
          }
        "
      >
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          :aria-label="help ? '快捷鍵與關於' : rename ? '重新命名專案' : '加入專案'"
          @click="(e) => e.stopPropagation()"
        >
          <button
            class="modal-close icon-button"
            aria-label="關閉對話框"
            @click="
              () => {
                pathDialog = false;
                rename = null;
                help = false;
              }
            "
          >
            <X :size="18" /></button
          ><template v-if="help"
            ><span class="eyebrow">{{ 'REPOVELA · 0.1.0' }}</span>
            <h2>{{ '鍵盤也能自在瀏覽' }}</h2>
            <div class="shortcuts">
              <template
                v-for="[k, v] in [
                  ['Ctrl / ⌘ O', '加入專案'],
                  ['Ctrl / ⌘ W', '關閉目前分頁'],
                  ['Ctrl / ⌘ Tab', '下一個專案'],
                  ['Ctrl / ⌘ Shift Tab', '上一個專案'],
                  ['Ctrl / ⌘ F', '搜尋 commit'],
                  ['Ctrl / ⌘ `', '開啟／隱藏終端機'],
                  ['Enter / Shift Enter', '下一筆 / 上一筆搜尋結果'],
                  ['j / k 或 ↑ / ↓', '選擇 commit'],
                  ['@', '跳至 HEAD'],
                  ['M', '跳至 master/main'],
                  ['R', '重新整理'],
                ]"
                :key="k"
                ><div>
                  <span>{{ v }}</span
                  ><kbd>{{ k }}</kbd>
                </div></template
              >
            </div>
            <p class="subtle">
              {{ '衍生自 trasta298/keifu（MIT）。' }}<br />{{ '分頁與專案清單自動儲存於本機。' }}
            </p></template
          ><template v-else
            ><form
              @submit="
                (e) => {
                  e.preventDefault();
                  if (rename) {
                    dispatch({
                      type: 'rename',
                      ...rename,
                    });
                    rename = null;
                  } else if (native || demo) void addPaths([inputPath]);
                  else message = '請以 Tauri 桌面版啟動後再加入專案。';
                }
              "
            >
              <span class="eyebrow">{{ rename ? 'PROJECT NAME' : 'ADD REPOSITORY' }}</span>
              <h2>{{ rename ? '重新命名專案' : '加入 Git 專案' }}</h2>
              <p class="subtle">
                {{ rename ? '名稱只會影響專案清單。' : '輸入專案的完整資料夾路徑。' }}
              </p>
              <input
                class="modal-input"
                v-autofocus
                required
                :aria-label="rename ? '專案名稱' : '專案路徑'"
                :value="rename ? rename.name : inputPath"
                @input="
                  (e) =>
                    rename
                      ? (rename = {
                          ...rename,
                          name: (e.target as HTMLInputElement).value,
                        })
                      : (inputPath = (e.target as HTMLInputElement).value)
                "
                :placeholder="rename ? '專案名稱' : 'C:\\Projects\\my-project'"
              /><button class="primary-button" :disabled="adding" type="submit">
                {{ rename ? '儲存名稱' : adding ? '加入中…' : '加入專案' }}
              </button>
            </form></template
          >
        </div>
      </div></template
    >
    <ContextMenu />
    <TrustProjectDialog
      v-if="ownershipIssue"
      :key="ownershipIssue.path"
      :issue="ownershipIssue"
      :busy="trusting || adding"
      @cancel="ownershipIssues.shift()"
      @trust="trustProject"
    />
    <CommitActionDialog
      v-if="commitAction && snapshot && commitAction.path === tab?.path"
      :key="`${commitAction.operation}:${commitAction.commit.oid}`"
      :operation="commitAction.operation"
      :commit="commitAction.commit"
      :snapshot="snapshot"
      :expected-head="commitAction.expectedHead"
      :expected-branch="commitAction.expectedBranch"
      :checkout-remote="commitAction.checkoutRemote"
      :busy="operating || loading"
      :operate="operate"
      @close="commitAction = null"
    />
    <StashDialog
      v-if="stashOpen && snapshot"
      :key="tab?.path"
      :snapshot="snapshot"
      :busy="operating || loading"
      :error="stashError"
      :operate="operateStash"
      @close="stashOpen = false"
    />
    <SyncBranchDialog
      v-if="syncBranchAction && snapshot && syncBranchAction.path === tab?.path"
      :remotes="syncBranchAction.remotes"
      :snapshot="snapshot"
      :expected-head="syncBranchAction.expectedHead"
      :expected-branch="syncBranchAction.expectedBranch"
      :busy="operating || loading"
      :operate="operate"
      @close="syncBranchAction = null"
    />
  </div>
</template>
