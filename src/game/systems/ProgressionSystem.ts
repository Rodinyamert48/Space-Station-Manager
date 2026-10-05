import { MODULES } from '../../data/modules';
import { RESOURCES } from '../../data/resources';
import { MAX_STAGE, RING_CAPACITY, STAGES, type StageDef } from '../../data/stages';
import type { Game } from '../Game';

export type RequirementKey = 'modules' | 'crew' | 'reputation' | 'shipsDocked' | 'techs' | 'stationValue' | 'requiresModule';

export interface Requirement {
  key: RequirementKey;
  current: number;
  target: number;
  met: boolean;
  module?: 'factory' | 'lab';
}

/**
 * Station growth through seven stages, from a small outpost to a mega station. Each stage widens
 * the build perimeter, pays a reward and makes the station visibly grander.
 */
export class ProgressionSystem {
  constructor(private readonly game: Game) {}

  /** Construction value of everything built, used as a measure of the station's size. */
  stationValue(): number {
    let value = 0;
    for (const m of this.game.station.modules) {
      const c = MODULES[m.type].cost;
      value += (c.credits ?? 0) + (c.metal ?? 0) * (RESOURCES.metal.basePrice ?? 6) + (c.electronics ?? 0) * (RESOURCES.electronics.basePrice ?? 22) + (c.titanium ?? 0) * (RESOURCES.titanium.basePrice ?? 36);
    }
    return Math.round(value);
  }

  next(): StageDef | null {
    return this.game.state.stage >= MAX_STAGE ? null : (STAGES[this.game.state.stage] ?? null);
  }

  requirements(stage: StageDef | null = this.next()): Requirement[] {
    if (!stage) return [];
    const g = this.game;
    const s = g.state;
    const req = (key: RequirementKey, current: number, target: number): Requirement => ({ key, current, target, met: current >= target });
    const out: Requirement[] = [];
    const modules = g.station.modules.filter((m) => m.status === 'active').length;
    if (stage.modules) out.push(req('modules', modules, stage.modules));
    if (stage.crew) out.push(req('crew', s.crew.members.length, stage.crew));
    if (stage.reputation) out.push(req('reputation', Math.floor(s.reputation), stage.reputation));
    if (stage.shipsDocked) out.push(req('shipsDocked', s.stats.shipsDocked, stage.shipsDocked));
    if (stage.techs) out.push(req('techs', s.research.completed.length, stage.techs));
    if (stage.stationValue) out.push(req('stationValue', this.stationValue(), stage.stationValue));
    if (stage.requiresModule) {
      const has = g.station.count(stage.requiresModule, true) > 0 ? 1 : 0;
      out.push({ ...req('requiresModule', has, 1), module: stage.requiresModule });
    }
    return out;
  }

  /** Extra crew berths from the orbital habitat ring. */
  ringCapacity(): number {
    let best = 0;
    for (const [stage, cap] of Object.entries(RING_CAPACITY)) if (this.game.state.stage >= Number(stage)) best = Math.max(best, cap);
    return best;
  }

  check(): void {
    const next = this.next();
    if (!next) return;
    if (this.requirements(next).every((r) => r.met)) this.advance();
  }

  advance(): void {
    const g = this.game;
    const next = this.next();
    if (!next) return;
    g.state.stage = next.id;
    g.economy.earn(next.reward, 'other');
    g.bus.emit('stageChanged', { stage: next.id });
    g.notify('success', 'notice.stageUp', { stage: `stage.${next.id}`, reward: next.reward });
  }
}
