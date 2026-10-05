import { clamp } from '../../core/math';
import { CREW_ROLES, CREW_ROLE_DEFS, HIRE_COST_DAYS, type CrewRole } from '../../data/crew';
import { MODULES, type ModuleType } from '../../data/modules';
import type { Game } from '../Game';
import { createCrewMember } from '../newGame';
import type { CrewMember, CrewTask, ModuleState } from '../state';

/** Fraction of output a module keeps with nobody on duty. */
export const AUTOMATION_FLOOR = 0.25;
/** A worker filling a specialist slot works at this effectiveness. */
const GENERALIST_EFFECTIVENESS = 0.6;
const MAX_APPLICANTS_PER_ROLE = 3;
export const SALARY_RATES = [0.8, 1, 1.25, 1.5] as const;

/** Staffing priority: life-critical systems are crewed first. */
const STAFF_PRIORITY: ModuleType[] = ['lifeSupport', 'water', 'power', 'docking', 'medical', 'lab', 'factory', 'cargo', 'comms', 'restaurant', 'defense'];

export type HireError = 'noBeds' | 'noApplicants' | 'noCredits';

interface Staffing {
  required: number;
  filled: number;
  crew: number[];
}

/**
 * Crew roster: staffing assignment, needs (rest, food, health), morale, recruitment and
 * departures. Assignment is recomputed only when the roster or layout changes; needs update hourly.
 */
export class CrewSystem {
  private staffing = new Map<number, Staffing>();
  private dirty = true;
  /** Hours each crew member has spent at rock-bottom morale. */
  private readonly misery = new Map<number, number>();

  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.crew;
  }

  get members(): readonly CrewMember[] {
    return this.state.members;
  }

  get(id: number): CrewMember | undefined {
    return this.state.members.find((m) => m.id === id);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Staff a module needs after research reductions. */
  required(type: ModuleType): number {
    const staff = MODULES[type].staff;
    if (!staff) return 0;
    return Math.max(0, staff.count - this.game.modifiers().staffReduction);
  }

  staffingOf(moduleId: number): Staffing {
    this.ensureAssigned();
    return this.staffing.get(moduleId) ?? { required: 0, filled: 0, crew: [] };
  }

  private ensureAssigned(): void {
    if (this.dirty) this.assign();
  }

  /** Matches crew to workplaces: specialists first, then workers fill remaining slots. */
  assign(): void {
    this.dirty = false;
    const g = this.game;
    const staffing = new Map<number, Staffing>();
    const free = new Set(this.state.members.filter((m) => m.health > 0).map((m) => m.id));
    for (const m of this.state.members) m.workId = 0;
    const modules = g.station.modules
      .filter((m) => g.station.isOperational(m) && this.required(m.type) > 0)
      .sort((a, b) => STAFF_PRIORITY.indexOf(a.type) - STAFF_PRIORITY.indexOf(b.type) || a.id - b.id);
    for (const mod of modules) staffing.set(mod.id, { required: this.required(mod.type), filled: 0, crew: [] });

    const fill = (mod: ModuleState, predicate: (c: CrewMember) => boolean, effectiveness: number): void => {
      const s = staffing.get(mod.id);
      if (!s) return;
      for (const c of this.state.members) {
        if (s.crew.length >= s.required) return;
        if (!free.has(c.id) || !predicate(c)) continue;
        free.delete(c.id);
        c.workId = mod.id;
        s.crew.push(c.id);
        s.filled += effectiveness;
      }
    };
    for (const mod of modules) {
      const role = MODULES[mod.type].staff?.role;
      fill(mod, (c) => c.role === role, 1);
    }
    for (const mod of modules) {
      const role = MODULES[mod.type].staff?.role;
      if (role !== 'worker') fill(mod, (c) => c.role === 'worker', GENERALIST_EFFECTIVENESS);
    }
    this.staffing = staffing;
  }

  /** Output factor from staffing, morale and health (1 = fully crewed and content). */
  workFactor(m: ModuleState): number {
    const required = this.required(m.type);
    if (required === 0) return 1;
    const s = this.staffingOf(m.id);
    const fillRatio = clamp(s.filled / required, 0, 1);
    let morale = 1;
    if (s.crew.length > 0) {
      let sum = 0;
      for (const id of s.crew) {
        const c = this.get(id);
        if (!c) continue;
        sum += (0.7 + 0.45 * (c.happiness / 100)) * (c.health < 50 ? 0.5 + c.health / 100 : 1);
      }
      morale = sum / s.crew.length;
    }
    let factor = (AUTOMATION_FLOOR + (1 - AUTOMATION_FLOOR) * fillRatio) * (fillRatio > 0 ? morale : 1);
    if (this.game.strikeActive()) factor *= 0.5;
    return factor;
  }

  understaffed(): { module: ModuleState; required: number; filled: number }[] {
    this.ensureAssigned();
    const out: { module: ModuleState; required: number; filled: number }[] = [];
    for (const [id, s] of this.staffing) {
      const module = this.game.station.getModule(id);
      if (module && s.filled < s.required - 1e-6) out.push({ module, required: s.required, filled: s.crew.length });
    }
    return out;
  }

  averageHappiness(): number {
    const list = this.state.members;
    if (list.length === 0) return 0;
    return list.reduce((s, m) => s + m.happiness, 0) / list.length;
  }

  hireCost(role: CrewRole): number {
    return Math.round(CREW_ROLE_DEFS[role].salary * HIRE_COST_DAYS);
  }

  canHire(role: CrewRole): { ok: true } | { ok: false; reason: HireError } {
    const g = this.game;
    if (this.state.members.length >= g.crewCapacity()) return { ok: false, reason: 'noBeds' };
    if ((this.state.applicants[role] ?? 0) <= 0) return { ok: false, reason: 'noApplicants' };
    if (g.state.resources.credits < this.hireCost(role)) return { ok: false, reason: 'noCredits' };
    return { ok: true };
  }

  hire(role: CrewRole): { ok: true; member: CrewMember } | { ok: false; reason: HireError } {
    const check = this.canHire(role);
    if (!check.ok) return check;
    const g = this.game;
    g.economy.spend(this.hireCost(role), 'hiring');
    this.state.applicants[role] = (this.state.applicants[role] ?? 1) - 1;
    const member = createCrewMember(this.state.nextId++, role, g.rng, g.hour, g.station.command().id);
    this.state.members.push(member);
    g.state.stats.peakCrew = Math.max(g.state.stats.peakCrew, this.state.members.length);
    this.dirty = true;
    g.bus.emit('crewAdded', { member });
    g.notify('success', 'notice.crewHired', { name: member.name, role: `role.${role}` });
    return { ok: true, member };
  }

  fire(id: number): boolean {
    const member = this.get(id);
    if (!member) return false;
    this.game.economy.charge(CREW_ROLE_DEFS[member.role].salary, 'salaries');
    this.removeMember(member, 'fired');
    this.game.notify('info', 'notice.crewFired', { name: member.name });
    return true;
  }

  private removeMember(member: CrewMember, reason: 'fired' | 'quit' | 'evacuated'): void {
    const list = this.state.members;
    const i = list.indexOf(member);
    if (i >= 0) list.splice(i, 1);
    this.misery.delete(member.id);
    this.dirty = true;
    this.game.bus.emit('crewRemoved', { member, reason });
  }

  setSalaryRate(rate: number): void {
    this.state.salaryRate = rate;
  }

  /** Adds applicants for roles the station currently needs (daily and from passenger ships). */
  addApplicants(count: number): void {
    const g = this.game;
    const needed = this.understaffed().map((u) => MODULES[u.module.type].staff?.role).filter((r): r is CrewRole => !!r);
    for (let i = 0; i < count; i++) {
      const role = needed.length > 0 && g.rng.chance(0.6) ? g.rng.pick(needed) : g.rng.pick(CREW_ROLES);
      this.state.applicants[role] = Math.min(MAX_APPLICANTS_PER_ROLE, (this.state.applicants[role] ?? 0) + 1);
    }
  }

  onNewDay(): void {
    const g = this.game;
    const appeal = 1 + Math.floor(g.state.stage / 2) + (g.state.reputation > 50 ? 1 : 0);
    this.addApplicants(g.rng.int(1, appeal + 1));
  }

  private happinessTarget(): number {
    const g = this.game;
    const crew = this.state.members.length;
    if (crew === 0) return 60;
    let recreation = 0;
    let medical = 0;
    for (const m of g.station.modules) {
      if (!g.station.isOperational(m)) continue;
      recreation += MODULES[m.type].recreation ?? 0;
      medical += MODULES[m.type].medical ?? 0;
    }
    const coverage = clamp(recreation / crew, 0, 1);
    let target = 52 + 20 * coverage + (medical > 0 ? 6 : 0) + (this.state.salaryRate - 1) * 45 + g.modifiers().happiness + g.happinessEffect();
    if (crew > g.crewCapacity()) target -= 20;
    if (g.resources.shortages.size > 0) target -= 30;
    else if (g.resources.flows.powerRatio < 0.9) target -= 10;
    return clamp(target, 0, 100);
  }

  private chooseTask(c: CrewMember, shiftOff: boolean): { task: CrewTask; location: number } {
    const g = this.game;
    const find = (type: ModuleType): number => {
      const options = g.station.modules.filter((m) => m.type === type && g.station.isOperational(m));
      if (options.length === 0) return 0;
      return (options[c.id % options.length] as ModuleState).id;
    };
    const hub = g.station.command().id;
    if (c.health < 45) {
      const med = find('medical');
      if (med) return { task: 'treatment', location: med };
    }
    if (c.energy < 25) return { task: 'resting', location: find('quarters') || hub };
    if (c.hunger > 7) return { task: 'eating', location: find('restaurant') || hub };
    if (c.workId && !shiftOff) return { task: 'working', location: c.workId };
    if (shiftOff) return { task: 'relaxing', location: find('restaurant') || hub };
    return { task: 'idle', location: find('quarters') || hub };
  }

  /** Hourly needs, health, morale, task choice and departures. */
  hourly(): void {
    const g = this.game;
    this.ensureAssigned();
    const shortages = g.resources.shortages;
    const target = this.happinessTarget();
    let medicalSlots = 0;
    for (const m of g.station.modules) if (g.station.isOperational(m)) medicalSlots += MODULES[m.type].medical ?? 0;
    const hourOfDay = Math.floor(g.hour) % 24;

    for (const c of [...this.state.members]) {
      // Needs.
      const working = c.task === 'working';
      c.energy = clamp(c.energy + (c.task === 'resting' ? 14 : working ? -4.5 : -2), 0, 100);
      c.hunger = c.task === 'eating' && g.state.resources.food > 0 ? 0 : c.hunger + 1;
      let health = c.health;
      if (shortages.has('oxygen')) health -= 18;
      if (shortages.has('water')) health -= 5;
      if (shortages.has('food')) health -= 2.5;
      if (shortages.size === 0) health += c.task === 'treatment' && medicalSlots-- > 0 ? 6 : 0.6;
      c.health = clamp(health, 0, 100);
      c.happiness = clamp(c.happiness + clamp(target - c.happiness, -5, 4), 0, 100);
      if (c.energy < 15) c.happiness = Math.max(0, c.happiness - 1);
      c.need = c.health < 45 ? 'medical' : c.energy < 25 ? 'rest' : c.hunger > 7 ? 'food' : c.happiness < 35 ? 'fun' : 'none';

      // Each crew member has an off-duty block based on their id (staggered shifts).
      const shiftOff = (hourOfDay + c.id * 5) % 24 < 6;
      const next = this.chooseTask(c, shiftOff);
      if (next.location && next.location !== c.locationId) {
        const from = c.locationId;
        c.locationId = next.location;
        g.bus.emit('crewMoved', { member: c, from, to: next.location });
      }
      c.task = next.task;

      if (c.health <= 0) {
        g.notify('danger', 'notice.crewEvacuated', { name: c.name });
        this.removeMember(c, 'evacuated');
        continue;
      }
      const misery = c.happiness < 12 ? (this.misery.get(c.id) ?? 0) + 1 : 0;
      this.misery.set(c.id, misery);
      if (misery >= 24) {
        g.notify('warning', 'notice.crewQuit', { name: c.name });
        this.removeMember(c, 'quit');
      }
    }
    // Crew whose module vanished go back to the hub.
    for (const c of this.state.members) {
      if (!g.station.getModule(c.locationId)) {
        const hub = g.station.command().id;
        g.bus.emit('crewMoved', { member: c, from: hub, to: hub });
        c.locationId = hub;
      }
    }
  }
}

