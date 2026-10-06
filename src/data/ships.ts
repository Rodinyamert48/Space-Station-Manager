import type { Good } from './resources';
import type { Feature } from './research';

export const SHIP_TYPES = [
  'cargo',
  'mining',
  'passenger',
  'fuelTanker',
  'research',
  'luxury',
  'military',
  'rareTrader',
] as const;
export type ShipTypeId = (typeof SHIP_TYPES)[number];
export type ShipSize = 'S' | 'M' | 'L';

export interface ShipTypeDef {
  id: ShipTypeId;
  size: ShipSize;
  weight: number;
  minReputation: number;
  requires?: Feature;
  /** Alternative unlock: this feature lets the ship appear regardless of reputation. */
  bypassReputation?: Feature;
  fee: [number, number];
  cargo: [number, number];
  passengers: [number, number];
  passengerFee: number;
  /** Goods this ship can sell to the station and the price factor relative to the market. */
  sells: Good[];
  sellFactor: [number, number];
  /** Goods this ship wants to buy and the price factor relative to the market. */
  buys: Good[];
  buyFactor: [number, number];
  /** Sells research data (research points) for credits. */
  sellsResearch?: boolean;
  patienceHours: number;
  serviceHours: number;
  color: string;
}

export const SHIPS: Record<ShipTypeId, ShipTypeDef> = {
  cargo: {
    id: 'cargo', size: 'M', weight: 30, minReputation: 0, fee: [50, 80], cargo: [120, 240], passengers: [0, 0], passengerFee: 0,
    sells: ['metal', 'food', 'electronics', 'water'], sellFactor: [0.8, 0.95],
    buys: ['water', 'oxygen', 'food', 'fuel', 'electronics'], buyFactor: [1.05, 1.25],
    patienceHours: 14, serviceHours: 9, color: '#8fb3ff',
  },
  mining: {
    id: 'mining', size: 'M', weight: 24, minReputation: 0, fee: [40, 65], cargo: [140, 260], passengers: [0, 0], passengerFee: 0,
    sells: ['metal', 'titanium'], sellFactor: [0.75, 0.9],
    buys: ['fuel', 'food', 'water', 'oxygen'], buyFactor: [1.1, 1.3],
    patienceHours: 12, serviceHours: 8, color: '#ffc14d',
  },
  passenger: {
    id: 'passenger', size: 'S', weight: 22, minReputation: 0, fee: [35, 55], cargo: [30, 60], passengers: [6, 18],
    passengerFee: 7, sells: ['food'], sellFactor: [0.9, 1.0],
    buys: ['food', 'water', 'oxygen'], buyFactor: [1.15, 1.35],
    patienceHours: 10, serviceHours: 7, color: '#7cf0d0',
  },
  fuelTanker: {
    id: 'fuelTanker', size: 'M', weight: 14, minReputation: 5, fee: [70, 100], cargo: [200, 320], passengers: [0, 0], passengerFee: 0,
    sells: ['fuel'], sellFactor: [0.7, 0.85],
    buys: ['water', 'oxygen'], buyFactor: [1.05, 1.2],
    patienceHours: 14, serviceHours: 8, color: '#ff8f3d',
  },
  research: {
    id: 'research', size: 'M', weight: 9, minReputation: 15, fee: [60, 90], cargo: [60, 120], passengers: [2, 6], passengerFee: 10,
    sells: [], sellFactor: [1, 1], sellsResearch: true,
    buys: ['electronics', 'titanium', 'food'], buyFactor: [1.15, 1.4],
    patienceHours: 16, serviceHours: 10, color: '#c08cff',
  },
  luxury: {
    id: 'luxury', size: 'L', weight: 7, minReputation: 40, requires: 'largeShips', fee: [140, 200], cargo: [80, 140],
    passengers: [18, 36], passengerFee: 20, sells: [], sellFactor: [1, 1],
    buys: ['food', 'water', 'oxygen'], buyFactor: [1.35, 1.6],
    patienceHours: 8, serviceHours: 10, color: '#ffe6a3',
  },
  military: {
    id: 'military', size: 'L', weight: 6, minReputation: 50, requires: 'largeShips', fee: [120, 170], cargo: [260, 420],
    passengers: [0, 0], passengerFee: 0, sells: ['metal'], sellFactor: [0.85, 0.95],
    buys: ['fuel', 'food', 'titanium', 'electronics'], buyFactor: [1.2, 1.45],
    patienceHours: 9, serviceHours: 10, color: '#9aa6b5',
  },
  rareTrader: {
    id: 'rareTrader', size: 'M', weight: 4, minReputation: 60, bypassReputation: 'rareTraders', fee: [90, 130],
    cargo: [100, 180], passengers: [0, 2], passengerFee: 0, sells: ['titanium', 'electronics'], sellFactor: [0.6, 0.75],
    buys: ['oxygen', 'water', 'food', 'metal'], buyFactor: [1.4, 1.8],
    patienceHours: 7, serviceHours: 7, color: '#ff7ae0',
  },
};

export const SHIP_NAME_PREFIX = ['ISV', 'MSV', 'CSV', 'RSS', 'TSV', 'HV', 'KSS', 'NSV'];
export const SHIP_NAME_WORDS = [
  'Kepler', 'Aurora', 'Meridian', 'Halcyon', 'Odyssey', 'Vanguard', 'Serenity', 'Nomad', 'Borealis', 'Tempest',
  'Pioneer', 'Zenith', 'Corvus', 'Lyra', 'Nebula', 'Polaris', 'Cassini', 'Atlas', 'Orion', 'Valkyrie', 'Ember',
  'Tethys', 'Calypso', 'Anatolia', 'Solstice', 'Equinox', 'Harbinger', 'Starling', 'Wayfarer', 'Drifter',
];
export const SHIP_OWNERS = [
  'Helios Freight', 'Kuiper Mining Company', 'Orion Lines', 'Ceres Consolidated', 'Tycho Logistics', 'Europa Agri',
  'Vesta Heavy Industries', 'Callisto Transit', 'Free Trader Guild', 'Titan Fuel Cartel', 'Ganymede Research Institute',
  'Lagrange Holdings',
];
export const LOCATIONS = [
  'Mars Orbital', 'Europa Colony', 'Ceres Hub', 'Titan Refinery', 'Luna Gateway', 'Ganymede Labs', 'Vesta Yards',
  'Callisto Station', 'Io Foundry', 'Pluto Outpost', 'Enceladus Wells', 'Phobos Depot', 'Kuiper Belt',
];
