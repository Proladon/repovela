<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useContextMenu, type MenuItem } from './contextMenu';

const menu = useContextMenu();
const element = ref<HTMLElement | null>(null);
const position = ref({ left: '0px', top: '0px' });
watch(menu.state, async (state) => {
  if (!state) return;
  position.value = { left: `${state.x}px`, top: `${state.y}px` };
  await nextTick();
  if (menu.state.value !== state || !element.value) return;
  const bounds = element.value.getBoundingClientRect();
  position.value = {
    left: `${Math.max(8, Math.min(state.x, innerWidth - bounds.width - 8))}px`,
    top: `${Math.max(8, Math.min(state.y, innerHeight - bounds.height - 8))}px`,
  };
  await nextTick();
  if (menu.state.value !== state) return;
  const first = element.value.querySelector<HTMLButtonElement>('button:not(:disabled)');
  (first ?? element.value).focus({ preventScroll: true });
});
function outside(event: Event) {
  if (!element.value?.contains(event.target as Node)) menu.close();
}
function dismiss() {
  menu.close();
}
function keydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    menu.close(true);
    return;
  }
  if (event.key === 'Tab') {
    menu.close();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(
    element.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  );
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus({ preventScroll: true });
}
function run(item: MenuItem) {
  if (item.disabled) return;
  menu.close(true);
  void item.run();
}
onMounted(() => {
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('contextmenu', outside, true);
  window.addEventListener('resize', dismiss);
  window.addEventListener('scroll', outside, true);
});
onUnmounted(() => {
  menu.close();
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('contextmenu', outside, true);
  window.removeEventListener('resize', dismiss);
  window.removeEventListener('scroll', outside, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu.state.value"
      ref="element"
      class="popover context-menu"
      :style="position"
      role="menu"
      tabindex="-1"
      aria-label="操作選單"
      @keydown="keydown"
      @contextmenu.prevent
    >
      <template v-for="item in menu.state.value.items" :key="item.label">
        <div v-if="item.separatorBefore" class="menu-separator" role="separator" />
        <button
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          :title="item.disabled ? item.disabledReason : undefined"
          @click="run(item)"
        >
          <component :is="item.icon" :size="15" aria-hidden="true" /><span>{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
