<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ToastPosition } from './preferences';
import type { ToastMessage } from './toasts';
import ToastNotice from './ToastNotice.vue';
const props = defineProps<{ messages: ToastMessage[]; position: ToastPosition }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
const host = ref<HTMLElement | null>(null);
const top = computed(() => props.position.startsWith('top-'));
const visibleMessages = computed(() =>
  top.value ? [...props.messages].reverse() : props.messages,
);
watch(
  () => [props.messages.length, props.position],
  async () => {
    await nextTick();
    if (host.value) host.value.scrollTop = top.value ? 0 : host.value.scrollHeight;
  },
  { immediate: true },
);
</script>
<template>
  <div
    v-if="messages.length"
    ref="host"
    class="toast-host"
    :class="`toast-${position}`"
    aria-label="通知訊息"
  >
    <ToastNotice
      v-for="toast in visibleMessages"
      :key="toast.id"
      :toast="toast"
      @close="emit('dismiss', toast.id)"
    />
  </div>
</template>
