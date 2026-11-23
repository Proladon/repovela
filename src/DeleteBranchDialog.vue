<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import type { Branch, GitRequest } from './types';

const props = defineProps<{
  branch: Branch;
  remote?: Branch;
  busy: boolean;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: [] }>();
const deleteRemote = ref(false);
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
    modal.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [],
  );
  if (event.shiftKey && document.activeElement === items[0]) {
    event.preventDefault();
    items.at(-1)?.focus();
  } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
    event.preventDefault();
    items[0]?.focus();
  }
}
async function submit() {
  if (props.busy) return;
  if (
    await props.operate({
      operation: 'deleteBranch',
      branch: props.branch.name,
      expectedLocalOid: props.branch.oid,
      deleteRemote: deleteRemote.value,
      ...(deleteRemote.value && props.remote ? { oid: props.remote.oid } : {}),
    })
  )
    emit('close');
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  modal.value?.querySelector<HTMLButtonElement>('.modal-close')?.focus();
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
      aria-label="刪除分支"
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
      <h2>刪除分支</h2>
      <p>
        確定要刪除本機分支 <strong>{{ branch.name }}</strong
        >？
      </p>
      <p class="subtle">尚未合併的分支無法刪除。</p>
      <form @submit.prevent="submit">
        <label
          ><input v-model="deleteRemote" type="checkbox" :disabled="busy || !remote" /> 同時刪除
          origin/{{ branch.name }}</label
        >
        <p v-if="!remote" class="subtle">找不到 origin 同名分支，請先 Fetch。</p>
        <div class="action-dialog-footer">
          <span v-if="busy" class="subtle" role="status">正在執行…</span>
          <button
            class="soft-button icon-button git-icon-action"
            type="submit"
            :disabled="busy"
            title="確認刪除分支"
            aria-label="確認刪除分支"
          >
            <Trash2 :size="18" />
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
