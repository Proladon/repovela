import { inject, provide, shallowRef, type Component, type InjectionKey } from 'vue';

export interface MenuItem {
  label: string;
  icon: Component;
  disabled?: boolean;
  disabledReason?: string;
  separatorBefore?: boolean;
  run: () => unknown;
}
export interface MenuState {
  x: number;
  y: number;
  target: HTMLElement | null;
  items: MenuItem[];
}
function createContextMenu() {
  const state = shallowRef<MenuState | null>(null);
  return {
    state,
    open(event: MouseEvent, items: MenuItem[]) {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const target =
        event.target instanceof Element
          ? (event.target.closest<HTMLElement>('button, [tabindex]') ??
            (event.currentTarget instanceof HTMLElement ? event.currentTarget : null))
          : event.currentTarget instanceof HTMLElement
            ? event.currentTarget
            : null;
      const bounds = target?.getBoundingClientRect();
      const keyboard = event.clientX === 0 && event.clientY === 0;
      state.value = {
        x: keyboard ? (bounds?.left ?? 0) : event.clientX,
        y: keyboard ? (bounds?.bottom ?? 0) : event.clientY,
        target,
        items,
      };
    },
    close(restoreFocus = false) {
      const target = state.value?.target;
      state.value = null;
      if (restoreFocus && target?.isConnected) target.focus({ preventScroll: true });
    },
  };
}
const menuKey: InjectionKey<ReturnType<typeof createContextMenu>> = Symbol('contextMenu');
export function provideContextMenu() {
  const menu = createContextMenu();
  provide(menuKey, menu);
  return menu;
}
export function useContextMenu() {
  const menu = inject(menuKey);
  if (!menu) throw new Error('Context menu provider is missing');
  return menu;
}
