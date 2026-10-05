import { describe, expect, it } from 'vitest';
import { MISSION_TEMPLATES } from '../src/data/missions';
import { Game } from '../src/game/Game';
import { createNewGameState } from '../src/game/newGame';

const newGame = (): Game => new Game(createNewGameState(77));
const tpl = (id: string) => {
  const t = MISSION_TEMPLATES.find((m) => m.id === id);
  if (!t) throw new Error(id);
  return t;
};
const runHours = (game: Game, hours: number): void => {
  for (let i = 0; i < Math.round(hours / 0.1); i++) game.step(0.1);
};

describe('missions', () => {
  it('offers contracts over time', () => {
    const game = newGame();
    runHours(game, 30);
    expect(game.missions.offers.length).toBeGreaterThan(0);
  });

  it('delivery contracts pay credits, research and reputation', () => {
    const game = newGame();
    const mission = game.missions.generate(tpl('researchRequest'));
    if (!mission?.good) throw new Error('no mission');
    expect(game.missions.accept(mission.id)).toEqual({ ok: true });
    game.resources.add(mission.good, mission.qty);
    const credits = game.state.resources.credits;
    const rep = game.state.reputation;
    const partial = Math.floor(mission.qty / 2);
    game.state.resources[mission.good] = partial;
    expect(game.missions.deliver(mission.id)).toEqual({ ok: true, qty: partial });
    expect(game.missions.active).toHaveLength(1);
    game.resources.add(mission.good, mission.qty);
    game.missions.deliver(mission.id);
    expect(game.missions.active).toHaveLength(0);
    expect(game.state.resources.credits).toBe(credits + mission.rewardCredits);
    expect(game.state.reputation).toBeGreaterThan(rep);
    expect(game.state.resources.research).toBeGreaterThanOrEqual(mission.rewardResearch);
    expect(game.state.stats.missionsCompleted).toBe(1);
  });

  it('missed deadlines cost reputation', () => {
    const game = newGame();
    const mission = game.missions.generate(tpl('fuelContract'));
    if (!mission) throw new Error('no mission');
    game.missions.accept(mission.id);
    const rep = game.state.reputation;
    runHours(game, mission.durationHours + 1);
    expect(game.missions.active).toHaveLength(0);
    expect(game.state.reputation).toBeLessThan(rep);
    expect(game.state.missions.failed).toBe(1);
  });

  it('hospitality needs free berths and adds guests to the population', () => {
    const game = newGame();
    const mission = game.missions.generate(tpl('hospitality'));
    if (!mission) throw new Error('no mission');
    mission.qty = 2;
    const pop = game.population();
    expect(game.missions.accept(mission.id)).toEqual({ ok: true });
    expect(game.population()).toBe(pop + 2);
    const big = game.missions.generate(tpl('hospitality'));
    if (!big) throw new Error('no mission');
    big.qty = 50;
    expect(game.missions.accept(big.id)).toEqual({ ok: false, reason: 'noBeds' });
  });

  it('docking contracts complete as ships dock', () => {
    const game = newGame();
    const mission = game.missions.generate(tpl('trafficContract'));
    if (!mission) throw new Error('no mission');
    game.missions.accept(mission.id);
    game.state.stats.shipsDocked += mission.qty;
    runHours(game, 1.1);
    expect(game.state.missions.completed).toBe(1);
  });
});

describe('events', () => {
  it('triggers on schedule and resolves with a default choice when ignored', () => {
    const game = newGame();
    game.state.events.nextEventAt = game.hour + 0.5;
    runHours(game, 1.2);
    expect(game.events.pending.length).toBe(1);
    runHours(game, 12);
    expect(game.events.pending.length).toBe(0);
    expect(game.state.stats.eventsResolved).toBe(1);
  });

  it('solar storms cut solar output', () => {
    const game = newGame();
    const before = game.resources.computeFlows().energyProduction;
    const e = game.events.trigger('solarStorm');
    if (!e) throw new Error('no event');
    game.events.resolve(e.id, 0);
    expect(game.resources.computeFlows().energyProduction).toBeLessThan(before - 15);
  });

  it('oxygen leaks drain air until sealed', () => {
    const game = newGame();
    const before = game.resources.computeFlows().consumption.oxygen;
    const e = game.events.trigger('oxygenLeak');
    if (!e) throw new Error('no event');
    expect(game.resources.computeFlows().consumption.oxygen).toBeGreaterThan(before);
    game.events.resolve(e.id, 0);
    expect(game.resources.computeFlows().consumption.oxygen).toBeCloseTo(before, 5);
  });

  it('choices with costs require resources', () => {
    const game = newGame();
    const e = game.events.trigger('powerFailure');
    if (!e) throw new Error('no event');
    const damaged = game.station.getModule(e.moduleId);
    expect(damaged?.damaged).toBe(true);
    game.state.resources.credits = 0;
    expect(game.events.resolve(e.id, 0)).toEqual({ ok: false, reason: 'cost' });
    game.state.resources.credits = 5000;
    expect(game.events.resolve(e.id, 0)).toEqual({ ok: true });
    expect(damaged?.damaged).toBe(false);
  });

  it('pirates are repelled by strong defenses', () => {
    const game = newGame();
    game.state.stage = 2;
    const e = game.events.trigger('pirateAttack');
    if (!e) throw new Error('no event');
    let repelled: boolean | null = null;
    game.bus.on('pirateAttack', (p) => (repelled = p.repelled));
    game.events.resolve(e.id, 0);
    expect(repelled).toBe(false);
  });

  it('supply crises raise prices temporarily', () => {
    const game = newGame();
    const e = game.events.trigger('supplyCrisis');
    if (!e?.good) throw new Error('no event');
    expect(game.priceEffect(e.good)).toBeGreaterThan(1.5);
    runHours(game, 50);
    expect(game.priceEffect(e.good)).toBe(1);
  });

  it('damaged modules stop working until repaired', () => {
    const game = newGame();
    const solar = game.station.modules.find((m) => m.type === 'solar');
    if (!solar) throw new Error('no solar');
    solar.damaged = true;
    expect(game.station.isOperational(solar)).toBe(false);
    expect(game.repairModule(solar.id).ok).toBe(true);
    expect(game.station.isOperational(solar)).toBe(true);
  });
});

describe('progression', () => {
  it('advances stages when requirements are met and widens the perimeter', () => {
    const game = newGame();
    expect(game.state.stage).toBe(1);
    expect(game.station.bounds().radius).toBe(3);
    const reqs = game.progression.requirements();
    expect(reqs.some((r) => !r.met)).toBe(true);
    game.state.reputation = 20;
    game.state.stats.shipsDocked = 10;
    for (let i = 0; i < 3; i++) game.state.crew.members.push({ ...game.state.crew.members[0]!, id: 100 + i });
    const cells = [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 3 },
    ];
    for (const c of cells) game.buildModule('quarters', c, 0);
    runHours(game, 4);
    expect(game.state.stage).toBe(2);
    expect(game.station.bounds().radius).toBe(4);
  });

  it('measures station value from built modules', () => {
    const game = newGame();
    const before = game.progression.stationValue();
    game.buildModule('quarters', { x: 0, y: 0, z: 1 }, 0);
    expect(game.progression.stationValue()).toBe(before + 300 + 25 * 6);
  });
});
