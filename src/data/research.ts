import type { ModuleType } from './modules';

export const TECH_IDS = [
  'basicPower',
  'improvedLifeSupport',
  'advancedSolar',
  'advancedManufacturing',
  'quantumComms',
  'efficientWater',
  'fusionPower',
  'automatedCargo',
  'defenseSystems',
  'luxuryHabitats',
  'advancedDocking',
  'aiManagement',
  'deepSpaceTravel',
] as const;
export type TechId = (typeof TECH_IDS)[number];

/** Global multipliers/bonuses. Completed techs and active events both contribute. */
export interface Modifiers {
  powerOutput: number;
  solarOutput: number;
  oxygenOutput: number;
  waterOutput: number;
  foodOutput: number;
  researchOutput: number;
  factoryOutput: number;
  waterUse: number;
  fuelUse: number;
  serviceTime: number;
  tradeCapacity: number;
  crewCapacity: number;
  happiness: number;
  restaurantIncome: number;
  shipTraffic: number;
  missionRewards: number;
  staffReduction: number;
  efficiency: number;
}

export type Feature = 'autoTrade' | 'largeShips' | 'rareTraders';

export interface TechDef {
  id: TechId;
  research: number;
  credits: number;
  hours: number;
  requires: TechId[];
  unlocksModules?: ModuleType[];
  features?: Feature[];
  /** Additive bonuses, e.g. powerOutput: 0.15 means +15%. */
  effects: Partial<Modifiers>;
  col: number;
  row: number;
}

export const TECHS: Record<TechId, TechDef> = {
  basicPower: { id: 'basicPower', research: 8, credits: 0, hours: 2, requires: [], effects: { powerOutput: 0.15 }, col: 0, row: 0 },
  improvedLifeSupport: {
    id: 'improvedLifeSupport', research: 20, credits: 150, hours: 4, requires: [],
    unlocksModules: ['medical'], effects: { oxygenOutput: 0.35 }, col: 0, row: 3,
  },
  advancedSolar: { id: 'advancedSolar', research: 40, credits: 300, hours: 6, requires: ['basicPower'], effects: { solarOutput: 0.5 }, col: 1, row: 0 },
  advancedManufacturing: {
    id: 'advancedManufacturing', research: 45, credits: 400, hours: 6, requires: ['basicPower'],
    unlocksModules: ['factory'], effects: { factoryOutput: 0.1 }, col: 1, row: 1,
  },
  quantumComms: {
    id: 'quantumComms', research: 60, credits: 600, hours: 8, requires: ['improvedLifeSupport'],
    unlocksModules: ['comms'], effects: { shipTraffic: 0.1 }, col: 1, row: 2,
  },
  efficientWater: {
    id: 'efficientWater', research: 40, credits: 300, hours: 6, requires: ['improvedLifeSupport'],
    effects: { waterOutput: 0.35, waterUse: -0.25 }, col: 1, row: 3,
  },
  fusionPower: {
    id: 'fusionPower', research: 140, credits: 1500, hours: 12, requires: ['advancedSolar', 'advancedManufacturing'],
    effects: { powerOutput: 0.8, fuelUse: -0.4 }, col: 2, row: 0,
  },
  automatedCargo: {
    id: 'automatedCargo', research: 90, credits: 800, hours: 10, requires: ['advancedManufacturing'],
    unlocksModules: ['cargo'], features: ['autoTrade'], effects: { tradeCapacity: 0.25 }, col: 2, row: 1,
  },
  defenseSystems: {
    id: 'defenseSystems', research: 100, credits: 1000, hours: 10, requires: ['advancedManufacturing', 'quantumComms'],
    unlocksModules: ['defense'], effects: {}, col: 2, row: 2,
  },
  luxuryHabitats: {
    id: 'luxuryHabitats', research: 120, credits: 1200, hours: 12, requires: ['efficientWater'],
    effects: { crewCapacity: 0.25, happiness: 10, restaurantIncome: 0.6, foodOutput: 0.2 }, col: 2, row: 3,
  },
  advancedDocking: {
    id: 'advancedDocking', research: 160, credits: 1800, hours: 14, requires: ['automatedCargo'],
    features: ['largeShips'], effects: { serviceTime: -0.3, shipTraffic: 0.2 }, col: 3, row: 1,
  },
  aiManagement: {
    id: 'aiManagement', research: 220, credits: 2500, hours: 16, requires: ['quantumComms', 'automatedCargo'],
    effects: { staffReduction: 1, efficiency: 0.1 }, col: 3, row: 2,
  },
  deepSpaceTravel: {
    id: 'deepSpaceTravel', research: 320, credits: 4000, hours: 20, requires: ['advancedDocking', 'fusionPower'],
    features: ['rareTraders'], effects: { missionRewards: 0.3, shipTraffic: 0.15 }, col: 4, row: 1,
  },
};

export function baseModifiers(): Modifiers {
  return {
    powerOutput: 0,
    solarOutput: 0,
    oxygenOutput: 0,
    waterOutput: 0,
    foodOutput: 0,
    researchOutput: 0,
    factoryOutput: 0,
    waterUse: 0,
    fuelUse: 0,
    serviceTime: 0,
    tradeCapacity: 0,
    crewCapacity: 0,
    happiness: 0,
    restaurantIncome: 0,
    shipTraffic: 0,
    missionRewards: 0,
    staffReduction: 0,
    efficiency: 0,
  };
}
