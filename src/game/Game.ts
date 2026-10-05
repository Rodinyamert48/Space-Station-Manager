import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { TKey, TParams } from '../i18n/i18n';
import type { Rotation, Vec3i } from '../data/grid';
import { DEMOLISH_REFUND, MODULES, type CostKey, type ModuleType } from '../data/modules';
import type { Good } from '../data/resources';
import { TECHS, baseModifiers, type Feature, type Modifiers } from '../data/research';
import { clamp } from '../core/math';
import type { GameEvents, Notice, NoticeLevel } from './events';
import type { GameSpeed, GameState, ModuleState } from './state';
import { CrewSystem } from './systems/CrewSystem';
import { EconomySystem } from './systems/EconomySystem';
import { MARKET_INTERVAL, MarketSystem } from './systems/MarketSystem';
import { ResearchSystem } from './systems/ResearchSystem';
import { ShipSystem } from './systems/ShipSystem';
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
  readonly market: MarketSystem;
  readonly ships: ShipSystem;
  readonly crew: CrewSystem;
  readonly research: ResearchSystem;
  private accumulator = 0;
  private noticeId = 1;
  private modifierCache: { key: string; value: Modifiers } | null = null;

  constructor(public readonly state: GameState) {
    this.rng = new Rng(state.rngState);
    // Order matters: the resource system evaluates flows on construction, which reads the
    // station layout and visitors aboard docked ships.
    this.station = new StationSystem(this);
    this.crew = new CrewSystem(this);
    this.ships = new ShipSystem(this);
    this.market = new MarketSystem(this);
    this.economy = new EconomySystem(this);
    this.resources = new ResourceSystem(this);
    this.research = new ResearchSystem(this);
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
    // Round to avoid floating-point drift from accumulating 0.1h steps.
    this.state.time.hour = Math.round((before + dt) * 1e6) / 1e6;
    this.advanceConstruction(dt);
    this.resources.tick(dt);
    this.research.tick(dt);
    this.ships.update();
    const hour = Math.floor(this.state.time.hour);
    if (hour !== Math.floor(before)) this.onHour(hour);
  }

  private onHour(hour: number): void {
    this.crew.hourly();
    this.ships.hourly();
    if (hour % MARKET_INTERVAL === 0) this.market.update();
    if (hour % 24 === 0) {
      const day = hour / 24;
      const report = this.economy.endDay(day);
      this.market.onNewDay();
      this.crew.onNewDay();
      this.bus.emit('day', { day, report });
      this.notify(report.net >= 0 ? 'info' : 'warning', 'notice.dayReport', { day, net: Math.round(report.net) });
    }
    this.bus.emit('hour', { hour });
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
        this.crew.markDirty();
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

  /** A docking module cannot be removed while a ship uses its berth. */
  isModuleOccupied(m: ModuleState): boolean {
    return m.type === 'docking' && !!this.ships.shipAtBerth(m.id);
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
    this.crew.markDirty();
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
    this.crew.markDirty();
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
  moduleWorkFactor(m: ModuleState): number {
    return this.crew.workFactor(m);
  }

  /** True while a crew strike event is active. */
  strikeActive(): boolean {
    return this.state.events.effects.some((e) => e.kind === 'strike');
  }

  /** Additive happiness bonus/penalty from active events. */
  happinessEffect(): number {
    let v = 0;
    for (const e of this.state.events.effects) if (e.kind === 'happiness') v += e.value;
    return v;
  }

  /** Crew berths from built modules (plus research bonuses). */
  crewCapacity(): number {
    let beds = 0;
    for (const m of this.station.modules) if (m.status === 'active') beds += MODULES[m.type].crewCapacity ?? 0;
    return Math.floor(beds * (1 + this.modifiers().crewCapacity));
  }

  /** People aboard who breathe, drink and eat. */
  population(): number {
    return this.state.crew.members.length + this.ships.visitors();
  }

  hasFeature(feature: Feature): boolean {
    return this.state.research.completed.some((id) => TECHS[id].features?.includes(feature));
  }

  /** Combined multiplier of active price events for a good. */
  priceEffect(good: Good): number {
    let mult = 1;
    for (const e of this.state.events.effects) if (e.kind === 'price' && e.good === good) mult *= e.value;
    return mult;
  }

  /** Additive traffic bonus from active events. */
  trafficEffect(): number {
    let bonus = 0;
    for (const e of this.state.events.effects) if (e.kind === 'traffic') bonus += e.value;
    return bonus;
  }

  changeReputation(delta: number): void {
    const before = this.state.reputation;
    const value = clamp(before + delta, 0, 100);
    if (value === before) return;
    this.state.reputation = value;
    this.bus.emit('reputationChanged', { value, delta: value - before });
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
