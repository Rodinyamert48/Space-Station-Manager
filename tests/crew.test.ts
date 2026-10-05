import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';
import { AUTOMATION_FLOOR } from '../src/game/systems/CrewSystem';

const newGame = (): Game => new Game(createNewGameState(31));
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('crew', () => {
  it('assigns specialists to matching workplaces', () => {
    const game = newGame();
    game.buildModule('power', { x: 0, y: 0, z: 1 }, 0);
    runHours(game, 5);
    const power = game.station.modules.find((m) => m.type === 'power');
    const dock = game.station.modules.find((m) => m.type === 'docking');
    const powerStaff = game.crew.staffingOf(power?.id ?? -1);
    expect(powerStaff.filled).toBe(1);
    expect(game.crew.get(powerStaff.crew[0] ?? -1)?.role).toBe('engineer');
    expect(game.crew.staffingOf(dock?.id ?? -1).filled).toBe(1);
  });

  it('lets workers cover specialist slots at reduced effectiveness', () => {
    const game = newGame();
    game.buildModule('lab', { x: 0, y: 0, z: 1 }, 0);
    runHours(game, 6);
    const lab = game.station.modules.find((m) => m.type === 'lab');
    const staffing = game.crew.staffingOf(lab?.id ?? -1);
    // No scientists aboard: the single worker helps out.
    expect(staffing.crew).toHaveLength(1);
    expect(staffing.filled).toBeCloseTo(0.6, 5);
  });

  it('runs unstaffed modules at the automation floor', () => {
    const game = newGame();
    game.state.crew.members = game.state.crew.members.filter((m) => m.role !== 'pilot' && m.role !== 'worker');
    game.crew.markDirty();
    const dock = game.station.modules.find((m) => m.type === 'docking');
    if (!dock) throw new Error('no dock');
    expect(game.crew.workFactor(dock)).toBeCloseTo(AUTOMATION_FLOOR, 5);
  });

  it('hiring needs berths, applicants and credits', () => {
    const game = newGame();
    game.state.crew.applicants = { scientist: 1 };
    expect(game.crew.canHire('doctor')).toEqual({ ok: false, reason: 'noApplicants' });
    const result = game.crew.hire('scientist');
    expect(result.ok).toBe(true);
    expect(game.state.crew.members).toHaveLength(5);
    expect(game.state.economy.today.expenses.hiring).toBeGreaterThan(0);
    game.state.crew.applicants = { worker: 3 };
    game.crew.hire('worker');
    // Six berths in the starting outpost.
    expect(game.crew.canHire('worker')).toEqual({ ok: false, reason: 'noBeds' });
  });

  it('dismissing crew removes them from the roster', () => {
    const game = newGame();
    const id = game.state.crew.members[0]?.id ?? -1;
    expect(game.crew.fire(id)).toBe(true);
    expect(game.crew.get(id)).toBeUndefined();
  });

  it('oxygen loss injures and finally evacuates crew', () => {
    const game = newGame();
    game.state.resources.oxygen = 0;
    for (const m of game.station.modules) m.offlineUntil = 1e9; // knock out life support
    runHours(game, 3);
    expect(game.state.crew.members.every((c) => c.health < 60)).toBe(true);
    runHours(game, 6);
    expect(game.state.crew.members.length).toBe(0);
  });

  it('better pay and recreation raise morale', () => {
    const low = newGame();
    low.crew.setSalaryRate(0.8);
    const high = newGame();
    high.crew.setSalaryRate(1.5);
    high.buildModule('restaurant', { x: 0, y: 0, z: 1 }, 0);
    runHours(low, 30);
    runHours(high, 30);
    expect(high.crew.averageHappiness()).toBeGreaterThan(low.crew.averageHappiness() + 15);
  });
});
