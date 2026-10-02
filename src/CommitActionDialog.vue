<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, X } from 'lucide-vue-next';
import type { Commit, CommitOperation, GitRequest, Snapshot } from './types';

const props = defineProps<{
  operation: CommitOperation;
  commit: Commit;
  snapshot: Snapshot;
  expectedHead: string;
  expectedBranch: string;
  checkoutRemote?: string;
  busy: boolean;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: [] }>();
const modal = ref<HTMLElement | null>(null);
const name = ref('');
const annotation = ref('');
const checkout = ref(false);
const checkoutBranches = computed(() =>
  props.snapshot.branches.filter((b) => !b.isRemote && b.oid === props.commit.oid),
);
const checkoutRemotes = computed(() =>
  props.snapshot.branches.filter((b) => b.isRemote && b.localName && b.oid === props.commit.oid),
);
const requestedRemote = checkoutRemotes.value.find((b) => b.name === props.checkoutRemote);
const requestedLocal = requestedRemote
  ? checkoutBranches.value.find((b) => b.name === requestedRemote.localName)
  : undefined;
const defaultBranch =
  requestedLocal ??
  checkoutBranches.value.find((b) => b.isHead) ??
  (checkoutBranches.value.length === 1 ? checkoutBranches.value[0] : undefined);
const defaultRemote =
  requestedRemote && !requestedLocal
    ? requestedRemote
    : !checkoutBranches.value.length && checkoutRemotes.value.length === 1
      ? checkoutRemotes.value[0]
      : undefined;
const branch = ref(
  defaultRemote
    ? `remote:${defaultRemote.name}`
    : defaultBranch
      ? `branch:${defaultBranch.name}`
      : checkoutBranches.value.length + checkoutRemotes.value.length
        ? ''
        : 'detached',
);
const trackingBranch = computed(() =>
  props.operation === 'checkout'
    ? checkoutRemotes.value.find((b) => `remote:${b.name}` === branch.value)
    : undefined,
);
const nameExists = computed(() =>
  props.snapshot.branches.some((b) => !b.isRemote && b.name === name.value.trim()),
);
watch(
  trackingBranch,
  (remote) => {
    const suggested = remote?.localName ?? '';
    name.value = props.snapshot.branches.some((b) => !b.isRemote && b.name === suggested)
      ? ''
      : suggested;
  },
  { immediate: true },
);
const currentBranchLabel = computed(() =>
  props.expectedBranch === 'HEAD'
    ? 'Detached HEAD'
    : props.expectedBranch.replace(/^refs\/heads\//, ''),
);
const mergeSource = computed(() => {
  const matching = props.snapshot.branches.filter((b) => b.oid === props.commit.oid);
  const local = matching.filter((b) => !b.isRemote);
  return (local.length ? local : matching).map((b) => b.name).join('、') || props.commit.shortId;
});
const mainline = ref(1);
const mode = ref(props.operation === 'reset' ? 'soft' : 'auto');
const titles: Record<CommitOperation, string> = {
  addTag: '新增 Tag',
  createBranch: '建立分支',
  checkout: 'Checkout',
  cherryPick: 'Cherry-pick',
  revert: 'Revert',
  merge: '合併至目前分支',
  rebase: 'Rebase 目前分支',
  reset: 'Reset 目前分支',
};
const title = computed(() => titles[props.operation]);
const description = computed(() => {
  switch (props.operation) {
    case 'addTag':
      return '在此 commit 新增 Tag；填寫註解會建立附註標籤。';
    case 'createBranch':
      return '從此 commit 建立本機分支。';
    case 'checkout':
      return '切換至本機分支，或從遠端分支建立本機追蹤分支。Detached HEAD 不屬於任何分支。';
    case 'cherryPick':
      return '將此 commit 的變更套用到目前分支，產生新的提交。';
    case 'revert':
      return '建立一筆新的提交，反向套用此 commit 的變更。';
    case 'merge':
      return '將選取的 commit 合併進目前分支。請先 Checkout 到接收變更的分支，再選擇來源 commit。';
    case 'rebase':
      return '將目前分支的提交重新套用到此 commit 上，會重寫提交 hash。';
    case 'reset':
      return mode.value === 'hard'
        ? 'Hard Reset 會移動目前分支，捨棄已追蹤檔案的未提交變更，也可能移除阻擋還原的未追蹤檔案。'
        : mode.value === 'mixed'
          ? 'Mixed Reset 會移動目前分支並取消暫存，保留工作目錄內容。'
          : 'Soft Reset 只移動目前分支，保留暫存區與工作目錄內容。';
  }
});
const needsName = computed(
  () =>
    ['addTag', 'createBranch'].includes(props.operation) ||
    (props.operation === 'checkout' && !!trackingBranch.value),
);
const needsMainline = computed(
  () => ['cherryPick', 'revert'].includes(props.operation) && props.commit.parents.length > 1,
);
const available = computed(
  () =>
    !props.busy &&
    (!needsName.value || !!name.value.trim()) &&
    !(props.operation === 'checkout' && trackingBranch.value && nameExists.value) &&
    (props.operation !== 'checkout' || !!branch.value),
);
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
    modal.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    ) ?? [],
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
  if (!available.value) return;
  const request: GitRequest = {
    operation: props.operation,
    oid: props.commit.oid,
    expectedHead: props.expectedHead,
    expectedBranch: props.expectedBranch,
  };
  if (props.operation === 'addTag') {
    request.tag = name.value.trim();
    request.message = annotation.value.trim();
  }
  if (props.operation === 'createBranch') {
    request.branch = name.value.trim();
    request.checkout = checkout.value;
  }
  if (props.operation === 'checkout' && branch.value.startsWith('branch:'))
    request.branch = branch.value.slice('branch:'.length);
  if (props.operation === 'checkout' && trackingBranch.value) {
    request.branch = name.value.trim();
    request.remoteBranch = trackingBranch.value.name;
  }
  if (needsMainline.value) request.mainline = mainline.value;
  if (props.operation === 'reset' || props.operation === 'merge') request.mode = mode.value;
  if (await props.operate(request)) emit('close');
}
let previousFocus: HTMLElement | null = null;
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  modal.value?.querySelector<HTMLElement>('input, select, button[type="submit"]')?.focus();
});
onUnmounted(() => {
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <div class="modal-backdrop" @click.self="close" @keydown="keydown">
    <section
      ref="modal"
      class="modal commit-action-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
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
      <h2>{{ title }}</h2>
      <div class="action-target">
        <code>{{ commit.shortId }}</code
        ><strong>{{ commit.message }}</strong>
      </div>
      <p class="subtle">目前位置：{{ currentBranchLabel }} · {{ expectedHead.slice(0, 7) }}</p>
      <p v-if="operation === 'merge'" class="action-target">
        合併方向：{{ mergeSource }} → {{ currentBranchLabel }}
      </p>
      <p :class="operation === 'reset' && mode === 'hard' ? 'minus' : ''">{{ description }}</p>
      <form @submit.prevent="submit">
        <template v-if="needsName">
          <label for="action-name">{{
            operation === 'addTag' ? 'Tag 名稱' : trackingBranch ? '本機分支名稱' : '分支名稱'
          }}</label>
          <input
            id="action-name"
            v-model="name"
            class="modal-input"
            :disabled="busy"
            :placeholder="
              operation === 'addTag'
                ? 'v1.0.0'
                : (trackingBranch?.localName ?? 'feature/new-branch')
            "
            required
          />
        </template>
        <template v-if="operation === 'addTag'">
          <label for="tag-annotation">Tag 註解（可留空）</label
          ><textarea id="tag-annotation" v-model="annotation" rows="3" :disabled="busy" />
        </template>
        <label v-if="operation === 'createBranch'" class="action-checkbox"
          ><input v-model="checkout" type="checkbox" :disabled="busy" />建立後切換至此分支</label
        >
        <template v-if="operation === 'checkout'">
          <label for="checkout-target">Checkout 目標</label>
          <select id="checkout-target" v-model="branch" :disabled="busy">
            <option
              v-if="
                !defaultBranch &&
                !defaultRemote &&
                checkoutBranches.length + checkoutRemotes.length > 1
              "
              value=""
              disabled
            >
              請選擇分支或 Detached HEAD
            </option>
            <option value="detached">此 commit（Detached HEAD）</option>
            <option v-for="b in checkoutBranches" :key="b.name" :value="`branch:${b.name}`">
              {{ b.name }}
            </option>
            <option v-for="b in checkoutRemotes" :key="b.name" :value="`remote:${b.name}`">
              {{ b.name }}（建立本機追蹤分支）
            </option>
          </select>
          <p v-if="trackingBranch" class="subtle">
            會建立並切換本機分支，追蹤 {{ trackingBranch.name }}。不會推送遠端。
          </p>
          <p v-if="trackingBranch && (nameExists || !name.trim())" class="subtle">
            請輸入尚未使用的本機分支名稱；如已有同名分支，請用「分支操作」切換既有分支。
          </p>
        </template>
        <template v-if="needsMainline">
          <label for="mainline-parent">主線父 commit</label>
          <select id="mainline-parent" v-model.number="mainline" :disabled="busy">
            <option v-for="(parent, i) in commit.parents" :key="parent" :value="i + 1">
              {{ i + 1 }} · {{ parent.slice(0, 7) }}
            </option>
          </select>
        </template>
        <template v-if="operation === 'reset'">
          <label for="reset-mode">Reset 模式</label
          ><select id="reset-mode" v-model="mode" :disabled="busy">
            <option value="soft">Soft · 保留暫存與檔案</option>
            <option value="mixed">Mixed · 取消暫存，保留檔案</option>
            <option value="hard">Hard · 捨棄未提交變更</option>
          </select>
        </template>
        <template v-if="operation === 'merge'">
          <label for="merge-mode">Merge 模式</label
          ><select id="merge-mode" v-model="mode" :disabled="busy">
            <option value="auto">自動 · 可快轉時快轉</option>
            <option value="noFf">建立合併提交（No FF）</option>
            <option value="ffOnly">只允許快轉（FF Only）</option>
          </select>
        </template>
        <div class="action-dialog-footer">
          <span v-if="busy" class="subtle" role="status">正在執行…</span
          ><button
            class="soft-button icon-button git-icon-action"
            type="submit"
            :disabled="!available"
            :title="`執行 ${title}`"
            :aria-label="`執行 ${title}`"
          >
            <Check :size="18" />
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
