import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Slot } from '../Materials';

export type V3 = readonly [number, number, number];
export type Axis = 'x' | 'y' | 'z';

export interface PartOpts {
  slot: Slot;
  pos?: V3;
  /** Euler rotation in radians, applied after axis alignment. */
  rot?: V3;
  scale?: V3;
  /** Vertex colour (paint slot only). */
  color?: string;
  /** Explicit UV tiling [u, v], overriding the size-based default. */
  uv?: readonly [number, number];
}

const AXIS_ROT: Record<Axis, V3> = { y: [0, 0, 0], z: [Math.PI / 2, 0, 0], x: [0, 0, -Math.PI / 2] };

/**
 * Builds procedural models out of primitives. Parts are baked into vertex space and merged per
 * material slot, so each finished model is a handful of meshes that instance cheaply.
 */
export class ModelKit {
  private readonly parts = new Map<Slot, Mesh[]>();
  private counter = 0;

  constructor(
    private readonly scene: Scene,
    readonly name: string,
  ) {}

  private add(mesh: Mesh, o: PartOpts, axis: Axis, uScale: number, vScale: number): Mesh {
    const s = o.scale ?? [1, 1, 1];
    const a = AXIS_ROT[axis];
    const r = o.rot ?? [0, 0, 0];
    const p = o.pos ?? [0, 0, 0];
    const m = Matrix.Scaling(s[0], s[1], s[2])
      .multiply(Matrix.RotationYawPitchRoll(a[1], a[0], a[2]))
      .multiply(Matrix.FromQuaternionToRef(Quaternion.FromEulerAngles(r[0], r[1], r[2]), new Matrix()))
      .multiply(Matrix.Translation(p[0], p[1], p[2]));
    mesh.bakeTransformIntoVertices(m);

    if (o.uv) [uScale, vScale] = o.uv;
    else if (o.slot === 'windows') vScale = 1;
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    if (uvs && (uScale !== 1 || vScale !== 1)) {
      for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] = (uvs[i] as number) * uScale;
        uvs[i + 1] = (uvs[i + 1] as number) * vScale;
      }
      mesh.setVerticesData(VertexBuffer.UVKind, uvs);
    }
    if (o.slot === 'paint') {
      const c = Color3.FromHexString(o.color ?? '#ffffff').toLinearSpace();
      const count = mesh.getTotalVertices();
      const colors = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
      mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    }
    const list = this.parts.get(o.slot);
    if (list) list.push(mesh);
    else this.parts.set(o.slot, [mesh]);
    return mesh;
  }

  private id(): string {
    return `${this.name}-p${this.counter++}`;
  }

  box(o: PartOpts & { w: number; h: number; d: number }): void {
    const mesh = CreateBox(this.id(), { width: o.w, height: o.h, depth: o.d }, this.scene);
    const u = Math.max(o.w, o.h, o.d) / 2.6;
    this.add(mesh, o, 'y', u, u);
  }

  cyl(o: PartOpts & { d: number; h: number; dTop?: number; dBottom?: number; tess?: number; axis?: Axis; cap?: boolean }): void {
    const mesh = CreateCylinder(
      this.id(),
      {
        height: o.h,
        diameterTop: o.dTop ?? o.d,
        diameterBottom: o.dBottom ?? o.d,
        tessellation: o.tess ?? 24,
        cap: o.cap === false ? Mesh.NO_CAP : Mesh.CAP_ALL,
      },
      this.scene,
    );
    this.add(mesh, o, o.axis ?? 'y', (Math.PI * o.d) / 3.2, o.h / 3.2);
  }

  sphere(o: PartOpts & { d: number; seg?: number; slice?: number }): void {
    const mesh = CreateSphere(this.id(), { diameter: o.d, segments: o.seg ?? 16, slice: o.slice ?? 1 }, this.scene);
    const u = (Math.PI * o.d) / 3.2;
    this.add(mesh, o, 'y', u, u / 2);
  }

  /**
   * Torus with independent ring and tube resolution (Babylon's builder uses one value for both,
   * which wastes triangles on thin rings).
   */
  torus(o: PartOpts & { d: number; t: number; tess?: number; tube?: number; axis?: Axis }): void {
    const ring = o.tess ?? 32;
    const tube = o.tube ?? (o.t > 2 ? 12 : 8);
    const R = o.d / 2;
    const r = o.t / 2;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= ring; i++) {
      const u = (i / ring) * Math.PI * 2;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      for (let j = 0; j <= tube; j++) {
        const v = (j / tube) * Math.PI * 2;
        const cv = Math.cos(v);
        const sv = Math.sin(v);
        positions.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
        normals.push(cv * cu, sv, cv * su);
        uvs.push(i / ring, j / tube);
      }
    }
    for (let i = 0; i < ring; i++) {
      for (let j = 0; j < tube; j++) {
        const a = i * (tube + 1) + j;
        const b = a + tube + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const mesh = new Mesh(this.id(), this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    this.add(mesh, o, o.axis ?? 'y', (Math.PI * o.d) / 3.2, 1);
  }

  /** Surface of revolution around the (aligned) Y axis; profile points are [radius, height]. */
  lathe(o: PartOpts & { profile: [number, number][]; tess?: number; axis?: Axis; closed?: boolean }): void {
    const shape = o.profile.map(([r, y]) => new Vector3(r, y, 0));
    const mesh = CreateLathe(
      this.id(),
      { shape, tessellation: o.tess ?? 32, closed: o.closed ?? true, sideOrientation: Mesh.DOUBLESIDE },
      this.scene,
    );
    this.add(mesh, o, o.axis ?? 'y', 3, 1);
  }

  tube(o: PartOpts & { path: V3[]; r: number; tess?: number }): void {
    const mesh = CreateTube(
      this.id(),
      { path: o.path.map(([x, y, z]) => new Vector3(x, y, z)), radius: o.r, tessellation: o.tess ?? 8, cap: Mesh.CAP_ALL },
      this.scene,
    );
    this.add(mesh, o, 'y', 1, 1);
  }

  /** Thin box running between two points (struts, rails, truss members). */
  beam(o: PartOpts & { from: V3; to: V3; w: number; h?: number }): void {
    const from = new Vector3(...o.from);
    const to = new Vector3(...o.to);
    const dir = to.subtract(from);
    const len = dir.length();
    const mesh = CreateBox(this.id(), { width: o.w, height: o.h ?? o.w, depth: len }, this.scene);
    const mid = from.add(to).scale(0.5);
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y / len)));
    const m = Matrix.RotationYawPitchRoll(yaw, pitch, 0).multiply(Matrix.Translation(mid.x, mid.y, mid.z));
    mesh.bakeTransformIntoVertices(m);
    this.add(mesh, { slot: o.slot, color: o.color }, 'y', len / 2.6, 1);
  }

  /** Merges parts per slot. Returned meshes are not yet assigned materials. */
  build(): Map<Slot, Mesh> {
    const out = new Map<Slot, Mesh>();
    for (const [slot, meshes] of this.parts) {
      const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true);
      if (!merged) throw new Error(`Failed to merge ${this.name}/${slot}`);
      merged.name = `${this.name}-${slot}`;
      out.set(slot, merged);
    }
    this.parts.clear();
    return out;
  }
}
