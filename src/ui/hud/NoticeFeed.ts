import type { Notice } from '../../game/events';
import { t } from '../../i18n/i18n';
import { h } from '../dom';
import { icon, type IconName } from '../icons';

const LEVEL_ICON: Record<Notice['level'], IconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  danger: 'warning',
};

/** Scrolling notification feed (desktop) / transient toasts (mobile). */
export class NoticeFeed {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly history: Notice[] = [];

  constructor(private readonly onFocus: (notice: Notice) => void) {
    this.list = h('div', { class: 'feed-list' });
    this.el = h('div', { class: 'feed' }, this.list);
  }

  push(notice: Notice): void {
    this.history.push(notice);
    if (this.history.length > 60) this.history.shift();
    const item = h(
      'div',
      { class: `feed-item lvl-${notice.level}` },
      h('span', { class: 'feed-icon' }, icon(LEVEL_ICON[notice.level])),
      h('span', { class: 'feed-text', text: t(notice.key, notice.params) }),
    );
    if (notice.moduleId || notice.shipId) {
      item.classList.add('clickable');
      item.addEventListener('click', () => this.onFocus(notice));
    }
    this.list.append(item);
    requestAnimationFrame(() => item.classList.add('in'));
    while (this.list.children.length > 6) this.list.firstElementChild?.remove();
    const ttl = notice.level === 'danger' ? 14000 : notice.level === 'warning' ? 10000 : 7000;
    window.setTimeout(() => {
      item.classList.add('out');
      window.setTimeout(() => item.remove(), 600);
    }, ttl);
  }

  get log(): readonly Notice[] {
    return this.history;
  }

  clear(): void {
    this.history.length = 0;
    this.list.replaceChildren();
  }
}
