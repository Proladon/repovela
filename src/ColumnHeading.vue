<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{ label: string; min: number; max: number }>();
const emit = defineEmits<{ resize: [width: number]; reset: [] }>();
const heading = ref<HTMLElement | null>(null);
const width = ref(props.min);
const dragging = ref(false);
let drag: { pointerId: number; x: number; width: number } | null = null;
let observer: ResizeObserver | undefined;
const clamp = (value: number) => Math.max(props.min, Math.min(props.max, value));

function start(event: PointerEvent) {
  if (event.button !== 0 || !heading.value) return;
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    width: heading.value.getBoundingClientRect().width,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging.value = true;
  event.preventDefault();
}
function move(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId)
    emit('resize', clamp(drag.width + event.clientX - drag.x));
}
function stop() {
  drag = null;
  dragging.value = false;
}
function keydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Home') emit('reset');
  else emit('resize', clamp(width.value + (event.key === 'ArrowRight' ? 16 : -16)));
}
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry && heading.value) width.value = heading.value.getBoundingClientRect().width;
  });
  if (heading.value) observer.observe(heading.value);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="heading" class="history-column-heading">
    <span>{{ label }}</span>
    <div
      class="column-resizer"
      :class="{ 'column-resizer-active': dragging }"
      role="separator"
      :aria-label="`調整${label}欄寬`"
      aria-orientation="vertical"
      :aria-valuenow="Math.round(width)"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :title="`拖曳調整${label}欄寬，按兩下還原`"
      tabindex="0"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @keydown="keydown"
      @dblclick="emit('reset')"
    />
  </div>
</template>
