export const EVENT_IDS = [
  'solarStorm',
  'powerFailure',
  'oxygenLeak',
  'pirateAttack',
  'supplyCrisis',
  'rareTraderArrival',
  'researchBreakthrough',
  'meteorShower',
  'engineFailure',
  'crewStrike',
] as const;
export type EventId = (typeof EVENT_IDS)[number];
