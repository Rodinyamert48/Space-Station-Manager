import { TECHS, TECH_IDS, type TechId } from '../../data/research';
import type { Game } from '../Game';

export type ResearchError = 'completed' | 'locked' | 'busy' | 'research' | 'credits';

/**
 * Technology research. Projects cost research points and credits up front, then take time;
 * every active laboratory speeds up the current project.
 */
export class ResearchSystem {
  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.research;
  }

  isCompleted(id: TechId): boolean {
    return this.state.completed.includes(id);
  }

  prerequisitesMet(id: TechId): boolean {
    return TECHS[id].requires.every((r) => this.isCompleted(r));
  }

  /** Research speed multiplier from laboratories (+30% each). */
  speed(): number {
    return 1 + 0.3 * this.game.station.count('lab', true);
  }

  check(id: TechId): { ok: true } | { ok: false; reason: ResearchError } {
    const def = TECHS[id];
    if (this.isCompleted(id)) return { ok: false, reason: 'completed' };
    if (!this.prerequisitesMet(id)) return { ok: false, reason: 'locked' };
    if (this.state.active) return { ok: false, reason: 'busy' };
    if (!this.game.resources.has('research', def.research)) return { ok: false, reason: 'research' };
    if (this.game.state.resources.credits < def.credits) return { ok: false, reason: 'credits' };
    return { ok: true };
  }

  start(id: TechId): { ok: true } | { ok: false; reason: ResearchError } {
    const check = this.check(id);
    if (!check.ok) return check;
    const def = TECHS[id];
    this.game.resources.remove('research', def.research);
    this.game.economy.spend(def.credits, 'research');
    this.state.active = { id, progress: 0, duration: def.hours };
    this.game.bus.emit('researchStarted', { id });
    this.game.notify('info', 'notice.researchStarted', { tech: `tech.${id}.name` });
    return { ok: true };
  }

  /** Aborts the current project and refunds its cost. */
  cancel(): void {
    const active = this.state.active;
    if (!active) return;
    const def = TECHS[active.id];
    this.state.active = null;
    this.game.resources.add('research', def.research);
    this.game.economy.refund(def.credits, 'research');
  }

  tick(dt: number): void {
    const active = this.state.active;
    if (!active) return;
    active.progress += dt * this.speed();
    if (active.progress < active.duration) return;
    this.state.active = null;
    this.complete(active.id);
  }

  /** Marks a technology as researched and applies its effects. */
  complete(id: TechId): void {
    if (this.isCompleted(id)) return;
    const g = this.game;
    this.state.completed.push(id);
    g.state.stats.researchCompleted++;
    g.crew.markDirty();
    g.resources.recomputeCapacity();
    g.bus.emit('researchCompleted', { id });
    g.notify('success', 'notice.researchCompleted', { tech: `tech.${id}.name` });
    for (const m of TECHS[id].unlocksModules ?? []) g.notify('info', 'notice.moduleUnlocked', { module: `module.${m}.name` });
  }

  /** Technologies that can be started right now (prerequisites met, not done). */
  available(): TechId[] {
    return TECH_IDS.filter((id) => !this.isCompleted(id) && this.prerequisitesMet(id) && this.state.active?.id !== id);
  }
}
