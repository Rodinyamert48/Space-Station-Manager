import { describe, expect, it } from 'vitest';
import { TECHS, TECH_IDS } from '../src/data/research';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';

const newGame = (): Game => new Game(createNewGameState(5));
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('research', () => {
  it('has a valid acyclic tree', () => {
    for (const id of TECH_IDS) {
      for (const req of TECHS[id].requires) {
        expect(TECH_IDS).toContain(req);
        expect(TECHS[req].col).toBeLessThan(TECHS[id].col);
      }
    }
  });

  it('requires research points and prerequisites', () => {
    const game = newGame();
    expect(game.research.check('basicPower')).toEqual({ ok: false, reason: 'research' });
    expect(game.research.check('advancedSolar')).toEqual({ ok: false, reason: 'locked' });
    game.state.resources.research = 100;
    expect(game.research.check('basicPower')).toEqual({ ok: true });
  });

  it('spends costs, progresses over time and applies effects', () => {
    const game = newGame();
    game.state.resources.research = 30;
    const credits = game.state.resources.credits;
    expect(game.research.start('improvedLifeSupport').ok).toBe(true);
    expect(game.state.resources.research).toBeCloseTo(10, 5);
    expect(game.state.resources.credits).toBe(credits - TECHS.improvedLifeSupport.credits);
    expect(game.research.check('basicPower')).toEqual({ ok: false, reason: 'busy' });
    expect(game.isModuleUnlocked('medical')).toBe(false);
    runHours(game, TECHS.improvedLifeSupport.hours + 0.2);
    expect(game.research.isCompleted('improvedLifeSupport')).toBe(true);
    expect(game.isModuleUnlocked('medical')).toBe(true);
    expect(game.modifiers().oxygenOutput).toBeCloseTo(0.35, 5);
    expect(game.state.stats.researchCompleted).toBe(1);
  });

  it('laboratories speed up projects', () => {
    const game = newGame();
    expect(game.research.speed()).toBe(1);
    game.buildModule('lab', { x: 0, y: 0, z: 1 }, 0);
    runHours(game, 6);
    expect(game.research.speed()).toBeCloseTo(1.3, 5);
  });

  it('cancelling refunds the project', () => {
    const game = newGame();
    game.state.resources.research = 20;
    const credits = game.state.resources.credits;
    game.research.start('basicPower');
    game.research.cancel();
    expect(game.state.resources.research).toBeCloseTo(20, 5);
    expect(game.state.resources.credits).toBe(credits);
    expect(game.state.research.active).toBeNull();
  });

  it('staff reduction from AI management lowers crew requirements', () => {
    const game = newGame();
    expect(game.crew.required('lab')).toBe(2);
    game.research.complete('aiManagement');
    expect(game.crew.required('lab')).toBe(1);
    expect(game.crew.required('power')).toBe(0);
  });
});
