<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { FileDiff, RefreshCw } from 'lucide-vue-next';
import { api } from './api';
import { parseRequestPatch } from './changeRequests';
import { useDiffHighlight } from './useDiffHighlight';
import type { Forge, PatchSource, RequestFile } from './types';
const props = defineProps<{
  path: string;
  remote: string;
  provider: Forge;
  number: number;
  headOid: string;
  revision: number;
  listWidth?: number | null;
  active?: boolean;
}>();
const emit = defineEmits<{ resizeList: [width: number | null] }>();
const container = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const preferredListWidth = ref<number | null>(props.listWidth ?? null);
const resizingList = ref(false);
const minimumListWidth = computed(() => Math.min(170, Math.floor(containerWidth.value * 0.4)));
const maximumListWidth = computed(() =>
  Math.max(
    minimumListWidth.value,
    Math.min(1000, Math.floor(containerWidth.value - Math.min(230, containerWidth.value * 0.6))),
  ),
);
const listWidth = computed(() =>
  Math.max(
    minimumListWidth.value,
    Math.min(
      maximumListWidth.value,
      preferredListWidth.value ?? Math.max(170, Math.round(containerWidth.value * 0.28)),
    ),
  ),
);
let listObserver: ResizeObserver | undefined;
let listDrag: { pointerId: number; x: number; width: number; target: HTMLElement } | null = null;
function measureContainer() {
  if (container.value?.clientWidth) containerWidth.value = container.value.clientWidth;
}
watch(
  container,
  (element) => {
    listObserver?.disconnect();
    if (!element) {
      stopListResize();
      return;
    }
    measureContainer();
    if (typeof ResizeObserver !== 'undefined') {
      listObserver = new ResizeObserver(measureContainer);
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
    if (active === false) stopListResize();
  },
);
function setListWidth(width: number) {
  if (!containerWidth.value) return;
  preferredListWidth.value = Math.max(
    minimumListWidth.value,
    Math.min(maximumListWidth.value, Math.round(width)),
  );
  emit('resizeList', preferredListWidth.value);
}
function startListResize(event: PointerEvent) {
  if (event.button !== 0 || !containerWidth.value) return;
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
onMounted(() => window.addEventListener('resize', measureContainer));
const files = ref<RequestFile[]>([]);
const selectedPath = ref('');
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref('');
const selected = computed(() => files.value.find((file) => file.path === selectedPath.value));
const lines = computed(() =>
  selected.value?.patch ? parseRequestPatch(selected.value.patch) : [],
);
const sources = shallowRef<PatchSource | null>(null);
watch(
  () =>
    [
      props.path,
      props.remote,
      props.provider,
      props.number,
      props.headOid,
      props.revision,
      selected.value,
    ] as const,
  async ([path, remote, provider, number, headOid, , file], _old, onCleanup) => {
    let live = true;
    onCleanup(() => {
      live = false;
    });
    sources.value = null;
    if (!file?.patch || !file.path.toLowerCase().endsWith('.vue')) return;
    if (['removed', 'deleted'].includes(file.kind)) {
      sources.value = { newSource: '' };
      return;
    }
    try {
      const source = await api.requestSource(path, remote, provider, number, headOid, file.path);
      if (live) sources.value = source;
    } catch {
      // 無法讀取來源時仍保留 diff 與片段高亮。
    }
  },
  { immediate: true },
);
const highlightedLines = useDiffHighlight(
  computed(() =>
    lines.value.map((line) => ({
      ...line,
      text: ['+', '-', 'context'].includes(line.kind) ? line.text.slice(1) : line.text,
    })),
  ),
  computed(() => selected.value?.path ?? ''),
  sources,
);
const kinds: Record<string, string> = {
  added: '新增',
  removed: '刪除',
  renamed: '重新命名',
  modified: '修改',
  changed: '修改',
  copied: '複製',
};
let generation = 0;
async function load(more = false) {
  const token = ++generation;
  loading.value = true;
  error.value = '';
  if (!more) {
    files.value = [];
    cursor.value = null;
    selectedPath.value = '';
  }
  try {
    const page = await api.requestChanges(
      props.path,
      props.remote,
      props.provider,
      props.number,
      props.headOid,
      more ? cursor.value : null,
    );
    if (token !== generation) return;
    const unique = new Map(files.value.map((file) => [file.path, file]));
    for (const file of page.files) unique.set(file.path, file);
    files.value = [...unique.values()];
    cursor.value = page.nextCursor;
    if (!selected.value) selectedPath.value = files.value[0]?.path ?? '';
  } catch (cause) {
    if (token === generation) error.value = String(cause);
  } finally {
    if (token === generation) loading.value = false;
  }
}
watch(
  () => [props.path, props.remote, props.provider, props.number, props.headOid, props.revision],
  () => void load(),
  { immediate: true },
);
onUnmounted(() => {
  ++generation;
  stopListResize();
  listObserver?.disconnect();
  window.removeEventListener('resize', measureContainer);
});
</script>
<template>
  <section
    ref="container"
    class="request-changes"
    :class="{ 'resizing-changes-list': resizingList }"
    :style="containerWidth ? { '--changes-list-width': `${listWidth}px` } : undefined"
    aria-label="PR／MR Changes"
    :aria-busy="loading"
  >
    <div class="changes-files">
      <div class="changes-heading">
        <FileDiff :size="15" /><strong>變更檔案</strong
        ><span class="subtle">{{ files.length }}</span
        ><button
          class="icon-button"
          title="重新整理 Changes"
          aria-label="重新整理 Changes"
          :disabled="loading"
          @click="load()"
        >
          <RefreshCw :size="14" />
        </button>
      </div>
      <div class="changes-file-list">
        <button
          v-for="file in files"
          :key="file.path"
          class="changes-file"
          :class="{ active: selectedPath === file.path }"
          :aria-pressed="selectedPath === file.path"
          @click="selectedPath = file.path"
        >
          <span>{{ file.path }}</span
          ><small
            >{{ kinds[file.kind] ?? file.kind }} <span class="plus">+{{ file.additions }}</span>
            <span class="minus">−{{ file.deletions }}</span></small
          >
        </button>
        <p v-if="loading" class="subtle changes-message" role="status">正在讀取 Changes…</p>
        <p v-if="!loading && !error && !files.length" class="subtle changes-message">
          沒有變更檔案。
        </p>
        <button
          v-if="cursor"
          class="soft-button changes-more"
          :disabled="loading"
          @click="load(true)"
        >
          載入更多檔案
        </button>
      </div>
    </div>
    <div
      class="changes-list-resizer"
      role="separator"
      aria-label="調整 Changes 檔案清單寬度"
      aria-orientation="vertical"
      :aria-valuenow="listWidth"
      :aria-valuemin="minimumListWidth"
      :aria-valuemax="maximumListWidth"
      :aria-valuetext="`${listWidth}px`"
      tabindex="0"
      title="拖曳調整檔案清單寬度；方向鍵微調；雙擊或 Home 還原"
      @pointerdown="startListResize"
      @pointermove="moveListResize"
      @pointerup="stopListResize"
      @pointercancel="stopListResize"
      @lostpointercapture="stopListResize"
      @dblclick="resetListWidth"
      @keydown="resizeListByKey"
    />
    <div class="changes-content">
      <div v-if="error" role="alert" class="changes-error">
        {{ error
        }}<button class="soft-button" :disabled="loading" @click="load(!!files.length)">
          重試 Changes
        </button>
      </div>
      <template v-if="selected">
        <header class="changes-heading">
          <strong>{{ selected.path }}</strong
          ><span class="plus">+{{ selected.additions }}</span
          ><span class="minus">−{{ selected.deletions }}</span>
        </header>
        <p
          v-if="selected.previousPath && selected.previousPath !== selected.path"
          class="subtle changes-message"
        >
          {{ selected.previousPath }} → {{ selected.path }}
        </p>
        <p v-if="selected.truncated" class="changes-warning">
          平台或大小限制僅提供部分 diff，可在網站查看完整內容。
        </p>
        <div
          v-if="selected.patch"
          class="changes-diff"
          tabindex="0"
          role="region"
          aria-label="變更內容 diff"
        >
          <table>
            <tbody>
              <tr
                v-for="(line, index) in lines"
                :key="index"
                :class="{
                  addition: line.kind === '+',
                  deletion: line.kind === '-',
                  hunk: line.kind === 'hunk',
                }"
              >
                <td class="line-number">{{ line.oldLine }}</td>
                <td class="line-number">{{ line.newLine }}</td>
                <td class="diff-text">
                  <span v-if="['+', '-', 'context'].includes(line.kind)">{{ line.text[0] }}</span
                  ><span v-html="highlightedLines[index]"></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="subtle changes-message">
          二進位檔、僅重新命名或平台未提供文字 diff；可在網站查看。
        </p>
      </template>
      <p v-else-if="!loading" class="subtle changes-message">選取檔案以查看變更。</p>
    </div>
  </section>
</template>
<style scoped>
.request-changes {
  position: relative;
  display: grid;
  grid-template-columns: var(--changes-list-width, minmax(170px, 28%)) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--border);
}
.changes-files {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}
.changes-list-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--changes-list-width, max(170px, 28%)) - 4px);
  width: 8px;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
}
.changes-list-resizer:hover,
.changes-list-resizer:focus-visible,
.resizing-changes-list .changes-list-resizer {
  background: #b6a3f533;
}
.changes-list-resizer:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.resizing-changes-list,
.resizing-changes-list :deep(*) {
  cursor: col-resize !important;
  user-select: none;
}
.changes-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.changes-heading strong {
  flex: 1;
  min-width: 0;
}
.changes-file-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.changes-file {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 12px;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
}
.changes-file.active {
  background: #b6a3f518;
  box-shadow: inset 3px 0 var(--accent);
}
.changes-file small {
  color: var(--muted);
}
.changes-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.changes-message {
  padding: 12px;
  margin: 0;
  overflow-wrap: anywhere;
}
.changes-error,
.changes-warning {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #f2bc7d;
  padding: 12px;
  margin: 0;
}
.changes-error button {
  margin-top: 8px;
}
.changes-more {
  margin: 10px;
}
.changes-diff {
  overflow: auto;
  min-height: 0;
  flex: 1;
  font: 12px/1.8 var(--code-font-family, Consolas, monospace);
}
table {
  border-collapse: collapse;
  width: 100%;
}
td {
  vertical-align: top;
}
.line-number {
  color: var(--muted);
  padding: 0 8px;
  text-align: right;
  user-select: none;
  width: 42px;
  min-width: 42px;
  border-right: 1px solid #ffffff08;
}
.diff-text {
  white-space: pre;
  padding: 0 10px;
}
.addition {
  background: #4da8751b;
  color: #9cdeb6;
}
.deletion {
  background: #d568731a;
  color: #efabb1;
}
.hunk {
  background: #b6a3f510;
  color: var(--accent);
}
.plus {
  color: #72d5a1;
}
.minus {
  color: #f29498;
}
</style>
