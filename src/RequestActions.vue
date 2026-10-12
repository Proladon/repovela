<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { native } from './api';
import type { Forge, RequestAction, RequestDetail, RequestOperation } from './types';
const props = defineProps<{
  detail: RequestDetail;
  provider: Forge;
  busy: boolean;
  run: (request: RequestAction) => Promise<boolean>;
}>();
const operation = ref<RequestOperation | ''>('');
const message = ref('');
const method = ref<'merge' | 'squash' | 'rebase'>('merge');
const labels: Record<string, string> = {
  comment: '留言',
  approve: '核准',
  requestChanges: '要求修改',
  unapprove: '撤銷核准',
  merge: '合併',
  close: '關閉',
  reopen: '重新開啟',
  draft: '轉為草稿',
  ready: '標記可審核',
};
const options = computed<RequestOperation[]>(() => {
  const item = props.detail.request;
  return [
    'comment',
    ...(item.state === 'open'
      ? [
          item.draft ? 'ready' : 'draft',
          'close',
          ...(!item.draft
            ? [
                'approve',
                ...(props.provider === 'github' ? ['requestChanges'] : ['unapprove']),
                'merge',
              ]
            : []),
        ]
      : item.state === 'closed'
        ? ['reopen']
        : []),
  ] as RequestOperation[];
});
const requiredMessage = computed(() => ['comment', 'requestChanges'].includes(operation.value));
const canSubmit = computed(
  () =>
    native &&
    !props.busy &&
    !!operation.value &&
    (!requiredMessage.value || !!message.value.trim()),
);
watch(
  [
    () => props.detail.request.number,
    () => props.provider,
    () => props.detail.headOid,
    () => props.detail.request.state,
  ],
  () => {
    operation.value = '';
    message.value = '';
    method.value = 'merge';
  },
);
async function submit() {
  if (!canSubmit.value || !operation.value) return;
  const request: RequestAction = {
    operation: operation.value,
    number: props.detail.request.number,
    expectedHead: props.detail.headOid,
    expectedState: props.detail.request.state,
    expectedTarget: props.detail.request.targetBranch,
    message: message.value,
    mergeMethod: method.value,
  };
  if (await props.run(request)) {
    operation.value = '';
    message.value = '';
  }
}
</script>
<template>
  <section class="request-actions" aria-label="PR／MR 操作">
    <div class="request-action-buttons">
      <button
        v-for="action in options"
        :key="action"
        class="soft-button"
        :disabled="busy || !native"
        :aria-pressed="operation === action"
        @click="operation = action"
      >
        {{ labels[action] }}
      </button>
    </div>
    <p v-if="!native" class="subtle">PR／MR 操作請使用桌面版。</p>
    <form v-if="operation" class="request-action-form" @submit.prevent="submit">
      <strong
        >{{ labels[operation] }} {{ provider === 'github' ? '#' : '!'
        }}{{ detail.request.number }}</strong
      >
      <p v-if="operation === 'merge'" class="subtle">
        {{ detail.request.sourceBranch }} →
        {{ detail.request.targetBranch }}。執行後會合併遠端分支。
      </p>
      <p v-else-if="operation === 'close'" class="subtle">此操作會關閉遠端 PR／MR。</p>
      <p v-else-if="operation === 'approve' || operation === 'requestChanges'" class="subtle">
        針對來源提交 {{ detail.headOid.slice(0, 12) }} 送出審核。
      </p>
      <label v-if="operation === 'merge'"
        >合併方式<select v-model="method" :disabled="busy" aria-label="PR／MR 合併方式">
          <option value="merge">Merge</option>
          <option value="squash">Squash</option>
          <option v-if="provider === 'github'" value="rebase">Rebase</option>
        </select></label
      >
      <label
        v-if="
          ['comment', 'approve', 'requestChanges'].includes(operation) &&
          !(provider === 'gitlab' && operation === 'approve')
        "
        >{{ requiredMessage ? '內容（必填）' : '審核說明（選填）'
        }}<textarea
          v-model="message"
          :disabled="busy"
          :required="requiredMessage"
          aria-label="PR／MR 操作內容"
          rows="4"
          maxlength="65536"
        />
      </label>
      <div class="request-form-buttons">
        <button class="soft-button" :disabled="busy" type="button" @click="operation = ''">
          取消操作</button
        ><button class="primary-button" type="submit" :disabled="!canSubmit">
          {{ busy ? '執行中…' : `確認${labels[operation]}` }}
        </button>
      </div>
    </form>
  </section>
</template>
<style scoped>
.request-actions {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.request-action-buttons,
.request-form-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.request-action-buttons [aria-pressed='true'] {
  border-color: var(--accent);
}
.request-action-form {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #494455;
  border-radius: 6px;
  background: #11131866;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}
textarea,
select {
  font: inherit;
  color: inherit;
  border: 1px solid #494455;
  border-radius: 5px;
  background: #15171d;
  padding: 8px;
  width: 100%;
  resize: vertical;
}
textarea {
  min-height: 90px;
  max-height: 240px;
}
.request-form-buttons {
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
