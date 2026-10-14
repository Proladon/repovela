<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { api } from './api';
import type { Forge, RequestAction } from './types';
import MarkdownPreview from './MarkdownPreview.vue';
const props = defineProps<{
  path: string;
  remote: string;
  provider: Forge;
  initialSource?: string | null;
  busy: boolean;
  run: (request: RequestAction) => Promise<boolean>;
}>();
const emit = defineEmits<{ cancel: []; error: [message: string] }>();
const title = ref('');
const body = ref('');
const source = ref('');
const target = ref('');
const branches = ref<string[]>([]);
const loading = ref(false);
const failed = ref(false);
let generation = 0;
async function loadBranches() {
  const token = ++generation;
  loading.value = true;
  failed.value = false;
  branches.value = [];
  source.value = '';
  target.value = '';
  try {
    const result = await api.requestBranches(props.path, props.remote, props.provider);
    if (token !== generation) return;
    branches.value = result.branches;
    if (result.defaultBranch && branches.value.includes(result.defaultBranch))
      target.value = result.defaultBranch;
    if (props.initialSource && branches.value.includes(props.initialSource))
      source.value = props.initialSource;
  } catch (cause) {
    if (token !== generation) return;
    failed.value = true;
    emit('error', `無法讀取遠端分支：${String(cause)}`);
  } finally {
    if (token === generation) loading.value = false;
  }
}
watch(
  () => [props.path, props.remote, props.provider],
  () => void loadBranches(),
  { immediate: true },
);
onUnmounted(() => ++generation);
const draft = ref(true);
const valid = computed(
  () =>
    !props.busy &&
    !loading.value &&
    !!title.value.trim() &&
    branches.value.includes(source.value) &&
    branches.value.includes(target.value) &&
    source.value !== target.value,
);
async function submit() {
  if (valid.value)
    await props.run({
      operation: 'create',
      title: title.value.trim(),
      message: body.value,
      sourceBranch: source.value,
      targetBranch: target.value,
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
        >來源分支<select
          v-model="source"
          required
          :disabled="busy || loading || !branches.length"
          aria-label="PR／MR 來源分支"
        >
          <option disabled value="">{{ loading ? '正在讀取分支…' : '選擇來源分支' }}</option>
          <option v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</option>
        </select></label
      ><span>→</span
      ><label
        >目標分支<select
          v-model="target"
          required
          :disabled="busy || loading || !branches.length"
          aria-label="PR／MR 目標分支"
        >
          <option disabled value="">{{ loading ? '正在讀取分支…' : '選擇目標分支' }}</option>
          <option v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</option>
        </select></label
      >
    </div>
    <button
      v-if="failed"
      class="soft-button"
      type="button"
      :disabled="busy || loading"
      @click="loadBranches"
    >
      重試讀取分支
    </button>
    <p v-else-if="!loading && !branches.length" class="subtle" role="status">
      所選遠端沒有可用分支。
    </p>
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
select,
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
