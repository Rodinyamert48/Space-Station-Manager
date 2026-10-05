import { t } from '../i18n/i18n';
import { button, h } from './dom';
import { icon, type IconName } from './icons';

/** Modal confirmation dialog rendered in the overlay layer. */
export function confirmDialog(layer: HTMLElement, message: string, opts: { danger?: boolean; icon?: IconName } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (value: boolean): void => {
      dialog.classList.remove('open');
      window.setTimeout(() => dialog.remove(), 150);
      window.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        close(true);
      }
    };
    const dialog = h(
      'div',
      { class: 'dialog panel' },
      h('div', { class: `dialog-icon${opts.danger ? ' danger' : ''}` }, icon(opts.icon ?? (opts.danger ? 'warning' : 'info'))),
      h('p', { class: 'dialog-text', text: message }),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('info.no'), () => close(false), 'btn ghost'),
        button(t('info.yes'), () => close(true), opts.danger ? 'btn danger' : 'btn primary'),
      ),
    );
    layer.append(dialog);
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => dialog.classList.add('open'));
  });
}
