<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RequestAction } from './types';
import MarkdownPreview from './MarkdownPreview.vue';
const props = defineProps<{ busy: boolean; run: (request: RequestAction) => Promise<boolean> }>();
const emit = defineEmits<{ cancel: [] }>();
const title = ref('');
const body = ref('');
const source = ref('');
const target = ref('main');
const draft = ref(true);
const valid = computed(
  () =>
    !props.busy &&
    !!title.value.trim() &&
    !!source.value.trim() &&
    !!target.value.trim() &&
    source.value.trim() !== target.value.trim(),
);
async function submit() {
  if (valid.value)
    await props.run({
      operation: 'create',
      title: title.value.trim(),
      message: body.value,
      sourceBranch: source.value.trim(),
      targetBranch: target.value.trim(),
      draft: draft.value,
    });
}
</script>
<template>
  <form class="request-create" aria-label="建立 PR／MR" @submit.prevent="submit">
    <h3>建立 PR／MR</h3>
    <p class="subtle">來源與目標分支必須已存在所選遠端。</p>
    <label
      >標題<input
        v-model="title"
        required
        maxlength="500"
        :disabled="busy"
        aria-label="PR／MR 標題"
    /></label>
    <div class="create-branches">
      <label
        >來源分支<input
          v-model="source"
          required
          :disabled="busy"
          aria-label="PR／MR 來源分支"
          placeholder="feature/my-change" /></label
      ><span>→</span
      ><label
        >目標分支<input v-model="target" required :disabled="busy" aria-label="PR／MR 目標分支"
      /></label>
    </div>
    <label
      >說明<textarea
        v-model="body"
        :disabled="busy"
        maxlength="65536"
        aria-label="PR／MR 說明"
        rows="6"
      />
    </label>
    <MarkdownPreview :content="body" />
    <label class="create-draft"
      ><input v-model="draft" type="checkbox" :disabled="busy" />建立為草稿</label
    >
    <div class="create-buttons">
      <button class="soft-button" type="button" :disabled="busy" @click="emit('cancel')">
        取消建立</button
      ><button class="primary-button" type="submit" :disabled="!valid">
        {{ busy ? '建立中…' : '確認建立' }}
      </button>
    </div>
  </form>
</template>
<style scoped>
.request-create {
  padding: 24px;
  max-width: 800px;
  width: 100%;
  overflow: auto;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 16px 0;
}
input,
textarea {
  background: #15171d;
  border: 1px solid #494455;
  border-radius: 5px;
  padding: 10px;
  color: inherit;
  font: inherit;
  width: 100%;
}
textarea {
  resize: vertical;
  min-height: 100px;
  max-height: 320px;
}
.create-branches {
  display: flex;
  align-items: center;
  gap: 12px;
}
.create-branches label {
  flex: 1;
  min-width: 0;
}
.create-draft {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.create-draft input {
  width: auto;
}
.create-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
