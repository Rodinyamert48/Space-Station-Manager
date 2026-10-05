import { formatCompact } from '../../core/math';
import { RESOURCES, type ResourceId } from '../../data/resources';
import type { UIContext } from '../context';
import { h, setText } from '../dom';
import { icon } from '../icons';

const STRIP: ResourceId[] = ['energy', 'oxygen', 'water', 'food', 'metal', 'fuel'];

/** Mobile-only compact resource chips; tapping opens the full resource sheet. */
export class ResourceStrip {
  readonly el: HTMLElement;
  private readonly values = new Map<ResourceId, HTMLElement>();

  constructor(
    private readonly ctx: UIContext,
    onOpen: () => void,
  ) {
    this.el = h('button', { class: 'res-strip panel', attrs: { type: 'button' } });
    for (const id of STRIP) {
      const value = h('span', { class: 'chip-value num' });
      this.values.set(id, value);
      this.el.append(h('span', { class: 'chip', dataset: { res: id }, style: { '--res-color': RESOURCES[id].color } }, icon(id), value));
    }
    this.el.addEventListener('click', () => {
      ctx.playSound('click');
      onOpen();
    });
  }

  refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    for (const [id, el] of this.values) setText(el, formatCompact(game.state.resources[id]));
  }
}
