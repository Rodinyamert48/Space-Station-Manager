import { MODULES, type Cost, type CostKey } from '../../data/modules';
import { GOODS, RESOURCE_IDS, type ResourceId } from '../../data/resources';
import type { Game } from '../Game';

/**
 * Single owner of resource amounts. Every system adds/removes resources through this API so
 * storage limits are always respected.
 */
export class ResourceSystem {
  private readonly capacities = {} as Record<ResourceId, number>;

  constructor(private readonly game: Game) {
    this.recomputeCapacity();
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
}
