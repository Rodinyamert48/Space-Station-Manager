import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { easeOutCubic } from '../core/math';
import type { Effects } from './Effects';
import type { MaterialLibrary, Slot } from './Materials';
import { ModelKit } from './models/ModelKit';
import type { ShadowSink } from './StationView';

/** Radius of the habitat rings in world units. */
export const RING_RADIUS = 132;
const RING_HEIGHT = 58;

interface Part {
  node: TransformNode;
  meshes: Mesh[];
  shown: number;
  target: number;
  spin: number;
}

/**
 * The orbital city: a central spire with giant rotating habitat rings that appear as the station
 * reaches its late stages. Purely visual, but it is what makes the station feel enormous.
 */
export class MegaStructure {
  private readonly parts = new Map<string, Part>();
  private stage = 0;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly effects: Effects,
    private readonly shadows: ShadowSink,
  ) {}

  private finalize(kit: ModelKit, name: string, spin: number, y: number): Part {
    const node = new TransformNode(name, this.scene);
    node.position.y = y;
    const meshes = [...kit.build().entries()].map(([slot, mesh]: [Slot, Mesh]) => {
      mesh.material = this.materials.get(slot, '#7fd8ff');
      mesh.parent = node;
      mesh.isPickable = false;
      mesh.receiveShadows = slot === 'hull' || slot === 'hullDark';
      this.shadows.addCaster(mesh);
      return mesh;
    });
    node.scaling.setAll(0.001);
    return { node, meshes, shown: 0, target: 1, spin };
  }

  private buildSpire(direction: 1 | -1): Part {
    const k = new ModelKit(this.scene, `spire${direction}`);
    const len = RING_HEIGHT - 6;
    k.cyl({ slot: 'hull', d: 3.2, h: len, pos: [0, direction * (6 + len / 2), 0], tess: 16 });
    for (let i = 1; i < 7; i++) {
      const y = direction * (6 + (len * i) / 7);
      k.torus({ slot: 'hullDark', d: 4.2, t: 0.6, pos: [0, y, 0], tess: 20 });
      k.torus({ slot: 'accent', d: 4.4, t: 0.15, pos: [0, y + direction * 0.5, 0], tess: 20 });
    }
    k.cyl({ slot: 'hullDark', d: 9, h: 4, pos: [0, direction * RING_HEIGHT, 0], tess: 24 });
    k.cyl({ slot: 'windows', d: 9.05, h: 1.2, pos: [0, direction * RING_HEIGHT, 0], tess: 32, cap: false });
    k.sphere({ slot: 'navRed', d: 0.8, seg: 8, pos: [0, direction * (RING_HEIGHT + 3), 0] });
    return this.finalize(k, `spire${direction}`, 0, 0);
  }

  private buildRing(name: string, y: number, radius: number, pods: number, outer: boolean): Part {
    const k = new ModelKit(this.scene, name);
    k.torus({ slot: 'hull', d: radius * 2, t: 9, tess: 128 });
    k.torus({ slot: 'windows', d: radius * 2, t: 9.3, tess: 128, scale: [1, 0.25, 1], uv: [120, 1] });
    k.torus({ slot: 'hullDark', d: radius * 2 + 9, t: 1.2, tess: 128 });
    k.torus({ slot: 'accent', d: radius * 2 - 9, t: 0.5, tess: 128 });
    for (let i = 0; i < pods; i++) {
      const a = (i / pods) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      k.box({ slot: 'hull', w: 14, h: 7, d: 10, pos: [x, 6.5, z], rot: [0, -a, 0] });
      k.sphere({ slot: 'glass', d: 9, seg: 12, slice: 0.5, pos: [x, 9.8, z], scale: [1.3, 0.6, 1] });
      k.sphere({ slot: 'foliage', d: 6, seg: 8, slice: 0.5, pos: [x, 9.9, z], scale: [1.3, 0.4, 1] });
      if (i % 2 === 0) k.box({ slot: 'gold', w: 8, h: 3, d: 6, pos: [x, -6, z], rot: [0, -a, 0] });
      k.sphere({ slot: i % 2 ? 'navRed' : 'navGreen', d: 0.9, seg: 6, pos: [Math.cos(a) * (radius + 5.5), 0, Math.sin(a) * (radius + 5.5)] });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.beam({ slot: 'hullDark', from: [Math.cos(a) * 5, 0, Math.sin(a) * 5], to: [Math.cos(a) * (radius - 4), 0, Math.sin(a) * (radius - 4)], w: 2.2, h: 1.6 });
      k.beam({ slot: 'accent', from: [Math.cos(a) * 6, 1.0, Math.sin(a) * 6], to: [Math.cos(a) * (radius - 5), 1.0, Math.sin(a) * (radius - 5)], w: 0.3, h: 0.2 });
    }
    if (outer) {
      k.torus({ slot: 'hullDark', d: radius * 2 + 30, t: 2.4, tess: 128 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.beam({ slot: 'hull', from: [Math.cos(a) * (radius + 4), 0, Math.sin(a) * (radius + 4)], to: [Math.cos(a) * (radius + 15), 0, Math.sin(a) * (radius + 15)], w: 1.2 });
        k.box({ slot: 'solar', w: 18, h: 0.3, d: 9, pos: [Math.cos(a) * (radius + 24), 0, Math.sin(a) * (radius + 24)], rot: [0, -a, 0] });
      }
    }
    return this.finalize(k, name, 0.006, y);
  }

  private ensure(key: string, create: () => Part): void {
    if (this.parts.has(key)) return;
    const part = create();
    this.parts.set(key, part);
    this.effects.burst(part.node.position.add(new Vector3(0, 0, 0)), new Color4(0.5, 0.85, 1, 1), 240, 30, 3);
  }

  /** Shows the structures that belong to a stage (no-op for early stages). */
  setStage(stage: number, animate = true): void {
    if (stage === this.stage) return;
    this.stage = stage;
    if (stage >= 5) {
      this.ensure('spireUp', () => this.buildSpire(1));
      this.ensure('ringUp', () => this.buildRing('ringUp', RING_HEIGHT, RING_RADIUS, 16, false));
    }
    if (stage >= 6) this.ensure('ringUpOuter', () => this.buildRing('ringUpOuter', RING_HEIGHT, RING_RADIUS, 24, true));
    if (stage >= 7) {
      this.ensure('spireDown', () => this.buildSpire(-1));
      this.ensure('ringDown', () => this.buildRing('ringDown', -RING_HEIGHT, RING_RADIUS * 0.85, 14, true));
    }
    for (const [key, part] of this.parts) {
      part.target = MegaStructure.visibleAt(key, stage) ? 1 : 0;
      if (!animate) {
        part.shown = part.target;
        part.node.scaling.setAll(Math.max(0.001, part.target));
        part.node.setEnabled(part.target > 0);
      }
    }
  }

  /** The simple stage-5 ring is replaced by the larger outer ring at stage 6. */
  private static visibleAt(key: string, stage: number): boolean {
    switch (key) {
      case 'spireUp':
        return stage >= 5;
      case 'ringUp':
        return stage === 5;
      case 'ringUpOuter':
        return stage >= 6;
      default:
        return stage >= 7;
    }
  }

  get radius(): number {
    return this.stage >= 5 ? RING_RADIUS + 30 : 0;
  }

  update(dt: number): void {
    for (const part of this.parts.values()) {
      if (part.shown !== part.target) {
        const dir = Math.sign(part.target - part.shown);
        part.shown = Math.max(0, Math.min(1, part.shown + dir * dt * 0.18));
        part.node.scaling.setAll(Math.max(0.001, easeOutCubic(part.shown)));
        part.node.setEnabled(part.shown > 0.002);
      }
      if (part.spin) part.node.rotation.y += part.spin * dt;
    }
  }
}
