import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { APPROACH_HOURS } from '../src/game/systems/ShipSystem';

const newGame = (): Game => new Game(createNewGameState(2024));
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

function dockedCargoShip(game: Game) {
  const ship = game.ships.spawn('cargo');
  game.ships.accept(ship.id);
  expect(ship.status).toBe('approaching');
  runHours(game, APPROACH_HOURS + 0.2);
  expect(ship.status).toBe('docked');
  return ship;
}

describe('ship traffic', () => {
  it('spawns ships on schedule when a berth exists', () => {
    const game = newGame();
    game.state.ships.nextArrivalAt = game.hour + 0.05;
    runHours(game, 0.2);
    expect(game.ships.list.length).toBe(1);
    expect(game.ships.list[0]?.status).toBe('pending');
  });

  it('docks accepted ships, charges fees and counts statistics', () => {
    const game = newGame();
    const credits = game.state.resources.credits;
    const ship = dockedCargoShip(game);
    expect(game.state.stats.shipsDocked).toBe(1);
    expect(game.state.economy.today.income.docking).toBe(ship.fee);
    expect(game.state.resources.credits).toBeGreaterThan(credits);
  });

  it('queues ships when every berth is taken and honours priority', () => {
    const game = newGame();
    const first = game.ships.spawn('cargo');
    const second = game.ships.spawn('mining');
    const third = game.ships.spawn('passenger');
    game.ships.accept(first.id);
    game.ships.accept(second.id);
    game.ships.accept(third.id);
    expect(first.status).toBe('approaching');
    expect(second.status).toBe('queued');
    game.ships.togglePriority(third.id);
    game.ships.release(first.id); // not docked yet: no effect
    runHours(game, APPROACH_HOURS + 0.2);
    game.ships.release(first.id);
    runHours(game, 2);
    expect(third.status === 'approaching' || third.status === 'docked').toBe(true);
    expect(second.status).toBe('queued');
  });

  it('rejected ships leave immediately', () => {
    const game = newGame();
    const ship = game.ships.spawn('cargo');
    game.ships.reject(ship.id);
    expect(game.ships.get(ship.id)).toBeUndefined();
  });

  it('ignored ships leave and cost reputation', () => {
    const game = newGame();
    const rep = game.state.reputation;
    const ship = game.ships.spawn('passenger');
    runHours(game, 20);
    expect(game.ships.get(ship.id)).toBeUndefined();
    expect(game.state.reputation).toBeLessThan(rep);
  });

  it('blocks demolishing an occupied berth', () => {
    const game = newGame();
    dockedCargoShip(game);
    const dock = game.station.modules.find((m) => m.type === 'docking');
    expect(game.canDemolish(dock?.id ?? -1)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('adds passengers to the population while docked', () => {
    const game = newGame();
    const crew = game.state.crew.members.length;
    const ship = game.ships.spawn('passenger');
    game.ships.accept(ship.id);
    runHours(game, APPROACH_HOURS + 0.2);
    expect(game.population()).toBe(crew + ship.passengers);
  });

  it('departing ships raise reputation when served well', () => {
    const game = newGame();
    const ship = dockedCargoShip(game);
    for (const line of [...ship.demands]) {
      game.resources.add(line.good, line.qty);
      game.ships.trade(ship.id, line.good, line.qty, 'sell');
    }
    const rep = game.state.reputation;
    game.ships.release(ship.id);
    expect(game.state.reputation).toBeGreaterThan(rep);
    runHours(game, 2);
    expect(game.ships.get(ship.id)).toBeUndefined();
  });
});

describe('trading', () => {
  it('buys goods from a docked ship', () => {
    const game = newGame();
    const ship = dockedCargoShip(game);
    const offer = ship.offers[0];
    expect(offer).toBeDefined();
    if (!offer) return;
    const before = game.state.resources[offer.good];
    const credits = game.state.resources.credits;
    const qty = Math.min(10, offer.qty);
    const result = game.ships.trade(ship.id, offer.good, qty, 'buy');
    expect(result.ok).toBe(true);
    expect(game.state.resources[offer.good]).toBe(before + qty);
    expect(game.state.resources.credits).toBe(credits - Math.round(offer.price * qty));
    expect(game.state.stats.cargoMoved).toBe(qty);
  });

  it('sells goods the ship demands', () => {
    const game = newGame();
    const ship = dockedCargoShip(game);
    const demand = ship.demands[0];
    if (!demand) throw new Error('ship has no demand');
    game.resources.add(demand.good, 50);
    const credits = game.state.resources.credits;
    const qty = Math.min(5, demand.qty);
    const result = game.ships.trade(ship.id, demand.good, qty, 'sell');
    expect(result.ok).toBe(true);
    expect(game.state.resources.credits).toBe(credits + Math.round(demand.price * qty));
    expect(ship.demandFilled).toBe(qty);
  });

  it('cannot trade with ships that are not docked', () => {
    const game = newGame();
    const ship = game.ships.spawn('cargo');
    const line = ship.offers[0];
    if (!line) throw new Error('no offer');
    expect(game.ships.trade(ship.id, line.good, 1, 'buy')).toEqual({ ok: false, reason: 'notDocked' });
  });

  it('limits each visit by cargo handling capacity', () => {
    const game = newGame();
    const ship = dockedCargoShip(game);
    expect(ship.tradeAllowance).toBe(80);
    ship.tradeAllowance = 3;
    const offer = ship.offers[0];
    if (!offer) throw new Error('no offer');
    const result = game.ships.trade(ship.id, offer.good, 50, 'buy');
    expect(result).toMatchObject({ ok: true, qty: 3 });
    expect(game.ships.trade(ship.id, offer.good, 1, 'buy')).toEqual({ ok: false, reason: 'allowance' });
  });

  it('auto-trades surplus once the technology is researched', () => {
    const game = newGame();
    game.state.research.completed.push('basicPower', 'advancedManufacturing', 'automatedCargo');
    game.state.ships.autoTrade = { enabled: true, sellAbove: 0.1, buyBelow: 0 };
    const ship = game.ships.spawn('cargo');
    const demand = ship.demands[0];
    if (!demand) throw new Error('no demand');
    game.resources.add(demand.good, 500);
    game.ships.accept(ship.id);
    runHours(game, APPROACH_HOURS + 0.2);
    expect(ship.demandFilled).toBeGreaterThan(0);
  });
});
