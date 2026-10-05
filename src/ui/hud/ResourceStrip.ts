import { formatCompact } from '../../core/math';
import { RESOURCES, type ResourceId } from '../../data/resources';
import type { UIContext } from '../context';
import { h, setText, toggleClass } from '../dom';
import { icon } from '../icons';

const STRIP: ResourceId[] = ['energy', 'oxygen', 'water', 'food', 'metal', 'fuel'];

/** Mobile-only compact resource chips; tapping opens the full resource sheet. */
export class ResourceStrip {
  readonly el: HTMLElement;
  private readonly chips = new Map<ResourceId, { chip: HTMLElement; value: HTMLElement }>();

  constructor(
    private readonly ctx: UIContext,
    onOpen: () => void,
  ) {
    this.el = h('button', { class: 'res-strip panel', attrs: { type: 'button' } });
    for (const id of STRIP) {
      const value = h('span', { class: 'chip-value num' });
      const chip = h('span', { class: 'chip', dataset: { res: id }, style: { '--res-color': RESOURCES[id].color } }, icon(id), value);
      this.chips.set(id, { chip, value });
      this.el.append(chip);
    }
    this.el.addEventListener('click', () => {
      ctx.playSound('click');
      onOpen();
    });
  }

  refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    for (const [id, { chip, value }] of this.chips) {
      setText(value, formatCompact(game.state.resources[id]));
      const net = game.resources.netRate(id);
      toggleClass(chip, 'down', net < -0.05);
      toggleClass(chip, 'critical', game.resources.hoursLeft(id) < 12);
    }
  }
}
