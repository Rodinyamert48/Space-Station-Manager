import { MODULES } from '../../data/modules';
import { t, tk } from '../../i18n/i18n';
import type { BuildPreview } from '../../world/BuildController';
import type { UIContext } from '../context';
import { button, h, setText, toggleClass } from '../dom';
import { costChips } from '../format';
import { icon } from '../icons';

/** Contextual build-mode controls: selected module, cost, status, rotate/build/cancel. */
export class BuildBar {
  readonly el: HTMLElement;
  private readonly name: HTMLElement;
  private readonly costWrap: HTMLElement;
  private readonly status: HTMLElement;
  private readonly buildBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  private preview: BuildPreview | null = null;

  constructor(
    private readonly ctx: UIContext,
    actions: { rotate: () => void; confirm: () => void; cancel: () => void },
  ) {
    this.name = h('div', { class: 'bb-name' });
    this.costWrap = h('div', { class: 'bb-cost' });
    this.status = h('div', { class: 'bb-status' });
    this.rotateBtn = button(h('span', { class: 'btn-inner' }, icon('rotate'), h('span', { class: 'btn-text', text: t('build.rotate') })), actions.rotate, 'btn');
    this.buildBtn = button(h('span', { class: 'btn-inner' }, icon('check'), h('span', { class: 'btn-text', text: t('build.confirm') })), actions.confirm, 'btn primary');
    const cancel = button(icon('close'), actions.cancel, 'icon-btn bb-cancel', t('build.cancel'));
    this.el = h(
      'div',
      { class: 'build-bar panel hidden' },
      h('div', { class: 'bb-info' }, h('div', { class: 'bb-top' }, this.name, this.costWrap), this.status),
      h('div', { class: 'bb-actions' }, this.rotateBtn, this.buildBtn, cancel),
    );
  }

  update(preview: BuildPreview | null): void {
    this.preview = preview;
    toggleClass(this.el, 'hidden', !preview);
    if (!preview) return;
    const game = this.ctx.game();
    setText(this.name, tk(`module.${preview.type}.name`));
    this.costWrap.replaceChildren(costChips(MODULES[preview.type].cost, game));
    let status: string;
    let cls = '';
    if (preview.snapCount === 0) {
      status = t('build.noSpot');
      cls = 'error';
    } else if (!preview.cell) status = t('build.pickPoint');
    else if (preview.error) {
      status = tk(`build.error.${preview.error}`);
      cls = 'error';
    } else {
      status = matchMedia('(pointer: coarse)').matches ? t('build.tapAgain') : `${t('build.ready')} · ${t('build.keys')}`;
      cls = 'ok';
    }
    setText(this.status, status);
    this.status.className = `bb-status ${cls}`;
    this.buildBtn.disabled = !preview.cell || preview.error !== null;
    this.rotateBtn.disabled = !preview.cell;
  }

  refresh(): void {
    if (this.preview) this.update(this.preview);
  }
}
