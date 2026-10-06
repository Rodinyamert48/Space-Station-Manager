import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { clamp, easeInOutCubic, easeOutCubic } from '../core/math';
import { Rng } from '../core/Rng';
import { CELL_SIZE, rotateVec } from '../data/grid';
import { SHIP_TYPES, type ShipTypeId } from '../data/ships';
import type { Game } from '../game/Game';
import type { ShipState, ShipStatus } from '../game/state';
import { APPROACH_HOURS, ARRIVAL_HOURS, DEPART_HOURS } from '../game/systems/ShipSystem';
import { t } from '../i18n/i18n';
import type { EffectHandle, Effects } from './Effects';
import type { WorldLabels } from './Labels';
import { slotTags, type MaterialLibrary } from './Materials';
import { ModelLibrary, type ShipTemplate } from './ModelLibrary';
import { ModelKit } from './models/ModelKit';
import type { ShadowSink } from './StationView';
import { cellToWorld } from './StationView';

interface ShipVisual {
  id: number;
  type: ShipTypeId;
  root: TransformNode;
  instances: InstancedMesh[];
  emitters: Mesh[];
  trails: EffectHandle[];
  spawn: Vector3;
  exit: Vector3;
  arriveStart: number;
  from: Vector3;
  status: ShipStatus;
  thrusting: boolean;
}

interface BerthFixture {
  moduleId: number;
  root: TransformNode;
  doorL: Mesh;
  doorR: Mesh;
  light: Mesh;
  open: number;
}

interface Drone {
  node: TransformNode;
  from: Vector3;
  to: Vector3;
  t: number;
  duration: number;
}

interface Traffic {
  root: TransformNode;
  from: Vector3;
  to: Vector3;
  t: number;
  duration: number;
}

const tmp = new Vector3();

function lookRotation(dir: Vector3, out: Quaternion): Quaternion {
  const len = dir.length();
  if (len < 1e-5) return out;
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = -Math.asin(clamp(dir.y / len, -1, 1));
  return Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, out);
}

function bezier(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3): Vector3 {
  const u = 1 - t;
  out.copyFrom(p0).scaleInPlace(u * u * u);
  out.addInPlace(p1.scale(3 * u * u * t));
  out.addInPlace(p2.scale(3 * u * t * t));
  out.addInPlace(p3.scale(t * t * t));
  return out;
}

/**
 * Animates visiting ships: arrival from deep space, holding pattern while waiting for clearance,
 * the docking approach, undocking and departure. Also drives berth doors/lights, cargo drones
 * and distant background traffic.
 */
export class ShipView {
  private readonly ships = new Map<number, ShipVisual>();
  private readonly berths = new Map<number, BerthFixture>();
  private readonly drones: Drone[] = [];
  private readonly dronePool: TransformNode[] = [];
  private readonly droneTemplate: Mesh[];
  private readonly traffic: Traffic[] = [];
  private readonly rng = new Rng(4242);
  private maxTraffic = 4;
  private labelTimer = 0;
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly models: ModelLibrary,
    private readonly materials: MaterialLibrary,
    private readonly effects: Effects,
    private readonly labels: WorldLabels,
    private readonly shadows: ShadowSink,
  ) {
    const kit = new ModelKit(scene, 'drone');
    kit.box({ slot: 'hullDark', w: 0.6, h: 0.35, d: 0.7 });
    kit.box({ slot: 'paint', w: 0.5, h: 0.4, d: 0.5, pos: [0, -0.35, 0], color: '#d1a23a' });
    kit.sphere({ slot: 'lightWhite', d: 0.18, seg: 6, pos: [0, 0.22, 0.3] });
    this.droneTemplate = [...kit.build().entries()].map(([slot, mesh]) => {
      mesh.material = materials.get(slot);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.metadata = slotTags(slot);
      return mesh;
    });
  }

  setTrafficLimit(max: number): void {
    this.maxTraffic = max;
  }

  // ---------------------------------------------------------------- ships

  syncAll(game: Game): void {
    for (const id of [...this.ships.keys()]) this.removeShip(id);
    for (const s of game.ships.list) this.addShip(s, game, true);
    this.syncBerths(game);
  }

  addShip(ship: ShipState, game: Game, fromSave = false): void {
    if (this.ships.has(ship.id)) return;
    const template = this.models.ships[ship.type];
    const root = new TransformNode(`ship-${ship.id}`, this.scene);
    root.rotationQuaternion = Quaternion.Identity();
    root.metadata = { shipId: ship.id };
    const instances = this.models.instantiate(template, root, `ship-${ship.id}`, true);
    for (const inst of instances) if (ModelLibrary.castsShadow(inst)) this.shadows.addCaster(inst);
    const emitters = template.engines.map((e, i) => {
      const m = CreateBox(`ship-${ship.id}-engine${i}`, { size: 0.05 }, this.scene);
      m.isVisible = false;
      m.isPickable = false;
      m.parent = root;
      m.position.set(e[0], e[1], e[2]);
      return m;
    });
    const angle = this.rng.range(0, Math.PI * 2);
    const spawn = new Vector3(Math.cos(angle) * 700, this.rng.range(-120, 160), Math.sin(angle) * 700);
    const exitAngle = angle + this.rng.range(1.5, 4.5);
    const exit = new Vector3(Math.cos(exitAngle) * 750, this.rng.range(-150, 180), Math.sin(exitAngle) * 750);
    const visual: ShipVisual = {
      id: ship.id,
      type: ship.type,
      root,
      instances,
      emitters,
      trails: [],
      spawn,
      exit,
      arriveStart: fromSave ? game.hour - ARRIVAL_HOURS : ship.statusSince,
      from: new Vector3(),
      status: ship.status,
      thrusting: false,
    };
    this.ships.set(ship.id, visual);
    this.pose(visual, ship, game, 1, true);
    visual.from.copyFrom(root.position);
  }

  removeShip(id: number): void {
    const v = this.ships.get(id);
    if (!v) return;
    for (const inst of v.instances) this.shadows.removeCaster(inst);
    for (const tr of v.trails) tr.stop();
    this.labels.remove(`ship-${id}`);
    v.root.dispose();
    this.ships.delete(id);
  }

  shipChanged(ship: ShipState, game: Game): void {
    const v = this.ships.get(ship.id);
    if (!v) return;
    if (v.status !== ship.status) {
      v.from.copyFrom(v.root.position);
      const berth = this.berths.get(ship.berthId);
      if (ship.status === 'docked' && berth) {
        this.effects.burst(berth.root.getAbsolutePosition(), new Color4(0.85, 0.95, 1, 0.8), 70, 3, 0.7);
      }
      v.status = ship.status;
    }
    this.syncBerthState(game);
  }

  shipIdFromNode(node: { metadata: unknown; parent: unknown } | null): number | null {
    let n = node as { metadata: unknown; parent: unknown } | null;
    while (n) {
      const meta = n.metadata as { shipId?: number } | null;
      if (meta && typeof meta.shipId === 'number') return meta.shipId;
      n = n.parent as { metadata: unknown; parent: unknown } | null;
    }
    return null;
  }

  shipPosition(id: number): Vector3 | null {
    return this.ships.get(id)?.root.position.clone() ?? null;
  }

  private berthGeometry(game: Game, moduleId: number, template: ShipTemplate): { dock: Vector3; approach: Vector3; dir: Vector3 } | null {
    const m = game.station.getModule(moduleId);
    if (!m) return null;
    const d = rotateVec({ x: 0, y: 0, z: 1 }, m.rotation);
    const dir = new Vector3(d.x, d.y, d.z);
    const base = cellToWorld(m.cell);
    const half = template.length / 2;
    return {
      dir,
      dock: base.add(dir.scale(2.75 + half)),
      approach: base.add(dir.scale(CELL_SIZE * 2.2 + half)),
    };
  }

  private holdingPoint(ship: ShipState, game: Game, out: Vector3): Vector3 {
    let radius = 30;
    for (const m of game.station.modules) radius = Math.max(radius, Math.hypot(m.cell.x, m.cell.z) * CELL_SIZE);
    radius += 55 + (ship.holdingSlot % 2) * 14;
    const angle = 0.5 + ship.holdingSlot * 0.63;
    const heights = [-8, 10, 22, -20];
    return out.set(Math.cos(angle) * radius, heights[ship.holdingSlot % heights.length] ?? 0, Math.sin(angle) * radius);
  }

  /** Computes position/orientation for a ship from its state and the smooth game clock. */
  private pose(v: ShipVisual, ship: ShipState, game: Game, dt: number, snap = false): void {
    const now = game.smoothHour;
    const template = this.models.ships[ship.type];
    const target = tmp;
    let facing: Vector3 | null = null;
    let thrust = false;
    const hold = this.holdingPoint(ship, game, new Vector3());

    switch (ship.status) {
      case 'pending':
      case 'queued': {
        const t = clamp((now - v.arriveStart) / ARRIVAL_HOURS, 0, 1);
        if (t < 1) {
          const e = easeOutCubic(t);
          const mid = Vector3.Lerp(v.spawn, hold, 0.6).addInPlaceFromFloats(0, 40, 0);
          bezier(v.spawn, mid, hold.add(new Vector3(0, 10, 0)), hold, e, target);
          thrust = true;
        } else {
          target.copyFrom(hold);
          target.y += Math.sin(this.time * 0.6 + ship.id) * 0.8;
          facing = hold.scale(-1);
        }
        break;
      }
      case 'approaching': {
        const geo = this.berthGeometry(game, ship.berthId, template);
        if (!geo) {
          target.copyFrom(hold);
          break;
        }
        const t = clamp((now - ship.statusSince) / APPROACH_HOURS, 0, 1);
        if (t < 0.72) {
          const e = easeInOutCubic(t / 0.72);
          const c1 = Vector3.Lerp(v.from, geo.approach, 0.5).addInPlaceFromFloats(0, 18, 0);
          bezier(v.from, c1, geo.approach.add(geo.dir.scale(20)), geo.approach, e, target);
          thrust = true;
          if (e > 0.75) facing = geo.dir.scale(-1);
        } else {
          const e = easeOutCubic((t - 0.72) / 0.28);
          Vector3.LerpToRef(geo.approach, geo.dock, e, target);
          facing = geo.dir.scale(-1);
        }
        break;
      }
      case 'docked': {
        const geo = this.berthGeometry(game, ship.berthId, template);
        if (geo) {
          target.copyFrom(geo.dock);
          facing = geo.dir.scale(-1);
        } else target.copyFrom(v.root.position);
        break;
      }
      case 'departing': {
        const geo = this.berthGeometry(game, ship.berthId, template);
        const t = clamp((now - ship.statusSince) / DEPART_HOURS, 0, 1);
        const start = geo?.dock ?? v.from;
        const out = geo?.approach ?? v.from;
        if (t < 0.3) {
          const e = easeInOutCubic(t / 0.3);
          Vector3.LerpToRef(start, out, e, target);
          facing = geo ? geo.dir.scale(-1) : null;
        } else {
          const e = Math.pow((t - 0.3) / 0.7, 2);
          const c1 = out.add((geo?.dir ?? Vector3.Up()).scale(60));
          bezier(out, c1, Vector3.Lerp(c1, v.exit, 0.5), v.exit, e, target);
          thrust = true;
        }
        break;
      }
    }

    const root = v.root;
    const delta = target.subtract(root.position);
    root.position.copyFrom(target);
    const q = root.rotationQuaternion ?? Quaternion.Identity();
    const desired = new Quaternion();
    if (facing) lookRotation(facing, desired);
    else if (delta.lengthSquared() > 1e-4) lookRotation(delta, desired);
    else desired.copyFrom(q);
    if (snap) root.rotationQuaternion = desired;
    else Quaternion.SlerpToRef(q, desired, Math.min(1, dt * 2.5), q);
    this.setThrust(v, thrust);
  }

  private setThrust(v: ShipVisual, on: boolean): void {
    if (on === v.thrusting) return;
    v.thrusting = on;
    for (const tr of v.trails) tr.stop();
    v.trails = [];
    if (!on) return;
    const template = this.models.ships[v.type];
    const color = Color4.FromHexString(`${template.engineColor}cc`);
    const size = template.length > 14 ? 1.4 : template.length > 9 ? 0.95 : 0.65;
    for (const e of v.emitters) {
      const tr = this.effects.stream(e, { color, direction: new Vector3(0, 0, -1), spread: 0.15, rate: 60, size, life: 0.6, power: 9 });
      if (tr) v.trails.push(tr);
    }
  }

  // ---------------------------------------------------------------- berths

  /** Creates door and status-light fixtures for every docking module. */
  syncBerths(game: Game): void {
    const docks = new Set(game.station.modules.filter((m) => m.type === 'docking').map((m) => m.id));
    for (const [id, b] of this.berths) {
      if (!docks.has(id)) {
        b.root.dispose();
        this.berths.delete(id);
      }
    }
    for (const id of docks) {
      if (this.berths.has(id)) continue;
      const m = game.station.getModule(id);
      if (!m) continue;
      const root = new TransformNode(`berth-${id}`, this.scene);
      cellToWorld(m.cell, root.position);
      root.rotation.y = (m.rotation * Math.PI) / 2;
      const door = (name: string): Mesh => {
        const d = CreateBox(name, { width: 1.95, height: 3.6, depth: 0.18 }, this.scene);
        d.parent = root;
        d.position.z = 2.62;
        d.material = this.materials.get('hullDark');
        d.isPickable = false;
        return d;
      };
      const doorL = door(`berth-${id}-doorL`);
      const doorR = door(`berth-${id}-doorR`);
      const light = CreateBox(`berth-${id}-light`, { width: 4.4, height: 0.16, depth: 0.12 }, this.scene);
      light.parent = root;
      light.position.set(0, 2.45, 2.7);
      light.isPickable = false;
      light.metadata = { glow: true };
      this.berths.set(id, { moduleId: id, root, doorL, doorR, light, open: 0 });
    }
    this.syncBerthState(game);
  }

  private syncBerthState(game: Game): void {
    for (const b of this.berths.values()) {
      const m = game.station.getModule(b.moduleId);
      const ship = game.ships.shipAtBerth(b.moduleId);
      let color = '#2aa7d6';
      if (!m || m.status !== 'active') color = '#30383f';
      else if (ship?.status === 'approaching' || ship?.status === 'departing') color = '#ffb547';
      else if (ship?.status === 'docked') color = '#5dfc8d';
      b.light.material = this.materials.emissive(color, 1.3);
      b.root.setEnabled(!!m && m.status === 'active');
    }
  }

  // ---------------------------------------------------------------- drones & traffic

  /** Cargo drones ferrying goods between a docked ship and the station core. */
  launchDrones(ship: ShipState, qty: number): void {
    const v = this.ships.get(ship.id);
    if (!v || ship.status !== 'docked') return;
    const count = Math.min(6, Math.max(1, Math.ceil(qty / 15)));
    for (let i = 0; i < count; i++) {
      const node = this.dronePool.pop() ?? this.createDrone();
      node.setEnabled(true);
      const from = v.root.position.add(new Vector3(this.rng.range(-2, 2), this.rng.range(-1, 2), this.rng.range(-2, 2)));
      const to = new Vector3(this.rng.range(-3, 3), this.rng.range(-2, 3), this.rng.range(-3, 3));
      this.drones.push({ node, from, to, t: -i * 0.35, duration: 3.2 + this.rng.range(0, 1) });
    }
  }

  private createDrone(): TransformNode {
    const node = new TransformNode('drone', this.scene);
    for (const src of this.droneTemplate) src.createInstance('drone-part').parent = node;
    return node;
  }

  private updateDrones(dt: number): void {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i] as Drone;
      d.t += dt;
      if (d.t < 0) {
        d.node.setEnabled(false);
        continue;
      }
      d.node.setEnabled(true);
      const p = d.t / d.duration;
      if (p >= 1) {
        d.node.setEnabled(false);
        this.dronePool.push(d.node);
        this.drones.splice(i, 1);
        continue;
      }
      // Out and back with a little arc.
      const leg = p < 0.5 ? easeInOutCubic(p * 2) : easeInOutCubic((1 - p) * 2);
      Vector3.LerpToRef(d.from, d.to, leg, d.node.position);
      d.node.position.y += Math.sin(leg * Math.PI) * 3;
      d.node.rotation.y = Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z) + (p < 0.5 ? 0 : Math.PI);
    }
  }

  private updateTraffic(dt: number, stage: number): void {
    const wanted = Math.min(this.maxTraffic, 1 + stage);
    while (this.traffic.length < wanted) this.traffic.push(this.spawnTraffic());
    while (this.traffic.length > wanted) this.traffic.pop()?.root.dispose();
    for (let i = 0; i < this.traffic.length; i++) {
      const tr = this.traffic[i] as Traffic;
      tr.t += dt / tr.duration;
      if (tr.t >= 1) {
        tr.root.dispose();
        this.traffic[i] = this.spawnTraffic();
        continue;
      }
      Vector3.LerpToRef(tr.from, tr.to, tr.t, tr.root.position);
    }
  }

  private spawnTraffic(): Traffic {
    const type = this.rng.pick(SHIP_TYPES);
    const root = new TransformNode('traffic', this.scene);
    this.models.instantiate(this.models.ships[type], root, 'traffic');
    const a = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(260, 620);
    const y = this.rng.range(-120, 140);
    const center = new Vector3(Math.cos(a) * dist, y, Math.sin(a) * dist);
    const heading = this.rng.range(0, Math.PI * 2);
    const dir = new Vector3(Math.cos(heading), this.rng.range(-0.15, 0.15), Math.sin(heading)).normalize();
    const from = center.subtract(dir.scale(900));
    const to = center.add(dir.scale(900));
    root.rotationQuaternion = lookRotation(dir, new Quaternion());
    root.position.copyFrom(from);
    return { root, from, to, t: this.rng.range(0, 0.6), duration: this.rng.range(45, 90) };
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, game: Game): void {
    this.time += dt;
    for (const ship of game.ships.list) {
      const v = this.ships.get(ship.id);
      if (v) this.pose(v, ship, game, dt);
    }
    for (const b of this.berths.values()) {
      const ship = game.ships.shipAtBerth(b.moduleId);
      const want = ship && (ship.status === 'docked' || (ship.status === 'departing' && game.smoothHour - ship.statusSince < DEPART_HOURS * 0.2)) ? 1 : 0;
      b.open += (want - b.open) * Math.min(1, dt * 2.5);
      b.doorL.position.x = -0.98 - b.open * 1.9;
      b.doorR.position.x = 0.98 + b.open * 1.9;
    }
    this.updateDrones(dt);
    this.updateTraffic(dt, game.state.stage);

    this.labelTimer += dt;
    if (this.labelTimer > 0.4) {
      this.labelTimer = 0;
      const keep = new Set<string>();
      for (const ship of game.ships.list) {
        const v = this.ships.get(ship.id);
        if (!v) continue;
        const key = `ship-${ship.id}`;
        if (ship.status === 'pending') {
          keep.add(key);
          this.labels.set(key, v.root, `⌛ ${ship.name}`, '#ffb547', -34);
        } else if (ship.status === 'queued') {
          keep.add(key);
          this.labels.set(key, v.root, `${t('ships.queue')} · ${ship.name}`, '#9fd8ff', -34);
        } else if (ship.status === 'docked') {
          keep.add(key);
          this.labels.set(key, v.root, `⚓ ${ship.name}`, '#5dfc8d', -30);
        }
      }
      this.labels.prune('ship-', keep);
    }
  }
}
