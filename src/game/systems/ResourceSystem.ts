import { MODULES, type Cost, type CostKey, type ModuleType } from '../../data/modules';
import { GOODS, PERSON_NEEDS, RESOURCE_IDS, type ResourceId } from '../../data/resources';
import type { Modifiers } from '../../data/research';
import type { Game } from '../Game';
import type { ModuleState } from '../state';

export type LifeResource = 'oxygen' | 'water' | 'food';
const LIFE: LifeResource[] = ['oxygen', 'water', 'food'];

/** Per-hour flows computed from the current station state. */
export interface FlowReport {
  production: Record<ResourceId, number>;
  consumption: Record<ResourceId, number>;
  /** 0..1 effective output of each module. */
  efficiency: Map<number, number>;
  energyProduction: number;
  energyDemand: number;
  /** Fraction of energy demand that can be met right now. */
  powerRatio: number;
  population: number;
}

const zeroRecord = (): Record<ResourceId, number> => {
  const r = {} as Record<ResourceId, number>;
  for (const id of RESOURCE_IDS) r[id] = 0;
  return r;
};

/** Output multiplier from research/events for a module's production of a resource. */
function outputMultiplier(type: ModuleType, resource: ResourceId, mods: Modifiers): number {
  let mult = 1 + mods.efficiency;
  if (resource === 'energy') {
    if (type === 'solar') mult *= 1 + mods.solarOutput;
    else mult *= 1 + mods.powerOutput;
  }
  if (resource === 'oxygen') mult *= 1 + mods.oxygenOutput;
  if (resource === 'water') mult *= 1 + mods.waterOutput;
  if (resource === 'food') mult *= 1 + mods.foodOutput;
  if (resource === 'research') mult *= 1 + mods.researchOutput;
  if (type === 'factory') mult *= 1 + mods.factoryOutput;
  return mult;
}

function inputMultiplier(type: ModuleType, resource: ResourceId, mods: Modifiers): number {
  if (resource === 'fuel') return Math.max(0.1, 1 + mods.fuelUse);
  if (resource === 'metal' && type === 'factory') return 1 + mods.factoryOutput;
  return 1;
}

/**
 * Single owner of resource amounts. Runs the production/consumption simulation and exposes
 * add/remove APIs so storage limits are always respected.
 */
export class ResourceSystem {
  private readonly capacities = {} as Record<ResourceId, number>;
  private report: FlowReport;
  /** Hysteresis flags so shortage warnings fire once per episode. */
  private readonly alerts = new Set<string>();
  /** Resources that hit zero during the last step (read by the crew system). */
  readonly shortages = new Set<LifeResource>();

  constructor(private readonly game: Game) {
    this.recomputeCapacity();
    this.report = this.computeFlows();
  }

  private get amounts(): Record<ResourceId, number> {
    return this.game.state.resources;
  }

  /** Recalculates storage and battery limits from built modules. */
  recomputeCapacity(): void {
    let storage = 0;
    let battery = 0;
    for (const m of this.game.station.modules) {
      if (m.status !== 'active') continue;
      const def = MODULES[m.type];
      storage += def.storage ?? 0;
      battery += def.battery ?? 0;
    }
    for (const id of RESOURCE_IDS) this.capacities[id] = Number.POSITIVE_INFINITY;
    for (const g of GOODS) this.capacities[g] = storage;
    this.capacities.energy = battery;
    for (const id of RESOURCE_IDS) {
      if (this.amounts[id] > this.capacities[id]) this.amounts[id] = this.capacities[id];
    }
  }

  capacity(id: ResourceId): number {
    return this.capacities[id];
  }

  get(id: ResourceId): number {
    return this.amounts[id];
  }

  /** Free space for a resource. */
  space(id: ResourceId): number {
    return Math.max(0, this.capacities[id] - this.amounts[id]);
  }

  has(id: ResourceId, amount: number): boolean {
    return this.amounts[id] >= amount - 1e-9;
  }

  /** Adds up to the storage limit and returns the amount actually stored. */
  add(id: ResourceId, amount: number): number {
    if (amount <= 0) return 0;
    const added = Math.min(amount, this.space(id));
    this.amounts[id] += added;
    return added;
  }

  /** Removes `amount` only if fully available. */
  remove(id: ResourceId, amount: number): boolean {
    if (amount <= 0) return true;
    if (!this.has(id, amount)) return false;
    this.amounts[id] = Math.max(0, this.amounts[id] - amount);
    return true;
  }

  /** Removes as much as possible up to `amount` and returns what was taken. */
  take(id: ResourceId, amount: number): number {
    const taken = Math.min(Math.max(0, amount), this.amounts[id]);
    this.amounts[id] -= taken;
    return taken;
  }

  /** Direct credit adjustment that may go negative (debt). Only the economy system uses this. */
  adjustCredits(delta: number): void {
    this.amounts.credits += delta;
  }

  missing(cost: Cost): CostKey[] {
    return (Object.keys(cost) as CostKey[]).filter((k) => !this.has(k, cost[k] ?? 0));
  }

  canAfford(cost: Cost): boolean {
    return this.missing(cost).length === 0;
  }

  /** Latest flow report (per-hour rates) for UI and other systems. */
  get flows(): FlowReport {
    return this.report;
  }

  /** Net change per hour of a resource from continuous flows. */
  netRate(id: ResourceId): number {
    return this.report.production[id] - this.report.consumption[id];
  }

  /** Game hours until a resource runs out at the current rate (Infinity if not draining). */
  hoursLeft(id: ResourceId): number {
    const net = this.netRate(id);
    if (net >= -1e-6) return Number.POSITIVE_INFINITY;
    return this.amounts[id] / -net;
  }

  /**
   * Computes desired per-hour flows. Inputs are limited by current stock so a module that is
   * out of fuel or raw material produces proportionally less.
   */
  computeFlows(dt = 0.1): FlowReport {
    const game = this.game;
    const mods = game.modifiers();
    const production = zeroRecord();
    const consumption = zeroRecord();
    const efficiency = new Map<number, number>();

    const operational: { m: ModuleState; base: number }[] = [];
    for (const m of game.station.modules) {
      if (!game.station.isOperational(m)) {
        efficiency.set(m.id, 0);
        continue;
      }
      operational.push({ m, base: game.moduleWorkFactor(m) });
    }

    // Energy balance first: it scales everything else.
    let energyProduction = 0;
    let energyDemand = 0;
    for (const { m, base } of operational) {
      const def = MODULES[m.type];
      energyDemand += def.consumes.energy ?? 0;
      const out = def.produces.energy;
      if (!out) continue;
      let factor = base * outputMultiplier(m.type, 'energy', mods);
      const fuel = (def.consumes.fuel ?? 0) * inputMultiplier(m.type, 'fuel', mods);
      if (fuel > 0) factor *= Math.min(1, this.amounts.fuel / (fuel * dt));
      energyProduction += out * factor;
    }
    const stored = this.amounts.energy;
    const deficitPerHour = energyDemand - energyProduction;
    let powerRatio = 1;
    if (deficitPerHour > 0 && energyDemand > 0) {
      const fromBattery = Math.min(deficitPerHour, stored / dt);
      powerRatio = Math.min(1, (energyProduction + fromBattery) / energyDemand);
    }
    production.energy = energyProduction;
    consumption.energy = energyDemand * powerRatio;

    for (const { m, base } of operational) {
      const def = MODULES[m.type];
      const usesPower = (def.consumes.energy ?? 0) > 0;
      let eff = base * (usesPower ? powerRatio : 1);
      // Material inputs (fuel, metal, water) limit output when stocks run dry.
      let inputFactor = 1;
      for (const [res, rate] of Object.entries(def.consumes) as [ResourceId, number][]) {
        if (res === 'energy' || rate <= 0) continue;
        const need = rate * inputMultiplier(m.type, res, mods) * eff * dt;
        if (need > 0) inputFactor = Math.min(inputFactor, this.amounts[res] / need);
      }
      inputFactor = Math.min(1, inputFactor);
      const hasMaterialInputs = Object.keys(def.consumes).some((r) => r !== 'energy');
      if (hasMaterialInputs && m.type !== 'power') eff *= inputFactor;
      efficiency.set(m.id, eff);
      for (const [res, rate] of Object.entries(def.consumes) as [ResourceId, number][]) {
        if (res === 'energy') continue;
        const scale = m.type === 'power' ? base * Math.min(1, inputFactor) : eff;
        consumption[res] += rate * inputMultiplier(m.type, res, mods) * scale;
      }
      for (const [res, rate] of Object.entries(def.produces) as [ResourceId, number][]) {
        if (res === 'energy') continue;
        production[res] += rate * eff * outputMultiplier(m.type, res, mods);
      }
    }

    const population = game.population();
    for (const res of LIFE) {
      const mult = res === 'water' ? Math.max(0.3, 1 + mods.waterUse) : 1;
      consumption[res] += population * PERSON_NEEDS[res] * mult;
    }

    return { production, consumption, efficiency, energyProduction, energyDemand, powerRatio, population };
  }

  /** Advances resource stocks by one simulation step. */
  tick(dt: number): void {
    const report = this.computeFlows(dt);
    this.report = report;
    for (const id of RESOURCE_IDS) {
      if (id === 'credits') continue;
      const net = (report.production[id] - report.consumption[id]) * dt;
      if (net >= 0) this.add(id, net);
      else this.take(id, -net);
    }
    this.game.economy.recordEnergyUse(report.consumption.energy * dt);

    this.shortages.clear();
    for (const res of LIFE) {
      if (this.amounts[res] <= 1e-6 && report.consumption[res] > report.production[res]) this.shortages.add(res);
    }
    this.checkAlerts(report);
  }

  private checkAlerts(report: FlowReport): void {
    const game = this.game;
    for (const res of LIFE) {
      const net = report.production[res] - report.consumption[res];
      const low = net < 0 && this.amounts[res] / -net < 12;
      this.flag(`low-${res}`, low, () => game.notify('warning', 'notice.resourceLow', { resource: `res.${res}` }));
      this.flag(`out-${res}`, this.shortages.has(res), () => game.notify('danger', 'notice.resourceOut', { resource: `res.${res}` }));
    }
    this.flag('power', report.powerRatio < 0.98, () =>
      game.notify('danger', 'notice.powerDeficit', { pct: Math.round(report.powerRatio * 100) }),
    );
    const fuelUse = report.consumption.fuel;
    this.flag('fuel', fuelUse > 0 && this.amounts.fuel < fuelUse * 6, () => game.notify('warning', 'notice.fuelLow'));
    for (const g of GOODS) {
      const cap = this.capacities[g];
      const key = `full-${g}`;
      const atCap = cap > 0 && this.amounts[g] >= cap - 1e-6 && report.production[g] > report.consumption[g];
      const stillHigh = this.alerts.has(key) && this.amounts[g] > cap * 0.95;
      this.flag(key, atCap || stillHigh, () => game.notify('info', 'notice.storageFull', { resource: `res.${g}` }));
    }
  }

  /** Raises an alert once when `active` becomes true; re-arms when it clears. */
  private flag(key: string, active: boolean, raise: () => void): void {
    if (active && !this.alerts.has(key)) {
      this.alerts.add(key);
      raise();
    } else if (!active) this.alerts.delete(key);
  }
}
