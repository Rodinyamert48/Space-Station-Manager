import { formatCompact, formatRate } from '../core/math';
import { MODULES, type Cost, type CostKey, type ModuleType } from '../data/modules';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { Game } from '../game/Game';
import { t, tk } from '../i18n/i18n';
import { h } from './dom';
import { icon } from './icons';

const COST_ORDER: CostKey[] = ['credits', 'metal', 'electronics', 'titanium'];

/** Cost chips; chips the player cannot afford are flagged. */
export function costChips(cost: Cost, game: Game | null): HTMLElement {
  const wrap = h('div', { class: 'cost' });
  for (const key of COST_ORDER) {
    const amount = cost[key];
    if (!amount) continue;
    const short = game ? !game.resources.has(key, amount) : false;
    wrap.append(
      h(
        'span',
        { class: `cost-chip${short ? ' short' : ''}`, title: tk(`res.${key}`), style: { '--res-color': RESOURCES[key].color } },
        icon(key),
        formatCompact(amount),
      ),
    );
  }
  return wrap;
}

export function resourceChip(id: ResourceId, text: string, cls = ''): HTMLElement {
  return h('span', { class: `rate-chip ${cls}`, title: tk(`res.${id}`), style: { '--res-color': RESOURCES[id].color } }, icon(id), text);
}

/** Per-hour production/consumption chips for a module definition. */
export function moduleFlowChips(type: ModuleType): { produces: HTMLElement[]; consumes: HTMLElement[] } {
  const def = MODULES[type];
  const produces = (Object.entries(def.produces) as [ResourceId, number][]).map(([id, v]) =>
    resourceChip(id, `${formatRate(v)}${t('hud.perHour')}`, 'pos'),
  );
  const consumes = (Object.entries(def.consumes) as [ResourceId, number][]).map(([id, v]) =>
    resourceChip(id, `${formatRate(-v)}${t('hud.perHour')}`, 'neg'),
  );
  return { produces, consumes };
}

/** Human-readable list of non-flow features (storage, berths, crew beds...). */
export function moduleFeatures(type: ModuleType): string[] {
  const d = MODULES[type];
  const out: string[] = [];
  if (d.storage) out.push(t('stat.storage', { v: d.storage }));
  if (d.battery) out.push(t('stat.battery', { v: d.battery }));
  if (d.crewCapacity) out.push(t('stat.crew', { v: d.crewCapacity }));
  if (d.berths) out.push(t('stat.berths'));
  if (d.tradeCapacity) out.push(t('stat.trade', { v: d.tradeCapacity }));
  if (d.defense) out.push(t('stat.defense', { v: d.defense }));
  if (d.recreation) out.push(t('stat.recreation', { v: d.recreation }));
  if (d.medical) out.push(t('stat.medical', { v: d.medical }));
  if (d.comms) out.push(t('stat.comms'));
  if (d.staff) out.push(t('stat.staff', { count: d.staff.count, role: tk(`role.${d.staff.role}`) }));
  return out;
}
