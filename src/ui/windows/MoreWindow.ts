import { t } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h } from '../dom';
import { icon, type IconName } from '../icons';
import { GameWindow } from './Window';

export interface MoreEntry {
  id: string;
  icon: IconName;
  label: () => string;
  action: () => void;
}

/** Mobile overflow menu for secondary windows. */
export class MoreWindow extends GameWindow {
  constructor(
    private readonly ctx: UIContext,
    private readonly entries: MoreEntry[],
  ) {
    super('more', 'hud.more', 'menu');
  }

  rebuild(): void {
    this.body.replaceChildren(
      h(
        'div',
        { class: 'more-grid' },
        ...this.entries.map((e) =>
          button(h('span', { class: 'more-inner' }, icon(e.icon), h('span', { text: e.label() })), () => {
            this.ctx.playSound('click');
            e.action();
          }, 'more-btn'),
        ),
      ),
      h('p', { class: 'muted small', text: t('app.title') }),
    );
  }
}
