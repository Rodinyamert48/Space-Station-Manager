import { clamp, formatCompact } from '../../core/math';
import { RESOURCES } from '../../data/resources';
import { SHIPS } from '../../data/ships';
import type { ShipState, TradeLine } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { slider, toggle } from '../widgets';
import { GameWindow } from './Window';

/** Traffic control: docking requests, the queue and docked ships. */
export class ShipsWindow extends GameWindow {
  private signature = '';
  private readonly timers = new Map<number, { text: HTMLElement; fill: HTMLElement | null }>();
  private headerInfo: HTMLElement | null = null;
  highlightId: number | null = null;

  constructor(
    private readonly ctx: UIContext,
    private readonly actions: { trade: (id: number) => void; focus: (id: number) => void },
  ) {
    super('ships', 'ships.title', 'ship');
  }

  private computeSignature(): string {
    const game = this.ctx.game();
    if (!game) return '';
    return `${game.ships.list.map((s) => `${s.id}:${s.status}:${s.priority ? 1 : 0}`).join('|')}#${game.ships.berths().length}#${game.state.ships.autoAccept}#${game.hasFeature('autoTrade')}#${game.state.ships.autoTrade.enabled}`;
  }

  rebuild(): void {
    const game = this.ctx.game();
    this.body.replaceChildren();
    this.timers.clear();
    if (!game) return;
    this.signature = this.computeSignature();
    const berths = game.ships.berths();
    const used = berths.filter((b) => game.ships.shipAtBerth(b.id)).length;
    this.headerInfo = h('span', { class: 'muted' });
    this.body.append(
      h('div', { class: 'ships-head' }, h('span', { class: 'pill' }, icon('dock'), t('ships.berths', { used, total: berths.length })), this.headerInfo),
    );
    if (berths.length === 0) this.body.append(h('p', { class: 'warn-text', text: t('ships.noBerths') }));

    const settings = h('div', { class: 'ships-settings' });
    settings.append(toggle(t('ships.autoAccept'), game.state.ships.autoAccept, (v) => {
      game.ships.setAutoAccept(v);
      this.rebuild();
    }));
    const rules = game.state.ships.autoTrade;
    if (game.hasFeature('autoTrade')) {
      settings.append(toggle(t('ships.autoTrade'), rules.enabled, (v) => {
        rules.enabled = v;
        this.rebuild();
      }));
      if (rules.enabled) {
        settings.append(
          slider({ min: 0.3, max: 1, step: 0.05, value: rules.sellAbove, onInput: (v) => (rules.sellAbove = v), label: (v) => t('ships.sellAbove', { pct: Math.round(v * 100) }) }),
          slider({ min: 0, max: 0.6, step: 0.05, value: rules.buyBelow, onInput: (v) => (rules.buyBelow = v), label: (v) => t('ships.buyBelow', { pct: Math.round(v * 100) }) }),
        );
      }
    } else settings.append(h('p', { class: 'muted small', text: t('ships.autoTradeLocked') }));
    this.body.append(settings);

    const groups: [string, ShipState[]][] = [
      [t('ships.docked'), game.ships.list.filter((s) => s.status === 'docked' || s.status === 'departing')],
      [t('ships.queue'), game.ships.list.filter((s) => s.status === 'queued' || s.status === 'approaching')],
      [t('ships.incoming'), game.ships.list.filter((s) => s.status === 'pending')],
    ];
    let any = false;
    for (const [title, ships] of groups) {
      if (ships.length === 0) continue;
      any = true;
      this.body.append(h('div', { class: 'section-title', text: `${title} · ${ships.length}` }));
      for (const ship of ships) this.body.append(this.card(ship));
    }
    if (!any) this.body.append(h('p', { class: 'empty', text: t('ships.none') }));
    this.refresh();
  }

  private lineChip(line: TradeLine, side: 'buy' | 'sell'): HTMLElement {
    const game = this.ctx.game();
    const market = game?.market.price(line.good) ?? line.price;
    const diff = market > 0 ? line.price / market - 1 : 0;
    // From the station's point of view: buying cheap or selling dear is good.
    const good = side === 'buy' ? diff < -0.02 : diff > 0.02;
    return h(
      'span',
      { class: `trade-chip ${good ? 'deal' : ''}`, style: { '--res-color': RESOURCES[line.good].color }, title: tk(`res.${line.good}`) },
      icon(line.good),
      h('span', { class: 'num', text: formatCompact(line.qty) }),
      h('span', { class: 'tc-price', text: `@${line.price.toFixed(1)}` }),
      h('span', { class: `tc-diff ${good ? 'good' : 'bad'}`, text: `${diff >= 0 ? '+' : ''}${Math.round(diff * 100)}%` }),
    );
  }

  private card(ship: ShipState): HTMLElement {
    const game = this.ctx.game();
    const def = SHIPS[ship.type];
    const timerText = h('span', { class: 'ship-timer' });
    const fill = ship.status === 'pending' || ship.status === 'queued' || ship.status === 'docked' ? h('div', { class: 'bar-fill' }) : null;
    this.timers.set(ship.id, { text: timerText, fill });
    const tags: HTMLElement[] = [];
    if (def.size === 'L') tags.push(h('span', { class: 'tag vip', text: t('ships.vip') }));
    if (ship.special) tags.push(h('span', { class: 'tag special', text: t('ships.special') }));
    if (ship.priority) tags.push(h('span', { class: 'tag prio' }, icon('star')));

    const actions = h('div', { class: 'ship-actions' });
    if (ship.status === 'pending' || ship.status === 'queued') {
      if (ship.status === 'pending') actions.append(button(h('span', { class: 'btn-inner' }, icon('check'), t('ships.accept')), () => this.act(() => game?.ships.accept(ship.id)), 'btn success small'));
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('star'), t('ships.priority')), () => this.act(() => game?.ships.togglePriority(ship.id)), `btn small ${ship.priority ? 'primary' : 'ghost'}`),
        button(h('span', { class: 'btn-inner' }, icon('close'), t('ships.reject')), () => this.act(() => game?.ships.reject(ship.id)), 'btn danger small'),
      );
    } else if (ship.status === 'docked') {
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('market'), t('ships.trade')), () => this.actions.trade(ship.id), 'btn primary small'),
        button(h('span', { class: 'btn-inner' }, icon('up'), t('ships.release')), () => this.act(() => game?.ships.release(ship.id)), 'btn ghost small'),
      );
    }
    actions.append(button(icon('focus'), () => this.actions.focus(ship.id), 'icon-btn small-icon', t('info.focus')));

    const offers = ship.offers.filter((l) => l.qty > 0);
    const demands = ship.demands.filter((l) => l.qty > 0);
    const card = h(
      'div',
      { class: `ship-card st-${ship.status}${this.highlightId === ship.id ? ' highlight' : ''}`, style: { '--ship-color': def.color }, dataset: { ship: String(ship.id) } },
      h('div', { class: 'ship-top' }, h('span', { class: 'ship-icon' }, icon('ship')), h('div', { class: 'ship-title' }, h('span', { class: 'ship-name', text: ship.name }), h('span', { class: 'ship-type', text: `${tk(`ship.${ship.type}`)} · ${ship.owner}` })), ...tags),
      h(
        'div',
        { class: 'ship-meta' },
        h('span', { text: t('ships.route', { from: ship.origin, to: ship.destination }) }),
        h('span', { text: t('ships.fee', { v: ship.fee }) }),
        ship.passengers > 0 ? h('span', { text: t('ships.passengers', { v: ship.passengers }) }) : null,
        h('span', { text: t('ships.cargoCap', { v: ship.cargoCapacity }) }),
      ),
      offers.length || ship.researchOffer > 0
        ? h('div', { class: 'ship-lines' }, h('span', { class: 'line-label', text: t('ships.sells') }), ...offers.map((l) => this.lineChip(l, 'buy')), ship.researchOffer > 0 ? h('span', { class: 'trade-chip', style: { '--res-color': RESOURCES.research.color } }, icon('research'), `${ship.researchOffer} @${ship.researchPrice}`) : null)
        : null,
      demands.length ? h('div', { class: 'ship-lines' }, h('span', { class: 'line-label', text: t('ships.wants') }), ...demands.map((l) => this.lineChip(l, 'sell'))) : null,
      h('div', { class: 'ship-status' }, timerText, fill ? h('div', { class: 'bar' }, fill) : null),
      actions,
    );
    return card;
  }

  private act(fn: () => unknown): void {
    this.ctx.playSound('click');
    fn();
    this.rebuild();
  }

  override refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    if (this.computeSignature() !== this.signature) {
      this.rebuild();
      return;
    }
    if (this.headerInfo) {
      const hours = Math.max(0, game.state.ships.nextArrivalAt - game.hour);
      setText(this.headerInfo, game.ships.berths().length ? t('ships.nextArrival', { hours: hours.toFixed(1) }) : '');
    }
    for (const ship of game.ships.list) {
      const timer = this.timers.get(ship.id);
      if (!timer) continue;
      const now = game.hour;
      let text = '';
      let ratio = 0;
      if (ship.status === 'pending' || ship.status === 'queued') {
        const left = Math.max(0, ship.patienceUntil - now);
        text = t('ships.patience', { hours: left.toFixed(1) });
        ratio = clamp(left / (SHIPS[ship.type].patienceHours * 1.5), 0, 1);
      } else if (ship.status === 'docked') {
        const left = Math.max(0, ship.serviceUntil - now);
        text = `${t('ships.service', { hours: left.toFixed(1) })} · ${t('trade.allowance', { v: ship.tradeAllowance })}`;
        ratio = clamp(left / SHIPS[ship.type].serviceHours, 0, 1);
      } else if (ship.status === 'approaching') text = t('ships.approaching');
      else text = t('ships.departing');
      setText(timer.text, text);
      if (timer.fill) timer.fill.style.width = `${ratio * 100}%`;
    }
  }
}
