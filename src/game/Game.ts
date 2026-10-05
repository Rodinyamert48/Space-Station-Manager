import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { TKey, TParams } from '../i18n/i18n';
import { MODULES, type ModuleType } from '../data/modules';
import type { GameEvents, Notice, NoticeLevel } from './events';
import type { GameSpeed, GameState } from './state';
import { StationSystem } from './systems/StationSystem';

/** Real seconds per game hour at 1x speed. One game day lasts one real minute. */
export const SECONDS_PER_HOUR = 2.5;
/** Fixed simulation step in game hours. */
export const STEP_HOURS = 0.1;
/** Never simulate more than this many steps per frame (protects against tab-switch catch-up spikes). */
const MAX_STEPS_PER_FRAME = 40;

export type Result<R extends string = string> = { ok: true } | { ok: false; reason: R };

/**
 * Simulation facade. Owns the game state and the systems that mutate it. Rendering and UI
 * code read the state and call the public command methods; they never mutate state directly.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: Rng;
  readonly station: StationSystem;
  private accumulator = 0;
  private noticeId = 1;

  constructor(public readonly state: GameState) {
    this.rng = new Rng(state.rngState);
    this.station = new StationSystem(this);
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
        this.bus.emit('moduleCompleted', { module: m });
        this.bus.emit('moduleChanged', { module: m });
        this.notify('success', 'notice.moduleCompleted', { module: `module.${m.type}.name` }, { moduleId: m.id });
      }
    }
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
