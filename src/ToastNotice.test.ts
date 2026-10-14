// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import ToastNotice from './ToastNotice.vue';
import type { ToastMessage } from './toasts';
import { useToasts } from './toasts';

const toast: ToastMessage = {
  id: 1,
  message: '通知內容',
  kind: 'info',
  dismissal: 'auto',
  duration: 5,
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
}

it('倒數從設定秒數遞減，到期自動關閉且清除計時器', async () => {
  const view = render(ToastNotice, { props: { toast } });
  expect(screen.getByText('5 秒後自動關閉')).toBeTruthy();
  await advance(2000);
  expect(screen.getByText('3 秒後自動關閉')).toBeTruthy();
  expect(view.emitted('close')).toBeUndefined();
  await advance(3000);
  expect(view.emitted('close')).toEqual([[]]);
  expect(vi.getTimerCount()).toBe(0);
});

it('手動通知不建立計時器，超過倒數仍保留，點擊才關閉', async () => {
  const view = render(ToastNotice, {
    props: { toast: { ...toast, kind: 'error', dismissal: 'manual' } },
  });
  expect(screen.getByRole('alert').textContent).toContain('需手動關閉');
  expect(vi.getTimerCount()).toBe(0);
  await advance(60000);
  expect(view.emitted('close')).toBeUndefined();
  await fireEvent.click(screen.getByRole('button', { name: '關閉提示' }));
  expect(view.emitted('close')).toEqual([[]]);
});

it('滑鼠與鍵盤同時停留時維持暫停，兩者離開才恢復剩餘倒數', async () => {
  const view = render(ToastNotice, { props: { toast } });
  await advance(1200);
  const notification = screen.getByRole('status');
  const close = screen.getByRole('button', { name: '關閉提示' });
  await fireEvent.mouseEnter(notification);
  await fireEvent.focusIn(close);
  await advance(10000);
  expect(screen.getByText('已暫停・剩餘 4 秒')).toBeTruthy();
  await fireEvent.mouseLeave(notification);
  await advance(10000);
  expect(view.emitted('close')).toBeUndefined();
  await fireEvent.focusOut(close, { relatedTarget: document.body });
  await advance(3700);
  expect(view.emitted('close')).toBeUndefined();
  await advance(100);
  expect(view.emitted('close')).toEqual([[]]);
});

it('自動通知也可以提前關閉，卸載後清除倒數', async () => {
  const close = vi.fn();
  const view = render(ToastNotice, { props: { toast, onClose: close } });
  await fireEvent.click(screen.getByRole('button', { name: '關閉提示' }));
  expect(view.emitted('close')).toEqual([[]]);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await advance(10000);
  expect(close).toHaveBeenCalledOnce();
});

it('新成功訊息不覆蓋手動錯誤，各通知獨立關閉並沿用發送時的設定', () => {
  let duration = 5;
  const notices = useToasts(() => duration);
  notices.error('網路錯誤');
  notices.error('網路錯誤');
  duration = 8;
  notices.success('完成');
  notices.info('提示');
  expect(
    notices.messages.value.map(({ message, dismissal, duration }) => ({
      message,
      dismissal,
      duration,
    })),
  ).toEqual([
    { message: '網路錯誤', dismissal: 'manual', duration: 5 },
    { message: '完成', dismissal: 'auto', duration: 8 },
    { message: '提示', dismissal: 'auto', duration: 8 },
  ]);
  notices.dismiss(notices.messages.value[1].id);
  expect(notices.messages.value.map((toast) => toast.message)).toEqual(['網路錯誤', '提示']);
});
