import { clamp, formatCompact, formatRate } from '../../core/math';
import { RESOURCE_IDS, RESOURCES, type ResourceId } from '../../data/resources';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { h, setText, toggleClass } from '../dom';
import { icon } from '../icons';

interface Row {
  el: HTMLElement;
  value: HTMLElement;
  rate: HTMLElement;
  fill: HTMLElement;
}

/** Station resource readout with storage bars and net hourly rates. */
export class ResourcePanel {
  readonly el: HTMLElement;
  private readonly rows = new Map<ResourceId, Row>();
  private powerValue!: HTMLElement;
  private powerDetail!: HTMLElement;
  private powerFill!: HTMLElement;
  private popValue!: HTMLElement;

  constructor(private readonly ctx: UIContext) {
    this.el = h('div', { class: 'res-panel' });
    this.rebuild();
  }

  rebuild(): void {
    this.el.replaceChildren();
    this.rows.clear();
    this.powerValue = h('span', { class: 'res-value' });
    this.powerDetail = h('span', { class: 'res-sub' });
    this.powerFill = h('div', { class: 'res-fill' });
    this.popValue = h('span', { class: 'res-value' });
    this.el.append(
      h('div', { class: 'panel-title' }, t('hud.resources')),
      h(
        'div',
        { class: 'res-summary' },
        h(
          'div',
          { class: 'res-card power', style: { '--res-color': RESOURCES.energy.color } },
          h('div', { class: 'res-card-head' }, icon('energy'), h('span', { class: 'res-name', text: t('res.power') }), this.powerValue),
          h('div', { class: 'res-bar' }, this.powerFill),
          this.powerDetail,
        ),
        h(
          'div',
          { class: 'res-card', style: { '--res-color': '#9fe1ff' } },
          h('div', { class: 'res-card-head' }, icon('crew'), h('span', { class: 'res-name', text: t('res.population') }), this.popValue),
        ),
      ),
    );
    for (const id of RESOURCE_IDS) {
      if (id === 'credits') continue;
      const value = h('span', { class: 'res-value' });
      const rate = h('span', { class: 'res-rate' });
      const fill = h('div', { class: 'res-fill' });
      const el = h(
        'div',
        { class: 'res-row', dataset: { res: id }, style: { '--res-color': RESOURCES[id].color } },
        h('span', { class: 'res-icon' }, icon(id)),
        h('span', { class: 'res-name', text: tk(`res.${id}`) }),
        rate,
        value,
        h('div', { class: 'res-bar' }, fill),
      );
      this.rows.set(id, { el, value, rate, fill });
      this.el.append(el);
    }
    this.refresh();
  }

  refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    const res = game.resources;
    const flows = res.flows;
    for (const [id, row] of this.rows) {
      const amount = game.state.resources[id];
      const cap = res.capacity(id);
      const finite = Number.isFinite(cap);
      setText(row.value, finite ? `${formatCompact(amount)}/${formatCompact(cap)}` : formatCompact(amount));
      const net = res.netRate(id);
      setText(row.rate, Math.abs(net) < 0.05 ? '' : `${formatRate(net)}${t('hud.perHour')}`);
      toggleClass(row.rate, 'neg', net < -0.05);
      const ratio = finite && cap > 0 ? clamp(amount / cap, 0, 1) : 0;
      row.fill.style.width = `${ratio * 100}%`;
      toggleClass(row.el, 'no-bar', !finite);
      toggleClass(row.el, 'critical', res.hoursLeft(id) < 12);
      toggleClass(row.el, 'full', finite && ratio >= 0.999);
    }
    const ratio = flows.powerRatio;
    setText(this.powerValue, `${formatCompact(flows.energyProduction)} / ${formatCompact(flows.energyDemand)}`);
    setText(this.powerDetail, t('res.powerBalance', { prod: `${formatRate(flows.energyProduction)}${t('hud.perHour')}`, use: `${formatCompact(flows.energyDemand)}${t('hud.perHour')}` }));
    const load = flows.energyProduction > 0 ? clamp(flows.energyDemand / flows.energyProduction, 0, 1) : 1;
    this.powerFill.style.width = `${load * 100}%`;
    toggleClass(this.powerValue, 'warn', ratio < 0.999 || load > 0.9);
    setText(this.popValue, t('res.crewBeds', { crew: game.state.crew.members.length, beds: game.crewCapacity() }));
  }
}
