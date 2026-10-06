<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowLeftRight,
  CloudDownload,
  Download,
  GitBranch,
  GitBranchPlus,
  Upload,
  Play,
  Undo2,
  Archive,
} from 'lucide-vue-next';
import { native } from './api';
import { useContextMenu } from './contextMenu';
import type { GitRequest, Snapshot } from './types';

const props = defineProps<{
  snapshot: Snapshot;
  busy: boolean;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ stash: [] }>();
const branchesOpen = ref(false);
const newBranch = ref('');
const selectedBranch = ref('');
const contextMenu = useContextMenu();
const state = computed(() => props.snapshot.operationState ?? 'clean');
const stateName = computed(
  () =>
    ({
      merge: 'Merge',
      cherryPick: 'Cherry-pick',
      revert: 'Revert',
      rebase: 'Rebase',
      clean: '',
      unsupported: 'Git 操作',
    })[state.value],
);
function openBranches() {
  branchesOpen.value = true;
}
defineExpose({ openBranches });
function openMenu(event: MouseEvent) {
  contextMenu.open(event, [
    {
      label: 'Fetch',
      icon: CloudDownload,
      disabled: !native || props.busy,
      run: () => props.operate({ operation: 'fetch' }),
    },
    {
      label: 'Pull',
      icon: Download,
      disabled: !native || props.busy || !props.snapshot.upstream,
      run: () => props.operate({ operation: 'pull' }),
    },
    {
      label: 'Push',
      icon: Upload,
      disabled: !native || props.busy || !props.snapshot.headOid,
      run: () => props.operate({ operation: 'push' }),
    },
    { label: '分支操作', icon: GitBranch, disabled: !native || props.busy, run: openBranches },
    { label: 'Stash', icon: Archive, disabled: !native || props.busy, run: () => emit('stash') },
  ]);
}
async function createBranch() {
  if (await props.operate({ operation: 'createBranch', branch: newBranch.value.trim() })) {
    newBranch.value = '';
    branchesOpen.value = false;
  }
}
async function switchBranch() {
  if (await props.operate({ operation: 'switchBranch', branch: selectedBranch.value })) {
    selectedBranch.value = '';
    branchesOpen.value = false;
  }
}
</script>

<template>
  <div
    class="git-actions"
    aria-label="Git 操作"
    :title="!native ? '桌面版可執行 Git 操作' : undefined"
    @keydown.esc.stop="branchesOpen = false"
    @contextmenu="openMenu"
  >
    <button
      class="soft-button icon-button git-icon-action"
      :disabled="!native || busy"
      aria-label="Fetch"
      title="Fetch：取得所有遠端的最新紀錄"
      @click="operate({ operation: 'fetch' })"
    >
      <CloudDownload :size="16" aria-hidden="true" />
    </button>
    <button
      class="soft-button icon-button git-icon-action"
      :disabled="!native || busy || !snapshot.upstream"
      aria-label="Pull"
      title="Pull：以快轉方式拉取目前分支的上游"
      @click="operate({ operation: 'pull' })"
    >
      <Download :size="16" aria-hidden="true" />
    </button>
    <button
      class="soft-button icon-button git-icon-action"
      :disabled="!native || busy || !snapshot.headOid"
      aria-label="Push"
      title="Push：推送目前分支；沒有上游時推送至 origin 並設定上游"
      @click="operate({ operation: 'push' })"
    >
      <Upload :size="16" aria-hidden="true" />
    </button>
    <button
      class="soft-button icon-button git-icon-action"
      :disabled="!native || busy"
      aria-label="Stash"
      :title="`Stash：儲存或還原工作區變更（${snapshot.stashes?.length ?? 0} 筆）`"
      @click="emit('stash')"
    >
      <Archive :size="16" aria-hidden="true" />
    </button>
    <div class="git-branch-picker">
      <button
        class="soft-button icon-button git-icon-action"
        title="分支操作"
        aria-label="分支操作"
        :disabled="!native || busy"
        :aria-expanded="branchesOpen"
        @click="branchesOpen = !branchesOpen"
      >
        <GitBranch :size="16" aria-hidden="true" />
      </button>
      <template v-if="branchesOpen">
        <div class="dismiss" @click="branchesOpen = false" />
        <div class="popover git-branch-menu" @keydown.esc.stop="branchesOpen = false">
          <form @submit.prevent="switchBranch">
            <label for="switch-branch">切換本機分支</label>
            <select id="switch-branch" v-model="selectedBranch" :disabled="busy">
              <option value="" disabled>選擇分支</option>
              <option
                v-for="branch in snapshot.branches.filter((b) => !b.isRemote && !b.isHead)"
                :key="branch.name"
                :value="branch.name"
              >
                {{ branch.name }}
              </option>
            </select>
            <button
              class="soft-button icon-button git-icon-action"
              type="submit"
              title="切換分支"
              aria-label="切換分支"
              :disabled="busy || !selectedBranch"
            >
              <ArrowLeftRight :size="16" aria-hidden="true" />
            </button>
          </form>
          <form @submit.prevent="createBranch">
            <label for="new-branch">建立並切換分支</label>
            <input id="new-branch" v-model="newBranch" placeholder="新分支名稱" :disabled="busy" />
            <button
              class="soft-button icon-button git-icon-action"
              type="submit"
              title="建立並切換分支"
              aria-label="建立分支"
              :disabled="busy || !newBranch.trim()"
            >
              <GitBranchPlus :size="16" aria-hidden="true" />
            </button>
          </form>
        </div>
      </template>
    </div>
    <Teleport defer to="#git-operation-status">
      <div v-if="state !== 'clean'" class="operation-state" role="status">
        <span>{{ stateName }} 進行中，請解決衝突並暫存檔案。</span>
        <template v-if="state !== 'unsupported'">
          <button
            class="soft-button icon-button git-icon-action"
            :disabled="!native || busy || snapshot.workingFiles.some((f) => f.conflict)"
            title="繼續目前操作"
            aria-label="繼續目前操作"
            @click="operate({ operation: 'continueOperation' })"
          >
            <Play :size="16" />
          </button>
          <button
            class="soft-button icon-button git-icon-action"
            :disabled="!native || busy"
            title="中止目前操作，還原操作前的狀態"
            aria-label="中止目前操作"
            @click="operate({ operation: 'abortOperation' })"
          >
            <Undo2 :size="16" />
          </button>
        </template>
        <span v-else>請先在 Git 中完成此操作。</span>
      </div>
    </Teleport>
  </div>
</template>
