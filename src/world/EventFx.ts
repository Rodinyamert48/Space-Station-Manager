import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { Rng } from '../core/Rng';
import type { CameraController } from './CameraController';
import type { EffectHandle, Effects } from './Effects';
import { slotTags, type MaterialLibrary } from './Materials';
import { ModelKit } from './models/ModelKit';

interface Mover {
  node: TransformNode;
  from: Vector3;
  to: Vector3;
  t: number;
  duration: number;
  curve: Vector3;
  trail: EffectHandle | null;
  onArrive?: () => void;
}

interface Bolt {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  t: number;
  onHit?: () => void;
}

/** Short cinematic effects for incidents: pirate raids and meteor showers. */
export class EventFx {
  private readonly movers: Mover[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly pirateTemplate: Mesh[];
  private readonly rockMesh: Mesh;
  private readonly boltMat: StandardMaterial;
  private readonly enemyBoltMat: StandardMaterial;
  private readonly rng = new Rng(808);
  private readonly timers: { at: number; fn: () => void }[] = [];
  private time = 0;

  constructor(
    private readonly scene: Scene,
    materials: MaterialLibrary,
    private readonly effects: Effects,
    private readonly camera: CameraController,
  ) {
    const k = new ModelKit(scene, 'pirate');
    k.box({ slot: 'hullDark', w: 1.4, h: 0.7, d: 4.2 });
    k.box({ slot: 'paint', w: 4.6, h: 0.18, d: 1.8, pos: [0, 0, -0.8], color: '#6a1414' });
    k.cyl({ slot: 'hullDark', d: 0.9, dTop: 0.1, h: 1.6, axis: 'z', pos: [0, 0, 2.8], tess: 6 });
    k.sphere({ slot: 'navRed', d: 0.35, seg: 6, pos: [2.2, 0, -0.8] });
    k.sphere({ slot: 'navRed', d: 0.35, seg: 6, pos: [-2.2, 0, -0.8] });
    k.cyl({ slot: 'accent', d: 0.7, h: 0.1, axis: 'z', pos: [0, 0, -2.15], tess: 10 });
    this.pirateTemplate = [...k.build().entries()].map(([slot, mesh]) => {
      mesh.material = slot === 'accent' ? materials.emissive('#ff5040', 1.5) : materials.get(slot);
      mesh.metadata = slotTags(slot);
      mesh.isVisible = false;
      mesh.isPickable = false;
      return mesh;
    });
    this.rockMesh = CreateIcoSphere('meteor', { radius: 0.8, subdivisions: 1 }, scene);
    this.rockMesh.material = materials.get('hullDark');
    this.rockMesh.isVisible = false;
    this.rockMesh.isPickable = false;
    const bolt = (name: string, color: Color3): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.disableLighting = true;
      m.emissiveColor = color;
      return m;
    };
    this.boltMat = bolt('boltFriendly', new Color3(0.4, 0.95, 1));
    this.enemyBoltMat = bolt('boltEnemy', new Color3(1, 0.3, 0.2));
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.time + seconds, fn });
  }

  private spawnMover(template: Mesh[] | Mesh, from: Vector3, to: Vector3, duration: number, curve: Vector3, trailColor: Color4 | null, onArrive?: () => void): Mover {
    const node = new TransformNode('fxMover', this.scene);
    const list = Array.isArray(template) ? template : [template];
    for (const src of list) src.createInstance('fxPart').parent = node;
    node.position.copyFrom(from);
    node.rotationQuaternion = Quaternion.Identity();
    const emitter = trailColor ? (list[0] as Mesh).createInstance('fxEmitter') : null;
    if (emitter) {
      emitter.parent = node;
      emitter.isVisible = false;
    }
    const trail = emitter && trailColor ? this.effects.stream(emitter, { color: trailColor, direction: new Vector3(0, 0, -1), spread: 0.2, rate: 70, size: 0.8, life: 0.7, power: 6 }) : null;
    const mover: Mover = { node, from, to, t: 0, duration, curve, trail, onArrive };
    this.movers.push(mover);
    return mover;
  }

  private fire(from: Vector3, to: Vector3, enemy: boolean, onHit?: () => void): void {
    const mesh = CreateCylinder('bolt', { height: 3, diameter: 0.25, tessellation: 6 }, this.scene);
    mesh.material = enemy ? this.enemyBoltMat : this.boltMat;
    mesh.isPickable = false;
    mesh.metadata = { glow: true };
    this.bolts.push({ mesh, from: from.clone(), to: to.clone(), t: 0, onHit });
  }

  /** Pirate fighters sweep in; turrets fire back; explosions either way. */
  pirateRaid(repelled: boolean, turrets: Vector3[], stationRadius: number): void {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const from = new Vector3(Math.cos(a) * 520, this.rng.range(-40, 80), Math.sin(a) * 520);
      const near = new Vector3(Math.cos(a + 0.6) * (stationRadius + 35), this.rng.range(-10, 25), Math.sin(a + 0.6) * (stationRadius + 35));
      const exit = new Vector3(Math.cos(a + 2.5) * 600, this.rng.range(-40, 120), Math.sin(a + 2.5) * 600);
      const pirate = this.spawnMover(this.pirateTemplate, from, near, 4 + i * 0.6, new Vector3(0, 30, 0), new Color4(1, 0.4, 0.3, 0.9), () => {
        const pos = pirate.node.position.clone();
        // Exchange fire.
        for (let s = 0; s < 4; s++) {
          this.after(s * 0.35, () => {
            const target = new Vector3(this.rng.range(-8, 8), this.rng.range(-4, 6), this.rng.range(-8, 8));
            if (!repelled) this.fire(pos, target, true, () => this.effects.burst(target, new Color4(1, 0.5, 0.2, 1), 60, 6, 1.2));
            const turret = turrets.length ? (this.rng.pick(turrets) as Vector3) : new Vector3(0, 2, 0);
            this.fire(turret, pos.add(new Vector3(this.rng.range(-2, 2), 0, this.rng.range(-2, 2))), false);
          });
        }
        this.after(1.6, () => {
          if (repelled) {
            this.effects.burst(pirate.node.position, new Color4(1, 0.7, 0.3, 1), 220, 14, 2.6);
            this.camera.shake(0.4);
            this.removeMover(pirate);
          } else {
            this.camera.shake(0.8);
            pirate.from = pirate.node.position.clone();
            pirate.to = exit;
            pirate.t = 0;
            pirate.duration = 5;
            pirate.onArrive = () => this.removeMover(pirate);
          }
        });
      });
    }
  }

  /** Debris streaks past the station. */
  meteorShower(stationRadius: number): void {
    for (let i = 0; i < 14; i++) {
      this.after(i * 0.25, () => {
        const dir = new Vector3(this.rng.range(-1, 1), this.rng.range(-0.4, 0.2), this.rng.range(-1, 1)).normalize();
        const offset = new Vector3(this.rng.range(-1, 1), this.rng.range(-0.5, 0.5), this.rng.range(-1, 1)).scale(stationRadius + 10);
        const from = offset.subtract(dir.scale(500));
        const to = offset.add(dir.scale(500));
        const m = this.spawnMover(this.rockMesh, from, to, 3.5, Vector3.Zero(), new Color4(1, 0.7, 0.4, 0.8), () => this.removeMover(m));
        m.node.scaling.setAll(this.rng.range(0.6, 1.8));
      });
    }
  }

  impact(position: Vector3): void {
    this.effects.burst(position, new Color4(1, 0.55, 0.2, 1), 160, 10, 1.8);
    this.camera.shake(0.7);
  }

  private removeMover(m: Mover): void {
    m.trail?.stop();
    m.node.dispose();
    const i = this.movers.indexOf(m);
    if (i >= 0) this.movers.splice(i, 1);
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      if (timer && timer.at <= this.time) {
        this.timers.splice(i, 1);
        timer.fn();
      }
    }
    for (const m of [...this.movers]) {
      if (m.t >= 1) continue;
      m.t = Math.min(1, m.t + dt / m.duration);
      const e = m.t < 1 ? 1 - Math.pow(1 - m.t, 2) : 1;
      const prev = m.node.position.clone();
      Vector3.LerpToRef(m.from, m.to, e, m.node.position);
      m.node.position.addInPlace(m.curve.scale(Math.sin(e * Math.PI)));
      const vel = m.node.position.subtract(prev);
      if (vel.lengthSquared() > 1e-6) {
        Quaternion.RotationYawPitchRollToRef(Math.atan2(vel.x, vel.z), -Math.asin(Math.max(-1, Math.min(1, vel.y / vel.length()))), 0, m.node.rotationQuaternion ?? Quaternion.Identity());
      }
      if (m.t >= 1) m.onArrive?.();
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i] as Bolt;
      b.t += dt * 2.2;
      Vector3.LerpToRef(b.from, b.to, Math.min(1, b.t), b.mesh.position);
      const d = b.to.subtract(b.from);
      b.mesh.rotation.set(Math.PI / 2 - Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(d.x, d.z), 0);
      if (b.t >= 1) {
        b.onHit?.();
        b.mesh.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }
}
