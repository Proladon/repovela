import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { native } from './api';

type Phase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed';

export function useAppUpdate(canInstall: () => boolean = () => true) {
  const state = reactive({
    version: __APP_VERSION__,
    phase: 'idle' as Phase,
    latestVersion: '',
    notes: '',
    downloadedBytes: 0,
    totalBytes: undefined as number | undefined,
    error: '',
    versionError: '',
  });
  let update: Update | null = null;
  let disposed = false;
  const busy = computed(() => ['checking', 'downloading', 'installing'].includes(state.phase));
  const progress = computed(() =>
    state.totalBytes
      ? Math.min(100, Math.floor((state.downloadedBytes / state.totalBytes) * 100))
      : undefined,
  );
  const installationBlocked = computed(() => !canInstall());

  async function releaseUpdate() {
    const previous = update;
    update = null;
    await previous?.close();
  }

  async function checkForUpdates() {
    if (!native || busy.value || ['downloaded', 'installed'].includes(state.phase)) return;
    state.phase = 'checking';
    state.error = '';
    state.latestVersion = '';
    state.notes = '';
    state.downloadedBytes = 0;
    state.totalBytes = undefined;
    try {
      await releaseUpdate();
      const result = await check({ timeout: 30_000 });
      if (disposed) {
        await result?.close();
        return;
      }
      update = result;
      if (result) {
        state.latestVersion = result.version;
        state.notes = result.body ?? '';
        state.phase = 'available';
      } else {
        state.phase = 'current';
      }
    } catch (error) {
      state.phase = 'idle';
      state.error = `無法檢查更新，請確認網路連線或稍後重試。更新來源尚未發布時也會出現此訊息。\n${String(error)}`;
    }
  }

  function downloadProgress(event: DownloadEvent) {
    if (event.event === 'Started') {
      state.downloadedBytes = 0;
      state.totalBytes = event.data.contentLength;
    } else if (event.event === 'Progress') {
      state.downloadedBytes += event.data.chunkLength;
    }
    // Finished 只表示網路傳輸完成；簽章驗證成功後才可安裝。
  }

  async function downloadUpdate() {
    if (!update || state.phase !== 'available') return;
    state.phase = 'downloading';
    state.error = '';
    state.downloadedBytes = 0;
    state.totalBytes = undefined;
    try {
      await update.download(downloadProgress, { timeout: 300_000 });
      state.phase = 'downloaded';
    } catch (error) {
      state.phase = 'available';
      state.error = `下載或驗證更新失敗，可重新下載。\n${String(error)}`;
    } finally {
      if (disposed) await releaseUpdate().catch(() => {});
    }
  }

  async function restartApp() {
    if (state.phase !== 'installed' || installationBlocked.value) return;
    state.error = '';
    state.phase = 'installing';
    try {
      await relaunch();
    } catch (error) {
      state.phase = 'installed';
      state.error = `更新已安裝，但無法重新啟動。請重試或手動重開 Repovela。\n${String(error)}`;
    }
  }

  async function installUpdate() {
    if (!update || state.phase !== 'downloaded' || installationBlocked.value) return;
    state.phase = 'installing';
    state.error = '';
    try {
      await invoke('prepare_update_install');
      await update.install({ restartAfterInstall: true });
    } catch (error) {
      state.phase = 'downloaded';
      state.error = `安裝更新失敗，可重試安裝。\n${String(error)}`;
      return;
    }
    // Windows 的安裝器會結束並重開程式；其他平台在安裝完成後重啟。
    state.phase = 'installed';
    await restartApp();
  }

  onMounted(async () => {
    if (!native) return;
    try {
      state.version = await getVersion();
    } catch {
      state.versionError = '無法讀取已安裝版本，以下顯示建置版本。';
    }
  });
  onUnmounted(() => {
    disposed = true;
    if (!busy.value) void releaseUpdate().catch(() => {});
  });

  return {
    state,
    busy,
    progress,
    installationBlocked,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    restartApp,
  };
}

export type AppUpdate = ReturnType<typeof useAppUpdate>;
