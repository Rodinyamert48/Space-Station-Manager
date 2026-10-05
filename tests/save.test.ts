import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { SaveManager } from '../src/save/SaveManager';
import { MemoryBackend, StorageError } from '../src/save/StorageBackend';
import { defaultSettings } from '../src/settings/Settings';

const settings = { ...defaultSettings(), language: 'en' as const };
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('save system', () => {
  it('round-trips a campaign with modules, ships, crew and research', async () => {
    const manager = new SaveManager(new MemoryBackend());
    const game = new Game(createNewGameState(11));
    game.buildModule('lifeSupport', { x: 0, y: 0, z: 1 }, 0);
    const ship = game.ships.spawn('cargo');
    game.ships.accept(ship.id);
    game.state.resources.research = 30;
    game.research.start('improvedLifeSupport');
    runHours(game, 3);
    const meta = await manager.save('manual', game, settings);
    expect(meta.modules).toBe(5);

    const loaded = await manager.load('manual');
    expect(loaded).not.toBeNull();
    if (!loaded) return;
    const restored = new Game(loaded.state);
    expect(restored.station.modules.map((m) => [m.type, m.cell, m.rotation])).toEqual(game.station.modules.map((m) => [m.type, m.cell, m.rotation]));
    expect(restored.state.resources).toEqual(game.state.resources);
    expect(restored.ships.list.map((s) => s.status)).toEqual(game.ships.list.map((s) => s.status));
    expect(restored.state.research.active?.id).toBe('improvedLifeSupport');
    expect(restored.hour).toBe(game.hour);
    // The RNG continues identically after loading.
    expect(restored.rng.next()).toBe(game.rng.next());
  });

  it('continues simulating deterministically after a load', async () => {
    const manager = new SaveManager(new MemoryBackend());
    const a = new Game(createNewGameState(99));
    runHours(a, 10);
    const text = manager.serialize(a, settings, 'auto');
    const b = new Game(manager.deserialize(text).state);
    runHours(a, 30);
    runHours(b, 30);
    expect(b.state.resources).toEqual(a.state.resources);
    expect(b.ships.list.length).toBe(a.ships.list.length);
  });

  it('lists saves newest first and finds the latest', async () => {
    const manager = new SaveManager(new MemoryBackend());
    const game = new Game(createNewGameState(1));
    await manager.save('auto', game, settings);
    await new Promise((r) => setTimeout(r, 5));
    await manager.save('manual', game, settings);
    const list = await manager.list();
    expect(list.map((m) => m.slot)).toEqual(['manual', 'auto']);
    expect((await manager.latest())?.slot).toBe('manual');
  });

  it('rejects corrupt or foreign data', () => {
    const manager = new SaveManager(new MemoryBackend());
    expect(() => manager.deserialize('{not json')).toThrow(StorageError);
    expect(() => manager.deserialize(JSON.stringify({ format: 'other' }))).toThrow(StorageError);
    const game = new Game(createNewGameState(3));
    const envelope = JSON.parse(manager.serialize(game, settings, 'auto'));
    envelope.state.station.modules = [];
    expect(() => manager.deserialize(JSON.stringify(envelope))).toThrow(/command module/);
    envelope.version = 999;
    expect(() => manager.deserialize(JSON.stringify(envelope))).toThrow(/newer version/);
  });

  it('persists settings separately and sanitises them', async () => {
    const backend = new MemoryBackend();
    const manager = new SaveManager(backend);
    await manager.saveSettings({ ...settings, masterVolume: 0.3, quality: 'low' });
    expect((await manager.loadSettings())?.masterVolume).toBe(0.3);
    await backend.set('ssm.settings', JSON.stringify({ masterVolume: 7, quality: 'insane' }));
    const sanitized = await manager.loadSettings();
    expect(sanitized?.masterVolume).toBe(1);
    expect(['low', 'medium', 'high', 'ultra']).toContain(sanitized?.quality);
  });
});
