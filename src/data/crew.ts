export const CREW_ROLES = ['engineer', 'scientist', 'trader', 'pilot', 'doctor', 'security', 'worker'] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export interface CrewRoleDef {
  id: CrewRole;
  /** Credits per game day. */
  salary: number;
  color: string;
}

export const CREW_ROLE_DEFS: Record<CrewRole, CrewRoleDef> = {
  engineer: { id: 'engineer', salary: 30, color: '#ffb547' },
  scientist: { id: 'scientist', salary: 34, color: '#b48cff' },
  trader: { id: 'trader', salary: 28, color: '#4fc3ff' },
  pilot: { id: 'pilot', salary: 30, color: '#7cf0d0' },
  doctor: { id: 'doctor', salary: 38, color: '#ff7d9c' },
  security: { id: 'security', salary: 28, color: '#ff5a4f' },
  worker: { id: 'worker', salary: 18, color: '#d0d6e0' },
};

/** One-off cost to recruit a crew member, as a multiple of their daily salary. */
export const HIRE_COST_DAYS = 4;

export const FIRST_NAMES = [
  'Ada', 'Kenji', 'Leyla', 'Mateo', 'Nia', 'Ivan', 'Zara', 'Emre', 'Sofia', 'Ravi', 'Mei', 'Omar', 'Elif', 'Lars',
  'Amara', 'Diego', 'Yuki', 'Tomas', 'Ines', 'Kofi', 'Aiko', 'Noah', 'Selin', 'Arjun', 'Freya', 'Jonas', 'Lina',
  'Malik', 'Sana', 'Viktor', 'Hana', 'Pavel', 'Rosa', 'Deniz', 'Kai', 'Olga', 'Tariq', 'Mina', 'Ezra', 'Chloe',
];
export const LAST_NAMES = [
  'Okafor', 'Tanaka', 'Yilmaz', 'Garcia', 'Novak', 'Petrova', 'Haddad', 'Kaya', 'Rossi', 'Patel', 'Chen', 'Mensah',
  'Lindqvist', 'Moreau', 'Silva', 'Kowalski', 'Nakamura', 'Demir', 'Fischer', 'Ahmadi', 'Costa', 'Ivanova',
  'Sato', 'Brennan', 'Osei', 'Park', 'Arslan', 'Dubois', 'Hoffman', 'Reyes',
];
