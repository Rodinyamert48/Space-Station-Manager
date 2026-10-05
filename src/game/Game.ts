import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { TKey, TParams } from '../i18n/i18n';
import type { Rotation, Vec3i } from '../data/grid';
import { DEMOLISH_REFUND, MODULES, type CostKey, type ModuleType } from '../data/modules';
import { TECHS, baseModifiers, type Modifiers } from '../data/research';
import type { GameEvents, Notice, NoticeLevel } from './events';
import type { GameSpeed, GameState, ModuleState } from './state';
import { EconomySystem } from './systems/EconomySystem';
import { ResourceSystem } from './systems/ResourceSystem';
import { StationSystem, type PlacementError } from './systems/StationSystem';

/** Real seconds per game hour at 1x speed. One game day lasts one real minute. */
export const SECONDS_PER_HOUR = 2.5;
/** Fixed simulation step in game hours. */
export const STEP_HOURS = 0.1;
/** Never simulate more than this many steps per frame (protects against tab-switch catch-up spikes). */
const MAX_STEPS_PER_FRAME = 40;

export type Result<R extends string = string> = { ok: true } | { ok: false; reason: R };

export type BuildError = PlacementError | 'cost';
export type DemolishError = 'command' | 'disconnects' | 'occupied' | 'missing';

/**
 * Simulation facade. Owns the game state and the systems that mutate it. Rendering and UI
 * code read the state and call the public command methods; they never mutate state directly.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: Rng;
  readonly station: StationSystem;
  readonly resources: ResourceSystem;
  readonly economy: EconomySystem;
  private accumulator = 0;
  private noticeId = 1;
  private modifierCache: { key: string; value: Modifiers } | null = null;

  constructor(public readonly state: GameState) {
    this.rng = new Rng(state.rngState);
    this.station = new StationSystem(this);
    this.resources = new ResourceSystem(this);
    this.economy = new EconomySystem(this);
  }

  get hour(): number {
    return this.state.time.hour;
  }

  get day(): number {
    return Math.floor(this.state.time.hour / 24) + 1;
  }

  get speed(): GameSpeed {
    return this.state.time.speed;
  }

  setSpeed(speed: GameSpeed): void {
    if (this.state.time.speed === speed) return;
    this.state.time.speed = speed;
    this.bus.emit('speedChanged', { speed });
  }

  /** Advances the simulation by real elapsed seconds, scaled by the current speed. */
  update(realSeconds: number): void {
    if (this.state.time.speed === 0) return;
    this.accumulator += (Math.min(realSeconds, 0.5) * this.state.time.speed) / SECONDS_PER_HOUR;
    let steps = 0;
    while (this.accumulator >= STEP_HOURS && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= STEP_HOURS;
      this.step(STEP_HOURS);
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  /** Fraction of the current fixed step that has elapsed, for smooth interpolation in views. */
  get stepAlpha(): number {
    return this.accumulator / STEP_HOURS;
  }

  /** Game hour including the not-yet-simulated fraction of the current step. */
  get smoothHour(): number {
    return this.state.time.hour + this.accumulator;
  }

  step(dt: number): void {
    const before = this.state.time.hour;
    this.state.time.hour = before + dt;
    this.advanceConstruction(dt);
    this.resources.tick(dt);
    if (Math.floor(this.state.time.hour) !== Math.floor(before)) {
      this.bus.emit('hour', { hour: Math.floor(this.state.time.hour) });
    }
  }

  private advanceConstruction(dt: number): void {
    for (const m of this.station.modules) {
      if (m.status !== 'constructing') continue;
      m.buildProgress += dt;
      if (m.buildProgress >= MODULES[m.type].buildHours) {
        m.status = 'active';
        m.buildProgress = MODULES[m.type].buildHours;
        this.state.stats.modulesBuilt++;
        this.resources.recomputeCapacity();
        this.bus.emit('moduleCompleted', { module: m });
        this.bus.emit('moduleChanged', { module: m });
        this.notify('success', 'notice.moduleCompleted', { module: `module.${m.type}.name` }, { moduleId: m.id });
      }
    }
  }

  /** Places a new module in construction after validating layout and paying its cost. */
  buildModule(type: ModuleType, cell: Vec3i, rotation: Rotation): Result<BuildError> & { moduleId?: number } {
    const check = this.station.checkPlacement(type, cell, rotation);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'noConnection' };
    const cost = MODULES[type].cost;
    if (!this.resources.canAfford(cost)) return { ok: false, reason: 'cost' };
    for (const key of Object.keys(cost) as CostKey[]) {
      const amount = cost[key] ?? 0;
      if (key === 'credits') this.economy.spend(amount, 'construction');
      else this.resources.remove(key, amount);
    }
    const module = this.station.addModule(type, cell, rotation, 'constructing');
    this.bus.emit('moduleAdded', { module });
    this.bus.emit('layoutChanged', {});
    this.notify('info', 'notice.constructionStarted', { module: `module.${type}.name` }, { moduleId: module.id });
    return { ok: true, moduleId: module.id };
  }

  canDemolish(id: number): Result<DemolishError> {
    const m = this.station.getModule(id);
    if (!m) return { ok: false, reason: 'missing' };
    if (MODULES[m.type].unique) return { ok: false, reason: 'command' };
    if (!this.station.isConnectedWithout(id)) return { ok: false, reason: 'disconnects' };
    if (this.isModuleOccupied(m)) return { ok: false, reason: 'occupied' };
    return { ok: true };
  }

  /** Hook for systems that lock a module (e.g. a ship using a docking berth). */
  isModuleOccupied(_m: ModuleState): boolean {
    return false;
  }

  /** Removes a module. Unfinished construction is refunded fully, finished modules partially. */
  demolishModule(id: number): Result<DemolishError> {
    const check = this.canDemolish(id);
    if (!check.ok) return check;
    const m = this.station.getModule(id) as ModuleState;
    const share = m.status === 'constructing' ? 1 : DEMOLISH_REFUND;
    const cost = MODULES[m.type].cost;
    this.station.removeModule(id);
    this.resources.recomputeCapacity();
    for (const key of Object.keys(cost) as CostKey[]) {
      const amount = Math.floor((cost[key] ?? 0) * share);
      if (key === 'credits') this.economy.refund(amount, 'construction');
      else this.resources.add(key, amount);
    }
    this.bus.emit('moduleRemoved', { module: m });
    this.bus.emit('layoutChanged', {});
    this.notify('info', m.status === 'constructing' ? 'notice.constructionCancelled' : 'notice.moduleDemolished', {
      module: `module.${m.type}.name`,
    });
    return { ok: true };
  }

  /** Player power toggle for a module. */
  setModuleEnabled(id: number, enabled: boolean): void {
    const m = this.station.getModule(id);
    if (!m || MODULES[m.type].unique || m.enabled === enabled) return;
    m.enabled = enabled;
    this.bus.emit('moduleChanged', { module: m });
  }

  /** Combined bonuses from completed research. */
  modifiers(): Modifiers {
    const key = this.state.research.completed.join(',');
    if (this.modifierCache?.key === key) return this.modifierCache.value;
    const mods = baseModifiers();
    for (const id of this.state.research.completed) {
      for (const [k, v] of Object.entries(TECHS[id].effects) as [keyof Modifiers, number][]) mods[k] += v;
    }
    this.modifierCache = { key, value: mods };
    return mods;
  }

  /** Output factor of a module from staffing and crew morale (1 = full output). */
  moduleWorkFactor(_m: ModuleState): number {
    return 1;
  }

  /** Crew berths from built modules (plus research bonuses). */
  crewCapacity(): number {
    let beds = 0;
    for (const m of this.station.modules) if (m.status === 'active') beds += MODULES[m.type].crewCapacity ?? 0;
    return Math.floor(beds * (1 + this.modifiers().crewCapacity));
  }

  /** People aboard who breathe, drink and eat. */
  population(): number {
    return this.state.crew.members.length;
  }

  isModuleUnlocked(type: ModuleType): boolean {
    const tech = MODULES[type].unlockedBy;
    return !tech || this.state.research.completed.includes(tech);
  }

  notify(level: NoticeLevel, key: TKey, params?: TParams, focus?: { moduleId?: number; shipId?: number }): void {
    const notice: Notice = { id: this.noticeId++, level, key, params, hour: this.state.time.hour, ...focus };
    this.bus.emit('notice', notice);
  }

  /** Copies volatile runtime state (RNG) back into the serialisable state object. */
  syncForSave(): GameState {
    this.state.rngState = this.rng.state;
    return this.state;
  }
}
