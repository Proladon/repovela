import { Channel, invoke } from '@tauri-apps/api/core';

export type TerminalEvent =
  | { event: 'data'; data: number[] }
  | { event: 'exit'; code: number | null }
  | { event: 'error'; message: string };

export interface TerminalInfo {
  id: number;
  shell: string;
  windows: boolean;
}

export const terminalApi = {
  open(path: string, cols: number, rows: number, receive: (event: TerminalEvent) => void) {
    const output = new Channel<TerminalEvent>();
    output.onmessage = receive;
    return invoke<TerminalInfo>('open_terminal', { path, cols, rows, output });
  },
  write: (id: number, data: string) => invoke<void>('write_terminal', { id, data }),
  resize: (id: number, cols: number, rows: number) =>
    invoke<void>('resize_terminal', { id, cols, rows }),
  close: (id: number) => invoke<void>('close_terminal', { id }),
};
