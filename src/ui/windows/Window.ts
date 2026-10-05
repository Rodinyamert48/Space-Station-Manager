import type { TKey } from '../../i18n/i18n';
import { t } from '../../i18n/i18n';
import { button, h, setText } from '../dom';
import { icon, type IconName } from '../icons';

export type WindowSize = 'normal' | 'wide';

/**
 * Base class for game windows. On desktop it renders as a docked side panel (or a wide centred
 * panel); on mobile the same content becomes a bottom sheet with a drag handle.
 */
export abstract class GameWindow {
  readonly el: HTMLElement;
  protected readonly body: HTMLElement;
  private readonly titleEl: HTMLElement;
  private dragStart: { y: number; t: number } | null = null;
  isOpen = false;
  onRequestClose: (() => void) | null = null;

  constructor(
    readonly id: string,
    private readonly titleKey: TKey,
    iconName: IconName,
    readonly size: WindowSize = 'normal',
  ) {
    this.titleEl = h('div', { class: 'win-title', text: t(titleKey) });
    const handle = h('div', { class: 'sheet-handle' });
    const header = h(
      'div',
      { class: 'win-header' },
      h('div', { class: 'win-icon' }, icon(iconName)),
      this.titleEl,
      button(icon('close'), () => this.onRequestClose?.(), 'icon-btn win-close', 'Close'),
    );
    this.body = h('div', { class: 'win-body' });
    this.el = h('section', { class: `window window-${size}`, dataset: { window: id } }, handle, header, this.body);
    this.installSwipeToClose(handle, header);
  }

  private installSwipeToClose(...targets: HTMLElement[]): void {
    for (const target of targets) {
      target.addEventListener('pointerdown', (e) => {
        if (document.getElementById('ui')?.dataset.layout !== 'mobile') return;
        this.dragStart = { y: e.clientY, t: performance.now() };
        target.setPointerCapture(e.pointerId);
      });
      target.addEventListener('pointermove', (e) => {
        if (!this.dragStart) return;
        const dy = Math.max(0, e.clientY - this.dragStart.y);
        this.el.style.transform = `translateY(${dy}px)`;
      });
      const end = (e: PointerEvent): void => {
        if (!this.dragStart) return;
        const dy = e.clientY - this.dragStart.y;
        const velocity = dy / Math.max(1, performance.now() - this.dragStart.t);
        this.dragStart = null;
        this.el.style.transform = '';
        if (dy > 120 || velocity > 0.8) this.onRequestClose?.();
      };
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', end);
    }
  }

  /** Re-translates static texts after a language change. */
  relabel(): void {
    setText(this.titleEl, t(this.titleKey));
    this.rebuild();
  }

  /** Builds the full window content. Called on open and after structural changes. */
  abstract rebuild(): void;

  /** Lightweight periodic refresh of live values while open. */
  refresh(): void {}

  open(): void {
    this.isOpen = true;
    this.rebuild();
  }

  close(): void {
    this.isOpen = false;
  }

  dispose(): void {
    this.el.remove();
  }
}
