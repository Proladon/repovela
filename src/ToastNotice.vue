<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-vue-next';
import type { ToastMessage } from './toasts';
const props = defineProps<{ toast: ToastMessage }>();
const emit = defineEmits<{ close: [] }>();
const remaining = ref(props.toast.duration * 1000);
const hovered = ref(false);
const focused = ref(false);
const paused = computed(() => hovered.value || focused.value);
const seconds = computed(() => Math.ceil(remaining.value / 1000));
let deadline = 0;
let timer: ReturnType<typeof setInterval> | undefined;
function stop() {
  clearInterval(timer);
  timer = undefined;
}
function tick() {
  remaining.value = Math.max(0, deadline - Date.now());
  if (!remaining.value) {
    stop();
    emit('close');
  }
}
function start() {
  if (props.toast.dismissal !== 'auto' || paused.value) return;
  deadline = Date.now() + remaining.value;
  timer = setInterval(tick, 100);
}
watch(paused, (value) => {
  if (props.toast.dismissal !== 'auto') return;
  if (value) {
    if (timer) tick();
    stop();
  } else start();
});
onMounted(start);
onUnmounted(stop);
function blur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    focused.value = false;
}
</script>
<template>
  <div
    class="toast"
    :class="`toast-${toast.kind}`"
    :role="toast.kind === 'error' ? 'alert' : 'status'"
    :data-dismissal="toast.dismissal"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="blur"
  >
    <component
      :is="toast.kind === 'error' ? CircleAlert : toast.kind === 'success' ? CheckCircle2 : Info"
      class="toast-icon"
      :size="18"
      aria-hidden="true"
    />
    <div class="toast-content">
      <pre>{{ toast.message }}</pre>
      <small v-if="toast.dismissal === 'manual'" class="toast-dismissal">需手動關閉</small>
      <small v-else class="toast-dismissal" aria-hidden="true">{{
        paused ? `已暫停・剩餘 ${seconds} 秒` : `${seconds} 秒後自動關閉`
      }}</small>
    </div>
    <button class="icon-button" aria-label="關閉提示" @click="emit('close')">
      <X :size="15" />
    </button>
  </div>
</template>
