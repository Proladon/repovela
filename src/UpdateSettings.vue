<script setup lang="ts">
import { Download, RefreshCw } from 'lucide-vue-next';
import { computed } from 'vue';
import { native } from './api';
import type { AppUpdate } from './appUpdate';

const props = defineProps<{ updater: AppUpdate }>();
const status = computed(() => {
  const { phase, latestVersion } = props.updater.state;
  if (!native) return '檢查與安裝更新請使用桌面版。';
  switch (phase) {
    case 'checking':
      return '正在檢查更新…';
    case 'current':
      return '目前已是最新版本。';
    case 'available':
      return `有新版本 v${latestVersion} 可供下載。`;
    case 'downloading':
      return '正在下載更新…';
    case 'downloaded':
      return `v${latestVersion} 已下載並通過驗證，可以安裝。`;
    case 'installing':
      return '正在安裝更新並重新啟動…';
    case 'installed':
      return '更新已安裝，請重新啟動。';
    default:
      return '手動檢查是否有新版本。';
  }
});
function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString('zh-TW', { maximumFractionDigits: 1 })} MB`;
}
</script>

<template>
  <section class="preferences-section update-settings" aria-labelledby="preferences-updates">
    <h2 id="preferences-updates">版本與更新</h2>
    <div class="preference-row">
      <span
        ><strong>Repovela</strong
        ><small
          >目前版本 <b>v{{ updater.state.version }}</b></small
        ></span
      >
      <button
        class="soft-button"
        :disabled="
          !native || updater.busy.value || ['downloaded', 'installed'].includes(updater.state.phase)
        "
        @click="updater.checkForUpdates"
      >
        <RefreshCw :size="14" />{{ updater.state.phase === 'checking' ? '檢查中…' : '檢查更新' }}
      </button>
    </div>
    <p v-if="updater.state.versionError" class="preferences-note">
      {{ updater.state.versionError }}
    </p>
    <p class="update-status" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="updater.state.error" class="update-error" role="alert">{{ updater.state.error }}</p>
    <div v-if="updater.state.phase === 'downloading'" class="update-progress">
      <progress aria-label="更新下載進度" :value="updater.progress.value" max="100" />
      <span
        >{{ formatBytes(updater.state.downloadedBytes)
        }}<template v-if="updater.state.totalBytes">
          / {{ formatBytes(updater.state.totalBytes) }}（{{ updater.progress.value }}%）</template
        ></span
      >
    </div>
    <details v-if="updater.state.notes" class="update-notes">
      <summary>版本說明 · v{{ updater.state.latestVersion }}</summary>
      <pre>{{ updater.state.notes }}</pre>
    </details>
    <div v-if="updater.state.phase === 'available'" class="update-actions">
      <button class="soft-button" @click="updater.downloadUpdate">
        <Download :size="14" />下載更新
      </button>
    </div>
    <div
      v-if="updater.state.phase === 'downloaded' || updater.state.phase === 'installed'"
      class="update-actions"
    >
      <p class="preferences-note">
        安裝將關閉 Repovela 與所有終端機工作階段，再重新啟動。請先完成正在執行的指令。
      </p>
      <p v-if="updater.installationBlocked.value" class="preferences-note">
        請等待目前的 Git 操作完成，再安裝或重新啟動。
      </p>
      <button
        v-if="updater.state.phase === 'downloaded'"
        class="soft-button"
        :disabled="updater.installationBlocked.value"
        @click="updater.installUpdate"
      >
        安裝更新並重新啟動
      </button>
      <button
        v-else
        class="soft-button"
        :disabled="updater.installationBlocked.value"
        @click="updater.restartApp"
      >
        重新啟動 Repovela
      </button>
    </div>
  </section>
</template>
