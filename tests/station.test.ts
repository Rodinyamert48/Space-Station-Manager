import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';

const newGame = (): Game => new Game(createNewGameState(1234));

describe('station layout', () => {
  it('starts with a connected outpost', () => {
    const game = newGame();
    expect(game.station.modules).toHaveLength(4);
    expect(game.station.connections()).toHaveLength(3);
    for (const m of game.station.modules) {
      expect(game.station.path(game.station.command().id, m.id).length).toBeGreaterThan(0);
    }
  });

  it('offers connection points next to open ports', () => {
    const game = newGame();
    const cells = game.station.snapCells('power');
    expect(cells).toContainEqual({ x: 0, y: 0, z: 1 });
    // The docking approach lane in front of the berth is reserved.
    expect(cells).not.toContainEqual({ x: 0, y: 0, z: -2 });
  });

  it('rejects occupied, reserved and unconnected cells', () => {
    const game = newGame();
    expect(game.station.checkPlacement('power', { x: 1, y: 0, z: 0 }, 0)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(game.station.checkPlacement('power', { x: 0, y: 0, z: -2 }, 0)).toMatchObject({ ok: false, reason: 'reserved' });
    expect(game.station.checkPlacement('power', { x: 2, y: 0, z: 2 }, 0)).toMatchObject({ ok: false, reason: 'noConnection' });
    expect(game.station.checkPlacement('power', { x: 9, y: 0, z: 0 }, 0)).toMatchObject({ ok: false, reason: 'outOfBounds' });
  });

  it('only accepts rotations whose ports line up', () => {
    const game = newGame();
    // Power modules connect front/back (Z axis locally); at +Z of the hub rotations 0 and 2 fit.
    expect(game.station.validRotations('power', { x: 0, y: 0, z: 1 }).sort()).toEqual([0, 2]);
    // Solar arrays have a single rear port, so exactly one rotation faces the hub.
    expect(game.station.validRotations('solar', { x: 0, y: 0, z: 1 })).toEqual([0]);
  });

  it('keeps clearance for docking approach lanes', () => {
    const game = newGame();
    // A docking module facing -Z at (-1,0,-1) would need (-1,0,-2) and (-1,0,-3) clear.
    const result = game.station.checkPlacement('docking', { x: -1, y: 0, z: 1 }, 0);
    expect(result.ok).toBe(true);
  });

  it('builds a module, charges its cost and finishes construction over time', () => {
    const game = newGame();
    const credits = game.state.resources.credits;
    const metal = game.state.resources.metal;
    const result = game.buildModule('power', { x: 0, y: 0, z: 1 }, 0);
    expect(result.ok).toBe(true);
    expect(game.state.resources.credits).toBe(credits - 450);
    expect(game.state.resources.metal).toBe(metal - 40);
    const built = game.station.modules.find((m) => m.type === 'power');
    expect(built?.status).toBe('constructing');
    for (let i = 0; i < 45; i++) game.step(0.1);
    expect(built?.status).toBe('active');
    expect(game.state.stats.modulesBuilt).toBe(1);
  });

  it('refuses to build without resources', () => {
    const game = newGame();
    game.state.resources.credits = 10;
    expect(game.buildModule('power', { x: 0, y: 0, z: 1 }, 0)).toEqual({ ok: false, reason: 'cost' });
  });

  it('refuses to build locked modules', () => {
    const game = newGame();
    expect(game.station.checkPlacement('factory', { x: 0, y: 0, z: 1 }, 0)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('prevents demolishing modules that would split the station', () => {
    const game = newGame();
    game.buildModule('quarters', { x: 0, y: 0, z: 1 }, 0);
    for (let i = 0; i < 40; i++) game.step(0.1);
    game.buildModule('quarters', { x: 0, y: 0, z: 2 }, 0);
    const middle = game.station.moduleAt({ x: 0, y: 0, z: 1 });
    expect(middle).toBeDefined();
    expect(game.canDemolish(middle?.id ?? -1)).toEqual({ ok: false, reason: 'disconnects' });
    expect(game.canDemolish(game.station.command().id)).toEqual({ ok: false, reason: 'command' });
  });

  it('refunds construction fully and finished modules partially', () => {
    const game = newGame();
    const credits = game.state.resources.credits;
    game.buildModule('quarters', { x: 0, y: 0, z: 1 }, 0);
    const id = game.station.moduleAt({ x: 0, y: 0, z: 1 })?.id ?? -1;
    expect(game.demolishModule(id).ok).toBe(true);
    expect(game.state.resources.credits).toBe(credits);

    game.buildModule('quarters', { x: 0, y: 0, z: 1 }, 0);
    for (let i = 0; i < 40; i++) game.step(0.1);
    const id2 = game.station.moduleAt({ x: 0, y: 0, z: 1 })?.id ?? -1;
    expect(game.demolishModule(id2).ok).toBe(true);
    expect(game.state.resources.credits).toBe(credits - 150);
  });

  it('finds paths through the module graph', () => {
    const game = newGame();
    const solar = game.station.moduleAt({ x: 1, y: 0, z: 0 });
    const storage = game.station.moduleAt({ x: -1, y: 0, z: 0 });
    const path = game.station.path(solar?.id ?? -1, storage?.id ?? -1);
    expect(path).toEqual([solar?.id, game.station.command().id, storage?.id]);
  });
});
