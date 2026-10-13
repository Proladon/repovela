<script setup lang="ts">
import MarkdownContent from './MarkdownContent.vue';
defineProps<{ content: string }>();
</script>
<template>
  <details v-if="content.trim()" class="markdown-preview">
    <summary>Markdown 預覽</summary>
    <MarkdownContent :content="content" />
  </details>
</template>
