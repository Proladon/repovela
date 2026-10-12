<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ExternalLink, Plus, RefreshCw, Search, Settings2 } from 'lucide-vue-next';
import { api, demo, native, openRepositoryWebsite } from './api';
import { detectForge, requestStateLabel } from './changeRequests';
import { repositoryWebLinks } from './repositoryUrl';
import RequestActions from './RequestActions.vue';
import RequestChanges from './RequestChanges.vue';
import RequestCreate from './RequestCreate.vue';
import type {
  ChangeRequest,
  Forge,
  Remote,
  RequestAction,
  RequestDetail,
  RequestState,
} from './types';

const props = defineProps<{
  path: string;
  name: string;
  remotes: Remote[];
  active: boolean;
  listWidth?: number | null;
  changesWidth?: number | null;
  toolbarTarget?: string;
}>();
const emit = defineEmits<{
  busy: [busy: boolean];
  resizeList: [width: number | null];
  resizeChanges: [width: number | null];
}>();
const browser = ref<HTMLElement | null>(null);
const browserWidth = ref(0);
const preferredListWidth = ref<number | null>(props.listWidth ?? null);
const resizingList = ref(false);
const minimumListWidth = computed(() => Math.min(210, Math.floor(browserWidth.value * 0.4)));
const maximumListWidth = computed(() =>
  Math.max(
    minimumListWidth.value,
    Math.min(1000, Math.floor(browserWidth.value - Math.min(400, browserWidth.value * 0.6))),
  ),
);
const listWidth = computed(() =>
  Math.max(
    minimumListWidth.value,
    Math.min(
      maximumListWidth.value,
      preferredListWidth.value ?? Math.max(210, Math.round(browserWidth.value * 0.26)),
    ),
  ),
);
let listObserver: ResizeObserver | undefined;
let listDrag: { pointerId: number; x: number; width: number; target: HTMLElement } | null = null;
function measureBrowser() {
  if (browser.value?.clientWidth) browserWidth.value = browser.value.clientWidth;
}
watch(
  browser,
  (element) => {
    listObserver?.disconnect();
    if (!element) {
      stopListResize();
      return;
    }
    measureBrowser();
    if (typeof ResizeObserver !== 'undefined') {
      listObserver = new ResizeObserver(measureBrowser);
      listObserver.observe(element);
    }
  },
  { flush: 'post' },
);
watch(
  () => props.listWidth,
  (width) => {
    preferredListWidth.value = width ?? null;
  },
);
watch(
  () => props.active,
  (active) => {
    if (!active) {
      stopListResize();
      sourceOpen.value = false;
    }
  },
);
function setListWidth(width: number) {
  if (!browserWidth.value) return;
  preferredListWidth.value = Math.max(
    minimumListWidth.value,
    Math.min(maximumListWidth.value, Math.round(width)),
  );
  emit('resizeList', preferredListWidth.value);
}
function startListResize(event: PointerEvent) {
  if (event.button !== 0 || !browserWidth.value) return;
  const target = event.currentTarget as HTMLElement;
  listDrag = { pointerId: event.pointerId, x: event.clientX, width: listWidth.value, target };
  resizingList.value = true;
  target.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function moveListResize(event: PointerEvent) {
  if (listDrag?.pointerId === event.pointerId)
    setListWidth(listDrag.width + event.clientX - listDrag.x);
}
function stopListResize() {
  const previous = listDrag;
  listDrag = null;
  resizingList.value = false;
  if (previous?.target.hasPointerCapture(previous.pointerId))
    previous.target.releasePointerCapture(previous.pointerId);
}
function resetListWidth() {
  stopListResize();
  preferredListWidth.value = null;
  emit('resizeList', null);
}
function resizeListByKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Home') resetListWidth();
  else if (event.key === 'End') setListWidth(maximumListWidth.value);
  else if (event.key === 'Escape') stopListResize();
  else
    setListWidth(
      listWidth.value + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 4 : 16),
    );
}
onMounted(() => window.addEventListener('resize', measureBrowser));
const links = computed(() => repositoryWebLinks(props.remotes));
const remote = ref(links.value[0]?.name ?? '');
const currentRemote = computed(() => links.value.find((link) => link.name === remote.value));
const provider = ref<Forge | ''>(currentRemote.value ? detectForge(currentRemote.value.url) : '');
const sourceOpen = ref(false);
function blurSource(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    sourceOpen.value = false;
}
const detectedProvider = computed(() =>
  currentRemote.value ? detectForge(currentRemote.value.url) : '',
);
watch(provider, (value) => {
  if (value) sourceOpen.value = false;
});
const state = ref<RequestState>('open');
const query = ref('');
const items = ref<ChangeRequest[]>([]);
const selectedNumber = ref<number | null>(null);
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref('');
const opening = ref(false);
const openError = ref('');
const detail = ref<RequestDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailTab = ref<'overview' | 'changes'>('overview');
const revision = ref(0);
const busy = ref(false);
const notice = ref('');
const actionError = ref('');
const creating = ref(false);
watch(busy, (value) => emit('busy', value), { flush: 'sync' });
const prefix = computed(() => (provider.value === 'gitlab' ? '!' : '#'));
const kind = computed(() => (provider.value === 'gitlab' ? 'MR' : 'PR'));
const filtered = computed(() => {
  const search = query.value.trim().toLowerCase();
  return items.value.filter((item) =>
    [
      String(item.number),
      `${prefix.value}${item.number}`,
      item.title,
      item.author,
      item.sourceBranch,
      item.targetBranch,
      ...item.labels,
    ].some((text) => text.toLowerCase().includes(search)),
  );
});
const listed = computed(() => filtered.value.find((item) => item.number === selectedNumber.value));
const selected = computed(() =>
  detail.value?.request.number === listed.value?.number ? detail.value?.request : listed.value,
);
watch(filtered, (list) => {
  if (!list.some((item) => item.number === selectedNumber.value))
    selectedNumber.value = list[0]?.number ?? null;
});
watch(remote, () => {
  provider.value = currentRemote.value ? detectForge(currentRemote.value.url) : '';
  sourceOpen.value = false;
});
let generation = 0;
let detailGeneration = 0;
let disposed = false;
async function load(more = false, preserve = false) {
  if (!provider.value || !currentRemote.value) return;
  const token = ++generation;
  const next = more ? cursor.value : null;
  const previous = more ? items.value : [];
  const previousNumber = preserve ? selectedNumber.value : null;
  loading.value = true;
  error.value = '';
  openError.value = '';
  if (!more && !preserve) {
    items.value = [];
    selectedNumber.value = null;
    cursor.value = null;
  }
  try {
    const page = await api.changeRequests(
      props.path,
      remote.value,
      provider.value,
      state.value,
      next,
    );
    if (generation !== token || disposed) return;
    const unique = new Map(previous.map((item) => [item.number, item]));
    for (const item of page.items) unique.set(item.number, item);
    items.value = [...unique.values()];
    cursor.value = page.nextCursor;
    if (previousNumber && items.value.some((item) => item.number === previousNumber))
      selectedNumber.value = previousNumber;
    if (preserve) revision.value++;
  } catch (cause) {
    if (generation === token && !disposed) error.value = String(cause);
  } finally {
    if (generation === token && !disposed) loading.value = false;
  }
}
watch(
  [() => props.path, remote, provider, state],
  () => {
    ++generation;
    items.value = [];
    cursor.value = null;
    error.value = '';
    loading.value = false;
    query.value = '';
    detail.value = null;
    creating.value = false;
    notice.value = '';
    actionError.value = '';
    void load();
  },
  { immediate: true },
);
async function loadDetail() {
  const token = ++detailGeneration;
  if (!listed.value || !provider.value || creating.value) {
    detail.value = null;
    detailLoading.value = false;
    return;
  }
  const number = listed.value.number;
  detailLoading.value = true;
  detailError.value = '';
  if (detail.value?.request.number !== number) detail.value = null;
  try {
    const data = await api.requestDetail(props.path, remote.value, provider.value, number);
    if (token !== detailGeneration || disposed) return;
    detail.value = data;
  } catch (cause) {
    if (token === detailGeneration && !disposed) detailError.value = String(cause);
  } finally {
    if (token === detailGeneration && !disposed) detailLoading.value = false;
  }
}
watch([() => listed.value?.number, remote, provider, revision, creating], () => void loadDetail());
async function runAction(request: RequestAction) {
  if (busy.value || !provider.value || !native) return false;
  busy.value = true;
  actionError.value = '';
  notice.value = '';
  let succeeded = false;
  try {
    const result = await api.requestAction(props.path, remote.value, provider.value, request);
    succeeded = true;
    if (disposed) return true;
    notice.value = result;
    if (request.operation === 'create') {
      creating.value = false;
      const number = /[#!](\d+)/.exec(result);
      if (number) selectedNumber.value = Number(number[1]);
    }
  } catch (cause) {
    if (!disposed)
      actionError.value = `${String(cause)}\n請重新整理核對遠端結果後再執行，避免重複送出。`;
  } finally {
    if (!disposed) {
      await load(false, true);
      busy.value = false;
    }
  }
  return succeeded;
}
async function startCreate() {
  if (busy.value || !native || !provider.value) return;
  state.value = 'open';
  await nextTick();
  creating.value = true;
}
async function openSelected() {
  if (!selected.value || opening.value) return;
  opening.value = true;
  openError.value = '';
  try {
    await openRepositoryWebsite(selected.value.url);
  } catch (cause) {
    if (!disposed) openError.value = `無法開啟網站：${String(cause)}`;
  } finally {
    opening.value = false;
  }
}
function date(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW');
}
const mergeStatus = computed(() => {
  const status = detail.value?.mergeStatus;
  const labels: Record<string, string> = {
    clean: '可合併',
    mergeable: '可合併',
    dirty: '有衝突',
    conflict: '有衝突',
    blocked: '等待檢查或審核',
    not_approved: '等待核准',
    ci_still_running: 'CI 執行中',
    ci_must_pass: '等待 CI 通過',
    draft_status: '草稿',
    checking: '平台檢查中',
    unchecked: '平台檢查中',
    unknown: '平台檢查中',
    unstable: '檢查未全部通過',
    has_conflicts: '有衝突',
  };
  return status ? (labels[status] ?? `平台合併狀態：${status}`) : '合併時由平台檢查權限與規則';
});
onUnmounted(() => {
  stopListResize();
  listObserver?.disconnect();
  window.removeEventListener('resize', measureBrowser);
  disposed = true;
  ++generation;
  ++detailGeneration;
  emit('busy', false);
});
</script>

<template>
  <section class="requests-page" aria-label="PR／MR" :aria-hidden="!active || undefined">
    <Teleport v-if="active" :to="toolbarTarget ?? 'body'" :disabled="!toolbarTarget">
      <div class="request-toolbar-actions">
        <div
          v-if="links.length > 1 || !detectedProvider"
          class="request-source"
          @keydown.esc.stop="sourceOpen = false"
          @focusout="blurSource"
        >
          <button
            class="soft-button icon-button"
            aria-label="PR／MR 來源設定"
            title="PR／MR 來源設定"
            :aria-expanded="sourceOpen || !provider"
            :disabled="busy"
            @click="sourceOpen = !sourceOpen"
          >
            <Settings2 :size="16" />
          </button>
          <div v-if="sourceOpen || !provider" class="request-source-options">
            <label v-if="links.length > 1"
              >遠端<select v-model="remote" :disabled="busy" aria-label="PR／MR 遠端">
                <option v-for="link in links" :key="link.name" :value="link.name">
                  {{ link.name }}
                </option>
              </select></label
            >
            <label v-if="!detectedProvider"
              >平台<select v-model="provider" :disabled="busy" aria-label="PR／MR 平台">
                <option disabled value="">選擇平台</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select></label
            >
          </div>
        </div>
        <button
          class="soft-button"
          :disabled="busy || loading || !provider || !native"
          :title="native ? '建立 PR／MR' : 'PR／MR 操作請使用桌面版'"
          @click="startCreate"
        >
          <Plus :size="15" />建立 PR／MR
        </button>
      </div>
    </Teleport>
    <p v-if="!provider" role="status">請選擇這個遠端使用的 GitHub 或 GitLab 平台。</p>
    <div v-if="error" class="request-error" role="alert">
      {{ error
      }}<button class="soft-button" :disabled="loading || busy" @click="load(!!items.length)">
        重試
      </button>
    </div>
    <p v-if="notice" class="request-notice" role="status">{{ notice }}</p>
    <p v-if="actionError" class="request-error" role="alert">{{ actionError }}</p>
    <div
      v-if="provider"
      ref="browser"
      class="request-browser"
      :class="{ 'resizing-request-list': resizingList }"
      :style="browserWidth ? { '--request-list-width': `${listWidth}px` } : undefined"
      :aria-busy="loading || busy"
    >
      <div class="request-list-panel">
        <div class="request-controls">
          <select v-model="state" :disabled="busy" aria-label="PR／MR 狀態" title="PR／MR 狀態">
            <option value="open">開啟中</option>
            <option value="merged">已合併</option>
            <option value="closed">已關閉</option>
            <option value="all">全部</option>
          </select>
          <span v-if="demo" class="subtle">展示資料</span>
          <button
            class="soft-button icon-button git-icon-action"
            aria-label="重新整理 PR／MR"
            title="重新整理 PR／MR"
            :disabled="loading || busy"
            @click="load(false, true)"
          >
            <RefreshCw :size="16" />
          </button>
        </div>
        <label class="request-search"
          ><Search :size="14" /><input
            v-model="query"
            :disabled="busy"
            aria-label="搜尋已載入 PR／MR"
            placeholder="搜尋編號、標題、作者或分支"
        /></label>
        <div class="request-list" aria-label="PR／MR 清單">
          <button
            v-for="item in filtered"
            :key="item.number"
            class="request-item"
            :class="{ active: selectedNumber === item.number && !creating }"
            :disabled="busy"
            :aria-pressed="selectedNumber === item.number && !creating"
            @click="
              selectedNumber = item.number;
              creating = false;
            "
          >
            <span class="request-item-title">{{ item.title }}</span
            ><span class="request-item-meta"
              ><span>{{ prefix }}{{ item.number }} · {{ item.author || '未知作者' }}</span
              ><span :class="`request-state ${item.state}`">{{
                item.draft ? '草稿' : requestStateLabel[item.state]
              }}</span></span
            >
          </button>
          <p v-if="!loading && !error && !filtered.length" class="subtle request-empty">
            {{
              query
                ? '已載入的項目沒有符合搜尋條件。'
                : `沒有${state === 'all' ? '' : state === 'open' ? '開啟中' : state === 'merged' ? '已合併' : '已關閉'}的 ${kind}。`
            }}
          </p>
          <p v-if="loading" class="subtle request-empty" role="status">正在讀取 {{ kind }}…</p>
          <button
            v-if="cursor"
            class="soft-button request-more"
            :disabled="loading || busy"
            @click="load(true)"
          >
            載入更多 {{ kind }}
          </button>
        </div>
        <span class="subtle request-count"
          >已載入 {{ items.length }} 筆<span v-if="query">
            · 符合 {{ filtered.length }} 筆</span
          ></span
        >
      </div>
      <div
        class="request-list-resizer"
        role="separator"
        aria-label="調整 PR／MR 清單寬度"
        aria-orientation="vertical"
        :aria-valuenow="listWidth"
        :aria-valuemin="minimumListWidth"
        :aria-valuemax="maximumListWidth"
        :aria-valuetext="`${listWidth}px`"
        tabindex="0"
        title="拖曳調整清單寬度；方向鍵微調；雙擊或 Home 還原"
        @pointerdown="startListResize"
        @pointermove="moveListResize"
        @pointerup="stopListResize"
        @pointercancel="stopListResize"
        @lostpointercapture="stopListResize"
        @dblclick="resetListWidth"
        @keydown="resizeListByKey"
      />
      <RequestCreate v-if="creating" :busy="busy" :run="runAction" @cancel="creating = false" />
      <article v-else-if="selected" class="request-detail" aria-label="PR／MR 內容">
        <header class="request-detail-header">
          <div class="request-detail-heading">
            <span :class="`request-state ${selected.state}`">{{
              requestStateLabel[selected.state]
            }}</span
            ><span v-if="selected.draft" class="request-state">草稿</span
            ><span class="subtle">{{ kind }} {{ prefix }}{{ selected.number }}</span
            ><button class="soft-button request-website" :disabled="opening" @click="openSelected">
              <ExternalLink :size="14" />在網站開啟 {{ kind }}
            </button>
          </div>
          <h3>{{ selected.title }}</h3>
          <div class="request-branches">
            <code>{{ selected.sourceBranch }}</code
            ><span>→</span><code>{{ selected.targetBranch }}</code>
          </div>
          <div class="request-detail-tabs" role="tablist" aria-label="PR／MR 內容分頁">
            <button
              role="tab"
              :aria-selected="detailTab === 'overview'"
              @click="detailTab = 'overview'"
            >
              概覽</button
            ><button
              role="tab"
              :aria-selected="detailTab === 'changes'"
              @click="detailTab = 'changes'"
            >
              Changes
            </button>
          </div>
        </header>
        <p v-if="detailLoading" class="subtle request-empty" role="status">
          正在讀取 PR／MR 最新資料…
        </p>
        <div v-if="detailError" class="request-error request-empty" role="alert">
          {{ detailError
          }}<button class="soft-button" :disabled="detailLoading || busy" @click="loadDetail">
            重試內容
          </button>
        </div>
        <p v-if="openError" role="alert" class="request-error request-empty">{{ openError }}</p>
        <RequestChanges
          v-if="detailTab === 'changes' && detail"
          :key="`${remote}:${provider}:${detail.request.number}`"
          :path="path"
          :remote="remote"
          :provider="provider"
          :number="detail.request.number"
          :head-oid="detail.headOid"
          :revision="revision"
          :list-width="changesWidth"
          :active="active"
          @resize-list="emit('resizeChanges', $event)"
        />
        <div v-else-if="detailTab === 'overview'" class="request-overview">
          <p class="subtle">
            {{ selected.author || '未知作者' }} · 更新於 {{ date(selected.updatedAt) }}
          </p>
          <p v-if="detail" class="subtle">{{ mergeStatus }} · {{ detail.headOid.slice(0, 12) }}</p>
          <div v-if="selected.labels.length" class="request-labels">
            <span v-for="label in selected.labels" :key="label">{{ label }}</span>
          </div>
          <div class="request-body">{{ selected.body || '沒有提供說明。' }}</div>
          <RequestActions
            v-if="detail"
            :key="`${remote}:${provider}:${detail.request.number}`"
            :detail="detail"
            :provider="provider"
            :busy="busy || detailLoading || loading || !!detailError"
            :run="runAction"
          />
        </div>
      </article>
      <div v-else class="request-detail request-empty subtle">選取項目以查看內容。</div>
    </div>
  </section>
</template>
<style scoped>
.requests-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.request-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.request-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.request-controls > button {
  margin-left: auto;
}
.request-controls > span {
  font-size: 11px;
}
.request-source {
  position: relative;
}
.request-source-options {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  display: flex;
  gap: 12px;
  min-width: 160px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel, #1c2027);
  box-shadow: 0 8px 24px #0006;
  flex-wrap: wrap;
}
.request-source-options label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
}
select {
  font: inherit;
  color: #d7dbe5;
  background: #15171d;
  border: 1px solid #494455;
  border-radius: 5px;
  padding: 6px 10px;
  max-width: 230px;
}
select:focus-visible {
  outline: 2px solid var(--accent);
}
.request-browser {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--request-list-width, minmax(210px, 26%)) minmax(0, 1fr);
  border: 1px solid var(--border);
  overflow: hidden;
}
.request-list-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
}
.request-list-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--request-list-width, max(210px, 26%)) - 4px);
  width: 8px;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
}
.request-list-resizer:hover,
.request-list-resizer:focus-visible,
.resizing-request-list .request-list-resizer {
  background: #b6a3f533;
}
.request-list-resizer:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.resizing-request-list,
.resizing-request-list :deep(*) {
  cursor: col-resize !important;
  user-select: none;
}
.request-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.request-search input {
  width: 100%;
  background: none;
  border: 0;
  padding: 4px;
  font-size: 11px;
}
.request-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.request-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 13px 12px;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
}
.request-item:hover {
  background: #ffffff08;
}
.request-item.active {
  background: #b6a3f518;
  box-shadow: inset 3px 0 var(--accent);
}
.request-item-title {
  display: block;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.request-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}
.request-item-meta > span:first-child {
  overflow-wrap: anywhere;
}
.request-state {
  font-size: 11px;
  color: var(--muted);
  background: #ffffff0a;
  padding: 3px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.request-state.open {
  color: #72d5a1;
  background: #72d5a114;
}
.request-state.merged {
  color: #b6a3f5;
  background: #b6a3f514;
}
.request-state.closed {
  color: #f29498;
  background: #f2949814;
}
.request-count {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}
.request-detail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.request-detail-header {
  padding: 16px 18px 0;
  flex-shrink: 0;
}
.request-detail-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.request-website {
  margin-left: auto;
}
.request-detail h3 {
  font-size: 18px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  margin: 10px 0 6px;
}
.request-branches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}
.request-branches code {
  overflow-wrap: anywhere;
  color: var(--accent);
  background: #ffffff08;
  padding: 4px 6px;
  border-radius: 4px;
}
.request-detail-tabs {
  display: flex;
  gap: 18px;
}
.request-detail-tabs button {
  padding: 10px 2px;
  border-radius: 0;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}
.request-detail-tabs button[aria-selected='true'] {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.request-overview {
  padding: 8px 18px 20px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.request-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 15px 0;
}
.request-labels span {
  font-size: 11px;
  padding: 3px 7px;
  border: 1px solid #494455;
  border-radius: 12px;
  overflow-wrap: anywhere;
}
.request-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
  margin-top: 18px;
}
.request-empty {
  padding: 18px;
}
.request-more {
  margin: 12px;
}
.request-error {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #f29498;
  font-size: 12px;
  max-height: 120px;
  flex-shrink: 0;
  overflow: auto;
  margin: 0 0 10px;
}
.request-error button {
  margin-top: 8px;
}
.request-notice {
  color: #72d5a1;
  margin: 0 0 10px;
}
@media (max-width: 1100px) {
  .request-browser {
    grid-template-columns: var(--request-list-width, 210px) minmax(0, 1fr);
  }
  .request-detail-header {
    padding: 12px 12px 0;
  }
  .request-overview {
    padding: 8px 12px 16px;
  }
}
</style>
