<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import { openRepositoryWebsite } from './api';
import { renderMarkdown, renderHighlightedMarkdown } from './markdown';
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    content: string;
    inline?: boolean;
    tag?: string;
  }>(),
  { inline: false },
);
const html = ref('');
const linkError = ref('');
const docId = useId();
watch(
  () => [props.content, props.inline] as const,
  async ([content, inline], _old, onCleanup) => {
    let live = true;
    onCleanup(() => {
      live = false;
    });
    linkError.value = '';
    html.value = renderMarkdown(content, inline, docId);
    if (inline) return;
    try {
      const highlighted = await renderHighlightedMarkdown(content, docId);
      if (live) html.value = highlighted;
    } catch {
      // 高亮失敗時保留 Markdown 與原始程式碼。
    }
  },
  { immediate: true },
);

async function openLink(event: MouseEvent) {
  const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('#')) {
    event.preventDefault();
    const root = anchor.closest('.markdown-content');
    Array.from(root?.querySelectorAll<HTMLElement>('[id]') ?? [])
      .find((element) => element.id === decodeURIComponent(href.slice(1)))
      ?.scrollIntoView({ block: 'nearest' });
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  try {
    await openRepositoryWebsite(anchor.href);
  } catch (error) {
    linkError.value = `無法開啟連結：${String(error)}`;
  }
}
</script>

<template>
  <component
    :is="tag ?? (inline ? 'span' : 'div')"
    v-bind="$attrs"
    class="markdown-content"
    :class="{ 'markdown-inline': inline }"
    @click="openLink"
    v-html="html"
  />
  <span v-if="linkError" class="markdown-link-error" role="alert">{{ linkError }}</span>
</template>
