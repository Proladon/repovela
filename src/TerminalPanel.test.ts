// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import TerminalPanel from './TerminalPanel.vue';
import type { TerminalEvent, TerminalInfo } from './terminalApi';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  close: vi.fn(),
  input: undefined as ((data: string) => void) | undefined,
  output: vi.fn(),
}));
vi.mock('./terminalApi', () => ({ terminalApi: mocks }));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {};
    textarea = document.createElement('textarea');
    open() {}
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onResize() {}
    reset() {}
    focus() {}
    dispose() {}
    clear() {}
    onData(callback: (data: string) => void) {
      mocks.input = callback;
    }
    write(data: Uint8Array) {
      mocks.output(data);
    }
    writeln() {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
const props = { path: '/project', active: true, fontFamily: 'monospace', fontSize: 13 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.open.mockResolvedValue({ id: 1, shell: 'cmd.exe', windows: true });
  mocks.write.mockResolvedValue(undefined);
  mocks.resize.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('啟動尚未完成就關閉面板，仍會清理稍後建立的 shell', async () => {
  const opening = deferred<TerminalInfo>();
  mocks.open.mockReturnValue(opening.promise);
  const view = render(TerminalPanel, { props });
  await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  view.unmount();
  opening.resolve({ id: 7, shell: 'cmd.exe', windows: true });
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(7));
});

it('保留啟動中的 PTY 回覆，並依序寫入後續輸入', async () => {
  const opening = deferred<TerminalInfo>();
  mocks.open.mockReturnValue(opening.promise);
  render(TerminalPanel, { props });
  await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  mocks.input?.('\x1b[1;1R');
  opening.resolve({ id: 1, shell: 'cmd.exe', windows: true });
  await screen.findByText('cmd.exe');
  await waitFor(() => expect(mocks.write).toHaveBeenCalledWith(1, '\x1b[1;1R'));
  const writing = deferred<void>();
  mocks.write.mockReturnValueOnce(writing.promise);
  mocks.input?.('first');
  mocks.input?.('second');
  await flushPromises();
  expect(mocks.write).toHaveBeenLastCalledWith(1, 'first');
  writing.resolve();
  await waitFor(() => expect(mocks.write).toHaveBeenLastCalledWith(1, 'second'));
});

it('重新啟動後忽略舊 shell 的輸出與結束事件', async () => {
  render(TerminalPanel, { props });
  await screen.findByText('cmd.exe');
  const oldReceive = mocks.open.mock.calls[0]![3] as (event: TerminalEvent) => void;
  mocks.open.mockResolvedValueOnce({ id: 2, shell: 'new-shell', windows: true });
  await fireEvent.click(screen.getByRole('button', { name: '重新啟動終端機' }));
  await screen.findByText('new-shell');
  expect(mocks.close).toHaveBeenCalledWith(1);
  oldReceive({ event: 'data', data: [97] });
  oldReceive({ event: 'exit', code: 1 });
  await flushPromises();
  expect(mocks.output).not.toHaveBeenCalled();
  expect(screen.getByText('new-shell')).toBeTruthy();
  cleanup();
  expect(mocks.close).toHaveBeenCalledWith(2);
});
