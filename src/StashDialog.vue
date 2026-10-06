<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Archive, X } from 'lucide-vue-next';
import type { GitRequest, Snapshot, StashEntry } from './types';

const props = defineProps<{
  snapshot: Snapshot;
  busy: boolean;
  error: string;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: [] }>();
const modal = ref<HTMLElement | null>(null);
const message = ref('');
const includeUntracked = ref(false);
const restoreIndex = ref(true);
const lastOperation = ref<GitRequest['operation'] | null>(null);
const selectedKey = ref('');
const dropTarget = ref<StashEntry | null>(null);
const stashes = computed(() => props.snapshot.stashes ?? []);
const key = (stash: StashEntry) => `${stash.index}:${stash.oid}`;
const stashRef = (index: number) => `stash@{${index}}`;
const selected = computed(() => stashes.value.find((stash) => key(stash) === selectedKey.value));
watch(
  stashes,
  (list) => {
    if (!list.some((stash) => key(stash) === selectedKey.value))
      selectedKey.value = list[0] ? key(list[0]) : '';
  },
  { immediate: true },
);
const cleanState = computed(() => (props.snapshot.operationState ?? 'clean') === 'clean');
const hasConflicts = computed(() => props.snapshot.workingFiles.some((file) => file.conflict));
const showSaveForm = computed(
  () =>
    cleanState.value &&
    !hasConflicts.value &&
    !!props.snapshot.headOid &&
    props.snapshot.workingFiles.some((file) => file.staged || file.unstaged || file.untracked),
);
const restoreConflict = computed(
  () =>
    hasConflicts.value &&
    (lastOperation.value === 'stashApply' || lastOperation.value === 'stashPop'),
);
const canRestore = computed(
  () => !props.busy && cleanState.value && !hasConflicts.value && !!selected.value,
);
const canSave = computed(
  () =>
    !props.busy &&
    cleanState.value &&
    !hasConflicts.value &&
    !!props.snapshot.headOid &&
    props.snapshot.workingFiles.some((file) => includeUntracked.value || !file.untracked),
);
const blockedReason = computed(() => {
  if (!cleanState.value) return '請先完成或中止目前的 Git 操作。';
  if (hasConflicts.value) return '工作區有衝突，請先解決衝突並暫存檔案。';
  if (!props.snapshot.headOid) return '尚無 commit，無法儲存 Stash。';
  return '';
});
function headCheck(): Partial<GitRequest> {
  if (!props.snapshot.headOid) return {};
  const branch = props.snapshot.branches.find((branch) => branch.isHead && !branch.isRemote);
  return {
    expectedHead: props.snapshot.headOid,
    expectedBranch: branch ? `refs/heads/${branch.name}` : 'HEAD',
  };
}
async function save() {
  if (!canSave.value) return;
  lastOperation.value = 'stashPush';
  if (
    await props.operate({
      operation: 'stashPush',
      message: message.value.trim(),
      includeUntracked: includeUntracked.value,
      ...headCheck(),
    })
  )
    message.value = '';
}
async function restore(operation: 'stashApply' | 'stashPop') {
  if (!canRestore.value || !selected.value) return;
  lastOperation.value = operation;
  await props.operate({
    operation,
    stashIndex: selected.value.index,
    stashOid: selected.value.oid,
    restoreIndex: restoreIndex.value,
    ...headCheck(),
  });
}
async function drop() {
  if (props.busy || !cleanState.value || !dropTarget.value) return;
  const target = dropTarget.value;
  lastOperation.value = 'stashDrop';
  if (
    await props.operate({ operation: 'stashDrop', stashIndex: target.index, stashOid: target.oid })
  )
    dropTarget.value = null;
}
function close() {
  if (!props.busy) emit('close');
}
function keydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    if (dropTarget.value && !props.busy) dropTarget.value = null;
    else close();
  }
  if (event.key !== 'Tab') return;
  const items = Array.from(
    modal.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [],
  );
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function focusPrimary() {
  const target =
    modal.value?.querySelector<HTMLElement>('#stash-message') ??
    modal.value?.querySelector<HTMLElement>('.stash-list [aria-selected="true"]') ??
    modal.value?.querySelector<HTMLElement>('.modal-close');
  target?.focus({ preventScroll: true });
}
watch(showSaveForm, async (visible) => {
  if (visible) return;
  await nextTick();
  if (document.activeElement === document.body) focusPrimary();
});
watch(dropTarget, async () => {
  await nextTick();
  if (dropTarget.value)
    modal.value?.querySelector<HTMLElement>('.cancel-drop')?.focus({ preventScroll: true });
  else focusPrimary();
});
let previousFocus: HTMLElement | null = null;
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  focusPrimary();
});
onUnmounted(() => previousFocus?.focus({ preventScroll: true }));
</script>

<template>
  <div class="modal-backdrop stash-backdrop" @click.self="close">
    <section
      ref="modal"
      class="modal stash-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stash-title"
      @keydown="keydown"
    >
      <button
        class="modal-close icon-button"
        aria-label="關閉 Stash"
        :disabled="busy"
        @click="close"
      >
        <X :size="16" />
      </button>
      <h2 id="stash-title"><Archive :size="20" />Stash</h2>
      <p class="subtle">{{ snapshot.project.name }} · 暫存工作區變更，稍後再還原。</p>
      <div v-if="error" class="stash-error" role="alert">
        <p>
          {{ restoreConflict ? 'Stash 套用產生衝突，原 Stash 已保留。' : error.split('\n')[0] }}
        </p>
        <details v-if="restoreConflict || error.includes('\n')">
          <summary>查看 Git 錯誤詳情</summary>
          <pre>{{ error }}</pre>
        </details>
      </div>
      <template v-if="dropTarget">
        <h3>刪除 Stash</h3>
        <p>
          <code>{{ stashRef(dropTarget.index) }}</code> · {{ dropTarget.message }}
        </p>
        <p>刪除後將無法從 Stash 清單還原這份變更。</p>
        <div class="stash-actions">
          <button class="soft-button cancel-drop" :disabled="busy" @click="dropTarget = null">
            取消刪除
          </button>
          <button class="soft-button minus" :disabled="busy || !cleanState" @click="drop">
            確認刪除 Stash
          </button>
        </div>
      </template>
      <template v-else>
        <form v-if="showSaveForm" class="stash-save" @submit.prevent="save">
          <label for="stash-message">Stash 訊息（可留空）</label>
          <input
            id="stash-message"
            v-model="message"
            class="modal-input"
            placeholder="例如：切換分支前的工作"
            :disabled="busy"
          />
          <label class="stash-checkbox"
            ><input
              v-model="includeUntracked"
              type="checkbox"
              :disabled="busy"
            />包含未追蹤檔案</label
          >
          <p class="subtle">會儲存已追蹤檔案的暫存與未暫存變更；忽略的檔案不包含在內。</p>
          <button
            class="soft-button"
            type="submit"
            :disabled="!canSave"
            :title="blockedReason || undefined"
          >
            儲存 Stash
          </button>
        </form>
        <p v-else class="subtle" role="status">
          {{ blockedReason || '目前工作區沒有可儲存的變更。' }}
        </p>
        <h3>
          已儲存的 Stash <span class="subtle">{{ stashes.length }}</span>
        </h3>
        <div class="stash-list" role="listbox" aria-label="Stash 清單">
          <button
            v-for="stash in stashes"
            :key="key(stash)"
            role="option"
            :aria-selected="selectedKey === key(stash)"
            :disabled="busy"
            @click="selectedKey = key(stash)"
          >
            <code>{{ stashRef(stash.index) }}</code>
            <strong>{{ stash.message }}</strong>
            <small>{{ new Date(stash.date).toLocaleString('zh-TW') }}</small>
          </button>
          <p v-if="!stashes.length" class="subtle">目前沒有 Stash。</p>
        </div>
        <label class="stash-checkbox"
          ><input v-model="restoreIndex" type="checkbox" :disabled="busy" />一併還原暫存狀態</label
        >
        <p class="subtle">套用會保留 Stash；還原並移除只在成功時移除，衝突時保留。</p>
        <div class="stash-actions">
          <button
            class="soft-button"
            :disabled="!canRestore"
            title="套用變更並保留 Stash"
            @click="restore('stashApply')"
          >
            套用 Stash
          </button>
          <button
            class="soft-button"
            :disabled="!canRestore"
            title="成功還原後移除 Stash；衝突時保留"
            @click="restore('stashPop')"
          >
            還原並移除 Stash
          </button>
          <button
            class="soft-button minus"
            :disabled="busy || !cleanState || !selected"
            @click="dropTarget = selected ?? null"
          >
            刪除 Stash
          </button>
        </div>
      </template>
      <p v-if="busy" class="subtle" role="status">正在更新 Stash…</p>
    </section>
  </div>
</template>

<style scoped>
.stash-backdrop {
  z-index: 120;
}
.stash-dialog {
  width: min(600px, calc(100vw - 48px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 24px;
}
.stash-dialog h2 {
  margin: 0 0 8px;
}
.stash-dialog p {
  margin: 8px 0;
}
.stash-dialog .modal-input {
  margin: 6px 0 4px;
}
h2,
.stash-actions,
.stash-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
}
h3 {
  font-size: 13px;
  margin: 16px 0 8px;
}
.stash-save {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.stash-save > label:first-child {
  display: block;
  margin-bottom: 7px;
}
.stash-checkbox {
  margin-top: 8px;
}
.stash-actions {
  margin-top: 14px;
  flex-wrap: wrap;
}
.stash-list {
  max-height: 190px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.stash-list > button {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  width: 100%;
  padding: 10px;
  text-align: left;
  border-radius: 0;
}
.stash-list > button[aria-selected='true'] {
  background: #332b48;
}
.stash-list strong {
  overflow-wrap: anywhere;
  font-weight: 500;
}
.stash-list small {
  grid-column: 2;
  color: #9298a6;
}
.stash-list > p {
  padding: 0 12px;
}
.stash-error {
  color: #f09b9b;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.stash-error pre {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 11px;
}
</style>
