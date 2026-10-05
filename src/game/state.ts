import type { CrewRole } from '../data/crew';
import type { EventId } from '../data/events';
import type { Rotation, Vec3i } from '../data/grid';
import type { ModuleType } from '../data/modules';
import { GOODS, type Good, type ResourceId } from '../data/resources';
import type { TechId } from '../data/research';
import type { ShipSize, ShipTypeId } from '../data/ships';

export const SAVE_VERSION = 1;

export type GameSpeed = 0 | 1 | 2 | 4;

export interface TimeState {
  /** Total elapsed game hours since the start of the campaign. */
  hour: number;
  speed: GameSpeed;
}

export type ModuleStatus = 'constructing' | 'active';

export interface ModuleState {
  id: number;
  type: ModuleType;
  cell: Vec3i;
  rotation: Rotation;
  status: ModuleStatus;
  /** Construction progress in game hours. */
  buildProgress: number;
  /** Player toggle; disabled modules neither produce nor consume. */
  enabled: boolean;
  damaged: boolean;
  /** Game hour until which the module is forced offline by an event (0 = none). */
  offlineUntil: number;
  builtAt: number;
}

export interface StationState {
  modules: ModuleState[];
  nextModuleId: number;
}

export type IncomeCategory = 'trade' | 'docking' | 'services' | 'passengers' | 'missions' | 'other';
export type ExpenseCategory =
  | 'salaries'
  | 'upkeep'
  | 'energy'
  | 'construction'
  | 'research'
  | 'trade'
  | 'shipServices'
  | 'events'
  | 'hiring';

export interface Ledger {
  income: Partial<Record<IncomeCategory, number>>;
  expenses: Partial<Record<ExpenseCategory, number>>;
}

export interface DayReport extends Ledger {
  day: number;
  net: number;
  credits: number;
}

export interface EconomyState {
  today: Ledger;
  history: DayReport[];
  /** Consecutive day-ends spent in debt. */
  debtDays: number;
  bankrupt: boolean;
  /** Energy consumed since the last daily bill. */
  energyConsumedToday: number;
}

export interface MarketState {
  prices: Record<Good, number>;
  /** Accumulated trade pressure: positive after the station buys, negative after it sells. */
  pressure: Record<Good, number>;
  history: Record<Good, number[]>;
  /** Long-running galactic drift per good. */
  drift: Record<Good, number>;
}

export type CrewNeed = 'none' | 'rest' | 'food' | 'fun' | 'medical';
export type CrewTask = 'working' | 'resting' | 'eating' | 'relaxing' | 'treatment' | 'idle';

export interface CrewMember {
  id: number;
  name: string;
  role: CrewRole;
  happiness: number;
  energy: number;
  health: number;
  /** Hours since the last meal. */
  hunger: number;
  need: CrewNeed;
  task: CrewTask;
  /** Module the crew member currently occupies. */
  locationId: number;
  /** Assigned workplace (0 = unassigned). */
  workId: number;
  hiredAt: number;
}

export interface CrewState {
  members: CrewMember[];
  nextId: number;
  /** Salary multiplier (raised by negotiations). */
  salaryRate: number;
  /** Number of applicants waiting to be hired, per role. */
  applicants: Partial<Record<CrewRole, number>>;
}

export interface TradeLine {
  good: Good;
  qty: number;
  price: number;
}

export type ShipStatus = 'pending' | 'queued' | 'approaching' | 'docked' | 'departing';

export interface ShipState {
  id: number;
  type: ShipTypeId;
  size: ShipSize;
  name: string;
  owner: string;
  origin: string;
  destination: string;
  cargoCapacity: number;
  offers: TradeLine[];
  demands: TradeLine[];
  /** Research points for sale (research vessels). */
  researchOffer: number;
  researchPrice: number;
  passengers: number;
  passengerFee: number;
  fee: number;
  status: ShipStatus;
  statusSince: number;
  patienceUntil: number;
  priority: boolean;
  berthId: number;
  serviceUntil: number;
  /** Units the station can still move with this ship during the visit. */
  tradeAllowance: number;
  demandTotal: number;
  demandFilled: number;
  holdingSlot: number;
  /** Flagged by events, e.g. a rare trader. */
  special: boolean;
}

export interface ShipsState {
  list: ShipState[];
  nextId: number;
  nextArrivalAt: number;
  autoAccept: boolean;
  autoTrade: AutoTradeRules;
}

export interface AutoTradeRules {
  enabled: boolean;
  /** Sell surplus above this fraction of storage capacity. */
  sellAbove: number;
  /** Buy goods below this fraction of storage capacity. */
  buyBelow: number;
}

export interface ResearchState {
  completed: TechId[];
  active: { id: TechId; progress: number; duration: number } | null;
}

export type MissionKind = 'deliver' | 'hospitality' | 'dock';

export interface Mission {
  id: number;
  kind: MissionKind;
  templateId: string;
  client: string;
  good: Good | null;
  qty: number;
  progress: number;
  rewardCredits: number;
  rewardReputation: number;
  rewardResearch: number;
  /** Offer expiry while on the board; deadline once accepted. */
  expiresAt: number;
  durationHours: number;
  acceptedAt: number;
  /** Ships docked counter value when a docking contract started. */
  baseline: number;
  special: boolean;
}

export interface MissionsState {
  offers: Mission[];
  active: Mission[];
  nextId: number;
  nextOfferAt: number;
  completed: number;
  failed: number;
}

export interface PendingEvent {
  id: number;
  eventId: EventId;
  createdAt: number;
  expiresAt: number;
  moduleId: number;
  shipId: number;
  good: Good | null;
  amount: number;
}

export type EffectKind =
  | 'solarOutput'
  | 'production'
  | 'price'
  | 'oxygenLeak'
  | 'strike'
  | 'traffic'
  | 'happiness'
  | 'defense';

export interface TimedEffect {
  id: number;
  kind: EffectKind;
  value: number;
  until: number;
  good: Good | null;
  source: EventId;
}

export interface EventsState {
  pending: PendingEvent[];
  effects: TimedEffect[];
  nextId: number;
  nextEventAt: number;
  log: { eventId: EventId; hour: number; choice: number }[];
}

export interface TutorialState {
  step: number;
  done: boolean;
}

export interface StatsState {
  creditsEarned: number;
  creditsSpent: number;
  cargoMoved: number;
  shipsDocked: number;
  modulesBuilt: number;
  researchCompleted: number;
  tradeVolume: number;
  peakCrew: number;
  missionsCompleted: number;
  eventsResolved: number;
  passengersServed: number;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  time: TimeState;
  resources: Record<ResourceId, number>;
  station: StationState;
  economy: EconomyState;
  market: MarketState;
  crew: CrewState;
  ships: ShipsState;
  research: ResearchState;
  missions: MissionsState;
  events: EventsState;
  reputation: number;
  stage: number;
  tutorial: TutorialState;
  stats: StatsState;
}

const goodsRecord = <T>(make: (g: Good) => T): Record<Good, T> => {
  const out = {} as Record<Good, T>;
  for (const g of GOODS) out[g] = make(g);
  return out;
};

export { goodsRecord };
