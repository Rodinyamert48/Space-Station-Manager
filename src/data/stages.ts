export interface StageDef {
  id: number;
  /** Requirements to reach this stage. */
  modules: number;
  crew: number;
  reputation: number;
  shipsDocked: number;
  techs: number;
  stationValue: number;
  requiresModule?: 'factory' | 'lab';
  /** Horizontal build radius (cells) and vertical range unlocked at this stage. */
  buildRadius: number;
  buildHeight: number;
  reward: number;
}

export const STAGES: StageDef[] = [
  { id: 1, modules: 0, crew: 0, reputation: 0, shipsDocked: 0, techs: 0, stationValue: 0, buildRadius: 3, buildHeight: 0, reward: 0 },
  { id: 2, modules: 7, crew: 6, reputation: 15, shipsDocked: 5, techs: 0, stationValue: 0, buildRadius: 4, buildHeight: 0, reward: 1500 },
  { id: 3, modules: 12, crew: 12, reputation: 22, shipsDocked: 12, techs: 3, stationValue: 0, requiresModule: 'factory', buildRadius: 5, buildHeight: 1, reward: 3000 },
  { id: 4, modules: 18, crew: 18, reputation: 30, shipsDocked: 20, techs: 6, stationValue: 0, requiresModule: 'lab', buildRadius: 6, buildHeight: 1, reward: 5000 },
  { id: 5, modules: 26, crew: 30, reputation: 45, shipsDocked: 35, techs: 8, stationValue: 30000, buildRadius: 7, buildHeight: 2, reward: 8000 },
  { id: 6, modules: 36, crew: 55, reputation: 60, shipsDocked: 55, techs: 10, stationValue: 50000, buildRadius: 8, buildHeight: 2, reward: 12000 },
  { id: 7, modules: 50, crew: 85, reputation: 75, shipsDocked: 80, techs: 13, stationValue: 80000, buildRadius: 9, buildHeight: 3, reward: 20000 },
];

export const MAX_STAGE = STAGES.length;

/** Extra crew capacity granted by the orbital habitat ring once a stage is reached. */
export const RING_CAPACITY: Record<number, number> = { 5: 40, 6: 80, 7: 140 };
