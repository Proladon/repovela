<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, X } from 'lucide-vue-next';
import type { Branch, GitRequest, Snapshot } from './types';

const props = defineProps<{
  remotes: Branch[];
  snapshot: Snapshot;
  expectedHead: string;
  expectedBranch: string;
  busy: boolean;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: [] }>();
// Keep the reviewed branch tips fixed even when the parent refreshes after a failure.
const locals = props.snapshot.branches.filter((b) => !b.isRemote);
const source = ref(props.remotes.length === 1 ? props.remotes[0].name : '');
const remote = computed(() => props.remotes.find((b) => b.name === source.value));
const branch = ref('');
watch(
  remote,
  (value) => {
    if (!value) {
      branch.value = '';
      return;
    }
    const tracking = locals.filter((b) => b.upstream === value.name);
    const sameName = locals.find((b) => b.name === value.localName);
    branch.value =
      tracking.length === 1 ? tracking[0].name : tracking.length ? '' : (sameName?.name ?? '');
  },
  { immediate: true },
);
const selected = computed(() => locals.find((b) => b.name === branch.value));
const reason = computed(() => {
  if (!remote.value) return '請選擇遠端分支。';
  if (!selected.value) return '請選擇要同步的本機分支。';
  if (selected.value.oid === remote.value.oid) return '本機分支已同步至此遠端紀錄。';
  if (selected.value.isHead && props.snapshot.workingFiles.length)
    return '請先提交或處理目前工作區變更。';
  return '';
});
const modal = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
function close() {
  if (!props.busy) emit('close');
}
function keydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
  if (event.key !== 'Tab') return;
  const items = Array.from(
    modal.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)') ??
      [],
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
async function submit() {
  if (props.busy || reason.value || !selected.value || !remote.value) return;
  const request: GitRequest = {
    operation: 'syncBranch',
    branch: selected.value.name,
    remoteBranch: remote.value.name,
    oid: remote.value.oid,
    expectedLocalOid: selected.value.oid,
    expectedHead: props.expectedHead,
    expectedBranch: props.expectedBranch,
  };
  if (await props.operate(request)) emit('close');
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  modal.value?.querySelector('select')?.focus();
});
onUnmounted(() => {
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <div class="modal-backdrop" @click.self="close" @keydown="keydown">
    <section
      ref="modal"
      class="modal commit-action-dialog sync-branch-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="同步本機分支"
    >
      <button
        class="icon-button modal-close"
        title="取消操作"
        aria-label="取消操作"
        :disabled="busy"
        @click="close"
      >
        <X :size="16" />
      </button>
      <h2>同步本機分支</h2>
      <div v-if="remote" class="action-target">
        <strong>{{ remote.name }}</strong
        ><code>{{ remote.oid.slice(0, 7) }}</code>
      </div>
      <p>只允許快轉；本機有獨有提交或歷史分歧時會拒絕同步。</p>
      <p class="subtle">使用已取得的遠端紀錄；需要最新資料時請先 Fetch。</p>
      <form @submit.prevent="submit">
        <template v-if="remotes.length > 1">
          <label for="sync-remote-branch">同步來源（遠端分支）</label>
          <select id="sync-remote-branch" v-model="source" :disabled="busy">
            <option value="" disabled>請選擇遠端分支</option>
            <option v-for="b in remotes" :key="b.name" :value="b.name">{{ b.name }}</option>
          </select>
        </template>
        <label for="sync-local-branch">同步目標（本機分支）</label>
        <select id="sync-local-branch" v-model="branch" :disabled="busy || !remote">
          <option value="" disabled>請選擇本機分支</option>
          <option v-for="b in locals" :key="b.name" :value="b.name">
            {{ b.name }}{{ b.isHead ? '（目前分支）' : '' }} · {{ b.oid.slice(0, 7) }}
          </option>
        </select>
        <p v-if="selected && remote" class="action-target">
          同步方向：{{ remote.name }} → {{ selected.name }}
        </p>
        <p v-if="selected" class="subtle">
          {{
            selected.isHead
              ? '會更新目前分支、暫存區與工作目錄，執行前須保持乾淨。'
              : '保留目前 Checkout 與工作目錄，僅快轉所選本機分支。'
          }}不會推送遠端或更改上游設定。
        </p>
        <p v-if="reason" class="subtle" role="status">{{ reason }}</p>
        <div class="action-dialog-footer">
          <span v-if="busy" class="subtle" role="status">正在執行…</span>
          <button
            class="soft-button icon-button git-icon-action"
            type="submit"
            :disabled="busy || !!reason"
            title="執行同步本機分支"
            aria-label="執行同步本機分支"
          >
            <Check :size="18" />
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
