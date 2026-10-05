import type { CrewRole } from './crew';
import type { Dir, Vec3i } from './grid';
import type { ResourceId } from './resources';
import type { TechId } from './research';

export const MODULE_TYPES = [
  'command',
  'power',
  'solar',
  'lifeSupport',
  'water',
  'storage',
  'quarters',
  'lab',
  'factory',
  'docking',
  'cargo',
  'medical',
  'restaurant',
  'defense',
  'comms',
] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleCategory = 'core' | 'power' | 'life' | 'habitat' | 'industry' | 'logistics' | 'science' | 'defense';
export const BUILD_CATEGORIES: ModuleCategory[] = ['power', 'life', 'habitat', 'industry', 'logistics', 'science', 'defense'];

export type CostKey = 'credits' | 'metal' | 'electronics' | 'titanium';
export type Cost = Partial<Record<CostKey, number>>;

export interface ModuleDef {
  id: ModuleType;
  category: ModuleCategory;
  cost: Cost;
  buildHours: number;
  /** Credits per game day. */
  upkeep: number;
  /** Units per game hour at full efficiency. */
  produces: Partial<Record<ResourceId, number>>;
  /** Units per game hour while active (energy included). */
  consumes: Partial<Record<ResourceId, number>>;
  storage?: number;
  battery?: number;
  crewCapacity?: number;
  berths?: number;
  tradeCapacity?: number;
  defense?: number;
  /** Number of crew a recreation module keeps entertained. */
  recreation?: number;
  /** Number of crew a medical module can treat. */
  medical?: number;
  comms?: number;
  staff?: { role: CrewRole; count: number };
  /** Port directions in local space (front = +Z). */
  ports: Dir[];
  /** Local cell offsets that must stay empty (docking approach lanes, solar wings, masts). */
  reserve?: Vec3i[];
  unlockedBy?: TechId;
  unique?: boolean;
  /** Emissive accent colour used by the 3D model and UI. */
  accent: string;
}

const H4: Dir[] = ['px', 'nx', 'pz', 'nz'];
const H4V: Dir[] = ['px', 'nx', 'pz', 'nz', 'py', 'ny'];
const INLINE: Dir[] = ['pz', 'nz'];
const TERMINAL: Dir[] = ['nz'];

export const MODULES: Record<ModuleType, ModuleDef> = {
  command: {
    id: 'command', category: 'core', cost: {}, buildHours: 0, upkeep: 30,
    produces: { energy: 12, oxygen: 2.5, water: 0.6, food: 0.4, research: 0.4 }, consumes: {},
    storage: 200, battery: 120, crewCapacity: 6, recreation: 4, ports: H4, unique: true, accent: '#5fd8ff',
  },
  power: {
    id: 'power', category: 'power', cost: { credits: 450, metal: 40, electronics: 5 }, buildHours: 4, upkeep: 24,
    produces: { energy: 45 }, consumes: { fuel: 0.5 }, battery: 150, staff: { role: 'engineer', count: 1 },
    ports: INLINE, accent: '#ff9a3c',
  },
  solar: {
    id: 'solar', category: 'power', cost: { credits: 260, metal: 25 }, buildHours: 3, upkeep: 6,
    produces: { energy: 20 }, consumes: {}, ports: TERMINAL,
    reserve: [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }], accent: '#ffd36b',
  },
  lifeSupport: {
    id: 'lifeSupport', category: 'life', cost: { credits: 380, metal: 30, electronics: 5 }, buildHours: 4, upkeep: 18,
    produces: { oxygen: 10, food: 1.2 }, consumes: { energy: 8 }, staff: { role: 'engineer', count: 1 },
    ports: H4, accent: '#5dfc8d',
  },
  water: {
    id: 'water', category: 'life', cost: { credits: 320, metal: 30 }, buildHours: 4, upkeep: 16,
    produces: { water: 9 }, consumes: { energy: 7 }, staff: { role: 'engineer', count: 1 }, ports: INLINE, accent: '#46a8ff',
  },
  storage: {
    id: 'storage', category: 'industry', cost: { credits: 220, metal: 35 }, buildHours: 3, upkeep: 6,
    produces: {}, consumes: { energy: 1 }, storage: 400, battery: 100, ports: H4V, accent: '#c9d3e0',
  },
  quarters: {
    id: 'quarters', category: 'habitat', cost: { credits: 300, metal: 25 }, buildHours: 3, upkeep: 10,
    produces: {}, consumes: { energy: 4 }, crewCapacity: 8, ports: H4V, accent: '#ffe2a8',
  },
  lab: {
    id: 'lab', category: 'science', cost: { credits: 600, metal: 40, electronics: 15 }, buildHours: 5, upkeep: 30,
    produces: { research: 2.5 }, consumes: { energy: 10 }, staff: { role: 'scientist', count: 2 }, ports: INLINE, accent: '#b77cff',
  },
  factory: {
    id: 'factory', category: 'industry', cost: { credits: 750, metal: 60, electronics: 10 }, buildHours: 6, upkeep: 36,
    produces: { electronics: 1.5 }, consumes: { energy: 16, metal: 3 }, staff: { role: 'worker', count: 2 },
    ports: H4, unlockedBy: 'advancedManufacturing', accent: '#ffc23d',
  },
  docking: {
    id: 'docking', category: 'logistics', cost: { credits: 550, metal: 45, electronics: 5 }, buildHours: 5, upkeep: 22,
    produces: {}, consumes: { energy: 5 }, berths: 1, staff: { role: 'pilot', count: 1 }, ports: TERMINAL,
    reserve: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }], accent: '#4dffb8',
  },
  cargo: {
    id: 'cargo', category: 'logistics', cost: { credits: 480, metal: 40 }, buildHours: 4, upkeep: 18,
    produces: {}, consumes: { energy: 3 }, tradeCapacity: 150, storage: 200, staff: { role: 'trader', count: 1 },
    ports: H4, unlockedBy: 'automatedCargo', accent: '#4fa3ff',
  },
  medical: {
    id: 'medical', category: 'habitat', cost: { credits: 520, metal: 30, electronics: 15 }, buildHours: 4, upkeep: 28,
    produces: {}, consumes: { energy: 6 }, medical: 14, staff: { role: 'doctor', count: 1 }, ports: INLINE,
    unlockedBy: 'improvedLifeSupport', accent: '#5ff0e0',
  },
  restaurant: {
    id: 'restaurant', category: 'habitat', cost: { credits: 420, metal: 30 }, buildHours: 4, upkeep: 20,
    produces: { food: 4 }, consumes: { energy: 6, water: 1.2 }, recreation: 16, staff: { role: 'worker', count: 1 },
    ports: H4, accent: '#ff8fb1',
  },
  defense: {
    id: 'defense', category: 'defense', cost: { credits: 900, metal: 70, electronics: 20, titanium: 10 }, buildHours: 6,
    upkeep: 40, produces: {}, consumes: { energy: 9, fuel: 0.15 }, defense: 25, staff: { role: 'security', count: 2 },
    ports: TERMINAL, unlockedBy: 'defenseSystems', accent: '#ff4d4d',
  },
  comms: {
    id: 'comms', category: 'logistics', cost: { credits: 700, metal: 35, electronics: 20 }, buildHours: 5, upkeep: 28,
    produces: {}, consumes: { energy: 8 }, comms: 1, staff: { role: 'trader', count: 1 }, ports: TERMINAL,
    reserve: [{ x: 0, y: 1, z: 0 }], unlockedBy: 'quantumComms', accent: '#8ad4ff',
  },
};

export const BUILDABLE_MODULES: ModuleType[] = MODULE_TYPES.filter((t) => !MODULES[t].unique);

/** Fraction of construction cost refunded when demolishing a finished module. */
export const DEMOLISH_REFUND = 0.5;
