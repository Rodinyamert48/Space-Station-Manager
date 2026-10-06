import { describe, expect, it } from 'vitest';
import { TUTORIAL_REWARD, TUTORIAL_STEPS } from '../src/data/tutorial';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { APPROACH_HOURS } from '../src/game/systems/ShipSystem';
import { SaveManager } from '../src/save/SaveManager';
import { MemoryBackend } from '../src/save/StorageBackend';
import { defaultSettings } from '../src/settings/Settings';

const newGame = (): Game => new Game(createNewGameState(4242));
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('tutorial', () => {
  it('starts with building a power module', () => {
    const game = newGame();
    expect(game.tutorial.active).toBe(true);
    expect(game.tutorial.current?.id).toBe('power');
    expect(game.tutorial.total).toBe(TUTORIAL_STEPS.length);
  });

  it('walks through every objective in order and pays the training bonus', () => {
    const game = newGame();
    const changes: number[] = [];
    game.bus.on('tutorialChanged', ({ step }) => changes.push(step));

    expect(game.buildModule('power', { x: 0, y: 0, z: 1 }, 0).ok).toBe(true);
    expect(game.tutorial.current?.id).toBe('lifeSupport');
    expect(game.buildModule('lifeSupport', { x: 0, y: 0, z: 2 }, 0).ok).toBe(true);
    expect(game.tutorial.current?.id).toBe('quarters');
    expect(game.buildModule('quarters', { x: -1, y: 0, z: 2 }, 1).ok || game.buildModule('quarters', { x: 0, y: 0, z: 3 }, 0).ok).toBe(true);
    expect(game.tutorial.current?.id).toBe('dock');

    const ship = game.ships.spawn('cargo');
    game.ships.accept(ship.id);
    runHours(game, APPROACH_HOURS + 0.2);
    expect(ship.status).toBe('docked');
    expect(game.tutorial.current?.id).toBe('trade');

    const offer = ship.offers[0];
    if (!offer) throw new Error('ship has no offers');
    expect(game.ships.trade(ship.id, offer.good, 1, 'buy').ok).toBe(true);
    expect(game.tutorial.current?.id).toBe('research');

    // A tech without module unlocks completes "research" but not "unlock".
    game.research.complete('basicPower');
    expect(game.tutorial.current?.id).toBe('unlock');

    const credits = game.state.resources.credits;
    game.research.complete('improvedLifeSupport');
    expect(game.tutorial.active).toBe(false);
    expect(game.tutorial.current).toBeNull();
    expect(game.state.resources.credits).toBe(credits + TUTORIAL_REWARD);
    expect(changes).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('skips objectives that are already met', () => {
    const game = newGame();
    game.research.complete('improvedLifeSupport');
    game.state.stats.shipsDocked = 1;
    expect(game.buildModule('power', { x: 0, y: 0, z: 1 }, 0).ok).toBe(true);
    expect(game.tutorial.current?.id).toBe('lifeSupport');
    game.buildModule('lifeSupport', { x: 0, y: 0, z: 2 }, 0);
    game.buildModule('quarters', { x: 0, y: 0, z: 3 }, 0);
    // Docked ships and the research are already done: only the trade remains.
    expect(game.tutorial.current?.id).toBe('trade');
  });

  it('can be skipped without the bonus', () => {
    const game = newGame();
    const credits = game.state.resources.credits;
    game.tutorial.skip();
    expect(game.tutorial.active).toBe(false);
    expect(game.state.resources.credits).toBe(credits);
    // Later progress no longer advances or pays anything.
    game.buildModule('power', { x: 0, y: 0, z: 1 }, 0);
    expect(game.state.tutorial.step).toBe(0);
  });

  it('survives save and load', async () => {
    const game = newGame();
    game.buildModule('power', { x: 0, y: 0, z: 1 }, 0);
    const saves = new SaveManager(new MemoryBackend());
    await saves.save('manual', game, defaultSettings());
    const loaded = await saves.load('manual');
    if (!loaded) throw new Error('save missing');
    expect(new Game(loaded.state).tutorial.current?.id).toBe('lifeSupport');
  });
});
