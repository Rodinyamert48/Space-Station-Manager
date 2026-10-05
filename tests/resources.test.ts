import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';

const newGame = (): Game => new Game(createNewGameState(99));
const run = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('resource simulation', () => {
  it('derives storage and battery capacity from modules', () => {
    const game = newGame();
    // Command (200) + Storage (400) storage; Command (120) + Storage (100) battery.
    expect(game.resources.capacity('metal')).toBe(600);
    expect(game.resources.capacity('energy')).toBe(220);
    expect(game.resources.capacity('credits')).toBe(Number.POSITIVE_INFINITY);
  });

  it('never stores more than capacity', () => {
    const game = newGame();
    const added = game.resources.add('metal', 10_000);
    expect(added).toBe(600 - 120);
    expect(game.state.resources.metal).toBe(600);
  });

  it('produces energy and charges the battery', () => {
    const game = newGame();
    game.state.resources.energy = 0;
    run(game, 2);
    const flows = game.resources.flows;
    expect(flows.energyProduction).toBeCloseTo(32, 5); // command 12 + solar 20
    expect(flows.powerRatio).toBe(1);
    expect(game.state.resources.energy).toBeGreaterThan(40);
  });

  it('crew consume oxygen, water and food', () => {
    const game = newGame();
    const flows = game.resources.computeFlows();
    // 4 crew: 0.3 O2, 0.25 water, 0.12 food per person-hour.
    expect(flows.consumption.oxygen).toBeCloseTo(1.2, 5);
    expect(flows.consumption.water).toBeCloseTo(1.0, 5);
    expect(flows.consumption.food).toBeCloseTo(0.48, 5);
  });

  it('flags shortages when a life resource runs out', () => {
    const game = newGame();
    game.state.resources.water = 0.01;
    run(game, 1);
    expect(game.resources.shortages.has('water')).toBe(true);
    expect(game.state.resources.water).toBe(0);
  });

  it('browns out consumers when demand exceeds supply and the battery is empty', () => {
    const game = newGame();
    // Add a heavy consumer: life support (8/h) + lab (10/h) on top of existing 6/h demand.
    game.buildModule('lifeSupport', { x: 0, y: 0, z: 1 }, 0);
    game.buildModule('lab', { x: 0, y: 0, z: 2 }, 0);
    run(game, 6);
    // Disable the solar array to create a deficit.
    const solar = game.station.modules.find((m) => m.type === 'solar');
    game.setModuleEnabled(solar?.id ?? -1, false);
    game.state.resources.energy = 0;
    run(game, 0.2);
    const flows = game.resources.flows;
    expect(flows.energyDemand).toBeGreaterThan(flows.energyProduction);
    expect(flows.powerRatio).toBeLessThan(1);
    const lab = game.station.modules.find((m) => m.type === 'lab');
    expect(flows.efficiency.get(lab?.id ?? -1)).toBeCloseTo(flows.powerRatio, 5);
  });

  it('reactors burn fuel and stop when it runs out', () => {
    const game = newGame();
    game.buildModule('power', { x: 0, y: 0, z: 1 }, 0);
    run(game, 5);
    const before = game.state.resources.fuel;
    run(game, 2);
    expect(game.state.resources.fuel).toBeLessThan(before);
    game.state.resources.fuel = 0;
    run(game, 0.5);
    expect(game.resources.flows.energyProduction).toBeCloseTo(32, 5);
  });

  it('factories need metal to make electronics', () => {
    const game = newGame();
    game.state.research.completed.push('basicPower', 'advancedManufacturing');
    game.buildModule('factory', { x: 0, y: 0, z: 1 }, 0);
    run(game, 7);
    const factory = game.station.modules.find((m) => m.type === 'factory');
    expect(factory?.status).toBe('active');
    const metal = game.state.resources.metal;
    const elec = game.state.resources.electronics;
    run(game, 2);
    expect(game.state.resources.metal).toBeLessThan(metal);
    expect(game.state.resources.electronics).toBeGreaterThan(elec);
    game.state.resources.metal = 0;
    run(game, 0.3);
    expect(game.resources.flows.efficiency.get(factory?.id ?? -1)).toBe(0);
  });

  it('research bonuses raise output', () => {
    const game = newGame();
    const base = game.resources.computeFlows().production.energy;
    game.state.research.completed.push('basicPower');
    const boosted = game.resources.computeFlows().production.energy;
    // Basic Power boosts reactors and the hub but not solar arrays.
    expect(boosted).toBeCloseTo(base + 12 * 0.15, 5);
  });
});
