import { Rng } from '../core/Rng';
import { FIRST_NAMES, LAST_NAMES, type CrewRole } from '../data/crew';
import type { Rotation, Vec3i } from '../data/grid';
import type { ModuleType } from '../data/modules';
import { RESOURCES } from '../data/resources';
import { SAVE_VERSION, goodsRecord, type CrewMember, type GameState, type ModuleState } from './state';

/** The small, aging outpost every campaign starts from. */
const START_LAYOUT: { type: ModuleType; cell: Vec3i; rotation: Rotation }[] = [
  { type: 'command', cell: { x: 0, y: 0, z: 0 }, rotation: 0 },
  { type: 'solar', cell: { x: 1, y: 0, z: 0 }, rotation: 1 },
  { type: 'storage', cell: { x: -1, y: 0, z: 0 }, rotation: 0 },
  { type: 'docking', cell: { x: 0, y: 0, z: -1 }, rotation: 2 },
];

const START_CREW: CrewRole[] = ['engineer', 'engineer', 'pilot', 'worker'];

export function randomCrewName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function createCrewMember(id: number, role: CrewRole, rng: Rng, hour: number, locationId: number): CrewMember {
  return {
    id,
    name: randomCrewName(rng),
    role,
    happiness: 70,
    energy: rng.range(60, 95),
    health: 100,
    hunger: rng.range(0, 6),
    need: 'none',
    task: 'idle',
    locationId,
    workId: 0,
    hiredAt: hour,
  };
}

export function createNewGameState(seed = (Date.now() ^ 0x5f3759df) >>> 0): GameState {
  const rng = new Rng(seed);
  const modules: ModuleState[] = START_LAYOUT.map((m, i) => ({
    id: i + 1,
    type: m.type,
    cell: { ...m.cell },
    rotation: m.rotation,
    status: 'active',
    buildProgress: 0,
    enabled: true,
    damaged: false,
    offlineUntil: 0,
    builtAt: 0,
  }));

  const members = START_CREW.map((role, i) => createCrewMember(i + 1, role, rng, 0, 1));

  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    time: { hour: 6, speed: 1 },
    resources: {
      credits: 4000,
      energy: 80,
      oxygen: 70,
      water: 60,
      food: 50,
      fuel: 40,
      metal: 120,
      electronics: 20,
      titanium: 0,
      research: 0,
    },
    station: { modules, nextModuleId: modules.length + 1 },
    economy: {
      today: { income: {}, expenses: {} },
      history: [],
      debtDays: 0,
      bankrupt: false,
      energyConsumedToday: 0,
    },
    market: {
      prices: goodsRecord((g) => RESOURCES[g].basePrice ?? 1),
      pressure: goodsRecord(() => 0),
      history: goodsRecord((g) => [RESOURCES[g].basePrice ?? 1]),
      drift: goodsRecord(() => 1),
    },
    crew: { members, nextId: members.length + 1, salaryRate: 1, applicants: { engineer: 1, scientist: 2, worker: 1 } },
    ships: {
      list: [],
      nextId: 1,
      nextArrivalAt: 9,
      autoAccept: false,
      autoTrade: { enabled: false, sellAbove: 0.8, buyBelow: 0.2 },
    },
    research: { completed: [], active: null },
    missions: { offers: [], active: [], nextId: 1, nextOfferAt: 12, completed: 0, failed: 0 },
    events: { pending: [], effects: [], nextId: 1, nextEventAt: 60, log: [] },
    reputation: 10,
    stage: 1,
    tutorial: { step: 0, done: false },
    stats: {
      creditsEarned: 0,
      creditsSpent: 0,
      cargoMoved: 0,
      shipsDocked: 0,
      modulesBuilt: 0,
      researchCompleted: 0,
      tradeVolume: 0,
      peakCrew: members.length,
      missionsCompleted: 0,
      eventsResolved: 0,
      passengersServed: 0,
    },
  };
}
