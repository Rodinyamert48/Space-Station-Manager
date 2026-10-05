import type { TKey, TParams } from '../i18n/i18n';
import type { Good } from '../data/resources';
import type { TechId } from '../data/research';
import type {
  CrewMember,
  DayReport,
  GameSpeed,
  Mission,
  ModuleState,
  PendingEvent,
  ShipState,
} from './state';

export type NoticeLevel = 'info' | 'success' | 'warning' | 'danger';

export interface Notice {
  id: number;
  level: NoticeLevel;
  key: TKey;
  params?: TParams;
  hour: number;
  /** Optional world focus target for the notification. */
  moduleId?: number;
  shipId?: number;
}

export interface GameEvents {
  hour: { hour: number };
  day: { day: number; report: DayReport };
  speedChanged: { speed: GameSpeed };
  notice: Notice;

  moduleAdded: { module: ModuleState };
  moduleRemoved: { module: ModuleState };
  moduleChanged: { module: ModuleState };
  moduleCompleted: { module: ModuleState };
  layoutChanged: Record<string, never>;

  shipAdded: { ship: ShipState };
  shipChanged: { ship: ShipState };
  shipRemoved: { ship: ShipState };
  traded: { ship: ShipState | null; good: Good | 'research'; qty: number; side: 'buy' | 'sell'; total: number };

  crewAdded: { member: CrewMember };
  crewRemoved: { member: CrewMember; reason: 'fired' | 'quit' | 'evacuated' };
  crewMoved: { member: CrewMember; from: number; to: number };

  researchStarted: { id: TechId };
  researchCompleted: { id: TechId };

  missionOffered: { mission: Mission };
  missionAccepted: { mission: Mission };
  missionCompleted: { mission: Mission };
  missionFailed: { mission: Mission };

  eventTriggered: { event: PendingEvent };
  eventResolved: { event: PendingEvent; choice: number };
  meteorImpact: { moduleId: number };
  pirateAttack: { repelled: boolean };

  reputationChanged: { value: number; delta: number };
  stageChanged: { stage: number };
  tutorialChanged: { step: number; done: boolean };
  bankrupt: Record<string, never>;
}
