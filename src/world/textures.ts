import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import { Rng } from '../core/Rng';

/**
 * Procedural canvas textures. Everything visual is generated at startup, so the game ships
 * without large binary texture files and resolution can follow the quality setting.
 */

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function toTexture(name: string, canvas: HTMLCanvasElement, scene: Scene, mipmaps = true): DynamicTexture {
  const tex = new DynamicTexture(name, canvas, scene, mipmaps, mipmaps ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

/** Tileable value noise on an integer lattice of the given period. */
function tileNoise(size: number, period: number, rng: Rng): Float32Array {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % period;
      const y1 = (y0 + 1) % period;
      const a = lattice[y0 * period + x0] as number;
      const b = lattice[y0 * period + x1] as number;
      const c = lattice[y1 * period + x0] as number;
      const d = lattice[y1 * period + x1] as number;
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function fbmTile(size: number, rng: Rng, octaves = 4, basePeriod = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, basePeriod << o, rng);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (n[i] as number) * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / total;
  return out;
}

/** Derives a tangent-space normal map from a height field. */
function heightToNormal(height: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const h = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)] as number;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
}

function subdividePanels(rng: Rng, size: number): Panel[] {
  const panels: Panel[] = [];
  const split = (p: Panel, depth: number): void => {
    const canSplit = p.w > size / 16 && p.h > size / 16;
    if (depth > 0 && canSplit && (depth > 2 || rng.chance(0.75))) {
      const vertical = p.w > p.h ? rng.chance(0.8) : rng.chance(0.2);
      const t = rng.pick([0.25, 0.5, 0.5, 0.75]);
      if (vertical) {
        const w = Math.round(p.w * t);
        split({ x: p.x, y: p.y, w, h: p.h }, depth - 1);
        split({ x: p.x + w, y: p.y, w: p.w - w, h: p.h }, depth - 1);
      } else {
        const h = Math.round(p.h * t);
        split({ x: p.x, y: p.y, w: p.w, h }, depth - 1);
        split({ x: p.x, y: p.y + h, w: p.w, h: p.h - h }, depth - 1);
      }
    } else panels.push(p);
  };
  split({ x: 0, y: 0, w: size, h: size }, 5);
  return panels;
}

export interface HullTextures {
  albedo: DynamicTexture;
  normal: DynamicTexture;
  /** R = ambient occlusion, G = roughness, B = metalness. */
  orm: DynamicTexture;
}

/** Greebled hull plating: panel seams, rivets, subtle per-panel tone and roughness variation. */
export function createHullTextures(scene: Scene, size: number, seed = 7): HullTextures {
  const rng = new Rng(seed);
  const height = new Float32Array(size * size).fill(1);
  const tone = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const grime = fbmTile(size, rng, 5, 4);
  const seam = Math.max(1, Math.round(size / 256));

  for (const p of subdividePanels(rng, size)) {
    const t = rng.range(-0.07, 0.07) + (rng.chance(0.08) ? -0.12 : 0);
    const r = rng.range(0.32, 0.62);
    const raised = rng.chance(0.2) ? rng.range(-0.25, 0.15) : 0;
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = y * size + x;
        tone[i] = t;
        rough[i] = r;
        const edge = Math.min(x - p.x, p.x + p.w - 1 - x, y - p.y, p.y + p.h - 1 - y);
        height[i] = edge < seam ? 0 : edge < seam * 2 ? 0.55 : 1 + raised;
      }
    }
    // Rivets in panel corners.
    if (p.w > size / 10 && p.h > size / 10 && rng.chance(0.6)) {
      const inset = seam * 4;
      for (const [cx, cy] of [
        [p.x + inset, p.y + inset],
        [p.x + p.w - inset, p.y + inset],
        [p.x + inset, p.y + p.h - inset],
        [p.x + p.w - inset, p.y + p.h - inset],
      ] as const) {
        for (let dy = -seam; dy <= seam; dy++)
          for (let dx = -seam; dx <= seam; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x >= 0 && y >= 0 && x < size && y < size) height[y * size + x] = 1.35;
          }
      }
    }
  }

  const albedo = makeCanvas(size, size);
  const orm = makeCanvas(size, size);
  const aImg = albedo.ctx.createImageData(size, size);
  const oImg = orm.ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const h = height[i] as number;
    const g = grime[i] as number;
    const seamDark = h < 0.3 ? 0.45 : h < 0.7 ? 0.8 : 1;
    const base = (0.78 + (tone[i] as number) + (g - 0.5) * 0.12) * seamDark;
    const v = Math.max(0, Math.min(1, base)) * 255;
    aImg.data[i * 4] = v;
    aImg.data[i * 4 + 1] = v * 1.01;
    aImg.data[i * 4 + 2] = v * 1.04;
    aImg.data[i * 4 + 3] = 255;
    oImg.data[i * 4] = (h < 0.3 ? 0.5 : 1) * 255;
    oImg.data[i * 4 + 1] = Math.min(1, (rough[i] as number) + (g - 0.5) * 0.25 + (h < 0.3 ? 0.25 : 0)) * 255;
    oImg.data[i * 4 + 2] = 255;
    oImg.data[i * 4 + 3] = 255;
  }
  albedo.ctx.putImageData(aImg, 0, 0);
  orm.ctx.putImageData(oImg, 0, 0);

  const normal = makeCanvas(size, size);
  const nImg = normal.ctx.createImageData(size, size);
  nImg.data.set(heightToNormal(height, size, 1.6));
  normal.ctx.putImageData(nImg, 0, 0);

  return {
    albedo: toTexture('hullAlbedo', albedo.canvas, scene),
    normal: toTexture('hullNormal', normal.canvas, scene),
    orm: toTexture('hullORM', orm.canvas, scene),
  };
}

/** Rows of cabin windows, some lit, for emissive window bands. */
export function createWindowTexture(scene: Scene, seed = 3): DynamicTexture {
  const rng = new Rng(seed);
  const w = 256;
  const h = 32;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const count = 16;
  const ww = w / count;
  for (let i = 0; i < count; i++) {
    const lit = rng.chance(0.78);
    const warm = rng.chance(0.75);
    const intensity = lit ? rng.range(0.6, 1) : 0.06;
    const r = warm ? 255 : 170;
    const g = warm ? 214 : 225;
    const b = warm ? 150 : 255;
    ctx.fillStyle = `rgba(${r},${g},${b},${intensity})`;
    ctx.fillRect(i * ww + ww * 0.2, h * 0.22, ww * 0.6, h * 0.56);
  }
  return toTexture('windows', canvas, scene);
}

/** Photovoltaic cells with a silver grid. */
export function createSolarTexture(scene: Scene, size: number): DynamicTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const cells = 8;
  const cs = size / cells;
  const rng = new Rng(11);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const grad = ctx.createLinearGradient(x * cs, y * cs, (x + 1) * cs, (y + 1) * cs);
      const k = rng.range(-8, 8);
      grad.addColorStop(0, `rgb(${18 + k},${38 + k},${92 + k})`);
      grad.addColorStop(1, `rgb(${10 + k},${22 + k},${60 + k})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x * cs, y * cs, cs, cs);
      ctx.strokeStyle = 'rgba(120,150,200,0.25)';
      ctx.lineWidth = 1;
      for (let l = 1; l < 4; l++) {
        ctx.beginPath();
        ctx.moveTo(x * cs + (cs * l) / 4, y * cs);
        ctx.lineTo(x * cs + (cs * l) / 4, (y + 1) * cs);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = '#b9c3d1';
  ctx.lineWidth = Math.max(2, size / 128);
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cs, 0);
    ctx.lineTo(i * cs, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cs);
    ctx.lineTo(size, i * cs);
    ctx.stroke();
  }
  return toTexture('solar', canvas, scene);
}

/** Worn yellow/black hazard stripes. */
export function createHazardTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f2b51d';
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 16 + size, size);
    ctx.lineTo(i + size, size);
    ctx.closePath();
    ctx.fill();
  }
  const rng = new Rng(5);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.25)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 6), rng.range(1, 3));
  }
  return toTexture('hazard', canvas, scene);
}

/** Crinkled multi-layer insulation foil (the gold blankets seen on real spacecraft). */
export function createFoilNormal(scene: Scene, size: number): DynamicTexture {
  const rng = new Rng(17);
  const n = fbmTile(size, rng, 5, 8);
  const ridges = new Float32Array(size * size);
  for (let i = 0; i < n.length; i++) ridges[i] = 1 - Math.abs((n[i] as number) * 2 - 1);
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  img.data.set(heightToNormal(ridges, size, 5));
  ctx.putImageData(img, 0, 0);
  return toTexture('foilNormal', canvas, scene);
}

/** Mottled rock albedo for asteroids. */
export function createRockTexture(scene: Scene, size: number): DynamicTexture {
  const rng = new Rng(23);
  const n = fbmTile(size, rng, 6, 4);
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < n.length; i++) {
    const v = n[i] as number;
    img.data[i * 4] = 70 + v * 90;
    img.data[i * 4 + 1] = 64 + v * 80;
    img.data[i * 4 + 2] = 58 + v * 70;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture('rock', canvas, scene);
}

/** Soft radial glow used for the sun, lens flares and engine sprites. */
export function createGlowTexture(scene: Scene, name: string, stops: [number, string][], size = 256): DynamicTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = toTexture(name, canvas, scene, false);
  tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/** Ring-shaped flare (hexagonal aperture ghost). */
export function createRingTexture(scene: Scene, name: string, color: string, size = 128): DynamicTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.04;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = size * 0.42;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const tex = toTexture(name, canvas, scene, false);
  tex.hasAlpha = true;
  return tex;
}
