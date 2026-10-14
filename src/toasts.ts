import { ref } from 'vue';

export type ToastDismissal = 'manual' | 'auto';
export interface ToastMessage {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  dismissal: ToastDismissal;
  duration: number;
}

export function useToasts(duration: () => number) {
  const messages = ref<ToastMessage[]>([]);
  let nextId = 0;
  function show(message: string, kind: ToastMessage['kind'], dismissal: ToastDismissal) {
    if (!message) return;
    // 同一個尚未關閉的錯誤不重複堆疊。
    if (
      dismissal === 'manual' &&
      messages.value.some(
        (toast) =>
          toast.message === message && toast.kind === kind && toast.dismissal === dismissal,
      )
    )
      return;
    messages.value.push({ id: ++nextId, message, kind, dismissal, duration: duration() });
  }
  return {
    messages,
    dismiss: (id: number) => {
      messages.value = messages.value.filter((toast) => toast.id !== id);
    },
    error: (message: string) => show(message, 'error', 'manual'),
    success: (message: string) => show(message, 'success', 'auto'),
    info: (message: string) => show(message, 'info', 'auto'),
    show,
  };
}
