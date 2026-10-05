import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DIR_VEC, type Dir } from '../../data/grid';
import { MODULES, MODULE_TYPES, type ModuleType } from '../../data/modules';
import type { Slot } from '../Materials';
import { ModelKit, type Axis, type V3 } from './ModelKit';

export interface ModelParts {
  base: Map<Slot, Mesh>;
  /** Optional animated sub-assembly (solar wings, dishes, turrets) rotating around local Y. */
  rotor?: Map<Slot, Mesh>;
  rotorPivot?: V3;
  /** Height of the model's top, for labels and markers. */
  top: number;
}

const TAU = Math.PI * 2;

const axisOf = (d: Dir): Axis => (DIR_VEC[d].x !== 0 ? 'x' : DIR_VEC[d].y !== 0 ? 'y' : 'z');
const along = (d: Dir, r: number): V3 => [DIR_VEC[d].x * r, DIR_VEC[d].y * r, DIR_VEC[d].z * r];

/** Docking collar at a port: the standard interface ring every module shares. */
function collar(k: ModelKit, d: Dir): void {
  const axis = axisOf(d);
  k.cyl({ slot: 'hullDark', d: 3.0, h: 0.6, axis, pos: along(d, 4.15), tess: 20 });
  k.torus({ slot: 'hull', d: 3.05, t: 0.3, axis, pos: along(d, 4.4), tess: 24 });
}

/** Pressurised neck from the module body to a port collar. */
function neck(k: ModelKit, d: Dir, from: number, diameter = 2.5, slot: Slot = 'hull'): void {
  const to = 3.9;
  if (to <= from) return;
  k.cyl({ slot, d: diameter, h: to - from, axis: axisOf(d), pos: along(d, (from + to) / 2), tess: 20 });
}

/** Small lights placed evenly around a ring in a plane perpendicular to `axis`. */
function lightRing(k: ModelKit, slot: Slot, axis: Axis, offset: number, radius: number, count: number, size = 0.22, phase = 0): void {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    const pos: V3 = axis === 'y' ? [c, offset, s] : axis === 'z' ? [c, s, offset] : [offset, c, s];
    k.sphere({ slot, d: size, seg: 6, pos });
  }
}

function buildCommand(k: ModelKit): number {
  k.sphere({ slot: 'hull', d: 7.4, seg: 32, scale: [1, 0.82, 1] });
  k.cyl({ slot: 'windows', d: 7.46, h: 0.42, tess: 48, pos: [0, 0.45, 0], cap: false });
  k.torus({ slot: 'hullDark', d: 7.5, t: 0.45, pos: [0, -0.2, 0], tess: 48 });
  k.torus({ slot: 'paint', d: 6.6, t: 0.3, pos: [0, 1.7, 0], tess: 40, color: '#2f86b8' });
  // Glass observation dome with a lit command deck inside.
  k.cyl({ slot: 'hullDark', d: 4.5, h: 0.5, pos: [0, 2.55, 0], tess: 32 });
  k.sphere({ slot: 'glass', d: 4.1, seg: 24, slice: 0.5, pos: [0, 2.75, 0] });
  k.cyl({ slot: 'lightWarm', d: 3.4, h: 0.08, pos: [0, 2.85, 0], tess: 24 });
  k.cyl({ slot: 'hullDark', d: 0.9, h: 0.7, pos: [0, 3.2, 0], tess: 12 });
  k.box({ slot: 'accent', w: 1.2, h: 0.3, d: 0.08, pos: [0, 3.5, 0.5] });
  // Antenna mast and beacon.
  k.cyl({ slot: 'hullDark', d: 0.14, h: 3.4, pos: [1.2, 5.3, -0.6], tess: 6 });
  k.sphere({ slot: 'navRed', d: 0.32, seg: 8, pos: [1.2, 7.05, -0.6] });
  k.cyl({ slot: 'hullDark', d: 0.1, h: 2.2, pos: [-1.0, 4.6, 0.9], tess: 6 });
  // Belly: thruster block wrapped in insulation foil.
  k.cyl({ slot: 'hullDark', d: 2.6, dTop: 4.2, h: 1.4, pos: [0, -3.25, 0], tess: 24 });
  k.cyl({ slot: 'gold', d: 2.3, h: 1.2, pos: [0, -4.4, 0], tess: 20 });
  k.cyl({ slot: 'hullDark', d: 1.4, dBottom: 1.9, h: 0.7, pos: [0, -5.25, 0], tess: 16 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    k.box({ slot: 'hullDark', w: 0.7, h: 0.7, d: 0.7, pos: [Math.cos(a) * 3.05, 1.2, Math.sin(a) * 3.05], rot: [0, -a, 0] });
    k.box({ slot: 'gold', w: 1.6, h: 1.1, d: 0.12, pos: [Math.cos(a) * 3.2, -1.4, Math.sin(a) * 3.2], rot: [0.25, Math.PI / 2 - a, 0] });
  }
  lightRing(k, 'accent', 'y', -0.2, 3.95, 12, 0.24);
  for (const d of MODULES.command.ports) {
    neck(k, d, 2.9, 2.7);
    collar(k, d);
  }
  return 7.2;
}

function buildPower(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 4.0, h: 7.6, axis: 'z', tess: 28 });
  k.cyl({ slot: 'hullDark', d: 5.0, h: 2.6, axis: 'z', tess: 28 });
  k.torus({ slot: 'accent', d: 5.1, t: 0.22, axis: 'z', pos: [0, 0, 1.1], tess: 40 });
  k.torus({ slot: 'accent', d: 5.1, t: 0.22, axis: 'z', pos: [0, 0, -1.1], tess: 40 });
  k.cyl({ slot: 'hazard', d: 4.08, h: 0.5, axis: 'z', pos: [0, 0, 2.6], tess: 28 });
  k.cyl({ slot: 'hazard', d: 4.08, h: 0.5, axis: 'z', pos: [0, 0, -2.6], tess: 28 });
  // Coolant vents glowing around the core.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    k.box({ slot: 'accent', w: 0.3, h: 0.12, d: 1.8, pos: [Math.cos(a) * 2.52, Math.sin(a) * 2.52, 0], rot: [0, 0, a] });
  }
  // Radiator wings.
  for (const side of [-1, 1]) {
    k.beam({ slot: 'hullDark', from: [side * 2.0, 0, -2.2], to: [side * 3.0, 0, -2.2], w: 0.35 });
    k.beam({ slot: 'hullDark', from: [side * 2.0, 0, 2.2], to: [side * 3.0, 0, 2.2], w: 0.35 });
    k.box({ slot: 'paint', w: 2.7, h: 0.1, d: 6.2, pos: [side * 4.3, 0, 0], color: '#e9edf2' });
    for (let j = -2; j <= 2; j++) k.box({ slot: 'hullDark', w: 2.7, h: 0.16, d: 0.12, pos: [side * 4.3, 0, j * 1.4] });
    k.box({ slot: 'hullDark', w: 0.14, h: 0.18, d: 6.3, pos: [side * 5.65, 0, 0] });
  }
  k.cyl({ slot: 'gold', d: 4.1, h: 1.4, axis: 'z', pos: [0, 0, 3.3], tess: 28 });
  k.cyl({ slot: 'gold', d: 4.1, h: 1.4, axis: 'z', pos: [0, 0, -3.3], tess: 28 });
  k.sphere({ slot: 'navGreen', d: 0.3, seg: 8, pos: [5.65, 0.2, 3.1] });
  k.sphere({ slot: 'navRed', d: 0.3, seg: 8, pos: [-5.65, 0.2, 3.1] });
  for (const d of MODULES.power.ports) collar(k, d);
  return 2.6;
}

function buildSolarBase(k: ModelKit): number {
  // Truss arm from the port to the rotating joint.
  const corners: [number, number][] = [
    [0.45, 0.45],
    [-0.45, 0.45],
    [0.45, -0.45],
    [-0.45, -0.45],
  ];
  for (const [x, y] of corners) k.beam({ slot: 'hullDark', from: [x, y, -3.9], to: [x, y, 0.4], w: 0.14 });
  for (let z = -3.4; z <= 0.4; z += 0.95) {
    k.beam({ slot: 'hull', from: [0.45, 0.45, z], to: [-0.45, -0.45, z + 0.95], w: 0.07 });
    k.beam({ slot: 'hull', from: [-0.45, 0.45, z], to: [0.45, -0.45, z + 0.95], w: 0.07 });
  }
  k.cyl({ slot: 'hull', d: 1.8, h: 1.1, axis: 'z', pos: [0, 0, 0.6], tess: 20 });
  k.cyl({ slot: 'gold', d: 1.5, h: 1.4, axis: 'z', pos: [0, 0, -3.2], tess: 16 });
  k.torus({ slot: 'accent', d: 1.85, t: 0.12, axis: 'z', pos: [0, 0, 1.15], tess: 24 });
  collar(k, 'nz');
  return 10.5;
}

function buildSolarWings(k: ModelKit): void {
  k.cyl({ slot: 'hull', d: 1.2, h: 2.4, pos: [0, 0, 0], tess: 16 });
  k.cyl({ slot: 'hullDark', d: 0.4, h: 21.4, pos: [0, 0, 0], tess: 8 });
  for (const side of [-1, 1]) {
    for (const half of [-1, 1]) {
      const cx = half * 1.95;
      const cy = side * 6.2;
      k.box({ slot: 'solar', w: 3.5, h: 8.6, d: 0.1, pos: [cx, cy, 0] });
      k.box({ slot: 'hullDark', w: 3.6, h: 0.14, d: 0.16, pos: [cx, side * 1.85, 0] });
      k.box({ slot: 'hullDark', w: 3.6, h: 0.14, d: 0.16, pos: [cx, side * 10.55, 0] });
      k.box({ slot: 'hullDark', w: 0.12, h: 8.8, d: 0.16, pos: [half * 3.72, cy, 0] });
    }
  }
  k.sphere({ slot: 'navRed', d: 0.3, seg: 8, pos: [0, 10.8, 0] });
  k.sphere({ slot: 'navRed', d: 0.3, seg: 8, pos: [0, -10.8, 0] });
}

function buildLifeSupport(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 4.8, h: 7.4, axis: 'z', tess: 8, rot: [0, 0, Math.PI / 8] });
  k.cyl({ slot: 'paint', d: 4.95, h: 0.6, axis: 'z', pos: [0, 0, 2.4], tess: 8, rot: [0, 0, Math.PI / 8], color: '#3dbf6a' });
  k.cyl({ slot: 'paint', d: 4.95, h: 0.6, axis: 'z', pos: [0, 0, -2.4], tess: 8, rot: [0, 0, Math.PI / 8], color: '#3dbf6a' });
  // Algae bioreactor tanks on the roof and belly.
  for (const y of [1, -1]) {
    for (const x of [-1.1, 1.1]) {
      for (const z of [-1.2, 1.2]) {
        k.cyl({ slot: 'hullDark', d: 1.3, h: 0.25, pos: [x, y * 2.45, z], tess: 16 });
        k.cyl({ slot: 'glass', d: 1.15, h: 1.9, pos: [x, y * 3.55, z], tess: 16 });
        k.cyl({ slot: 'accent', d: 0.8, h: 1.7, pos: [x, y * 3.55, z], tess: 12 });
        k.cyl({ slot: 'hullDark', d: 1.25, h: 0.2, pos: [x, y * 4.55, z], tess: 16 });
      }
    }
    k.tube({ slot: 'hullDark', path: [[-1.1, y * 4.6, -1.2], [-1.1, y * 4.9, 0], [1.1, y * 4.9, 0], [1.1, y * 4.6, 1.2]], r: 0.12 });
  }
  for (const d of MODULES.lifeSupport.ports) {
    neck(k, d, 2.2, 2.5);
    collar(k, d);
  }
  lightRing(k, 'lightWhite', 'z', 3.75, 1.9, 6, 0.18);
  return 5;
}

function buildWater(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 3.4, h: 7.6, axis: 'z', tess: 24 });
  for (const side of [-1, 1]) {
    k.sphere({ slot: 'paint', d: 3.4, seg: 24, pos: [side * 2.55, 0.1, 0], color: '#d9e6f2' });
    k.torus({ slot: 'hullDark', d: 3.45, t: 0.18, pos: [side * 2.55, 0.1, 0], tess: 32 });
    k.torus({ slot: 'accent', d: 3.47, t: 0.08, pos: [side * 2.55, 0.65, 0], tess: 32 });
    k.beam({ slot: 'hullDark', from: [side * 1.4, 0, -1.2], to: [side * 2.3, 0, -1.2], w: 0.3 });
    k.beam({ slot: 'hullDark', from: [side * 1.4, 0, 1.2], to: [side * 2.3, 0, 1.2], w: 0.3 });
  }
  k.sphere({ slot: 'paint', d: 2.6, seg: 20, pos: [0, 2.3, -1.6], color: '#cfdcea' });
  k.sphere({ slot: 'paint', d: 2.6, seg: 20, pos: [0, 2.3, 1.6], color: '#cfdcea' });
  k.tube({ slot: 'hullDark', path: [[0, 2.3, -0.4], [0, 2.6, 0], [0, 2.3, 0.4]], r: 0.25 });
  k.cyl({ slot: 'gold', d: 3.5, h: 1.2, axis: 'z', pos: [0, 0, 3.2], tess: 24 });
  k.cyl({ slot: 'gold', d: 3.5, h: 1.2, axis: 'z', pos: [0, 0, -3.2], tess: 24 });
  lightRing(k, 'accent', 'z', 0, 1.75, 8, 0.2, Math.PI / 8);
  for (const d of MODULES.water.ports) collar(k, d);
  return 3.6;
}

const CONTAINER_COLORS = ['#c8642d', '#2f6db3', '#8a949f', '#b33b33', '#3a8a5a', '#d1a23a'];

function containers(k: ModelKit, seed: number, positions: V3[], size: V3): void {
  positions.forEach((p, i) => {
    const color = CONTAINER_COLORS[(i * 7 + seed) % CONTAINER_COLORS.length] as string;
    k.box({ slot: 'paint', w: size[0], h: size[1], d: size[2], pos: p, color });
    k.box({ slot: 'hullDark', w: size[0] + 0.06, h: 0.12, d: size[2] + 0.06, pos: [p[0], p[1] + size[1] / 2, p[2]] });
  });
}

function frameEdges(k: ModelKit, half: number, w: number, slot: Slot = 'hullDark'): void {
  const h = half;
  const pts: [V3, V3][] = [];
  for (const a of [-h, h])
    for (const b of [-h, h]) {
      pts.push([[-h, a, b], [h, a, b]]);
      pts.push([[a, -h, b], [a, h, b]]);
      pts.push([[a, b, -h], [a, b, h]]);
    }
  for (const [from, to] of pts) k.beam({ slot, from, to, w });
}

function buildStorage(k: ModelKit): number {
  frameEdges(k, 2.9, 0.32);
  const pos: V3[] = [];
  for (const x of [-1.4, 1.4]) for (const y of [-1.4, 1.4]) for (const z of [-1.4, 1.4]) pos.push([x, y, z]);
  containers(k, 1, pos, [2.5, 2.5, 2.5]);
  k.cyl({ slot: 'hull', d: 1.6, h: 5.6, pos: [0, 0, 0], tess: 12 });
  for (const d of MODULES.storage.ports) {
    neck(k, d, 2.9, 2.3);
    collar(k, d);
  }
  for (const x of [-2.9, 2.9]) for (const y of [-2.9, 2.9]) k.sphere({ slot: 'lightWhite', d: 0.28, seg: 6, pos: [x, y, 2.9] });
  return 3.4;
}

function buildQuarters(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 5.4, h: 7.4, axis: 'z', tess: 32 });
  for (const z of [-2.6, -0.9, 0.9, 2.6]) k.cyl({ slot: 'windows', d: 5.46, h: 0.55, axis: 'z', pos: [0, 0, z], tess: 40, cap: false });
  k.cyl({ slot: 'paint', d: 5.5, h: 0.25, axis: 'z', pos: [0, 0, 1.75], tess: 32, color: '#d9a441' });
  k.cyl({ slot: 'paint', d: 5.5, h: 0.25, axis: 'z', pos: [0, 0, -1.75], tess: 32, color: '#d9a441' });
  k.cyl({ slot: 'gold', d: 5.3, h: 0.6, axis: 'z', pos: [0, 0, 3.45], tess: 32 });
  k.cyl({ slot: 'gold', d: 5.3, h: 0.6, axis: 'z', pos: [0, 0, -3.45], tess: 32 });
  for (const d of MODULES.quarters.ports) {
    neck(k, d, 2.5, 2.4);
    collar(k, d);
  }
  lightRing(k, 'lightWarm', 'z', 3.8, 2.2, 8, 0.2);
  return 3.4;
}

function buildLab(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 4.4, h: 7.6, axis: 'z', tess: 28 });
  k.cyl({ slot: 'glass', d: 4.7, h: 2.2, axis: 'z', tess: 28 });
  k.cyl({ slot: 'accent', d: 3.6, h: 2.0, axis: 'z', tess: 20 });
  k.torus({ slot: 'hullDark', d: 4.75, t: 0.3, axis: 'z', pos: [0, 0, 1.15], tess: 32 });
  k.torus({ slot: 'hullDark', d: 4.75, t: 0.3, axis: 'z', pos: [0, 0, -1.15], tess: 32 });
  k.cyl({ slot: 'paint', d: 4.5, h: 0.4, axis: 'z', pos: [0, 0, 2.6], tess: 28, color: '#7a4fd1' });
  k.cyl({ slot: 'paint', d: 4.5, h: 0.4, axis: 'z', pos: [0, 0, -2.6], tess: 28, color: '#7a4fd1' });
  // Sensor dish and instrument pods.
  k.cyl({ slot: 'hullDark', d: 0.35, h: 1.6, pos: [0, 2.9, -2.4], tess: 8 });
  k.lathe({ slot: 'hull', profile: [[0.1, 0], [0.8, 0.12], [1.5, 0.45], [1.7, 0.62]], pos: [0, 3.7, -2.4], rot: [0.6, 0, 0], tess: 24 });
  k.cyl({ slot: 'hullDark', d: 0.12, h: 1.1, pos: [0, 4.3, -2.0], rot: [0.6, 0, 0], tess: 6 });
  k.box({ slot: 'gold', w: 1.4, h: 0.9, d: 1.6, pos: [1.6, 2.0, 2.4] });
  k.box({ slot: 'hullDark', w: 1.0, h: 0.7, d: 1.2, pos: [-1.7, 1.9, 2.2] });
  k.sphere({ slot: 'navGreen', d: 0.28, seg: 8, pos: [2.25, 0, 3.6] });
  for (const d of MODULES.lab.ports) collar(k, d);
  return 4.7;
}

function buildFactory(k: ModelKit): number {
  k.box({ slot: 'hull', w: 6.4, h: 4.2, d: 6.4 });
  k.box({ slot: 'hullDark', w: 6.6, h: 0.4, d: 6.6, pos: [0, 2.2, 0] });
  k.box({ slot: 'hullDark', w: 6.6, h: 0.4, d: 6.6, pos: [0, -2.2, 0] });
  k.box({ slot: 'hazard', w: 6.5, h: 0.45, d: 6.5, pos: [0, 1.35, 0] });
  // Furnace stacks with glowing throats.
  for (const x of [-1.6, 1.6]) {
    k.cyl({ slot: 'hullDark', d: 1.3, dTop: 1.0, h: 2.6, pos: [x, 3.6, -1.6], tess: 16 });
    k.cyl({ slot: 'accent', d: 0.85, h: 0.12, pos: [x, 4.92, -1.6], tess: 16 });
  }
  // Heat-exchanger fins.
  for (let i = 0; i < 6; i++) k.box({ slot: 'paint', w: 0.12, h: 1.4, d: 2.6, pos: [-1.5 + i * 0.6, 3.05, 1.7], color: '#c4ccd6' });
  // Robotic manipulator.
  k.cyl({ slot: 'hullDark', d: 0.8, h: 0.6, pos: [2.4, 2.7, 2.4], tess: 12 });
  k.beam({ slot: 'paint', from: [2.4, 2.9, 2.4], to: [2.0, 4.6, 1.4], w: 0.32, color: '#e8a830' });
  k.beam({ slot: 'paint', from: [2.0, 4.6, 1.4], to: [0.8, 4.2, 0.6], w: 0.26, color: '#e8a830' });
  k.box({ slot: 'hullDark', w: 0.5, h: 0.3, d: 0.5, pos: [0.8, 4.05, 0.6] });
  for (const x of [-3.2, 3.2]) for (const z of [-3.2, 3.2]) k.sphere({ slot: 'accent', d: 0.3, seg: 6, pos: [x, 2.45, z] });
  for (const d of MODULES.factory.ports) {
    neck(k, d, 3.2, 2.4);
    collar(k, d);
  }
  return 5;
}

function buildDocking(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 3.8, h: 5.4, axis: 'z', pos: [0, 0, -1.3], tess: 28 });
  k.cyl({ slot: 'hullDark', d: 4.6, h: 1.2, axis: 'z', pos: [0, 0, 1.8], tess: 32 });
  k.torus({ slot: 'hazard', d: 5.0, t: 0.55, axis: 'z', pos: [0, 0, 2.4], tess: 40 });
  k.torus({ slot: 'accent', d: 4.15, t: 0.14, axis: 'z', pos: [0, 0, 2.55], tess: 40 });
  // Approach guide arms with green tip lights.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 2.5;
    const y = Math.sin(a) * 2.5;
    k.beam({ slot: 'hullDark', from: [x, y, 2.3], to: [x * 1.25, y * 1.25, 4.6], w: 0.22 });
    k.sphere({ slot: 'navGreen', d: 0.34, seg: 8, pos: [x * 1.25, y * 1.25, 4.7] });
    k.box({ slot: 'lightWhite', w: 0.45, h: 0.3, d: 0.3, pos: [x * 0.9, y * 0.9, 2.9] });
  }
  k.cyl({ slot: 'gold', d: 3.9, h: 1.6, axis: 'z', pos: [0, 0, -2.6], tess: 28 });
  k.box({ slot: 'hullDark', w: 1.2, h: 0.8, d: 2.0, pos: [0, 2.2, -1.0] });
  k.box({ slot: 'windows', w: 1.22, h: 0.3, d: 1.6, pos: [0, 2.3, -1.0] });
  lightRing(k, 'accent', 'z', 1.2, 2.0, 8, 0.2);
  collar(k, 'nz');
  return 3.2;
}

function buildCargo(k: ModelKit): number {
  frameEdges(k, 3.0, 0.28);
  const pos: V3[] = [];
  for (const x of [-1.5, 1.5]) for (const z of [-1.0, 1.0]) pos.push([x, -1.6, z * 1.5]);
  for (const x of [-1.5, 1.5]) pos.push([x, 0.2, 0]);
  containers(k, 3, pos, [2.6, 1.5, 2.6]);
  // Gantry crane on the roof.
  k.beam({ slot: 'paint', from: [-3, 3.3, 0], to: [3, 3.3, 0], w: 0.4, color: '#3a7bd5' });
  k.beam({ slot: 'paint', from: [-3, 3.0, 0], to: [-3, 3.3, 0], w: 0.4, color: '#3a7bd5' });
  k.box({ slot: 'hullDark', w: 0.9, h: 0.7, d: 0.9, pos: [0.8, 2.9, 0] });
  k.cyl({ slot: 'hullDark', d: 0.06, h: 1.4, pos: [0.8, 2.0, 0], tess: 4 });
  k.cyl({ slot: 'hull', d: 1.6, h: 6.0, axis: 'z', pos: [0, 1.8, 0], tess: 12 });
  for (const d of MODULES.cargo.ports) {
    neck(k, d, 3.0, 2.2);
    collar(k, d);
  }
  for (const x of [-3, 3]) for (const z of [-3, 3]) k.sphere({ slot: 'accent', d: 0.3, seg: 6, pos: [x, 3.0, z] });
  return 3.8;
}

function buildMedical(k: ModelKit): number {
  k.lathe({
    slot: 'paint',
    color: '#eef3f6',
    profile: [[0.0, -3.7], [1.6, -3.7], [2.3, -3.1], [2.45, -2.2], [2.45, 2.2], [2.3, 3.1], [1.6, 3.7], [0.0, 3.7]],
    axis: 'z',
    tess: 32,
  });
  k.cyl({ slot: 'glass', d: 5.0, h: 1.4, axis: 'z', tess: 32 });
  k.cyl({ slot: 'accent', d: 4.6, h: 1.2, axis: 'z', tess: 24 });
  // Medical cross emblems.
  for (const side of [-1, 1]) {
    k.box({ slot: 'accent', w: 0.1, h: 1.4, d: 0.45, pos: [side * 2.48, 0, 2.0] });
    k.box({ slot: 'accent', w: 0.1, h: 0.45, d: 1.4, pos: [side * 2.48, 0, 2.0] });
    k.box({ slot: 'accent', w: 0.1, h: 1.4, d: 0.45, pos: [side * 2.48, 0, -2.0] });
    k.box({ slot: 'accent', w: 0.1, h: 0.45, d: 1.4, pos: [side * 2.48, 0, -2.0] });
  }
  k.torus({ slot: 'hullDark', d: 4.95, t: 0.22, axis: 'z', pos: [0, 0, 0.75], tess: 32 });
  k.torus({ slot: 'hullDark', d: 4.95, t: 0.22, axis: 'z', pos: [0, 0, -0.75], tess: 32 });
  k.box({ slot: 'hullDark', w: 1.6, h: 0.5, d: 2.4, pos: [0, 2.45, 0] });
  for (const d of MODULES.medical.ports) collar(k, d);
  return 3;
}

function buildRestaurant(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 7.0, h: 2.0, pos: [0, -0.8, 0], tess: 40 });
  k.cyl({ slot: 'windows', d: 7.06, h: 0.5, pos: [0, -0.7, 0], tess: 48, cap: false });
  k.torus({ slot: 'hullDark', d: 7.0, t: 0.4, pos: [0, 0.2, 0], tess: 48 });
  k.lathe({ slot: 'hullDark', profile: [[3.5, -1.8], [2.6, -2.6], [1.0, -2.9], [0, -2.95]], tess: 40 });
  // Garden dome.
  k.sphere({ slot: 'glass', d: 6.4, seg: 32, slice: 0.5, pos: [0, 0.2, 0] });
  k.cyl({ slot: 'lightWarm', d: 6.0, h: 0.1, pos: [0, 0.25, 0], tess: 40 });
  const trees: V3[] = [[1.4, 0.9, 0.6], [-1.2, 0.8, 1.2], [0.2, 1.0, -1.5], [-1.6, 0.8, -0.6], [1.5, 0.7, -1.2]];
  for (const [x, y, z] of trees) {
    k.cyl({ slot: 'hullDark', d: 0.12, h: 0.9, pos: [x, 0.7, z], tess: 5 });
    k.sphere({ slot: 'foliage', d: 1.0 + y * 0.3, seg: 8, pos: [x, 1.25 + y * 0.2, z] });
  }
  k.cyl({ slot: 'hullDark', d: 1.0, h: 0.6, pos: [0, 0.55, 0.1], tess: 16 });
  lightRing(k, 'accent', 'y', 0.2, 3.55, 16, 0.18);
  for (const d of MODULES.restaurant.ports) {
    neck(k, d, 3.3, 2.2);
    collar(k, d);
  }
  return 3.6;
}

function buildDefenseBase(k: ModelKit): number {
  k.cyl({ slot: 'hullDark', d: 3.6, h: 4.6, axis: 'z', pos: [0, 0, -1.7], tess: 8, rot: [0, 0, Math.PI / 8] });
  k.cyl({ slot: 'hull', d: 4.6, h: 1.4, pos: [0, 0.0, 0.8], tess: 8 });
  k.box({ slot: 'hazard', w: 4.0, h: 0.3, d: 0.4, pos: [0, -0.5, 3.0] });
  for (const side of [-1, 1]) k.box({ slot: 'hullDark', w: 0.5, h: 2.4, d: 3.6, pos: [side * 2.1, -0.4, -1.6] });
  k.sphere({ slot: 'navRed', d: 0.32, seg: 8, pos: [2.4, 0.6, -3.2] });
  k.sphere({ slot: 'navRed', d: 0.32, seg: 8, pos: [-2.4, 0.6, -3.2] });
  collar(k, 'nz');
  return 3.5;
}

function buildDefenseTurret(k: ModelKit): void {
  k.cyl({ slot: 'hullDark', d: 3.2, h: 0.6, pos: [0, 0, 0], tess: 24 });
  k.sphere({ slot: 'hull', d: 2.8, seg: 20, slice: 0.5, pos: [0, 0.3, 0], scale: [1, 0.8, 1.1] });
  for (const x of [-0.5, 0.5]) {
    k.cyl({ slot: 'hullDark', d: 0.36, h: 3.6, axis: 'z', pos: [x, 1.0, 2.2], tess: 10 });
    k.cyl({ slot: 'accent', d: 0.26, h: 0.1, axis: 'z', pos: [x, 1.0, 4.02], tess: 10 });
  }
  k.box({ slot: 'accent', w: 1.2, h: 0.18, d: 0.1, pos: [0, 1.3, 1.25] });
}

function buildCommsBase(k: ModelKit): number {
  k.cyl({ slot: 'hull', d: 3.2, h: 4.4, axis: 'z', pos: [0, 0, -1.8], tess: 24 });
  k.cyl({ slot: 'hullDark', d: 2.4, h: 1.2, pos: [0, 1.6, -0.6], tess: 16 });
  // Lattice mast.
  for (const [x, z] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]] as const) {
    k.beam({ slot: 'hullDark', from: [x, 1.8, -0.6 + z], to: [x * 0.5, 10.0, -0.6 + z * 0.5], w: 0.12 });
  }
  for (let y = 2.4; y < 9.5; y += 1.2) {
    const s = 1 - ((y - 1.8) / 8.2) * 0.5;
    k.box({ slot: 'hull', w: 0.8 * s, h: 0.06, d: 0.8 * s, pos: [0, y, -0.6] });
  }
  k.sphere({ slot: 'navRed', d: 0.36, seg: 8, pos: [0, 10.2, -0.6] });
  k.lathe({ slot: 'hull', profile: [[0.05, 0], [0.6, 0.08], [1.1, 0.3], [1.3, 0.42]], pos: [1.6, 0.4, -2.6], rot: [0, 0, -1.1], tess: 20 });
  lightRing(k, 'accent', 'z', 0.4, 1.4, 6, 0.18);
  collar(k, 'nz');
  return 10.5;
}

function buildCommsDish(k: ModelKit): void {
  k.cyl({ slot: 'hullDark', d: 0.5, h: 1.0, pos: [0, 0, 0], tess: 10 });
  k.lathe({
    slot: 'paint',
    color: '#f2f5f8',
    profile: [[0.1, 0], [1.2, 0.15], [2.2, 0.55], [2.75, 0.9]],
    pos: [0, 0.6, 0.6],
    rot: [1.1, 0, 0],
    tess: 32,
  });
  k.cyl({ slot: 'hullDark', d: 0.1, h: 2.2, pos: [0, 1.3, 1.6], rot: [1.1, 0, 0], tess: 6 });
  k.sphere({ slot: 'accent', d: 0.32, seg: 8, pos: [0, 1.75, 2.55] });
}

export interface ModelLibraryParts {
  modules: Record<ModuleType, ModelParts>;
  connector: Map<Slot, Mesh>;
  hatch: Map<Slot, Mesh>;
  scaffold: Map<Slot, Mesh>;
}

function buildConnector(k: ModelKit): void {
  // Built along +Z from 0 to 3 (one corridor between two port faces).
  k.cyl({ slot: 'glass', d: 2.1, h: 3.0, axis: 'z', pos: [0, 0, 1.5], tess: 20, cap: false });
  for (const a of [0.9, -0.9]) k.beam({ slot: 'hull', from: [Math.sin(a) * 1.02, Math.cos(a) * 1.02, 0.1], to: [Math.sin(a) * 1.02, Math.cos(a) * 1.02, 2.9], w: 0.12 });
  for (const z of [0.15, 1.5, 2.85]) k.torus({ slot: 'hullDark', d: 2.25, t: 0.26, axis: 'z', pos: [0, 0, z], tess: 24 });
  k.box({ slot: 'hull', w: 1.2, h: 0.1, d: 3.0, pos: [0, -0.82, 1.5] });
  k.box({ slot: 'lightWhite', w: 0.08, h: 0.05, d: 2.8, pos: [0.45, -0.75, 1.5] });
  k.box({ slot: 'lightWhite', w: 0.08, h: 0.05, d: 2.8, pos: [-0.45, -0.75, 1.5] });
}

function buildHatch(k: ModelKit): void {
  // Sealed hatch over an unused port, facing +Z, centred at the port face.
  k.cyl({ slot: 'hullDark', d: 2.6, h: 0.18, axis: 'z', pos: [0, 0, 0], tess: 20 });
  k.box({ slot: 'hull', w: 2.2, h: 0.24, d: 0.12, pos: [0, 0, 0.1] });
  k.box({ slot: 'hull', w: 0.24, h: 2.2, d: 0.12, pos: [0, 0, 0.1] });
  k.cyl({ slot: 'accent', d: 0.5, h: 0.12, axis: 'z', pos: [0, 0, 0.16], tess: 12 });
}

function buildScaffold(k: ModelKit): void {
  frameEdges(k, 4.2, 0.16, 'hazard');
  for (const s of [-1, 1]) {
    k.beam({ slot: 'hullDark', from: [-4.2, -4.2, s * 4.2], to: [4.2, 4.2, s * 4.2], w: 0.1 });
    k.beam({ slot: 'hullDark', from: [s * 4.2, -4.2, -4.2], to: [s * 4.2, 4.2, 4.2], w: 0.1 });
  }
  for (const x of [-4.2, 4.2]) for (const y of [-4.2, 4.2]) for (const z of [-4.2, 4.2]) k.sphere({ slot: 'lightWarm', d: 0.4, seg: 6, pos: [x, y, z] });
}

/** Builds every procedural model template used by the station view. */
export function buildModuleModels(scene: Scene): ModelLibraryParts {
  const modules = {} as Record<ModuleType, ModelParts>;
  for (const type of MODULE_TYPES) {
    const k = new ModelKit(scene, `module-${type}`);
    let top = 4;
    let rotor: Map<Slot, Mesh> | undefined;
    let rotorPivot: V3 | undefined;
    switch (type) {
      case 'command':
        top = buildCommand(k);
        break;
      case 'power':
        top = buildPower(k);
        break;
      case 'solar': {
        top = buildSolarBase(k);
        const r = new ModelKit(scene, 'module-solar-rotor');
        buildSolarWings(r);
        rotor = r.build();
        rotorPivot = [0, 0, 1.6];
        break;
      }
      case 'lifeSupport':
        top = buildLifeSupport(k);
        break;
      case 'water':
        top = buildWater(k);
        break;
      case 'storage':
        top = buildStorage(k);
        break;
      case 'quarters':
        top = buildQuarters(k);
        break;
      case 'lab':
        top = buildLab(k);
        break;
      case 'factory':
        top = buildFactory(k);
        break;
      case 'docking':
        top = buildDocking(k);
        break;
      case 'cargo':
        top = buildCargo(k);
        break;
      case 'medical':
        top = buildMedical(k);
        break;
      case 'restaurant':
        top = buildRestaurant(k);
        break;
      case 'defense': {
        top = buildDefenseBase(k);
        const r = new ModelKit(scene, 'module-defense-rotor');
        buildDefenseTurret(r);
        rotor = r.build();
        rotorPivot = [0, 0.7, 0.8];
        break;
      }
      case 'comms': {
        top = buildCommsBase(k);
        const r = new ModelKit(scene, 'module-comms-rotor');
        buildCommsDish(r);
        rotor = r.build();
        rotorPivot = [0, 7.4, -0.6];
        break;
      }
    }
    modules[type] = { base: k.build(), rotor, rotorPivot, top };
  }
  const connector = new ModelKit(scene, 'connector');
  buildConnector(connector);
  const hatch = new ModelKit(scene, 'hatch');
  buildHatch(hatch);
  const scaffold = new ModelKit(scene, 'scaffold');
  buildScaffold(scaffold);
  return { modules, connector: connector.build(), hatch: hatch.build(), scaffold: scaffold.build() };
}

