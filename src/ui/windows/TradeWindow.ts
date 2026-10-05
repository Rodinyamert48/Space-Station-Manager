import { formatCompact } from '../../core/math';
import { RESOURCES, type Good } from '../../data/resources';
import { SHIPS } from '../../data/ships';
import type { ShipState, TradeLine } from '../../game/state';
import type { TradeError } from '../../game/systems/ShipSystem';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { QtyStepper } from '../widgets';
import { GameWindow } from './Window';

interface TradeRow {
  good: Good;
  side: 'buy' | 'sell';
  stepper: QtyStepper;
  left: HTMLElement;
  stock: HTMLElement;
  action: HTMLButtonElement;
}

/** Buy from and sell to a docked ship. */
export class TradeWindow extends GameWindow {
  private shipId: number | null = null;
  private rows: TradeRow[] = [];
  private allowanceEl: HTMLElement | null = null;
  private serviceEl: HTMLElement | null = null;
  private researchStepper: QtyStepper | null = null;

  constructor(private readonly ctx: UIContext) {
    super('trade', 'trade.title', 'market');
  }

  setShip(id: number): void {
    this.shipId = id;
    if (this.isOpen) this.rebuild();
  }

  private ship(): ShipState | undefined {
    return this.shipId === null ? undefined : this.ctx.game()?.ships.get(this.shipId);
  }

  rebuild(): void {
    this.body.replaceChildren();
    this.rows = [];
    this.researchStepper = null;
    const game = this.ctx.game();
    const ship = this.ship();
    if (!game || !ship) return;
    const def = SHIPS[ship.type];
    this.allowanceEl = h('span', { class: 'pill' });
    this.serviceEl = h('span', { class: 'muted' });
    this.body.append(
      h(
        'div',
        { class: 'trade-head', style: { '--ship-color': def.color } },
        h('div', { class: 'ship-title' }, h('span', { class: 'ship-name', text: ship.name }), h('span', { class: 'ship-type', text: `${tk(`ship.${ship.type}`)} · ${ship.owner}` })),
        h('div', { class: 'trade-meta' }, this.allowanceEl, this.serviceEl),
      ),
    );
    const offers = ship.offers.filter((l) => l.qty > 0);
    const demands = ship.demands.filter((l) => l.qty > 0);
    if (offers.length) {
      this.body.append(h('div', { class: 'section-title', text: t('trade.shipSells') }));
      for (const line of offers) this.body.append(this.row(ship, line, 'buy'));
    }
    if (ship.researchOffer > 0) this.body.append(this.researchRow(ship));
    if (demands.length) {
      this.body.append(h('div', { class: 'section-title', text: t('trade.shipBuys') }));
      for (const line of demands) this.body.append(this.row(ship, line, 'sell'));
    }
    if (!offers.length && !demands.length && ship.researchOffer <= 0) this.body.append(h('p', { class: 'empty', text: t('trade.nothing') }));
    this.refresh();
  }

  private row(ship: ShipState, line: TradeLine, side: 'buy' | 'sell'): HTMLElement {
    const game = this.ctx.game();
    const market = game?.market.price(line.good) ?? line.price;
    const diff = market > 0 ? line.price / market - 1 : 0;
    const good = side === 'buy' ? diff < -0.02 : diff > 0.02;
    const left = h('span', { class: 'muted' });
    const stock = h('span', { class: 'muted' });
    const action = button('', () => this.execute(ship, line.good, side), side === 'buy' ? 'btn primary small trade-go' : 'btn success small trade-go');
    const stepper = new QtyStepper(0, (v) => {
      setText(action, `${side === 'buy' ? t('trade.buy') : t('trade.sell')} · ${formatCompact(Math.round(v * line.price))} cr`);
      action.disabled = v <= 0;
    }, t('trade.max'));
    const row: TradeRow = { good: line.good, side, stepper, left, stock, action };
    this.rows.push(row);
    stepper.setMax(game?.ships.maxTrade(ship, line.good, side) ?? 0);
    stepper.set(Math.min(stepper.value || 10, game?.ships.maxTrade(ship, line.good, side) ?? 0));
    return h(
      'div',
      { class: 'trade-row', style: { '--res-color': RESOURCES[line.good].color } },
      h(
        'div',
        { class: 'tr-head' },
        h('span', { class: 'tr-icon' }, icon(line.good)),
        h('span', { class: 'tr-name', text: tk(`res.${line.good}`) }),
        h('span', { class: 'tr-price', text: t('trade.price', { v: line.price.toFixed(2) }) }),
        h('span', { class: `tc-diff ${good ? 'good' : 'bad'}`, text: t('trade.vsMarket', { pct: `${diff >= 0 ? '+' : ''}${Math.round(diff * 100)}%` }) }),
      ),
      h('div', { class: 'tr-sub' }, left, stock),
      h('div', { class: 'tr-controls' }, stepper.el, action),
    );
  }

  private researchRow(ship: ShipState): HTMLElement {
    const action = button('', () => {
      const game = this.ctx.game();
      if (!game || !this.researchStepper) return;
      const result = game.ships.buyResearch(ship.id, this.researchStepper.value);
      this.feedback(result.ok ? null : result.reason, result.ok ? { qty: result.qty, good: 'res.research', total: result.total } : null);
    }, 'btn primary small trade-go');
    const stepper = new QtyStepper(0, (v) => {
      setText(action, `${t('trade.buy')} · ${formatCompact(v * ship.researchPrice)} cr`);
      action.disabled = v <= 0;
    }, t('trade.max'));
    this.researchStepper = stepper;
    stepper.setMax(ship.researchOffer);
    stepper.set(Math.min(5, ship.researchOffer));
    return h(
      'div',
      { class: 'trade-row', style: { '--res-color': RESOURCES.research.color } },
      h(
        'div',
        { class: 'tr-head' },
        h('span', { class: 'tr-icon' }, icon('research')),
        h('span', { class: 'tr-name', text: t('ships.researchData') }),
        h('span', { class: 'tr-price', text: t('trade.price', { v: ship.researchPrice }) }),
      ),
      h('div', { class: 'tr-sub' }, h('span', { class: 'muted', text: t('trade.left', { v: ship.researchOffer }) })),
      h('div', { class: 'tr-controls' }, stepper.el, action),
    );
  }

  private execute(ship: ShipState, good: Good, side: 'buy' | 'sell'): void {
    const game = this.ctx.game();
    const row = this.rows.find((r) => r.good === good && r.side === side);
    if (!game || !row) return;
    const result = game.ships.trade(ship.id, good, row.stepper.value, side);
    this.feedback(result.ok ? null : result.reason, result.ok ? { qty: result.qty, good: `res.${good}`, total: result.total } : null);
  }

  private feedback(error: TradeError | null, done: { qty: number; good: string; total: number } | null): void {
    const game = this.ctx.game();
    if (!game) return;
    if (done) {
      this.ctx.playSound('trade');
      game.notify('success', 'trade.done', { qty: done.qty, good: done.good, total: done.total });
    } else if (error) {
      this.ctx.playSound('error');
      game.notify('warning', `trade.error.${error}`);
    }
    this.rebuild();
  }

  override refresh(): void {
    const game = this.ctx.game();
    const ship = this.ship();
    if (!game || !ship || ship.status !== 'docked') {
      if (this.isOpen) this.onRequestClose?.();
      return;
    }
    if (this.allowanceEl) setText(this.allowanceEl, t('trade.allowance', { v: ship.tradeAllowance }));
    if (this.serviceEl) setText(this.serviceEl, t('ships.service', { hours: Math.max(0, ship.serviceUntil - game.hour).toFixed(1) }));
    for (const row of this.rows) {
      const line = (row.side === 'buy' ? ship.offers : ship.demands).find((l) => l.good === row.good);
      setText(row.left, t('trade.left', { v: formatCompact(line?.qty ?? 0) }));
      setText(row.stock, t('trade.stock', { v: `${formatCompact(game.state.resources[row.good])}/${formatCompact(game.resources.capacity(row.good))}` }));
      row.stepper.setMax(game.ships.maxTrade(ship, row.good, row.side));
    }
  }
}
