import { formatCompact } from '../../core/math';
import { GOODS, RESOURCES, type Good } from '../../data/resources';
import { EXCHANGE_FEE } from '../../game/systems/MarketSystem';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { QtyStepper, sparkline } from '../widgets';
import { GameWindow } from './Window';

interface MarketRow {
  good: Good;
  price: HTMLElement;
  trend: HTMLElement;
  stock: HTMLElement;
  spark: HTMLElement;
  stepper?: QtyStepper;
  buyBtn?: HTMLButtonElement;
  sellBtn?: HTMLButtonElement;
}

/** Live prices with history, plus the galactic exchange once a comms module exists. */
export class MarketWindow extends GameWindow {
  private rows: MarketRow[] = [];
  private exchangeInfo: HTMLElement | null = null;
  private hadExchange = false;
  private historyKey = '';

  constructor(private readonly ctx: UIContext) {
    super('market', 'market.title', 'market');
  }

  rebuild(): void {
    this.body.replaceChildren();
    this.rows = [];
    const game = this.ctx.game();
    if (!game) return;
    const exchange = game.market.exchangeCapacity() > 0;
    this.hadExchange = exchange;
    this.body.append(h('p', { class: 'muted small', text: t('market.hint') }));
    const list = h('div', { class: 'market-list' });
    for (const good of GOODS) {
      const row: MarketRow = {
        good,
        price: h('span', { class: 'mk-price num' }),
        trend: h('span', { class: 'mk-trend' }),
        stock: h('span', { class: 'muted small' }),
        spark: h('span', { class: 'mk-spark' }),
      };
      const controls: HTMLElement[] = [];
      if (exchange) {
        row.buyBtn = button(t('trade.buy'), () => this.exchange(good, 'buy'), 'btn small primary');
        row.sellBtn = button(t('trade.sell'), () => this.exchange(good, 'sell'), 'btn small success');
        row.stepper = new QtyStepper(10, () => this.updateQuote(row), t('trade.max'));
        controls.push(h('div', { class: 'mk-exchange' }, row.stepper.el, row.buyBtn, row.sellBtn));
      }
      this.rows.push(row);
      list.append(
        h(
          'div',
          { class: 'market-row', style: { '--res-color': RESOURCES[good].color } },
          h('div', { class: 'mk-main' }, h('span', { class: 'tr-icon' }, icon(good)), h('div', { class: 'mk-name' }, h('span', { text: tk(`res.${good}`) }), row.stock), row.spark, h('div', { class: 'mk-values' }, row.price, row.trend)),
          ...controls,
        ),
      );
    }
    this.body.append(list);
    this.body.append(h('div', { class: 'section-title', text: t('market.exchange') }));
    this.exchangeInfo = h('p', { class: 'muted small' });
    this.body.append(this.exchangeInfo);
    this.historyKey = '';
    this.refresh();
  }

  private updateQuote(row: MarketRow): void {
    const game = this.ctx.game();
    if (!game || !row.stepper || !row.buyBtn || !row.sellBtn) return;
    const q = row.stepper.value;
    setText(row.buyBtn, `${t('trade.buy')} ${formatCompact(Math.round(game.market.exchangeQuote(row.good, 'buy') * q))}`);
    setText(row.sellBtn, `${t('trade.sell')} ${formatCompact(Math.round(game.market.exchangeQuote(row.good, 'sell') * q))}`);
    row.buyBtn.disabled = q <= 0;
    row.sellBtn.disabled = q <= 0 || game.state.resources[row.good] < q;
  }

  private exchange(good: Good, side: 'buy' | 'sell'): void {
    const game = this.ctx.game();
    const row = this.rows.find((r) => r.good === good);
    if (!game || !row?.stepper) return;
    const result = game.market.exchange(good, row.stepper.value, side);
    if (result.ok) {
      this.ctx.playSound('trade');
      game.notify('success', 'trade.done', { qty: row.stepper.value, good: `res.${good}`, total: result.total });
    } else {
      this.ctx.playSound('error');
      game.notify('warning', `trade.error.${result.reason}`);
    }
    this.refresh();
  }

  override refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    const exchange = game.market.exchangeCapacity() > 0;
    if (exchange !== this.hadExchange) {
      this.rebuild();
      return;
    }
    const key = game.state.market.history.food.length + ':' + game.state.market.history.food.at(-1);
    const redrawSpark = key !== this.historyKey;
    this.historyKey = key;
    for (const row of this.rows) {
      const price = game.market.price(row.good);
      setText(row.price, `${price.toFixed(2)} cr`);
      const trend = game.market.trend(row.good);
      setText(row.trend, `${trend >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(trend * 100))}%`);
      row.trend.className = `mk-trend ${trend > 0.01 ? 'up' : trend < -0.01 ? 'down' : ''}`;
      setText(row.stock, `${t('market.stock')} ${formatCompact(game.state.resources[row.good])}/${formatCompact(game.resources.capacity(row.good))} · ${t('market.base', { v: game.market.basePrice(row.good) })}`);
      if (redrawSpark) row.spark.replaceChildren(sparkline(game.state.market.history[row.good], 84, 26, RESOURCES[row.good].color));
      if (row.stepper) {
        const remaining = game.market.exchangeRemaining();
        row.stepper.setMax(remaining);
        this.updateQuote(row);
      }
    }
    if (this.exchangeInfo) {
      setText(
        this.exchangeInfo,
        exchange ? t('market.exchangeHint', { fee: Math.round(EXCHANGE_FEE * 100), v: game.market.exchangeRemaining() }) : t('market.exchangeLocked'),
      );
    }
  }
}
