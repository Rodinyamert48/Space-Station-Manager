import { clamp } from '../../core/math';
import { MISSION_TEMPLATES, type MissionTemplate } from '../../data/missions';
import type { Game } from '../Game';
import type { Mission } from '../state';

/** Hours an offer stays on the contract board. */
const OFFER_HOURS: [number, number] = [24, 40];
/** Credits paid per guest-hour for hospitality contracts. */
const HOSPITALITY_RATE = 1.6;
/** Credits paid per ship for docking contracts. */
const DOCKING_BONUS = 140;

export type MissionError = 'missing' | 'full' | 'noBeds' | 'nothing';

/**
 * Contracts from around the system: deliveries, hosting guests and traffic quotas.
 * Rewards scale with the station stage, reputation and research.
 */
export class MissionSystem {
  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.missions;
  }

  get offers(): readonly Mission[] {
    return this.state.offers;
  }

  get active(): readonly Mission[] {
    return this.state.active;
  }

  maxOffers(): number {
    return Math.min(6, 2 + this.game.station.count('comms', true) + Math.floor(this.game.state.stage / 2));
  }

  maxActive(): number {
    return 3 + this.game.station.count('comms', true);
  }

  /** Guests currently hosted under hospitality contracts. */
  guests(): number {
    let n = 0;
    for (const m of this.state.active) if (m.kind === 'hospitality') n += m.qty;
    return n;
  }

  private rewardScale(): number {
    const g = this.game;
    return (1 + g.modifiers().missionRewards) * (1 + g.state.reputation / 200);
  }

  private eligible(): MissionTemplate[] {
    const g = this.game;
    return MISSION_TEMPLATES.filter((tpl) => g.state.stage >= tpl.minStage && g.state.reputation >= tpl.minReputation);
  }

  /** Creates a new contract offer. */
  generate(template?: MissionTemplate): Mission | null {
    const g = this.game;
    const rng = g.rng;
    const tpl = template ?? rng.weighted(this.eligible(), (t) => t.weight);
    if (!tpl) return null;
    const stageScale = 1 + 0.35 * (g.state.stage - 1);
    const good = tpl.goods ? rng.pick(tpl.goods) : null;
    let qty = Math.round(rng.range(tpl.qty[0], tpl.qty[1]) * (tpl.kind === 'dock' ? 1 : stageScale));
    const hours = Math.round(rng.range(tpl.hours[0], tpl.hours[1]));
    let credits: number;
    if (tpl.kind === 'deliver' && good) {
      credits = qty * g.market.basePrice(good) * rng.range(tpl.rewardMult[0], tpl.rewardMult[1]);
    } else if (tpl.kind === 'hospitality') {
      qty = Math.max(2, Math.round(qty * (0.8 + 0.4 * g.state.stage)));
      credits = qty * hours * HOSPITALITY_RATE;
    } else {
      credits = qty * DOCKING_BONUS;
    }
    const mission: Mission = {
      id: this.state.nextId++,
      kind: tpl.kind,
      templateId: tpl.id,
      client: rng.pick(tpl.clients),
      good,
      qty,
      progress: 0,
      rewardCredits: Math.round((credits * this.rewardScale()) / 10) * 10,
      rewardReputation: tpl.reputation,
      rewardResearch: Math.round(tpl.research * stageScale),
      expiresAt: g.hour + rng.range(OFFER_HOURS[0], OFFER_HOURS[1]),
      durationHours: hours,
      acceptedAt: 0,
      baseline: 0,
      special: !!tpl.special,
    };
    this.state.offers.push(mission);
    g.bus.emit('missionOffered', { mission });
    g.notify('info', 'notice.missionOffered', { client: mission.client });
    return mission;
  }

  accept(id: number): { ok: true } | { ok: false; reason: MissionError } {
    const g = this.game;
    const i = this.state.offers.findIndex((m) => m.id === id);
    const mission = this.state.offers[i];
    if (!mission) return { ok: false, reason: 'missing' };
    if (this.state.active.length >= this.maxActive()) return { ok: false, reason: 'full' };
    if (mission.kind === 'hospitality' && g.crewCapacity() - g.state.crew.members.length - this.guests() < mission.qty) {
      return { ok: false, reason: 'noBeds' };
    }
    this.state.offers.splice(i, 1);
    mission.acceptedAt = g.hour;
    mission.expiresAt = g.hour + mission.durationHours;
    mission.baseline = g.state.stats.shipsDocked;
    this.state.active.push(mission);
    g.bus.emit('missionAccepted', { mission });
    return { ok: true };
  }

  decline(id: number): void {
    const i = this.state.offers.findIndex((m) => m.id === id);
    if (i >= 0) this.state.offers.splice(i, 1);
  }

  /** Delivers as much of the requested good as is in stock. */
  deliver(id: number): { ok: true; qty: number } | { ok: false; reason: MissionError } {
    const g = this.game;
    const mission = this.state.active.find((m) => m.id === id);
    if (!mission || mission.kind !== 'deliver' || !mission.good) return { ok: false, reason: 'missing' };
    const qty = Math.floor(Math.min(mission.qty - mission.progress, g.state.resources[mission.good]));
    if (qty <= 0) return { ok: false, reason: 'nothing' };
    g.resources.remove(mission.good, qty);
    mission.progress += qty;
    g.state.stats.cargoMoved += qty;
    if (mission.progress >= mission.qty) this.complete(mission);
    return { ok: true, qty };
  }

  abandon(id: number): void {
    const mission = this.state.active.find((m) => m.id === id);
    if (mission) this.fail(mission);
  }

  private remove(mission: Mission): void {
    const i = this.state.active.indexOf(mission);
    if (i >= 0) this.state.active.splice(i, 1);
  }

  private complete(mission: Mission): void {
    const g = this.game;
    this.remove(mission);
    g.economy.earn(mission.rewardCredits, 'missions');
    if (mission.rewardResearch > 0) g.resources.add('research', mission.rewardResearch);
    g.changeReputation(mission.rewardReputation);
    this.state.completed++;
    g.state.stats.missionsCompleted++;
    g.bus.emit('missionCompleted', { mission });
    g.notify('success', 'notice.missionCompleted', { client: mission.client, reward: mission.rewardCredits });
  }

  private fail(mission: Mission): void {
    const g = this.game;
    this.remove(mission);
    g.changeReputation(-Math.max(1, mission.rewardReputation * 1.2));
    this.state.failed++;
    g.bus.emit('missionFailed', { mission });
    g.notify('warning', 'notice.missionFailed', { client: mission.client });
  }

  /** Remaining fraction of time for UI bars. */
  timeLeft(mission: Mission): number {
    const total = mission.acceptedAt ? mission.durationHours : mission.expiresAt - (mission.expiresAt - OFFER_HOURS[1]);
    return clamp((mission.expiresAt - this.game.hour) / Math.max(1, total), 0, 1);
  }

  hourly(): void {
    const g = this.game;
    const now = g.hour;
    this.state.offers = this.state.offers.filter((m) => m.expiresAt > now);
    if (now >= this.state.nextOfferAt) {
      if (this.state.offers.length < this.maxOffers()) this.generate();
      this.state.nextOfferAt = now + g.rng.range(7, 13) / (1 + 0.25 * g.station.count('comms', true));
    }
    for (const m of [...this.state.active]) {
      if (m.kind === 'dock') {
        m.progress = Math.min(m.qty, g.state.stats.shipsDocked - m.baseline);
        if (m.progress >= m.qty) {
          this.complete(m);
          continue;
        }
      }
      if (m.kind === 'hospitality') {
        // Guests leave unhappy if life support fails or they lose their beds.
        const overcrowded = g.state.crew.members.length + this.guests() > g.crewCapacity();
        if (g.resources.shortages.size > 0 || overcrowded) {
          this.fail(m);
          continue;
        }
        m.progress = Math.min(m.durationHours, now - m.acceptedAt);
        if (now >= m.expiresAt) {
          this.complete(m);
          continue;
        }
      }
      if (now >= m.expiresAt) this.fail(m);
    }
  }
}
