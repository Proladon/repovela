<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Check, X } from 'lucide-vue-next';
import type { OwnershipIssue } from './types';

const props = defineProps<{ issue: OwnershipIssue; busy: boolean }>();
const emit = defineEmits<{ cancel: []; trust: [] }>();
const modal = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
function keydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!props.busy) emit('cancel');
  }
  if (event.key !== 'Tab') return;
  const buttons = Array.from(
    modal.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  );
  const first = buttons[0];
  const last = buttons.at(-1);
  if (
    (event.shiftKey && document.activeElement === first) ||
    (!event.shiftKey && document.activeElement === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  modal.value?.querySelector<HTMLButtonElement>('button')?.focus();
});
onUnmounted(() => {
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
</script>

<template>
  <div class="modal-backdrop" @click.self="!busy && emit('cancel')" @keydown="keydown">
    <section
      ref="modal"
      class="modal commit-action-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="信任 Git 專案"
    >
      <button
        class="icon-button modal-close"
        title="取消加入"
        aria-label="取消加入"
        :disabled="busy"
        @click="emit('cancel')"
      >
        <X :size="16" />
      </button>
      <h2>信任此 Git 專案？</h2>
      <p>{{ issue.message }}</p>
      <div class="action-target">
        <code>{{ issue.path }}</code>
      </div>
      <p>
        若這是你建立或信任的專案，可確認後加入。此操作只會將上方路徑加入 Git
        全域信任清單（safe.directory），Git 和其他 Git 工具也會信任此專案。
      </p>
      <div class="action-dialog-footer">
        <span v-if="busy" class="subtle" role="status">正在處理…</span>
        <button
          class="soft-button icon-button git-icon-action"
          title="信任並加入專案"
          aria-label="信任並加入專案"
          :disabled="busy"
          @click="emit('trust')"
        >
          <Check :size="18" />
        </button>
      </div>
    </section>
  </div>
</template>
