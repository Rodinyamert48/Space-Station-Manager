import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import { clamp, easeOutCubic } from '../core/math';
import { CELL_SIZE, DIR_VEC, PORT_OFFSET, type Dir, type Vec3i } from '../data/grid';
import { MODULES, type ModuleType } from '../data/modules';
import type { Game } from '../game/Game';
import type { ModuleState } from '../game/state';
import { t } from '../i18n/i18n';
import type { EffectHandle, Effects } from './Effects';
import type { WorldLabels } from './Labels';
import type { ModelLibrary } from './ModelLibrary';

export interface ShadowSink {
  addCaster(mesh: AbstractMesh): void;
  removeCaster(mesh: AbstractMesh): void;
}

interface ModuleVisual {
  id: number;
  type: ModuleType;
  root: TransformNode;
  body: TransformNode;
  instances: InstancedMesh[];
  rotor: TransformNode | null;
  scaffold: TransformNode | null;
  sparks: EffectHandle | null;
  shown: number;
}

export const cellToWorld = (c: Vec3i, out = new Vector3()): Vector3 => out.set(c.x * CELL_SIZE, c.y * CELL_SIZE, c.z * CELL_SIZE);

/** Rotation that turns a +Z-facing template to face `dir`. */
export function dirRotation(dir: Dir): Vector3 {
  switch (dir) {
    case 'pz':
      return new Vector3(0, 0, 0);
    case 'nz':
      return new Vector3(0, Math.PI, 0);
    case 'px':
      return new Vector3(0, Math.PI / 2, 0);
    case 'nx':
      return new Vector3(0, -Math.PI / 2, 0);
    case 'py':
      return new Vector3(-Math.PI / 2, 0, 0);
    case 'ny':
      return new Vector3(Math.PI / 2, 0, 0);
  }
}

/**
 * Renders the station from game state. Listens to layout events and keeps one transform
 * hierarchy per module, plus connector corridors and sealed hatches on unused ports.
 */
export class StationView {
  private readonly visuals = new Map<number, ModuleVisual>();
  private linkRoot: TransformNode;
  private linkInstances: InstancedMesh[] = [];
  private readonly sunYaw: number;
  private time = 0;
  private labelTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly library: ModelLibrary,
    private readonly shadows: ShadowSink,
    private readonly effects: Effects,
    private readonly labels: WorldLabels,
    sunDirection: Vector3,
  ) {
    this.linkRoot = new TransformNode('stationLinks', scene);
    this.sunYaw = Math.atan2(sunDirection.x, sunDirection.z);
  }

  /** Rebuilds every visual from the current state (new game / load). */
  syncAll(game: Game): void {
    for (const id of [...this.visuals.keys()]) this.removeModule(id);
    for (const m of game.station.modules) this.addModule(m);
    this.rebuildLinks(game);
  }

  addModule(m: ModuleState): void {
    const template = this.library.modules[m.type];
    const root = new TransformNode(`module-${m.id}`, this.scene);
    cellToWorld(m.cell, root.position);
    root.rotation.y = (m.rotation * Math.PI) / 2;
    root.metadata = { moduleId: m.id };
    const body = new TransformNode(`module-${m.id}-body`, this.scene);
    body.parent = root;
    const instances = this.library.instantiate(template.base, body, `module-${m.id}`, true);
    let rotor: TransformNode | null = null;
    if (template.rotor && template.rotorPivot) {
      rotor = new TransformNode(`module-${m.id}-rotor`, this.scene);
      rotor.parent = body;
      rotor.position.set(...template.rotorPivot);
      if (m.type === 'solar') rotor.rotation.y = this.sunYaw - root.rotation.y;
      instances.push(...this.library.instantiate(template.rotor, rotor, `module-${m.id}-rotor`, true));
    }
    for (const inst of instances) this.shadows.addCaster(inst);
    const visual: ModuleVisual = { id: m.id, type: m.type, root, body, instances, rotor, scaffold: null, sparks: null, shown: 1 };
    this.visuals.set(m.id, visual);
    this.applyStatus(visual, m);
  }

  removeModule(id: number): void {
    const v = this.visuals.get(id);
    if (!v) return;
    for (const inst of v.instances) this.shadows.removeCaster(inst);
    this.labels.remove(`module-${id}`);
    v.sparks?.stop();
    v.scaffold?.dispose();
    v.root.dispose();
    this.visuals.delete(id);
  }

  /** Called when a module's status changes (construction finished, damaged, etc.). */
  updateModule(m: ModuleState): void {
    const v = this.visuals.get(m.id);
    if (v) this.applyStatus(v, m);
  }

  private applyStatus(v: ModuleVisual, m: ModuleState): void {
    if (m.status === 'constructing') {
      if (!v.scaffold) {
        v.scaffold = new TransformNode(`module-${m.id}-scaffold`, this.scene);
        v.scaffold.parent = v.root;
        this.library.instantiate(this.library.scaffold, v.scaffold, `module-${m.id}-scaffold`);
      }
      v.shown = this.constructionScale(m);
      v.body.scaling.setAll(v.shown);
      if (!v.sparks) v.sparks = this.effects.constructionSparks(v.root.position, 3.2);
    } else {
      if (v.scaffold) this.effects.burst(v.root.position, new Color4(0.5, 0.9, 1, 1), 160, 9, 0.9);
      v.scaffold?.dispose();
      v.scaffold = null;
      v.sparks?.stop();
      v.sparks = null;
    }
  }

  private constructionScale(m: ModuleState): number {
    const total = MODULES[m.type].buildHours || 1;
    return 0.15 + 0.85 * easeOutCubic(clamp(m.buildProgress / total, 0, 1));
  }

  /** Recreates connector corridors and port hatches after any layout change. */
  rebuildLinks(game: Game): void {
    for (const inst of this.linkInstances) this.shadows.removeCaster(inst);
    this.linkRoot.dispose();
    this.linkRoot = new TransformNode('stationLinks', this.scene);
    this.linkInstances = [];

    for (const c of game.station.connections()) {
      const a = game.station.getModule(c.a);
      if (!a) continue;
      const node = new TransformNode(`link-${c.a}-${c.b}`, this.scene);
      node.parent = this.linkRoot;
      const d = DIR_VEC[c.dir];
      cellToWorld(a.cell, node.position).addInPlaceFromFloats(d.x * PORT_OFFSET, d.y * PORT_OFFSET, d.z * PORT_OFFSET);
      node.rotation = dirRotation(c.dir);
      const inst = this.library.instantiate(this.library.connector, node, node.name);
      this.linkInstances.push(...inst);
    }
    for (const m of game.station.modules) {
      for (const dir of game.station.openPorts(m)) {
        const node = new TransformNode(`hatch-${m.id}-${dir}`, this.scene);
        node.parent = this.linkRoot;
        const d = DIR_VEC[dir];
        cellToWorld(m.cell, node.position).addInPlaceFromFloats(d.x * PORT_OFFSET, d.y * PORT_OFFSET, d.z * PORT_OFFSET);
        node.rotation = dirRotation(dir);
        this.linkInstances.push(...this.library.instantiate(this.library.hatch, node, node.name));
      }
    }
    for (const inst of this.linkInstances) this.shadows.addCaster(inst);
  }

  update(dt: number, game: Game): void {
    this.time += dt;
    this.labelTimer += dt;
    if (this.labelTimer > 0.5) {
      this.labelTimer = 0;
      this.updateLabels(game);
    }
    for (const v of this.visuals.values()) {
      const m = game.station.getModule(v.id);
      if (!m) continue;
      if (m.status === 'constructing') {
        const target = this.constructionScale(m);
        v.shown += (target - v.shown) * Math.min(1, dt * 4);
        v.body.scaling.setAll(v.shown);
        if (v.scaffold) v.scaffold.rotation.y = Math.sin(this.time * 0.6 + v.id) * 0.02;
      } else if (v.shown < 1) {
        v.shown = Math.min(1, v.shown + dt * 1.5);
        v.body.scaling.setAll(easeOutCubic(v.shown));
      }
      if (v.rotor && m.status === 'active') {
        if (v.type === 'comms') v.rotor.rotation.y += dt * 0.15;
        else if (v.type === 'defense') v.rotor.rotation.y = Math.sin(this.time * 0.25 + v.id) * 1.1;
      }
    }
  }

  /** Floating alerts over modules that are not working normally. */
  private updateLabels(game: Game): void {
    const keep = new Set<string>();
    const flows = game.resources.flows;
    for (const v of this.visuals.values()) {
      const m = game.station.getModule(v.id);
      if (!m || m.status !== 'active') continue;
      const def = MODULES[m.type];
      let alert: { text: string; color: string } | null = null;
      if (m.damaged) alert = { text: t('label.damaged'), color: '#ff5a4f' };
      else if (m.offlineUntil > game.hour) alert = { text: t('label.offline'), color: '#ff5a4f' };
      else if (!m.enabled) alert = { text: t('label.disabled'), color: '#8ea3bb' };
      else if ((def.consumes.energy ?? 0) > 0 && flows.powerRatio < 0.98) alert = { text: t('label.noPower'), color: '#ffb547' };
      else if ((flows.efficiency.get(m.id) ?? 1) < 0.5) alert = { text: t('label.lowOutput'), color: '#ffb547' };
      if (!alert) continue;
      const key = `module-${v.id}`;
      keep.add(key);
      this.labels.set(key, v.root, alert.text, alert.color, -46);
    }
    this.labels.prune('module-', keep);
  }

  /** Resolves a picked mesh to the module it belongs to. */
  moduleIdFromMesh(mesh: AbstractMesh | null): number | null {
    let node: Node | null = mesh;
    while (node) {
      const meta = node.metadata as { moduleId?: number } | null;
      if (meta && typeof meta.moduleId === 'number') return meta.moduleId;
      node = node.parent;
    }
    return null;
  }

  modulePosition(id: number): Vector3 | null {
    return this.visuals.get(id)?.root.position.clone() ?? null;
  }

  moduleTop(type: ModuleType): number {
    return this.library.modules[type].top;
  }

  /** Approximate radius of the station in world units (for camera limits). */
  radius(game: Game): number {
    let r = 0;
    for (const m of game.station.modules) {
      r = Math.max(r, Math.hypot(m.cell.x, m.cell.y, m.cell.z) * CELL_SIZE + CELL_SIZE * 0.75);
    }
    return r;
  }
}
