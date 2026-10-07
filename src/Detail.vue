<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import {
  Archive,
  Check,
  ChevronLeft,
  Copy,
  FileCode2,
  Files,
  GitCommitHorizontal,
  ListMinus,
  ListPlus,
  Minus,
  Plus,
  X,
} from 'lucide-vue-next';
import { api, native } from './api';
import { useContextMenu } from './contextMenu';
import type { CommitDetail, FilePatch, GitRequest, Snapshot } from './types';

const props = defineProps<{
  path: string;
  selection: string | null;
  snapshot: Snapshot;
  revision: number;
  busy: boolean;
  operate: (request: GitRequest) => Promise<boolean>;
}>();
const emit = defineEmits<{ close: []; stash: [] }>();
const detail = shallowRef<{ key: string; data?: CommitDetail; error?: string }>({ key: '' });
const file = ref<{ path: string; area: string } | null>(null);
const patch = shallowRef<{ key: string; data?: FilePatch; error?: string }>({ key: '' });
const copied = ref(false);
const commitMessage = ref('');
const contextMenu = useContextMenu();
function openFileMenu(event: MouseEvent, path: string, area: string) {
  const staged = area === 'staged';
  contextMenu.open(event, [
    {
      label: '查看檔案差異',
      icon: FileCode2,
      run: () => {
        file.value = { path, area };
      },
    },
    {
      label: staged ? '取消暫存' : '暫存',
      icon: staged ? Minus : Plus,
      disabled:
        !native ||
        props.busy ||
        !props.snapshot.workingFiles.some(
          (f) => f.path === path && (staged ? f.staged : f.unstaged),
        ),
      run: () => props.operate({ operation: staged ? 'unstage' : 'stage', files: [path] }),
    },
    {
      label: 'Stash 工作區…',
      icon: Archive,
      disabled: !native || props.busy,
      separatorBefore: true,
      run: () => emit('stash'),
    },
  ]);
}
function openWorktreeMenu(event: MouseEvent) {
  contextMenu.open(event, [
    ...workingAreas.value.map(({ area, files }) => ({
      label: area === 'staged' ? '全部取消暫存' : '全部暫存',
      icon: area === 'staged' ? ListMinus : ListPlus,
      disabled: !native || props.busy || !files.length,
      run: () =>
        props.operate({
          operation: area === 'staged' ? 'unstage' : 'stage',
          files: files.map((f) => f.path),
        }),
    })),
    {
      label: '提交已暫存變更',
      icon: GitCommitHorizontal,
      disabled: !native || props.busy || !canCommit.value || !commitMessage.value.trim(),
      run: submitCommit,
    },
    {
      label: 'Stash',
      icon: Archive,
      disabled: !native || props.busy,
      separatorBefore: true,
      run: () => emit('stash'),
    },
  ]);
}
const canCommit = computed(
  () =>
    props.snapshot.workingFiles.some((f) => f.staged) &&
    !props.snapshot.workingFiles.some((f) => f.conflict),
);
async function submitCommit() {
  if (await props.operate({ operation: 'commit', message: commitMessage.value }))
    commitMessage.value = '';
}
const worktree = computed(() => props.selection === 'worktree');
const detailKey = computed(() => `${props.path}:${props.selection}`);
const patchKey = computed(
  () => `${detailKey.value}:${file.value?.area}:${file.value?.path}:${props.revision}`,
);
const current = computed<{ key: string; data?: CommitDetail; error?: string }>(() =>
  detail.value.key === detailKey.value ? detail.value : { key: detailKey.value },
);
const currentPatch = computed<{ key: string; data?: FilePatch; error?: string }>(() =>
  patch.value.key === patchKey.value ? patch.value : { key: patchKey.value },
);
const commit = computed(() => current.value.data?.commit);
const workingAreas = computed(() =>
  (['staged', 'unstaged'] as const).map((area) => ({
    area,
    files: props.snapshot.workingFiles.filter((f) => f[area]),
  })),
);

watch(
  detailKey,
  (_key, _previous, onCleanup) => {
    let live = true;
    onCleanup(() => {
      live = false;
    });
    file.value = null;
    copied.value = false;
    if (props.selection && !worktree.value) {
      const requestKey = detailKey.value;
      detail.value = { key: requestKey };
      api
        .commit(props.path, props.selection)
        .then((data) => {
          if (live) detail.value = { key: requestKey, data };
        })
        .catch((error) => {
          if (live) detail.value = { key: requestKey, error: String(error) };
        });
    }
  },
  { immediate: true, flush: 'sync' },
);

watch(
  patchKey,
  (_key, _previous, onCleanup) => {
    if (!file.value || !props.selection) return;
    let live = true;
    onCleanup(() => {
      live = false;
    });
    const requestKey = patchKey.value;
    patch.value = { key: requestKey };
    api
      .patch(props.path, worktree.value ? null : props.selection, file.value.path, file.value.area)
      .then((data) => {
        if (live) patch.value = { key: requestKey, data };
      })
      .catch((error) => {
        if (live) patch.value = { key: requestKey, error: String(error) };
      });
  },
  { flush: 'sync' },
);

async function copy() {
  if (!commit.value) return;
  try {
    await navigator.clipboard.writeText(commit.value.oid);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="detail-panel" aria-label="詳細資訊">
    <div class="panel-heading">
      <span>{{ file ? '檔案差異' : worktree ? '工作區變更' : 'Commit 詳細資訊' }}</span>
      <span class="subtle">{{ worktree ? '工作區' : commit?.shortId }}</span>
      <button
        class="icon-button"
        title="關閉詳細資訊"
        aria-label="關閉詳細資訊"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>
    <template v-if="!selection">
      <div class="detail-empty">
        <GitCommitHorizontal :size="36" />
        <p>{{ '選擇一筆 commit，查看詳細資訊。' }}</p>
      </div> </template
    ><template v-else>
      <template v-if="file"
        ><div
          class="diff-heading"
          @contextmenu="worktree && file ? openFileMenu($event, file.path, file.area) : undefined"
        >
          <button
            class="icon-button"
            title="返回檔案清單"
            aria-label="返回檔案清單"
            @click="() => (file = null)"
          >
            <ChevronLeft :size="17" /></button
          ><FileCode2 :size="15" /><span :title="file.path">{{ file.path }}</span
          ><small>{{
            file.area === 'staged' ? '已暫存' : file.area === 'unstaged' ? '未暫存' : 'commit'
          }}</small>
        </div>
        <template v-if="currentPatch.error"
          ><div class="inline-error" role="alert">{{ currentPatch.error }}</div></template
        ><template v-else
          ><template v-if="!currentPatch.data"
            ><div class="loading">{{ '讀取 diff…' }}</div></template
          ><template v-else
            ><div class="diff-scroll">
              <template v-if="currentPatch.data.binary"
                ><div class="detail-empty">
                  <Files :size="28" />
                  <p>{{ '二進位檔案無法顯示文字差異。' }}</p>
                </div></template
              ><template v-else
                ><template v-if="currentPatch.data.lines.length === 0"
                  ><p class="empty-note">
                    {{ '沒有文字差異，可能只有檔案權限或類型變更。' }}
                  </p></template
                ><template v-else
                  ><div class="diff-code">
                    <template v-for="(line, i) in currentPatch.data.lines" :key="i"
                      ><div
                        :class="`diff-line ${line.kind === '+' ? 'addition' : line.kind === '-' ? 'deletion' : line.kind === 'H' ? 'hunk' : ''}`"
                      >
                        <span class="line-number">{{ line.oldLine }}</span
                        ><span class="line-number">{{ line.newLine }}</span
                        ><span class="line-sign">{{
                          ['+', '-'].includes(line.kind) ? line.kind : ' '
                        }}</span
                        ><code>{{ line.text || ' ' }}</code>
                      </div></template
                    >
                  </div></template
                ></template
              ><template v-if="currentPatch.data.truncated"
                ><div class="notice">
                  {{ 'diff 超過顯示上限（1 MB 或 10,000 行），已截斷顯示。' }}
                </div></template
              >
            </div></template
          ></template
        ></template
      ><template v-else
        ><template v-if="worktree"
          ><div class="detail-scroll" @contextmenu="openWorktreeMenu">
            <div class="commit-summary">
              <span class="eyebrow">{{ 'WORKING TREE' }}</span>
              <h2>{{ '尚未提交的變更' }}</h2>
              <p class="subtle">{{ snapshot.workingFiles.length }}<!---->{{ ' 個檔案' }}</p>
            </div>
            <form class="commit-form" @submit.prevent="submitCommit">
              <label for="commit-message">提交訊息</label>
              <textarea
                id="commit-message"
                v-model="commitMessage"
                rows="3"
                placeholder="描述這次變更"
                :disabled="busy || !native"
              />
              <div class="commit-form-actions">
                <small class="subtle">提交只包含已暫存的變更。</small
                ><button
                  class="soft-button icon-button git-icon-action"
                  type="submit"
                  title="提交已暫存變更"
                  aria-label="提交已暫存變更"
                  :disabled="busy || !native || !canCommit || !commitMessage.trim()"
                >
                  <GitCommitHorizontal :size="17" aria-hidden="true" />
                </button>
              </div>
            </form>
            <template v-for="{ area, files } in workingAreas" :key="area"
              ><div class="file-section">
                <div class="section-heading">
                  <span>{{ area === 'staged' ? '已暫存' : '未暫存與未追蹤' }}</span
                  ><span class="count">{{ files.length }}</span>
                  <button
                    class="soft-button icon-button git-icon-action"
                    :title="area === 'staged' ? '全部取消暫存' : '全部暫存'"
                    :aria-label="area === 'staged' ? '全部取消暫存' : '全部暫存'"
                    :disabled="busy || !native || !files.length"
                    @click="
                      operate({
                        operation: area === 'staged' ? 'unstage' : 'stage',
                        files: files.map((f) => f.path),
                      })
                    "
                  >
                    <component
                      :is="area === 'staged' ? ListMinus : ListPlus"
                      :size="16"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <template v-if="files.length"
                  ><template v-for="f in files" :key="f.path"
                    ><div
                      class="working-file-actions"
                      @contextmenu="openFileMenu($event, f.path, area)"
                    >
                      <button
                        class="file-row"
                        @click="
                          () =>
                            (file = {
                              path: f.path,
                              area,
                            })
                        "
                      >
                        <FileCode2 :size="15" /><span :title="f.path">{{ f.path }}</span
                        ><small :class="f.conflict ? 'minus' : 'subtle'">{{
                          f.conflict ? '衝突' : f.untracked ? '新增' : '變更'
                        }}</small></button
                      ><button
                        class="soft-button icon-button git-icon-action"
                        :title="`${area === 'staged' ? '取消暫存' : '暫存'} ${f.path}`"
                        :disabled="busy || !native"
                        :aria-label="`${area === 'staged' ? '取消暫存' : '暫存'} ${f.path}`"
                        @click="
                          operate({
                            operation: area === 'staged' ? 'unstage' : 'stage',
                            files: [f.path],
                          })
                        "
                      >
                        <component
                          :is="area === 'staged' ? Minus : Plus"
                          :size="16"
                          aria-hidden="true"
                        />
                      </button></div></template></template
                ><template v-else
                  ><p class="empty-note">
                    {{ '沒有' }}<!---->{{ area === 'staged' ? '已暫存' : '未暫存' }}<!---->{{
                      '的變更'
                    }}
                  </p></template
                >
              </div></template
            >
          </div></template
        ><template v-else
          ><template v-if="current.error"
            ><div class="inline-error" role="alert">{{ current.error }}</div></template
          ><template v-else
            ><template v-if="!commit"
              ><div class="loading">{{ '讀取 commit…' }}</div></template
            ><template v-else
              ><div class="detail-scroll">
                <div class="commit-summary">
                  <span class="eyebrow">{{ 'COMMIT' }}</span>
                  <h2>{{ commit.message }}</h2>
                  <div class="author-line">
                    <div class="avatar">{{ commit.author.slice(0, 1).toUpperCase() }}</div>
                    <div>
                      <strong>{{ commit.author }}</strong
                      ><span class="subtle">{{
                        new Date(commit.date).toLocaleString('zh-TW')
                      }}</span>
                    </div>
                  </div>
                  <div class="metadata">
                    <span>{{ 'SHA' }}</span
                    ><button class="hash-copy" @click="copy" title="複製完整 commit hash">
                      <code>{{ commit.shortId }}</code
                      ><template v-if="copied"><Check :size="13" /></template
                      ><template v-else><Copy :size="13" /></template></button
                    ><span>{{ '父 commit' }}</span
                    ><code>{{
                      commit.parents.length
                        ? commit.parents.map((p) => p.slice(0, 7)).join(', ')
                        : '初始 commit'
                    }}</code>
                  </div>
                  <template v-if="commit.fullMessage.trim() !== commit.message.trim()">
                    <pre class="commit-body">{{
                      commit.fullMessage.split('\n').slice(1).join('\n').trim()
                    }}</pre>
                  </template>
                </div>
                <div class="file-section">
                  <div class="section-heading">
                    <span>{{ '變更的檔案' }}</span
                    ><span class="count">{{ current.data!.totalFiles }}</span
                    ><span class="diff-totals"
                      ><span class="plus"
                        >{{ '+' }}<!---->{{
                          current.data!.files.reduce((n, f) => n + f.insertions, 0)
                        }}</span
                      ><span class="minus"
                        >{{ '−' }}<!---->{{
                          current.data!.files.reduce((n, f) => n + f.deletions, 0)
                        }}</span
                      ></span
                    >
                  </div>
                  <template v-for="f in current.data!.files" :key="f.path"
                    ><button
                      class="file-row"
                      @click="
                        () =>
                          (file = {
                            path: f.path,
                            area: 'commit',
                          })
                      "
                    >
                      <span :class="`file-kind kind-${f.kind.toLowerCase()}`" :title="f.kind">{{
                        f.kind.slice(0, 1)
                      }}</span
                      ><span :title="f.path">{{ f.path }}</span
                      ><template v-if="f.binary"
                        ><small>{{ '二進位' }}</small></template
                      ><template v-else
                        ><small
                          ><span class="plus">{{ '+' }}<!---->{{ f.insertions }}</span
                          >{{ ' '
                          }}<span class="minus">{{ '−' }}<!---->{{ f.deletions }}</span></small
                        ></template
                      >
                    </button></template
                  ><template v-if="current.data!.totalFiles > current.data!.files.length"
                    ><p class="notice">{{ '僅顯示前 1,000 個變更檔案。' }}</p></template
                  ><template v-if="!current.data!.files.length"
                    ><p class="empty-note">{{ '這筆 commit 沒有檔案變更。' }}</p></template
                  ><template v-if="commit.parents.length > 1"
                    ><p class="empty-note">
                      {{ 'Merge commit 的差異以第一個父 commit 為基準。' }}
                    </p></template
                  >
                </div>
              </div></template
            ></template
          ></template
        ></template
      >
    </template>
  </section>
</template>
