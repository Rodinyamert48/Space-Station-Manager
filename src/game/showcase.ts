import { TECH_IDS } from '../data/research';
import type { Rotation, Vec3i } from '../data/grid';
import type { ModuleType } from '../data/modules';
import { CREW_ROLES } from '../data/crew';
import { Game } from './Game';
import { createCrewMember, createNewGameState } from './newGame';
import type { GameState } from './state';

const LAYOUT: [ModuleType, Vec3i, Rotation][] = [
  ['power', { x: 0, y: 0, z: 1 }, 0],
  ['lifeSupport', { x: 0, y: 0, z: 2 }, 0],
  ['quarters', { x: 1, y: 0, z: 2 }, 0],
  ['restaurant', { x: -1, y: 0, z: 2 }, 0],
  ['lab', { x: 0, y: 0, z: 3 }, 0],
  ['comms', { x: 0, y: 0, z: 4 }, 0],
  ['factory', { x: -1, y: 0, z: 1 }, 0],
  ['storage', { x: -2, y: 0, z: 0 }, 0],
  ['docking', { x: -2, y: 0, z: 1 }, 3],
  ['water', { x: 2, y: 0, z: 2 }, 1],
  ['solar', { x: 1, y: 0, z: 3 }, 0],
  ['medical', { x: 1, y: 0, z: 1 }, 0],
  ['defense', { x: -2, y: 0, z: 2 }, 3],
  ['docking', { x: 3, y: 0, z: 2 }, 1],
  ['quarters', { x: 1, y: 1, z: 2 }, 0],
  ['cargo', { x: -2, y: 0, z: -1 }, 0],
  ['solar', { x: -3, y: 0, z: 0 }, 1],
];

/** A mid-sized, fully built station used as the animated title-screen backdrop. */
export function createShowcaseGame(): Game {
  const state: GameState = createNewGameState(20250);
  state.stage = 4;
  state.research.completed = [...TECH_IDS];
  state.resources.credits = 1e6;
  state.resources.metal = 600;
  state.resources.electronics = 600;
  state.resources.titanium = 600;
  state.events.nextEventAt = 1e9;
  state.missions.nextOfferAt = 1e9;
  state.reputation = 55;
  state.ships.autoAccept = true;
  const game = new Game(state);
  for (const [type, cell, rotation] of LAYOUT) {
    const rotations = game.station.validRotations(type, cell);
    const r = rotations.includes(rotation) ? rotation : rotations[0];
    if (r !== undefined) game.buildModule(type, cell, r);
  }
  for (const m of game.station.modules) {
    m.status = 'active';
    m.buildProgress = 99;
  }
  game.resources.recomputeCapacity();
  // Staff every workplace so the backdrop looks busy and healthy.
  for (let i = 0; i < 18; i++) {
    const role = CREW_ROLES[i % CREW_ROLES.length] ?? 'worker';
    state.crew.members.push(createCrewMember(state.crew.nextId++, role, game.rng, game.hour, game.station.command().id));
  }
  game.crew.markDirty();
  game.state.ships.nextArrivalAt = game.hour + 0.5;
  return game;
}
