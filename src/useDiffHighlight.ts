import { shallowRef, watch, type Ref } from 'vue';
import { escapeHtml } from './markdown';
import type { PatchLine, PatchSource } from './types';

export function useDiffHighlight(
  lines: Ref<PatchLine[]>,
  path: Ref<string>,
  sources: Ref<PatchSource | null | undefined> = shallowRef(null),
) {
  const html = shallowRef<string[]>([]);
  watch(
    [lines, path, sources],
    async ([currentLines, currentPath, currentSources], _previous, onCleanup) => {
      let live = true;
      onCleanup(() => {
        live = false;
      });
      html.value = currentLines.map((line) => escapeHtml(line.text || ' '));
      if (!currentLines.length) return;
      try {
        const { highlightPatch } = await import('./syntaxHighlight');
        const highlighted = await highlightPatch(currentLines, currentPath, currentSources);
        if (live) html.value = highlighted;
      } catch {
        // 保留已跳脫的原始程式碼，讓語言載入失敗時仍能查看 diff。
      }
    },
    { immediate: true },
  );
  return html;
}
