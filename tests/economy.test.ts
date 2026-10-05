import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { BANKRUPTCY_DAYS } from '../src/game/systems/EconomySystem';

const newGame = (): Game => new Game(createNewGameState(7));
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('economy', () => {
  it('records income and expenses by category', () => {
    const game = newGame();
    const start = game.state.resources.credits;
    game.economy.earn(100, 'trade');
    game.economy.charge(30, 'upkeep');
    expect(game.state.resources.credits).toBe(start + 70);
    expect(game.state.economy.today.income.trade).toBe(100);
    expect(game.state.economy.today.expenses.upkeep).toBe(30);
    expect(game.economy.netToday()).toBe(70);
  });

  it('refuses optional spending beyond available credits', () => {
    const game = newGame();
    game.state.resources.credits = 50;
    expect(game.economy.spend(80, 'construction')).toBe(false);
    expect(game.state.resources.credits).toBe(50);
  });

  it('charges salaries, upkeep and energy at midnight', () => {
    const game = newGame();
    const salaries = game.economy.dailySalaries();
    const upkeep = game.economy.dailyUpkeep();
    // 2 engineers (30) + pilot (30) + worker (18).
    expect(salaries).toBe(108);
    // command 30 + solar 6 + storage 6 + docking 22.
    expect(upkeep).toBe(64);
    let report = null as null | { net: number };
    game.bus.on('day', (e) => (report = e.report));
    runHours(game, 18.2); // game starts at 06:00
    expect(report).not.toBeNull();
    const history = game.state.economy.history[0];
    expect(history?.expenses.salaries).toBe(108);
    expect(history?.expenses.upkeep).toBe(64);
    expect(history?.expenses.energy ?? 0).toBeGreaterThan(0);
  });

  it('goes bankrupt after consecutive days in debt', () => {
    const game = newGame();
    let bankrupt = false;
    game.bus.on('bankrupt', () => (bankrupt = true));
    game.state.resources.credits = -5000;
    for (let d = 1; d <= BANKRUPTCY_DAYS; d++) game.economy.endDay(d);
    expect(bankrupt).toBe(true);
    expect(game.state.economy.bankrupt).toBe(true);
  });

  it('clears the debt counter once credits recover', () => {
    const game = newGame();
    game.state.resources.credits = -10;
    game.economy.endDay(1);
    expect(game.state.economy.debtDays).toBe(1);
    game.state.resources.credits = 10_000;
    game.economy.endDay(2);
    expect(game.state.economy.debtDays).toBe(0);
  });
});

describe('market', () => {
  it('selling lowers and buying raises prices', () => {
    const game = newGame();
    const base = game.market.recompute('metal');
    game.market.recordTrade('metal', 300, 'sell');
    const afterSell = game.market.price('metal');
    expect(afterSell).toBeLessThan(base);
    game.market.recordTrade('metal', 600, 'buy');
    expect(game.market.price('metal')).toBeGreaterThan(afterSell);
  });

  it('full warehouses make goods cheaper locally', () => {
    const game = newGame();
    game.state.resources.water = 0;
    const scarce = game.market.recompute('water');
    game.state.resources.water = game.resources.capacity('water');
    const plenty = game.market.recompute('water');
    expect(plenty).toBeLessThan(scarce);
  });

  it('keeps prices within bounds and records history', () => {
    const game = newGame();
    for (let i = 0; i < 200; i++) game.market.update();
    for (const good of ['oxygen', 'water', 'food', 'fuel', 'metal', 'electronics', 'titanium'] as const) {
      const base = game.market.basePrice(good);
      expect(game.market.price(good)).toBeGreaterThanOrEqual(base * 0.35);
      expect(game.market.price(good)).toBeLessThanOrEqual(base * 3.5);
      expect(game.state.market.history[good].length).toBeLessThanOrEqual(28);
    }
  });

  it('applies event price multipliers', () => {
    const game = newGame();
    const before = game.market.recompute('food');
    game.state.events.effects.push({ id: 1, kind: 'price', value: 1.6, until: 100, good: 'food', source: 'supplyCrisis' });
    expect(game.market.recompute('food')).toBeCloseTo(before * 1.6, 1);
  });

  it('requires a communications module for the exchange', () => {
    const game = newGame();
    expect(game.market.exchange('metal', 10, 'buy')).toEqual({ ok: false, reason: 'noComms' });
  });
});
