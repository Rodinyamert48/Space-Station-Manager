/** Integer grid helpers. The station is laid out on a 3D grid of cells; modules connect through ports. */
export interface Vec3i {
  x: number;
  y: number;
  z: number;
}

export const DIRS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
export type Dir = (typeof DIRS)[number];
export type Rotation = 0 | 1 | 2 | 3;

export const DIR_VEC: Record<Dir, Vec3i> = {
  px: { x: 1, y: 0, z: 0 },
  nx: { x: -1, y: 0, z: 0 },
  py: { x: 0, y: 1, z: 0 },
  ny: { x: 0, y: -1, z: 0 },
  pz: { x: 0, y: 0, z: 1 },
  nz: { x: 0, y: 0, z: -1 },
};

export const OPPOSITE: Record<Dir, Dir> = { px: 'nx', nx: 'px', py: 'ny', ny: 'py', pz: 'nz', nz: 'pz' };

/** World units per grid cell. */
export const CELL_SIZE = 12;
/** Distance from a module centre to its port face. */
export const PORT_OFFSET = 4.5;

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

/**
 * Rotates a local offset around +Y by rotation * 90 degrees, matching Babylon's
 * left-handed `rotation.y = rotation * PI / 2` convention.
 */
export function rotateVec(v: Vec3i, rotation: Rotation): Vec3i {
  const c = COS[rotation] as number;
  const s = SIN[rotation] as number;
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

export function vecToDir(v: Vec3i): Dir {
  for (const d of DIRS) {
    const dv = DIR_VEC[d];
    if (dv.x === v.x && dv.y === v.y && dv.z === v.z) return d;
  }
  throw new Error(`Not a unit direction: ${v.x},${v.y},${v.z}`);
}

export function rotateDir(dir: Dir, rotation: Rotation): Dir {
  return vecToDir(rotateVec(DIR_VEC[dir], rotation));
}

export const addVec = (a: Vec3i, b: Vec3i): Vec3i => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const cellKey = (c: Vec3i): string => `${c.x},${c.y},${c.z}`;
export const sameCell = (a: Vec3i, b: Vec3i): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
