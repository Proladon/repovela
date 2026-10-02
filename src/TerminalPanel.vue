<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Eraser, Minus, RefreshCw, RotateCcw, SquareTerminal, X } from 'lucide-vue-next';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalApi, type TerminalEvent } from './terminalApi';

const props = defineProps<{
  path: string;
  active: boolean;
  fontFamily: string;
  fontSize: number;
}>();
const emit = defineEmits<{ hide: []; close: []; refresh: [] }>();
const panel = ref<HTMLElement>();
const host = ref<HTMLDivElement>();
const status = ref('正在啟動…');
const error = ref('');
const starting = ref(false);
const running = ref(false);
const height = ref(260);
const maximumHeight = ref(Math.round(innerHeight * 0.65));
let terminal: Terminal | undefined;
let fit: FitAddon | undefined;
let observer: ResizeObserver | undefined;
let id: number | undefined;
let generation = 0;
let disposed = false;
let resizing = false;
let frame = 0;
// 按鍵與貼上依序寫入，避免背景 IPC 重新排列輸入。
let writes = Promise.resolve();
let pendingInput: string[] = [];

function writeInput(target: number, data: string) {
  const current = generation;
  writes = writes
    .then(() => {
      if (!disposed && current === generation) return terminalApi.write(target, data);
    })
    .catch(report);
}

function report(e: unknown) {
  if (!disposed) error.value = String(e);
}
function fitTerminal() {
  maximumHeight.value = Math.round(innerHeight * 0.65);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!host.value?.clientWidth || !host.value.clientHeight) return;
    fit?.fit();
  });
}

function receive(event: TerminalEvent, current: number) {
  if (disposed || current !== generation) return;
  if (event.event === 'data') terminal?.write(new Uint8Array(event.data));
  if (event.event === 'error') error.value = event.message;
  if (event.event === 'exit') {
    id = undefined;
    running.value = false;
    status.value = `已結束（${event.code ?? '未知'}）`;
    terminal?.writeln(`\r\n[${status.value}]`);
    emit('refresh');
  }
}

async function start() {
  if (!terminal || starting.value || disposed) return;
  starting.value = true;
  running.value = false;
  error.value = '';
  status.value = '正在啟動…';
  const current = ++generation;
  const previous = id;
  id = undefined;
  pendingInput = [];
  try {
    if (previous !== undefined) await terminalApi.close(previous);
    if (disposed) return;
    terminal.reset();
    fit?.fit();
    let exited = false;
    const info = await terminalApi.open(props.path, terminal.cols, terminal.rows, (event) => {
      if (event.event === 'exit') exited = true;
      receive(event, current);
    });
    if (disposed || current !== generation) {
      await terminalApi.close(info.id);
      return;
    }
    if (exited) return;
    id = info.id;
    terminal.options.windowsPty = info.windows ? { backend: 'conpty' } : undefined;
    running.value = true;
    for (const data of pendingInput) writeInput(info.id, data);
    pendingInput = [];
    status.value = info.shell.split(/[\\/]/).pop() ?? info.shell;
    await terminalApi.resize(info.id, terminal.cols, terminal.rows);
    if (props.active) terminal.focus();
  } catch (e) {
    if (current === generation) {
      status.value = '啟動失敗';
      report(e);
    }
  } finally {
    if (current === generation) starting.value = false;
  }
}

function moveResize(event: PointerEvent) {
  if (!resizing || !panel.value) return;
  const bounds = panel.value.getBoundingClientRect();
  height.value = Math.max(140, Math.min(innerHeight * 0.65, bounds.bottom - event.clientY));
}
function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  height.value = Math.max(
    140,
    Math.min(innerHeight * 0.65, height.value + (event.key === 'ArrowUp' ? 20 : -20)),
  );
}
function focusOut(event: FocusEvent) {
  if (!panel.value?.contains(event.relatedTarget as Node | null)) emit('refresh');
}

watch(
  () => props.active,
  async (active) => {
    if (!active) return;
    await nextTick();
    fitTerminal();
    terminal?.focus();
  },
);
watch(
  () => [props.fontFamily, props.fontSize] as const,
  () => {
    if (!terminal) return;
    terminal.options.fontFamily = props.fontFamily;
    terminal.options.fontSize = props.fontSize;
    fitTerminal();
  },
);
onMounted(async () => {
  try {
    const [xterm, addon] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
    if (disposed || !host.value) return;
    terminal = new xterm.Terminal({
      fontFamily: props.fontFamily,
      fontSize: props.fontSize,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#101216',
        foreground: '#d7dae0',
        cursor: '#b6a3f5',
        selectionBackground: '#b6a3f555',
      },
    });
    fit = new addon.FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.value);
    terminal.attachCustomKeyEventHandler(
      (event) => !((event.ctrlKey || event.metaKey) && event.code === 'Backquote'),
    );
    terminal.textarea?.setAttribute('aria-label', '終端機輸入');
    terminal.onData((data) => {
      const target = id;
      // 包含 ConPTY 啟動時的游標位置查詢回覆。
      if (target === undefined) {
        if (starting.value) pendingInput.push(data);
        return;
      }
      if (running.value) writeInput(target, data);
    });
    terminal.onResize(({ cols, rows }) => {
      if (id !== undefined) void terminalApi.resize(id, cols, rows).catch(report);
    });
    observer = new ResizeObserver(fitTerminal);
    observer.observe(host.value);
    await start();
  } catch (e) {
    status.value = '啟動失敗';
    report(e);
  }
});
onUnmounted(() => {
  disposed = true;
  generation++;
  observer?.disconnect();
  cancelAnimationFrame(frame);
  if (id !== undefined) void terminalApi.close(id).catch(() => {});
  terminal?.dispose();
});
</script>

<template>
  <section
    ref="panel"
    class="terminal-panel"
    aria-label="專案終端機"
    :style="{ height: `${height}px` }"
    @focusout="focusOut"
  >
    <div
      class="terminal-resizer"
      role="separator"
      aria-label="調整終端機高度"
      aria-orientation="horizontal"
      :aria-valuenow="height"
      :aria-valuemin="140"
      :aria-valuemax="maximumHeight"
      tabindex="0"
      @pointerdown="startResize"
      @pointermove="moveResize"
      @pointerup="resizing = false"
      @pointercancel="resizing = false"
      @lostpointercapture="resizing = false"
      @keydown="resizeKey"
    />
    <header class="terminal-header">
      <SquareTerminal :size="15" /><strong>終端機</strong
      ><span class="terminal-status">{{ status }}</span
      ><span class="meta-spacer" />
      <button
        class="icon-button"
        title="重新整理 Git 狀態"
        aria-label="重新整理 Git 狀態"
        @click="emit('refresh')"
      >
        <RefreshCw :size="14" />
      </button>
      <button
        class="icon-button"
        title="清除終端機畫面"
        aria-label="清除終端機畫面"
        @click="terminal?.clear()"
      >
        <Eraser :size="14" />
      </button>
      <button
        class="icon-button"
        title="重新啟動終端機"
        aria-label="重新啟動終端機"
        :disabled="starting"
        @click="start"
      >
        <RotateCcw :size="14" />
      </button>
      <button
        class="icon-button"
        title="隱藏終端機（保留工作階段）"
        aria-label="隱藏終端機"
        @click="emit('hide')"
      >
        <Minus :size="14" />
      </button>
      <button class="icon-button" title="結束終端機" aria-label="結束終端機" @click="emit('close')">
        <X :size="14" />
      </button>
    </header>
    <p v-if="error" class="terminal-error" role="alert">{{ error }}</p>
    <div ref="host" class="terminal-host" @contextmenu.prevent />
  </section>
</template>
