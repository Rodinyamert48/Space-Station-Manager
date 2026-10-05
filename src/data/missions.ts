import type { Good } from './resources';

export type MissionTemplateId =
  | 'colonySupply'
  | 'miningOrder'
  | 'researchRequest'
  | 'fuelContract'
  | 'hospitality'
  | 'trafficContract'
  | 'militaryRequisition';

export interface MissionTemplate {
  id: MissionTemplateId;
  kind: 'deliver' | 'hospitality' | 'dock';
  goods?: Good[];
  clients: string[];
  /** Base quantity range; scaled by station stage. */
  qty: [number, number];
  /** Hours to finish once accepted. */
  hours: [number, number];
  /** Credit reward as a multiple of the goods' market value (deliveries). */
  rewardMult: [number, number];
  reputation: number;
  research: number;
  weight: number;
  minStage: number;
  minReputation: number;
  special?: boolean;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'colonySupply', kind: 'deliver', goods: ['food', 'water', 'oxygen'], clients: ['Europa Colony', 'Mars Orbital', 'Enceladus Wells', 'Pluto Outpost'],
    qty: [35, 70], hours: [36, 72], rewardMult: [1.5, 1.9], reputation: 3, research: 0, weight: 30, minStage: 1, minReputation: 0,
  },
  {
    id: 'miningOrder', kind: 'deliver', goods: ['metal', 'titanium'], clients: ['Kuiper Mining Co.', 'Vesta Heavy Industries', 'Ceres Consolidated'],
    qty: [30, 60], hours: [48, 84], rewardMult: [1.6, 2.0], reputation: 2, research: 0, weight: 20, minStage: 1, minReputation: 0,
  },
  {
    id: 'researchRequest', kind: 'deliver', goods: ['electronics'], clients: ['Ganymede Research Inst.', 'Ganymede Labs'],
    qty: [15, 30], hours: [48, 96], rewardMult: [1.4, 1.7], reputation: 3, research: 15, weight: 16, minStage: 1, minReputation: 5,
  },
  {
    id: 'fuelContract', kind: 'deliver', goods: ['fuel'], clients: ['Callisto Transit', 'Orion Lines', 'Tycho Logistics'],
    qty: [40, 80], hours: [36, 72], rewardMult: [1.5, 1.8], reputation: 2, research: 0, weight: 14, minStage: 1, minReputation: 0,
  },
  {
    id: 'hospitality', kind: 'hospitality', clients: ['Orion Lines', 'Callisto Transit', 'Lagrange Holdings'],
    qty: [4, 10], hours: [24, 48], rewardMult: [1, 1], reputation: 4, research: 0, weight: 14, minStage: 1, minReputation: 5,
  },
  {
    id: 'trafficContract', kind: 'dock', clients: ['Tycho Logistics', 'Helios Freight', 'Free Trader Guild'],
    qty: [3, 5], hours: [48, 72], rewardMult: [1, 1], reputation: 3, research: 0, weight: 12, minStage: 1, minReputation: 0,
  },
  {
    id: 'militaryRequisition', kind: 'deliver', goods: ['titanium', 'electronics', 'fuel'], clients: ['Fleet Command', 'Lagrange Holdings'],
    qty: [80, 140], hours: [72, 120], rewardMult: [2.1, 2.6], reputation: 8, research: 20, weight: 6, minStage: 3, minReputation: 60, special: true,
  },
];
