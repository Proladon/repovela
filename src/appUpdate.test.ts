// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { useAppUpdate, type AppUpdate } from './appUpdate';
import UpdateSettings from './UpdateSettings.vue';

const mocks = vi.hoisted(() => ({
  native: true,
  version: vi.fn(),
  check: vi.fn(),
  invoke: vi.fn(),
  relaunch: vi.fn(),
}));
vi.mock('./api', () => ({
  get native() {
    return mocks.native;
  },
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: mocks.version }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

function release() {
  return {
    version: '0.2.0',
    body: '<script>不應執行</script>\n新增更新功能',
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  let updater!: AppUpdate;
  const blocked = ref(false);
  const open = ref(true);
  const wrapper = render(
    defineComponent({
      setup() {
        updater = useAppUpdate(() => !blocked.value);
        return () => (open.value ? h(UpdateSettings, { updater }) : null);
      },
    }),
  );
  return { updater, blocked, open, ...wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.native = true;
  mocks.version.mockResolvedValue('0.1.7');
  mocks.check.mockResolvedValue(null);
  mocks.invoke.mockResolvedValue(undefined);
  mocks.relaunch.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('版本與更新', () => {
  it('讀取原生版本，手動檢查後才顯示最新版本', async () => {
    setup();
    await screen.findByText('v0.1.7');
    expect(mocks.check).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: '檢查更新' }));
    await screen.findByText('目前已是最新版本。');
    expect(mocks.check).toHaveBeenCalledWith({ timeout: 30_000 });
    expect(screen.queryByRole('button', { name: '下載更新' })).toBeNull();
  });

  it('檢查失敗可重試，檢查期間阻止重複請求', async () => {
    const pending = deferred<Update | null>();
    mocks.check.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(null);
    const { updater } = setup();
    await fireEvent.click(screen.getByRole('button', { name: '檢查更新' }));
    expect(screen.getByRole('button', { name: '檢查中…' }).hasAttribute('disabled')).toBe(true);
    await updater.checkForUpdates();
    expect(mocks.check).toHaveBeenCalledTimes(1);
    pending.reject('offline');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('offline'));
    expect(screen.queryByText('目前已是最新版本。')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '檢查更新' }));
    await screen.findByText('目前已是最新版本。');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('下載進度與下載內容在關閉並重開設定後保留，版本說明以純文字顯示', async () => {
    const update = release();
    const pending = deferred<void>();
    update.download.mockReturnValue(pending.promise);
    mocks.check.mockResolvedValue(update);
    const { updater, open, container } = setup();
    await updater.checkForUpdates();
    await fireEvent.click(await screen.findByRole('button', { name: '下載更新' }));
    const progress = update.download.mock.calls[0][0] as unknown as (event: DownloadEvent) => void;
    progress({ event: 'Started', data: { contentLength: 4 * 1024 * 1024 } });
    progress({ event: 'Progress', data: { chunkLength: 1024 * 1024 } });
    await flushPromises();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('25');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/不應執行/).textContent).toContain('<script>');
    open.value = false;
    await flushPromises();
    progress({ event: 'Progress', data: { chunkLength: 3 * 1024 * 1024 } });
    progress({ event: 'Finished' });
    expect(updater.state.phase).toBe('downloading');
    pending.resolve();
    await flushPromises();
    open.value = true;
    await screen.findByText('v0.2.0 已下載並通過驗證，可以安裝。');
    expect(update.close).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '檢查更新' }).hasAttribute('disabled')).toBe(true);
  });

  it('沒有 Content-Length 時顯示不定進度；驗證失敗不能安裝，可重新下載', async () => {
    const update = release();
    const pending = deferred<void>();
    update.download.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(undefined);
    mocks.check.mockResolvedValue(update);
    const { updater } = setup();
    await updater.checkForUpdates();
    await fireEvent.click(await screen.findByRole('button', { name: '下載更新' }));
    const progress = update.download.mock.calls[0][0] as unknown as (event: DownloadEvent) => void;
    progress({ event: 'Started', data: {} });
    progress({ event: 'Progress', data: { chunkLength: 1024 * 1024 } });
    progress({ event: 'Finished' });
    await flushPromises();
    expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
    expect(screen.getByText('1 MB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '安裝更新並重新啟動' })).toBeNull();
    pending.reject('signature mismatch');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('signature mismatch'),
    );
    await updater.installUpdate();
    expect(update.install).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: '下載更新' }));
    await screen.findByRole('button', { name: '安裝更新並重新啟動' });
    expect(updater.state.downloadedBytes).toBe(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('等待 Git 操作完成，安裝前清理終端機並指定重新啟動', async () => {
    const update = release();
    mocks.check.mockResolvedValue(update);
    const { updater, blocked } = setup();
    await updater.checkForUpdates();
    await updater.downloadUpdate();
    blocked.value = true;
    await flushPromises();
    expect(
      screen.getByRole('button', { name: '安裝更新並重新啟動' }).hasAttribute('disabled'),
    ).toBe(true);
    await updater.installUpdate();
    expect(update.install).not.toHaveBeenCalled();
    blocked.value = false;
    await flushPromises();
    await fireEvent.click(screen.getByRole('button', { name: '安裝更新並重新啟動' }));
    await flushPromises();
    expect(mocks.invoke).toHaveBeenCalledWith('prepare_update_install');
    expect(update.install).toHaveBeenCalledWith({ restartAfterInstall: true });
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      update.install.mock.invocationCallOrder[0],
    );
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it('安裝失敗可重試；重新啟動失敗時只重試重新啟動', async () => {
    const update = release();
    update.install.mockRejectedValueOnce('installer failed').mockResolvedValueOnce(undefined);
    mocks.relaunch.mockRejectedValueOnce('restart failed').mockResolvedValueOnce(undefined);
    mocks.check.mockResolvedValue(update);
    const { updater } = setup();
    await updater.checkForUpdates();
    await updater.downloadUpdate();
    await updater.installUpdate();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('installer failed'),
    );
    expect(updater.state.phase).toBe('downloaded');
    expect(mocks.relaunch).not.toHaveBeenCalled();
    await updater.installUpdate();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('restart failed'));
    expect(updater.state.phase).toBe('installed');
    await fireEvent.click(screen.getByRole('button', { name: '重新啟動 Repovela' }));
    await flushPromises();
    expect(update.install).toHaveBeenCalledTimes(2);
    expect(update.download).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).toHaveBeenCalledTimes(2);
  });

  it('更換更新與結束應用時釋放後端資源', async () => {
    const first = release();
    const second = release();
    mocks.check.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { updater, unmount } = setup();
    await updater.checkForUpdates();
    await updater.checkForUpdates();
    expect(first.close).toHaveBeenCalledTimes(1);
    unmount();
    await flushPromises();
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it('檢查尚未完成就結束應用，也會釋放之後取得的更新', async () => {
    const update = release();
    const pending = deferred<Update | null>();
    mocks.check.mockReturnValue(pending.promise);
    const { updater, unmount } = setup();
    const checking = updater.checkForUpdates();
    await flushPromises();
    unmount();
    pending.resolve(update as unknown as Update);
    await checking;
    expect(update.close).toHaveBeenCalledTimes(1);
  });

  it('瀏覽器預覽只顯示建置版本並停用更新', async () => {
    mocks.native = false;
    const { updater } = setup();
    await screen.findByText(`v${__APP_VERSION__}`);
    expect(screen.getByRole('button', { name: '檢查更新' }).hasAttribute('disabled')).toBe(true);
    await updater.checkForUpdates();
    expect(mocks.version).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
