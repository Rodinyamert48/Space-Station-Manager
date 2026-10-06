import { describe, expect, it } from 'vitest';
import type { Rotation, Vec3i } from '../src/data/grid';
import type { ModuleType } from '../src/data/modules';
import { RESOURCE_IDS } from '../src/data/resources';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { SaveManager } from '../src/save/SaveManager';
import { MemoryBackend } from '../src/save/StorageBackend';
import { defaultSettings } from '../src/settings/Settings';

/** Plays a campaign hands-off: accepts traffic and contracts, answers incidents, expands a little. */
function autoplay(game: Game, days: number): void {
  game.ships.setAutoAccept(true);
  const extra: [ModuleType, Vec3i, Rotation][] = [
    ['power', { x: 0, y: 0, z: 1 }, 0],
    ['lifeSupport', { x: 0, y: 0, z: 2 }, 0],
    ['quarters', { x: -1, y: 0, z: 1 }, 1],
  ];
  for (let hour = 0; hour < days * 24; hour++) {
    for (let i = 0; i < 10; i++) game.step(0.1);
    for (const e of [...game.events.pending]) game.events.resolve(e.id, 0, true);
    const offer = game.state.missions.offers[0];
    if (offer && game.state.missions.active.length < 2) game.missions.accept(offer.id);
    const next = extra[0];
    if (next && game.buildModule(next[0], next[1], next[2]).ok) extra.shift();
    if (game.state.economy.bankrupt) break;
  }
}

describe('long-running simulation', () => {
  it('stays numerically sound over many days', () => {
    for (const seed of [1, 42, 777]) {
      const game = new Game(createNewGameState(seed));
      autoplay(game, 25);
      for (const id of RESOURCE_IDS) {
        const value = game.state.resources[id];
        expect(Number.isFinite(value), `${id} on seed ${seed}`).toBe(true);
        expect(value, `${id} on seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isFinite(game.state.reputation)).toBe(true);
      expect(game.state.stats.shipsDocked).toBeGreaterThan(0);
      for (const m of game.state.crew.members) {
        expect(Number.isFinite(m.happiness) && Number.isFinite(m.energy) && Number.isFinite(m.health)).toBe(true);
      }
    }
  });

  it('round-trips a mature campaign through the save system', async () => {
    const game = new Game(createNewGameState(9));
    autoplay(game, 12);
    const saves = new SaveManager(new MemoryBackend());
    await saves.save('manual', game, defaultSettings());
    const loaded = await saves.load('manual');
    if (!loaded) throw new Error('save missing');
    const restored = new Game(loaded.state);
    expect(restored.state).toEqual(JSON.parse(JSON.stringify(game.state)));
    // Both copies keep simulating identically (the RNG state is part of the save).
    for (let i = 0; i < 240; i++) {
      game.step(0.1);
      restored.step(0.1);
    }
    expect(restored.state.resources).toEqual(game.state.resources);
  });
});
