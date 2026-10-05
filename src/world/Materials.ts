import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import {
  createFoilNormal,
  createHazardTexture,
  createHullTextures,
  createSolarTexture,
  createWindowTexture,
  type HullTextures,
} from './textures';

export type Slot =
  | 'hull'
  | 'hullDark'
  | 'paint'
  | 'glass'
  | 'gold'
  | 'solar'
  | 'hazard'
  | 'windows'
  | 'accent'
  | 'lightWhite'
  | 'lightWarm'
  | 'navRed'
  | 'navGreen';

/** Slots whose geometry is small detail and can be culled at a distance. */
export const DETAIL_SLOTS: ReadonlySet<Slot> = new Set<Slot>(['gold', 'hazard', 'navRed', 'navGreen', 'lightWhite']);

export interface MaterialQuality {
  textureSize: number;
  normalMaps: boolean;
}

/**
 * Shared material library. Every module/ship/prop draws from the same small set of materials so
 * instancing can batch them and the GPU state changes stay low.
 */
export class MaterialLibrary {
  private readonly materials = new Map<string, Material>();
  private readonly hullTex: HullTextures;
  private readonly accentMaterials = new Map<string, StandardMaterial>();
  private readonly navRed: StandardMaterial;
  private readonly navGreen: StandardMaterial;
  private readonly lightSets: StandardMaterial[] = [];
  private brownout = 1;

  constructor(
    private readonly scene: Scene,
    private readonly quality: MaterialQuality,
  ) {
    this.hullTex = createHullTextures(scene, quality.textureSize);

    this.materials.set('hull', this.metal('hull', new Color3(0.9, 0.92, 0.95), 0.32, 0.95));
    this.materials.set('hullDark', this.metal('hullDark', new Color3(0.22, 0.235, 0.26), 0.75, 0.75));

    const paint = this.metal('paint', new Color3(1, 1, 1), 0.15, 0.95);
    this.materials.set('paint', paint);

    const glass = new PBRMaterial('glass', scene);
    glass.albedoColor = new Color3(0.02, 0.05, 0.08);
    glass.metallic = 0.05;
    glass.roughness = 0.06;
    glass.alpha = 0.32;
    glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    glass.useRadianceOverAlpha = true;
    glass.useSpecularOverAlpha = true;
    glass.environmentIntensity = 1.6;
    glass.backFaceCulling = true;
    this.materials.set('glass', glass);

    const gold = new PBRMaterial('gold', scene);
    gold.albedoColor = new Color3(1.0, 0.7, 0.26);
    gold.metallic = 1;
    gold.roughness = 0.32;
    if (quality.normalMaps) {
      gold.bumpTexture = createFoilNormal(scene, Math.min(256, quality.textureSize));
      gold.bumpTexture.level = 0.7;
    }
    this.materials.set('gold', gold);

    const solar = new PBRMaterial('solar', scene);
    solar.albedoTexture = createSolarTexture(scene, Math.min(512, quality.textureSize));
    solar.metallic = 0.55;
    solar.roughness = 0.2;
    solar.environmentIntensity = 1.3;
    this.materials.set('solar', solar);

    const hazard = new PBRMaterial('hazard', scene);
    hazard.albedoTexture = createHazardTexture(scene);
    hazard.metallic = 0.2;
    hazard.roughness = 0.6;
    this.materials.set('hazard', hazard);

    const windows = new StandardMaterial('windows', scene);
    windows.disableLighting = true;
    windows.diffuseColor = Color3.Black();
    windows.specularColor = Color3.Black();
    windows.emissiveTexture = createWindowTexture(scene);
    this.materials.set('windows', windows);

    this.materials.set('lightWhite', this.light('lightWhite', new Color3(0.85, 0.93, 1)));
    this.materials.set('lightWarm', this.light('lightWarm', new Color3(1, 0.78, 0.5)));
    this.navRed = this.light('navRed', new Color3(1, 0.12, 0.1));
    this.navGreen = this.light('navGreen', new Color3(0.2, 1, 0.4));
    this.materials.set('navRed', this.navRed);
    this.materials.set('navGreen', this.navGreen);
  }

  private metal(name: string, color: Color3, metallic: number, roughness: number): PBRMaterial {
    const m = new PBRMaterial(name, this.scene);
    m.albedoColor = color;
    m.albedoTexture = this.hullTex.albedo;
    m.metallicTexture = this.hullTex.orm;
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.metallic = metallic;
    m.roughness = roughness;
    if (this.quality.normalMaps) {
      m.bumpTexture = this.hullTex.normal;
      m.bumpTexture.level = 0.55;
    }
    return m;
  }

  private light(name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.disableLighting = true;
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.emissiveColor = color;
    m.metadata = { baseEmissive: color.clone() };
    this.lightSets.push(m);
    return m;
  }

  get(slot: Slot, accent = '#5fd8ff'): Material {
    if (slot === 'accent') return this.accent(accent);
    const m = this.materials.get(slot);
    if (!m) throw new Error(`Unknown material slot ${slot}`);
    return m;
  }

  /** Emissive light material in a module's accent colour (cached per colour). */
  accent(hex: string): StandardMaterial {
    let m = this.accentMaterials.get(hex);
    if (!m) {
      m = this.light(`accent-${hex}`, Color3.FromHexString(hex).scale(1.15));
      this.accentMaterials.set(hex, m);
    }
    return m;
  }

  /** Emissive colour of a light material at runtime (used for in-scene status lights). */
  emissive(hex: string, intensity = 1): StandardMaterial {
    const key = `${hex}@${intensity}`;
    let m = this.accentMaterials.get(key);
    if (!m) {
      m = this.light(`emissive-${key}`, Color3.FromHexString(hex).scale(intensity));
      this.accentMaterials.set(key, m);
    }
    return m;
  }

  /** Dims all station lights when power runs short (1 = normal, 0.2 = blackout). */
  setBrownout(level: number): void {
    this.brownout = level;
  }

  update(time: number): void {
    // Navigation beacons blink; status lights flicker during brownouts.
    const blink = Math.sin(time * 3.2) > 0.55 ? 1 : 0.08;
    const blinkAlt = Math.sin(time * 3.2 + Math.PI) > 0.55 ? 1 : 0.08;
    const flicker = this.brownout < 0.99 ? this.brownout * (0.85 + 0.15 * Math.sin(time * 37)) : 1;
    for (const m of this.lightSets) {
      const base = (m.metadata as { baseEmissive: Color3 }).baseEmissive;
      const k = m === this.navRed ? blink : m === this.navGreen ? blinkAlt : flicker;
      m.emissiveColor.copyFromFloats(base.r * k, base.g * k, base.b * k);
    }
  }
}
