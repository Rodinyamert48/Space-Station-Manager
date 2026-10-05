import { GOODS, type Good } from '../../data/resources';
import type { EventId } from '../../data/events';
import type { ModuleType } from '../../data/modules';
import type { Game } from '../Game';
import type { NoticeLevel } from '../events';
import type { EffectKind, ModuleState, PendingEvent } from '../state';

export interface ChoiceCost {
  credits?: number;
  metal?: number;
  electronics?: number;
}

interface Choice {
  cost?: (g: Game, e: PendingEvent) => ChoiceCost;
  apply: (g: Game, e: PendingEvent) => void;
}

interface EventDef {
  id: EventId;
  weight: (g: Game) => number;
  minStage: number;
  severity: NoticeLevel;
  /** Game hours before the default choice is applied automatically. */
  timeout: number;
  defaultChoice: number;
  /** Fills in the event context; returning false skips the event. */
  prepare: (g: Game, e: PendingEvent) => boolean;
  choices: Choice[];
}

const pickModule = (g: Game, types: ModuleType[] | null): ModuleState | undefined => {
  const list = g.station.modules.filter((m) => m.status === 'active' && !m.damaged && (!types || types.includes(m.type)));
  return list.length ? g.rng.pick(list) : undefined;
};

const damage = (g: Game, m: ModuleState | undefined): void => {
  if (!m || m.type === 'command') return;
  m.damaged = true;
  g.crew.markDirty();
  g.bus.emit('moduleChanged', { module: m });
  g.notify('danger', 'notice.moduleDamaged', { module: `module.${m.type}.name` }, { moduleId: m.id });
};

const takeOffline = (g: Game, m: ModuleState | undefined, hours: number): void => {
  if (!m) return;
  m.offlineUntil = Math.max(m.offlineUntil, g.hour + hours);
  g.crew.markDirty();
  g.bus.emit('moduleChanged', { module: m });
};

const EVENTS: EventDef[] = [
  {
    id: 'solarStorm',
    weight: (g) => (g.station.count('solar', true) > 0 ? 10 : 0),
    minStage: 1,
    severity: 'warning',
    timeout: 4,
    defaultChoice: 0,
    prepare: () => true,
    choices: [
      { apply: (g, e) => g.events.addEffect('solarOutput', -1, 10, null, e.eventId) },
      {
        apply: (g, e) => {
          g.events.addEffect('solarOutput', -0.45, 10, null, e.eventId);
          if (g.rng.chance(0.5)) damage(g, pickModule(g, ['solar']));
        },
      },
    ],
  },
  {
    id: 'powerFailure',
    weight: () => 8,
    minStage: 1,
    severity: 'danger',
    timeout: 6,
    defaultChoice: 1,
    prepare: (g, e) => {
      const m = pickModule(g, ['power', 'solar', 'lifeSupport', 'water', 'lab', 'factory', 'storage']);
      if (!m) return false;
      e.moduleId = m.id;
      damage(g, m);
      return true;
    },
    choices: [
      {
        cost: (g) => ({ credits: 180 * g.state.stage, electronics: 5 }),
        apply: (g, e) => g.repairModule(e.moduleId, true),
      },
      {
        apply: (g, e) => {
          const m = g.station.getModule(e.moduleId);
          if (!m) return;
          m.damaged = false;
          takeOffline(g, m, 12);
        },
      },
    ],
  },
  {
    id: 'oxygenLeak',
    weight: () => 8,
    minStage: 1,
    severity: 'danger',
    timeout: 5,
    defaultChoice: 0,
    prepare: (g, e) => {
      const m = pickModule(g, ['command', 'quarters', 'lifeSupport', 'restaurant', 'medical', 'lab']);
      if (!m) return false;
      e.moduleId = m.id;
      e.amount = 3 + g.state.stage;
      g.events.addEffect('oxygenLeak', e.amount, 14, null, e.eventId);
      return true;
    },
    choices: [
      {
        apply: (g, e) => {
          g.events.clearEffects('oxygenLeak');
          const m = g.station.getModule(e.moduleId);
          if (m && m.type !== 'command') takeOffline(g, m, 6);
        },
      },
      { cost: () => ({ metal: 30 }), apply: (g) => g.events.clearEffects('oxygenLeak') },
      { apply: () => undefined },
    ],
  },
  {
    id: 'pirateAttack',
    weight: () => 7,
    minStage: 2,
    severity: 'danger',
    timeout: 3,
    defaultChoice: 0,
    prepare: (g, e) => {
      e.amount = 20 + 15 * g.state.stage;
      return true;
    },
    choices: [
      {
        apply: (g, e) => {
          if (g.defenseRating() >= e.amount) {
            g.changeReputation(3);
            g.bus.emit('pirateAttack', { repelled: true });
            g.notify('success', 'notice.piratesRepelled');
            return;
          }
          let worst: Good = 'metal';
          for (const good of GOODS) if (g.state.resources[good] * g.market.price(good) > g.state.resources[worst] * g.market.price(worst)) worst = good;
          const lost = Math.floor(g.state.resources[worst] * 0.25);
          g.resources.take(worst, lost);
          damage(g, pickModule(g, null));
          g.changeReputation(-2);
          g.bus.emit('pirateAttack', { repelled: false });
          g.notify('danger', 'notice.piratesRaided', { qty: lost, good: `res.${worst}` });
        },
      },
      { cost: (g) => ({ credits: 250 * g.state.stage }), apply: () => undefined },
    ],
  },
  {
    id: 'supplyCrisis',
    weight: () => 9,
    minStage: 1,
    severity: 'info',
    timeout: 2,
    defaultChoice: 0,
    prepare: (g, e) => {
      const good = g.rng.pick(['food', 'water', 'oxygen', 'fuel', 'metal', 'electronics'] as const);
      e.good = good;
      e.amount = Math.round(g.rng.range(1.6, 2.1) * 100) / 100;
      g.events.addEffect('price', e.amount, 48, good, e.eventId);
      g.market.recompute(good);
      return true;
    },
    choices: [{ apply: () => undefined }],
  },
  {
    id: 'rareTraderArrival',
    weight: (g) => (g.ships.berths().length > 0 ? 5 : 0),
    minStage: 1,
    severity: 'success',
    timeout: 2,
    defaultChoice: 0,
    prepare: (g, e) => {
      e.shipId = g.ships.spawn('rareTrader', true).id;
      return true;
    },
    choices: [{ apply: () => undefined }],
  },
  {
    id: 'researchBreakthrough',
    weight: (g) => (g.station.count('lab', true) > 0 || g.state.research.active ? 6 : 1),
    minStage: 1,
    severity: 'success',
    timeout: 6,
    defaultChoice: 1,
    prepare: () => true,
    choices: [
      {
        apply: (g) => {
          g.changeReputation(3);
          g.economy.earn(150 * g.state.stage, 'other');
        },
      },
      {
        apply: (g) => {
          g.resources.add('research', 15 * g.state.stage);
          const active = g.state.research.active;
          if (active) active.progress = Math.min(active.duration, active.progress + active.duration * 0.4);
        },
      },
    ],
  },
  {
    id: 'meteorShower',
    weight: () => 7,
    minStage: 1,
    severity: 'danger',
    timeout: 3,
    defaultChoice: 0,
    prepare: () => true,
    choices: [
      {
        apply: (g) => {
          const shield = 50 / (50 + g.defenseRating());
          for (let i = 0; i < 3; i++) {
            if (!g.rng.chance(0.45 * shield)) continue;
            const m = pickModule(g, null);
            if (!m || m.type === 'command') continue;
            damage(g, m);
            g.bus.emit('meteorImpact', { moduleId: m.id });
          }
        },
      },
      {
        apply: (g) => {
          for (const m of g.station.modules) if (m.type !== 'command' && m.status === 'active') takeOffline(g, m, 3);
        },
      },
    ],
  },
  {
    id: 'engineFailure',
    weight: (g) => (g.ships.berths().length > 0 ? 6 : 0),
    minStage: 1,
    severity: 'warning',
    timeout: 4,
    defaultChoice: 1,
    prepare: () => true,
    choices: [
      {
        cost: () => ({ metal: 25 }),
        apply: (g) => {
          g.changeReputation(4);
          g.economy.earn(120 * g.state.stage, 'services');
        },
      },
      { apply: (g) => g.changeReputation(-3) },
    ],
  },
  {
    id: 'crewStrike',
    weight: (g) => {
      if (g.state.crew.members.length < 5) return 0;
      const mood = g.crew.averageHappiness();
      return mood < 35 ? 18 : mood < 50 ? 6 : 0;
    },
    minStage: 1,
    severity: 'danger',
    timeout: 6,
    defaultChoice: 2,
    prepare: () => true,
    choices: [
      {
        apply: (g, e) => {
          g.crew.setSalaryRate(Math.min(1.5, g.state.crew.salaryRate + 0.25));
          g.events.addEffect('happiness', 12, 24, null, e.eventId);
        },
      },
      {
        cost: (g) => ({ credits: 30 * g.state.crew.members.length }),
        apply: (g, e) => g.events.addEffect('happiness', 6, 24, null, e.eventId),
      },
      {
        apply: (g, e) => {
          g.events.addEffect('strike', 1, 18, null, e.eventId);
          g.events.addEffect('happiness', -8, 24, null, e.eventId);
        },
      },
    ],
  },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export type EventError = 'missing' | 'cost';

/** Random incidents with player choices. Effects are timed modifiers on the simulation. */
export class EventSystem {
  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.events;
  }

  get pending(): readonly PendingEvent[] {
    return this.state.pending;
  }

  choiceCount(eventId: EventId): number {
    return BY_ID.get(eventId)?.choices.length ?? 0;
  }

  choiceCost(e: PendingEvent, index: number): ChoiceCost | null {
    return BY_ID.get(e.eventId)?.choices[index]?.cost?.(this.game, e) ?? null;
  }

  severity(eventId: EventId): NoticeLevel {
    return BY_ID.get(eventId)?.severity ?? 'info';
  }

  addEffect(kind: EffectKind, value: number, hours: number, good: Good | null, source: EventId): void {
    this.state.effects.push({ id: this.state.nextId++, kind, value, until: this.game.hour + hours, good, source });
  }

  clearEffects(kind: EffectKind): void {
    this.state.effects = this.state.effects.filter((e) => e.kind !== kind);
  }

  /** Starts a specific event now (also used by tests and the tutorial). */
  trigger(id: EventId): PendingEvent | null {
    const def = BY_ID.get(id);
    if (!def) return null;
    const g = this.game;
    const event: PendingEvent = {
      id: this.state.nextId++,
      eventId: id,
      createdAt: g.hour,
      expiresAt: g.hour + def.timeout,
      moduleId: 0,
      shipId: 0,
      good: null,
      amount: 0,
    };
    if (!def.prepare(g, event)) return null;
    this.state.pending.push(event);
    g.bus.emit('eventTriggered', { event });
    return event;
  }

  private canAfford(cost: ChoiceCost | null): boolean {
    if (!cost) return true;
    const r = this.game.state.resources;
    return (cost.credits ?? 0) <= Math.max(0, r.credits) && (cost.metal ?? 0) <= r.metal && (cost.electronics ?? 0) <= r.electronics;
  }

  canChoose(e: PendingEvent, index: number): boolean {
    return this.canAfford(this.choiceCost(e, index));
  }

  resolve(eventInstanceId: number, index: number, force = false): { ok: true } | { ok: false; reason: EventError } {
    const g = this.game;
    const event = this.state.pending.find((p) => p.id === eventInstanceId);
    const def = event ? BY_ID.get(event.eventId) : undefined;
    const choice = def?.choices[index];
    if (!event || !def || !choice) return { ok: false, reason: 'missing' };
    const cost = choice.cost?.(g, event) ?? null;
    if (!force && !this.canAfford(cost)) return { ok: false, reason: 'cost' };
    if (cost) {
      if (cost.credits) g.economy.charge(cost.credits, 'events');
      if (cost.metal) g.resources.take('metal', cost.metal);
      if (cost.electronics) g.resources.take('electronics', cost.electronics);
    }
    this.state.pending = this.state.pending.filter((p) => p !== event);
    choice.apply(g, event);
    this.state.log.push({ eventId: event.eventId, hour: g.hour, choice: index });
    if (this.state.log.length > 50) this.state.log.shift();
    g.state.stats.eventsResolved++;
    g.bus.emit('eventResolved', { event, choice: index });
    return { ok: true };
  }

  hourly(): void {
    const g = this.game;
    const now = g.hour;
    this.state.effects = this.state.effects.filter((e) => e.until > now);
    for (const e of [...this.state.pending]) {
      if (now >= e.expiresAt) {
        const def = BY_ID.get(e.eventId);
        this.resolve(e.id, def?.defaultChoice ?? 0, true);
      }
    }
    if (now < this.state.nextEventAt || this.state.pending.length > 0) return;
    const candidates = EVENTS.filter((d) => g.state.stage >= d.minStage);
    const def = g.rng.weighted(candidates, (d) => d.weight(g));
    if (def) this.trigger(def.id);
    this.state.nextEventAt = now + g.rng.range(28, 54) * Math.max(0.6, 1 - 0.05 * g.state.stage);
  }
}
