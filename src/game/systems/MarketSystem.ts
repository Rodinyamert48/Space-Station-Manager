import { clamp } from '../../core/math';
import { GOODS, RESOURCES, type Good } from '../../data/resources';
import type { Game } from '../Game';

/** Hours between market updates and history samples. */
export const MARKET_INTERVAL = 6;
const HISTORY_LENGTH = 28;
/** Galactic exchange fee as a fraction of the price. */
export const EXCHANGE_FEE = 0.18;
/** Units each communications module may move through the exchange per day. */
export const EXCHANGE_DAILY_LIMIT = 120;

/**
 * Dynamic prices. A price is driven by:
 * - galactic drift (slow mean-reverting random walk),
 * - trade pressure (the station buying pushes prices up, selling pushes them down),
 * - local supply (a full warehouse makes a good cheap here, an empty one makes it dear),
 * - temporary event multipliers (supply crises, booms).
 */
export class MarketSystem {
  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.market;
  }

  basePrice(good: Good): number {
    return RESOURCES[good].basePrice ?? 1;
  }

  /** Local supply factor: 1.2 when storage is empty, 0.8 when it is full. */
  supplyFactor(good: Good): number {
    const cap = this.game.resources.capacity(good);
    if (!Number.isFinite(cap) || cap <= 0) return 1;
    const fill = clamp(this.game.state.resources[good] / cap, 0, 1);
    return 1.2 - 0.4 * fill;
  }

  eventFactor(good: Good): number {
    return this.game.priceEffect(good);
  }

  price(good: Good): number {
    return this.state.prices[good];
  }

  /** Recomputes the current price from all factors. */
  recompute(good: Good): number {
    const base = this.basePrice(good);
    const raw = base * this.state.drift[good] * (1 + this.state.pressure[good]) * this.supplyFactor(good) * this.eventFactor(good);
    const price = clamp(raw, base * 0.35, base * 3.5);
    this.state.prices[good] = Math.round(price * 100) / 100;
    return this.state.prices[good];
  }

  /** Trade volume moves prices. side = what the station did. */
  recordTrade(good: Good, qty: number, side: 'buy' | 'sell'): void {
    const elasticity = RESOURCES[good].elasticity ?? 800;
    const delta = (qty / elasticity) * (side === 'buy' ? 1 : -1);
    this.state.pressure[good] = clamp(this.state.pressure[good] + delta, -0.5, 0.8);
    this.recompute(good);
  }

  /** Periodic update: drift, pressure decay and history sampling. */
  update(): void {
    const rng = this.game.rng;
    for (const g of GOODS) {
      const noise = (rng.next() + rng.next() + rng.next() - 1.5) * 0.06;
      let drift = this.state.drift[g] * Math.exp(noise);
      drift += (1 - drift) * 0.08;
      this.state.drift[g] = clamp(drift, 0.6, 1.6);
      this.state.pressure[g] *= 0.85;
      const price = this.recompute(g);
      const history = this.state.history[g];
      history.push(price);
      if (history.length > HISTORY_LENGTH) history.shift();
    }
  }

  /** Price change vs. the oldest sample in history, as a fraction. */
  trend(good: Good): number {
    const history = this.state.history[good];
    const first = history[Math.max(0, history.length - 5)] ?? this.price(good);
    return first > 0 ? this.price(good) / first - 1 : 0;
  }

  onNewDay(): void {
    this.state.exchangedToday = 0;
  }

  exchangeCapacity(): number {
    return this.game.station.count('comms', true) * EXCHANGE_DAILY_LIMIT;
  }

  exchangeRemaining(): number {
    return Math.max(0, this.exchangeCapacity() - this.state.exchangedToday);
  }

  exchangeQuote(good: Good, side: 'buy' | 'sell'): number {
    const p = this.price(good);
    return side === 'buy' ? p * (1 + EXCHANGE_FEE) : p * (1 - EXCHANGE_FEE);
  }

  /** Remote trading through the communications array. */
  exchange(good: Good, qty: number, side: 'buy' | 'sell'): { ok: true; total: number } | { ok: false; reason: 'noComms' | 'limit' | 'noCredits' | 'noSpace' | 'noStock' } {
    const amount = Math.floor(qty);
    if (this.exchangeCapacity() <= 0) return { ok: false, reason: 'noComms' };
    if (amount <= 0 || amount > this.exchangeRemaining()) return { ok: false, reason: 'limit' };
    const unit = this.exchangeQuote(good, side);
    const total = Math.round(unit * amount);
    const game = this.game;
    if (side === 'buy') {
      if (game.resources.space(good) < amount) return { ok: false, reason: 'noSpace' };
      if (!game.economy.spend(total, 'trade')) return { ok: false, reason: 'noCredits' };
      game.resources.add(good, amount);
    } else {
      if (!game.resources.remove(good, amount)) return { ok: false, reason: 'noStock' };
      game.economy.earn(total, 'trade');
    }
    this.state.exchangedToday += amount;
    game.state.stats.tradeVolume += total;
    game.state.stats.cargoMoved += amount;
    this.recordTrade(good, amount, side);
    game.bus.emit('traded', { ship: null, good, qty: amount, side, total });
    return { ok: true, total };
  }
}
