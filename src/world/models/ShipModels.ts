import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { SHIP_TYPES, type ShipTypeId } from '../../data/ships';
import type { Slot } from '../Materials';
import { ModelKit, type V3 } from './ModelKit';

export interface ShipParts {
  parts: Map<Slot, Mesh>;
  /** Overall length along Z; the nose docking port sits at +length/2. */
  length: number;
  /** Engine nozzle exit positions (for exhaust trails). */
  engines: V3[];
  /** Emissive engine colour. */
  engineColor: string;
}

/** Docking collar on the nose so every ship mates with the station's berth ring. */
function noseCollar(k: ModelKit, z: number, d = 1.8): void {
  k.cyl({ slot: 'hullDark', d, h: 0.5, axis: 'z', pos: [0, 0, z - 0.25], tess: 16 });
  k.torus({ slot: 'hull', d: d + 0.1, t: 0.18, axis: 'z', pos: [0, 0, z], tess: 20 });
}

function nozzle(k: ModelKit, pos: V3, d: number): V3 {
  k.cyl({ slot: 'hullDark', d: d * 0.7, dBottom: d, dTop: d * 0.65, h: d * 0.9, axis: 'z', pos: [pos[0], pos[1], pos[2] + d * 0.45], rot: [Math.PI, 0, 0], tess: 14 });
  k.cyl({ slot: 'accent', d: d * 0.62, h: 0.08, axis: 'z', pos: [pos[0], pos[1], pos[2] - 0.02], tess: 14 });
  return [pos[0], pos[1], pos[2] - 0.3];
}

function navLights(k: ModelKit, halfWidth: number, z: number, y = 0): void {
  k.sphere({ slot: 'navRed', d: 0.22, seg: 6, pos: [-halfWidth, y, z] });
  k.sphere({ slot: 'navGreen', d: 0.22, seg: 6, pos: [halfWidth, y, z] });
}

function buildCargo(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 11;
  k.box({ slot: 'hullDark', w: 1.1, h: 1.1, d: 8.6, pos: [0, 0, -0.4] });
  const colors = ['#c8642d', '#2f6db3', '#8a949f', '#3a8a5a', '#d1a23a', '#b33b33'];
  let i = 0;
  for (const z of [-2.9, -0.4, 2.1])
    for (const [x, y] of [[-1.25, 0.6], [1.25, 0.6], [-1.25, -0.65], [1.25, -0.65]] as const) {
      k.box({ slot: 'paint', w: 1.3, h: 1.15, d: 2.3, pos: [x, y, z], color: colors[i++ % colors.length] });
    }
  k.cyl({ slot: 'hull', d: 2.2, h: 2.0, axis: 'z', pos: [0, 0, 4.0], tess: 16 });
  k.cyl({ slot: 'windows', d: 2.24, h: 0.35, axis: 'z', pos: [0, 0.1, 4.3], tess: 20, cap: false });
  k.box({ slot: 'hull', w: 3.0, h: 2.0, d: 1.6, pos: [0, 0, -4.7] });
  noseCollar(k, L / 2, 1.5);
  navLights(k, 1.95, -0.4);
  const engines = [nozzle(k, [-0.8, 0, -5.5], 1.0), nozzle(k, [0.8, 0, -5.5], 1.0)];
  return { length: L, engines, engineColor: '#ffad5c' };
}

function buildMining(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 10;
  k.box({ slot: 'paint', w: 3.2, h: 2.2, d: 6.2, pos: [0, 0, 0], color: '#d9a422' });
  k.box({ slot: 'hazard', w: 3.25, h: 0.5, d: 6.25, pos: [0, 0.5, 0] });
  k.box({ slot: 'hullDark', w: 2.6, h: 1.6, d: 2.0, pos: [0, 0.2, 3.8] });
  k.box({ slot: 'windows', w: 2.0, h: 0.35, d: 0.1, pos: [0, 0.65, 4.82] });
  for (const x of [-1.8, 1.8]) {
    k.beam({ slot: 'hullDark', from: [x, -0.3, 2.0], to: [x * 0.9, -0.6, 4.6], w: 0.35 });
    k.cyl({ slot: 'hull', d: 0.75, dTop: 0.05, h: 1.4, axis: 'z', pos: [x * 0.9, -0.6, 5.2], tess: 10 });
  }
  k.box({ slot: 'hullDark', w: 2.6, h: 1.4, d: 2.2, pos: [0, -1.6, -0.6] });
  k.box({ slot: 'gold', w: 1.6, h: 0.9, d: 2.0, pos: [0, 1.5, -1.0] });
  noseCollar(k, L / 2, 1.3);
  navLights(k, 1.7, 0, 0.5);
  const engines = [nozzle(k, [-1.0, 0, -3.3], 1.1), nozzle(k, [1.0, 0, -3.3], 1.1)];
  return { length: L, engines, engineColor: '#ffb04d' };
}

function buildPassenger(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 7.4;
  k.lathe({
    slot: 'paint',
    color: '#eef2f6',
    profile: [[0.0, -3.2], [0.9, -3.2], [1.25, -2.4], [1.3, 1.4], [1.0, 2.6], [0.55, 3.3], [0.0, 3.5]],
    axis: 'z',
    tess: 24,
  });
  k.cyl({ slot: 'windows', d: 2.62, h: 2.6, axis: 'z', pos: [0, 0.1, 0.2], tess: 24, cap: false });
  k.box({ slot: 'paint', w: 5.0, h: 0.14, d: 1.6, pos: [0, -0.4, -1.4], color: '#3aa0c8' });
  for (const x of [-2.2, 2.2]) k.cyl({ slot: 'hull', d: 0.7, h: 1.6, axis: 'z', pos: [x, -0.4, -2.0], tess: 12 });
  k.sphere({ slot: 'glass', d: 1.4, seg: 12, pos: [0, 0.75, 2.0], scale: [1, 0.6, 1.4] });
  noseCollar(k, L / 2, 1.0);
  navLights(k, 2.6, -1.4, -0.4);
  const engines = [nozzle(k, [-2.2, -0.4, -2.9], 0.6), nozzle(k, [2.2, -0.4, -2.9], 0.6), nozzle(k, [0, 0, -3.3], 0.9)];
  return { length: L, engines, engineColor: '#7fd4ff' };
}

function buildFuelTanker(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 12.5;
  k.box({ slot: 'hullDark', w: 0.9, h: 0.9, d: 10.5, pos: [0, 0, -0.2] });
  for (const z of [-3.2, -0.2, 2.8]) {
    k.sphere({ slot: 'paint', d: 2.9, seg: 18, pos: [0, 0, z], color: '#e8823a' });
    k.torus({ slot: 'hull', d: 2.95, t: 0.15, pos: [0, 0, z], tess: 28 });
  }
  k.cyl({ slot: 'hull', d: 1.8, h: 1.8, axis: 'z', pos: [0, 0, 5.0], tess: 16 });
  k.cyl({ slot: 'windows', d: 1.84, h: 0.3, axis: 'z', pos: [0, 0.1, 5.3], tess: 16, cap: false });
  k.box({ slot: 'hull', w: 2.6, h: 1.6, d: 1.4, pos: [0, 0, -5.4] });
  noseCollar(k, L / 2, 1.3);
  navLights(k, 1.5, -0.2, 1.4);
  const engines = [nozzle(k, [0, 0, -6.1], 1.4)];
  return { length: L, engines, engineColor: '#ff9d4a' };
}

function buildResearch(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 10;
  k.lathe({ slot: 'hull', profile: [[0, -4.4], [0.9, -4.4], [1.1, -3.4], [1.1, 3.0], [0.6, 4.2], [0, 4.5]], axis: 'z', tess: 20 });
  k.torus({ slot: 'paint', d: 4.4, t: 0.35, axis: 'z', pos: [0, 0, -0.6], tess: 32, color: '#7a4fd1' });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    k.beam({ slot: 'hullDark', from: [0, 0, -0.6], to: [Math.cos(a) * 2.1, Math.sin(a) * 2.1, -0.6], w: 0.18 });
  }
  k.torus({ slot: 'accent', d: 4.42, t: 0.08, axis: 'z', pos: [0, 0, -0.6], tess: 40 });
  k.lathe({ slot: 'hull', profile: [[0.05, 0], [0.5, 0.1], [0.95, 0.35]], pos: [0, 1.4, 1.6], rot: [-0.5, 0, 0], tess: 16 });
  k.cyl({ slot: 'hullDark', d: 0.1, h: 1.2, pos: [0, 1.1, 1.5], tess: 6 });
  k.box({ slot: 'gold', w: 1.2, h: 0.8, d: 1.8, pos: [0, -1.1, 1.0] });
  noseCollar(k, L / 2, 1.0);
  navLights(k, 2.3, -0.6);
  const engines = [nozzle(k, [0, 0, -4.5], 1.0)];
  return { length: L, engines, engineColor: '#c28dff' };
}

function buildLuxury(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 16;
  k.lathe({
    slot: 'paint',
    color: '#f4f1ea',
    profile: [[0, -7.6], [1.5, -7.6], [2.1, -6.0], [2.2, 3.0], [1.6, 5.8], [0.7, 7.4], [0, 7.8]],
    axis: 'z',
    tess: 28,
  });
  for (const z of [-3.4, -1.0, 1.4]) k.cyl({ slot: 'windows', d: 4.44, h: 0.6, axis: 'z', pos: [0, 0, z], tess: 32, cap: false });
  k.cyl({ slot: 'gold', d: 4.46, h: 0.25, axis: 'z', pos: [0, 0, -5.0], tess: 32 });
  k.cyl({ slot: 'gold', d: 4.46, h: 0.25, axis: 'z', pos: [0, 0, 3.2], tess: 32 });
  k.sphere({ slot: 'glass', d: 3.0, seg: 18, slice: 0.5, pos: [0, 1.8, -0.8], scale: [1, 0.7, 2.0] });
  k.cyl({ slot: 'lightWarm', d: 2.6, h: 0.05, pos: [0, 1.85, -0.8], tess: 20, scale: [1, 1, 2.0] });
  for (const side of [-1, 1]) {
    k.box({ slot: 'paint', w: 3.2, h: 0.18, d: 3.6, pos: [side * 2.6, -0.5, -5.2], rot: [0, 0, side * -0.15], color: '#e8d9b0' });
    k.cyl({ slot: 'hull', d: 1.1, h: 3.2, axis: 'z', pos: [side * 3.6, -0.7, -5.4], tess: 14 });
  }
  noseCollar(k, L / 2, 1.4);
  navLights(k, 4.2, -5.2, -0.5);
  const engines = [nozzle(k, [-3.6, -0.7, -7.0], 0.9), nozzle(k, [3.6, -0.7, -7.0], 0.9), nozzle(k, [0, 0, -7.7], 1.6)];
  return { length: L, engines, engineColor: '#ffe3a1' };
}

function buildMilitary(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 15;
  k.box({ slot: 'hullDark', w: 3.8, h: 2.4, d: 11.0, pos: [0, 0, -0.8] });
  k.box({ slot: 'hullDark', w: 2.6, h: 1.8, d: 3.0, pos: [0, 0.2, 5.6], rot: [0.12, 0, 0] });
  k.box({ slot: 'hull', w: 4.4, h: 0.4, d: 9.0, pos: [0, 1.25, -1.0] });
  k.box({ slot: 'hull', w: 4.4, h: 0.4, d: 9.0, pos: [0, -1.25, -1.0] });
  for (const side of [-1, 1]) {
    k.box({ slot: 'hullDark', w: 1.0, h: 1.6, d: 6.0, pos: [side * 2.4, 0, -2.0], rot: [0, 0, side * 0.2] });
    k.cyl({ slot: 'hull', d: 0.6, h: 0.5, pos: [side * 1.2, 1.6, 1.5], tess: 10 });
    k.cyl({ slot: 'hullDark', d: 0.16, h: 1.4, axis: 'z', pos: [side * 1.2, 1.75, 2.2], tess: 6 });
  }
  k.box({ slot: 'accent', w: 2.0, h: 0.12, d: 0.1, pos: [0, 0.6, 7.1] });
  noseCollar(k, L / 2, 1.5);
  navLights(k, 2.9, -2.0, 0.8);
  const engines = [nozzle(k, [-1.2, 0.5, -6.3], 1.2), nozzle(k, [1.2, 0.5, -6.3], 1.2), nozzle(k, [-1.2, -0.6, -6.3], 1.2), nozzle(k, [1.2, -0.6, -6.3], 1.2)];
  return { length: L, engines, engineColor: '#ff6a5a' };
}

function buildRareTrader(k: ModelKit): Omit<ShipParts, 'parts'> {
  const L = 10.5;
  k.lathe({
    slot: 'paint',
    color: '#5b2a86',
    profile: [[0, -4.6], [1.0, -4.6], [1.6, -3.0], [1.7, 1.0], [1.2, 3.5], [0, 5.0]],
    axis: 'z',
    tess: 8,
  });
  k.cyl({ slot: 'gold', d: 3.5, h: 0.3, axis: 'z', pos: [0, 0, 0.6], tess: 8 });
  k.cyl({ slot: 'gold', d: 3.4, h: 0.3, axis: 'z', pos: [0, 0, -2.2], tess: 8 });
  for (const side of [-1, 1]) {
    k.box({ slot: 'gold', w: 0.16, h: 2.6, d: 3.2, pos: [side * 1.5, side * 0.8, -2.6], rot: [0.2, 0, side * 0.6] });
    k.box({ slot: 'accent', w: 0.08, h: 1.8, d: 0.12, pos: [side * 1.6, side * 0.9, -1.2], rot: [0.2, 0, side * 0.6] });
  }
  k.sphere({ slot: 'glass', d: 1.4, seg: 12, pos: [0, 0.9, 2.2], scale: [1, 0.6, 1.5] });
  noseCollar(k, L / 2 - 0.2, 1.0);
  navLights(k, 2.4, -2.6, 1.6);
  const engines = [nozzle(k, [-0.6, 0, -4.7], 0.8), nozzle(k, [0.6, 0, -4.7], 0.8)];
  return { length: L, engines, engineColor: '#ff7ae0' };
}

const BUILDERS: Record<ShipTypeId, (k: ModelKit) => Omit<ShipParts, 'parts'>> = {
  cargo: buildCargo,
  mining: buildMining,
  passenger: buildPassenger,
  fuelTanker: buildFuelTanker,
  research: buildResearch,
  luxury: buildLuxury,
  military: buildMilitary,
  rareTrader: buildRareTrader,
};

export function buildShipModels(scene: Scene): Record<ShipTypeId, ShipParts> {
  const out = {} as Record<ShipTypeId, ShipParts>;
  for (const type of SHIP_TYPES) {
    const k = new ModelKit(scene, `ship-${type}`);
    const meta = BUILDERS[type](k);
    out[type] = { ...meta, parts: k.build() };
  }
  return out;
}
