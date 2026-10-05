import { formatCompact } from '../../core/math';
import { RESOURCE_IDS, RESOURCES, type ResourceId } from '../../data/resources';
import { tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { h, setText } from '../dom';
import { icon } from '../icons';

interface Row {
  el: HTMLElement;
  value: HTMLElement;
}

/** Station resource readout. */
export class ResourcePanel {
  readonly el: HTMLElement;
  private readonly rows = new Map<ResourceId, Row>();

  constructor(private readonly ctx: UIContext) {
    this.el = h('div', { class: 'res-panel' });
    this.rebuild();
  }

  rebuild(): void {
    this.el.replaceChildren();
    this.rows.clear();
    for (const id of RESOURCE_IDS) {
      if (id === 'credits') continue;
      const value = h('span', { class: 'res-value' });
      const el = h(
        'div',
        { class: 'res-row', dataset: { res: id }, style: { '--res-color': RESOURCES[id].color } },
        h('span', { class: 'res-icon' }, icon(id)),
        h('span', { class: 'res-name', text: tk(`res.${id}`) }),
        value,
      );
      this.rows.set(id, { el, value });
      this.el.append(el);
    }
    this.refresh();
  }

  refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    for (const [id, row] of this.rows) setText(row.value, formatCompact(game.state.resources[id]));
  }
}
