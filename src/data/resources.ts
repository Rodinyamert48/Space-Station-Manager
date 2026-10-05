export const RESOURCE_IDS = [
  'credits',
  'energy',
  'oxygen',
  'water',
  'food',
  'fuel',
  'metal',
  'electronics',
  'titanium',
  'research',
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** Physical goods that can be stored in station storage and traded with ships. */
export const GOODS = ['oxygen', 'water', 'food', 'fuel', 'metal', 'electronics', 'titanium'] as const;
export type Good = (typeof GOODS)[number];

export const isGood = (id: string): id is Good => (GOODS as readonly string[]).includes(id);

export interface ResourceDef {
  id: ResourceId;
  color: string;
  /** Base market price in credits per unit (goods only). */
  basePrice?: number;
  /** How strongly the market reacts to trade volume (higher = more stable). */
  elasticity?: number;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  credits: { id: 'credits', color: '#ffd166' },
  energy: { id: 'energy', color: '#ffe066' },
  oxygen: { id: 'oxygen', color: '#7fdcff', basePrice: 6, elasticity: 900 },
  water: { id: 'water', color: '#4ea8ff', basePrice: 4, elasticity: 900 },
  food: { id: 'food', color: '#8ee07a', basePrice: 8, elasticity: 800 },
  fuel: { id: 'fuel', color: '#ff9f43', basePrice: 10, elasticity: 700 },
  metal: { id: 'metal', color: '#b8c4d6', basePrice: 6, elasticity: 1000 },
  electronics: { id: 'electronics', color: '#5ef2c2', basePrice: 22, elasticity: 450 },
  titanium: { id: 'titanium', color: '#d6b3ff', basePrice: 36, elasticity: 300 },
  research: { id: 'research', color: '#c38bff' },
};

/** Per-person, per-hour life support needs. */
export const PERSON_NEEDS: Readonly<Record<'oxygen' | 'water' | 'food', number>> = {
  oxygen: 0.3,
  water: 0.25,
  food: 0.12,
};
