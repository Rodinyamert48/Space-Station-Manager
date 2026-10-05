import {
  DIR_VEC,
  OPPOSITE,
  addVec,
  cellKey,
  rotateDir,
  rotateVec,
  type Dir,
  type Rotation,
  type Vec3i,
} from '../../data/grid';
import { MODULES, type ModuleType } from '../../data/modules';
import { STAGES } from '../../data/stages';
import type { Game } from '../Game';
import type { ModuleState, ModuleStatus } from '../state';

export type PlacementError =
  | 'occupied'
  | 'outOfBounds'
  | 'noConnection'
  | 'reserved'
  | 'blocksReserve'
  | 'locked'
  | 'unique';

export interface PlacementCheck {
  ok: boolean;
  reason?: PlacementError;
  connections: number;
}

export interface Connection {
  a: number;
  b: number;
  /** Direction from module a to module b. */
  dir: Dir;
}

interface CellEntry {
  moduleId: number;
  reserved: boolean;
}

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

/**
 * Owns the station layout: grid occupancy, port connections, placement rules and the module graph
 * used by crew pathfinding. All layout mutations go through this system.
 */
export class StationSystem {
  private occupancy = new Map<string, CellEntry>();
  private connectionCache: Connection[] | null = null;
  private adjacency = new Map<number, number[]>();
  private byId = new Map<number, ModuleState>();

  constructor(private readonly game: Game) {
    this.rebuildIndex();
  }

  get modules(): readonly ModuleState[] {
    return this.game.state.station.modules;
  }

  getModule(id: number): ModuleState | undefined {
    return this.byId.get(id);
  }

  command(): ModuleState {
    const cmd = this.modules.find((m) => m.type === 'command');
    if (!cmd) throw new Error('Station has no command module');
    return cmd;
  }

  /** Rebuilds lookup tables. Call after any change to the module list. */
  rebuildIndex(): void {
    this.occupancy.clear();
    this.byId.clear();
    for (const m of this.modules) {
      this.byId.set(m.id, m);
      this.occupancy.set(cellKey(m.cell), { moduleId: m.id, reserved: false });
    }
    for (const m of this.modules) {
      for (const r of this.reserveCells(m.type, m.cell, m.rotation)) {
        const key = cellKey(r);
        if (!this.occupancy.has(key)) this.occupancy.set(key, { moduleId: m.id, reserved: true });
      }
    }
    this.connectionCache = null;
    this.adjacency.clear();
    for (const c of this.connections()) {
      this.link(c.a, c.b);
      this.link(c.b, c.a);
    }
  }

  private link(a: number, b: number): void {
    const list = this.adjacency.get(a);
    if (list) list.push(b);
    else this.adjacency.set(a, [b]);
  }

  moduleAt(cell: Vec3i): ModuleState | undefined {
    const entry = this.occupancy.get(cellKey(cell));
    if (!entry || entry.reserved) return undefined;
    return this.byId.get(entry.moduleId);
  }

  isReserved(cell: Vec3i): boolean {
    return this.occupancy.get(cellKey(cell))?.reserved ?? false;
  }

  worldPorts(type: ModuleType, rotation: Rotation): Dir[] {
    return MODULES[type].ports.map((d) => rotateDir(d, rotation));
  }

  reserveCells(type: ModuleType, cell: Vec3i, rotation: Rotation): Vec3i[] {
    return (MODULES[type].reserve ?? []).map((off) => addVec(cell, rotateVec(off, rotation)));
  }

  bounds(): { radius: number; height: number } {
    const stage = STAGES[Math.min(this.game.state.stage, STAGES.length) - 1] ?? STAGES[0];
    return { radius: stage?.buildRadius ?? 3, height: stage?.buildHeight ?? 0 };
  }

  inBounds(cell: Vec3i): boolean {
    const { radius, height } = this.bounds();
    if (Math.abs(cell.x) > radius || Math.abs(cell.z) > radius || Math.abs(cell.y) > height) return false;
    // The column above and below the command hub is kept clear for the orbital spire.
    if (cell.x === 0 && cell.z === 0 && cell.y !== 0) return false;
    return true;
  }

  checkPlacement(type: ModuleType, cell: Vec3i, rotation: Rotation): PlacementCheck {
    const def = MODULES[type];
    if (def.unique && this.modules.some((m) => m.type === type)) return { ok: false, reason: 'unique', connections: 0 };
    if (!this.game.isModuleUnlocked(type)) return { ok: false, reason: 'locked', connections: 0 };
    if (!this.inBounds(cell)) return { ok: false, reason: 'outOfBounds', connections: 0 };
    const entry = this.occupancy.get(cellKey(cell));
    if (entry) return { ok: false, reason: entry.reserved ? 'reserved' : 'occupied', connections: 0 };
    for (const r of this.reserveCells(type, cell, rotation)) {
      const e = this.occupancy.get(cellKey(r));
      if (e && !e.reserved) return { ok: false, reason: 'blocksReserve', connections: 0 };
      if (r.x === 0 && r.z === 0 && r.y !== 0) return { ok: false, reason: 'blocksReserve', connections: 0 };
    }
    let connections = 0;
    for (const d of this.worldPorts(type, rotation)) {
      const neighbor = this.moduleAt(addVec(cell, DIR_VEC[d]));
      if (neighbor && this.worldPorts(neighbor.type, neighbor.rotation).includes(OPPOSITE[d])) connections++;
    }
    if (connections === 0) return { ok: false, reason: 'noConnection', connections };
    return { ok: true, connections };
  }

  validRotations(type: ModuleType, cell: Vec3i): Rotation[] {
    return ROTATIONS.filter((r) => this.checkPlacement(type, cell, r).ok);
  }

  /** Empty cells next to an open port where `type` could be placed with at least one rotation. */
  snapCells(type: ModuleType): Vec3i[] {
    const seen = new Set<string>();
    const out: Vec3i[] = [];
    for (const m of this.modules) {
      for (const d of this.worldPorts(m.type, m.rotation)) {
        const cell = addVec(m.cell, DIR_VEC[d]);
        const key = cellKey(cell);
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.occupancy.has(key)) continue;
        if (this.validRotations(type, cell).length > 0) out.push(cell);
      }
    }
    return out;
  }

  connections(): Connection[] {
    if (this.connectionCache) return this.connectionCache;
    const out: Connection[] = [];
    for (const m of this.modules) {
      for (const d of this.worldPorts(m.type, m.rotation)) {
        if (d !== 'px' && d !== 'py' && d !== 'pz') continue; // count each pair once
        const other = this.moduleAt(addVec(m.cell, DIR_VEC[d]));
        if (other && this.worldPorts(other.type, other.rotation).includes(OPPOSITE[d])) {
          out.push({ a: m.id, b: other.id, dir: d });
        }
      }
    }
    this.connectionCache = out;
    return out;
  }

  /** Ports that are not connected to a neighbouring module (rendered as sealed hatches). */
  openPorts(m: ModuleState): Dir[] {
    return this.worldPorts(m.type, m.rotation).filter((d) => {
      const other = this.moduleAt(addVec(m.cell, DIR_VEC[d]));
      return !other || !this.worldPorts(other.type, other.rotation).includes(OPPOSITE[d]);
    });
  }

  neighbors(id: number): readonly number[] {
    return this.adjacency.get(id) ?? [];
  }

  /** Breadth-first path through connected modules, inclusive of both ends. */
  path(fromId: number, toId: number): number[] {
    if (fromId === toId) return [fromId];
    const prev = new Map<number, number>([[fromId, fromId]]);
    const queue = [fromId];
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const n of this.neighbors(current)) {
        if (prev.has(n)) continue;
        prev.set(n, current);
        if (n === toId) {
          const path = [toId];
          let step = current;
          while (step !== fromId) {
            path.push(step);
            step = prev.get(step) as number;
          }
          path.push(fromId);
          return path.reverse();
        }
        queue.push(n);
      }
    }
    return [];
  }

  /** True if every module stays reachable from the command hub without `excludeId`. */
  isConnectedWithout(excludeId: number): boolean {
    const start = this.command().id;
    if (start === excludeId) return false;
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const n of this.neighbors(current)) {
        if (n === excludeId || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return seen.size === this.modules.length - 1;
  }

  addModule(type: ModuleType, cell: Vec3i, rotation: Rotation, status: ModuleStatus): ModuleState {
    const station = this.game.state.station;
    const module: ModuleState = {
      id: station.nextModuleId++,
      type,
      cell: { ...cell },
      rotation,
      status,
      buildProgress: 0,
      enabled: true,
      damaged: false,
      offlineUntil: 0,
      builtAt: this.game.state.time.hour,
    };
    station.modules.push(module);
    this.rebuildIndex();
    return module;
  }

  removeModule(id: number): ModuleState | undefined {
    const station = this.game.state.station;
    const index = station.modules.findIndex((m) => m.id === id);
    if (index < 0) return undefined;
    const [removed] = station.modules.splice(index, 1);
    this.rebuildIndex();
    return removed;
  }

  /** Modules that are built, enabled, undamaged and not forced offline. */
  isOperational(m: ModuleState): boolean {
    return m.status === 'active' && m.enabled && !m.damaged && m.offlineUntil <= this.game.state.time.hour;
  }

  count(type: ModuleType, onlyActive = false): number {
    let n = 0;
    for (const m of this.modules) if (m.type === type && (!onlyActive || m.status === 'active')) n++;
    return n;
  }
}
