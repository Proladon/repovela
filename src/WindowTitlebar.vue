<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { Copy, GitBranch, Minus, Square, X } from 'lucide-vue-next';

const emit = defineEmits<{ error: [message: string] }>();
const appWindow = getCurrentWindow();
const maximized = ref(false);
let disposed = false;
let unlisten: UnlistenFn | undefined;

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (!disposed) emit('error', `無法操作視窗：${String(error)}`);
  }
}
async function syncMaximized() {
  const value = await appWindow.isMaximized();
  if (!disposed) maximized.value = value;
}
onMounted(() => {
  void run(async () => {
    const stop = await appWindow.onResized(() => void run(syncMaximized));
    if (disposed) {
      stop();
      return;
    }
    unlisten = stop;
    await syncMaximized();
  });
});
onUnmounted(() => {
  disposed = true;
  unlisten?.();
});
</script>

<template>
  <header class="window-titlebar" aria-label="視窗標題列">
    <div class="window-drag-region" data-tauri-drag-region>
      <GitBranch :size="14" data-tauri-drag-region />
      <span data-tauri-drag-region>Repovela</span>
    </div>
    <div class="window-controls">
      <button aria-label="最小化視窗" title="最小化" @click="run(() => appWindow.minimize())">
        <Minus :size="15" />
      </button>
      <button
        :aria-label="maximized ? '還原視窗' : '最大化視窗'"
        :title="maximized ? '還原' : '最大化'"
        @click="run(() => appWindow.toggleMaximize())"
      >
        <Copy v-if="maximized" :size="13" />
        <Square v-else :size="13" />
      </button>
      <button
        class="window-close"
        aria-label="關閉視窗"
        title="關閉"
        @click="run(() => appWindow.close())"
      >
        <X :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.window-titlebar {
  grid-column: 1 / -1;
  display: flex;
  background: #101216;
  border-bottom: 1px solid var(--border);
  user-select: none;
}
.window-drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 14px;
  color: var(--muted);
  font-size: 11px;
}
.window-drag-region > svg {
  color: var(--accent);
  pointer-events: none;
}
.window-controls {
  display: flex;
}
.window-controls button {
  display: grid;
  place-items: center;
  width: 46px;
  border-radius: 0;
}
.window-controls button:hover {
  background: #282b34;
}
.window-controls .window-close:hover {
  background: #c42b3b;
  color: white;
}
</style>
