import { EventBus } from '../core/EventBus';
import { clamp } from '../core/math';
import { detectLanguage, type Language } from '../i18n/i18n';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type ParticleLevel = 'off' | 'low' | 'high';
export type FpsLimit = 30 | 60 | 0;

export interface Settings {
  quality: QualityLevel;
  /** Fraction of the native device resolution to render at. */
  resolutionScale: number;
  shadows: boolean;
  bloom: boolean;
  particles: ParticleLevel;
  fpsLimit: FpsLimit;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  cameraSensitivity: number;
  language: Language;
  autoPauseEvents: boolean;
  showFps: boolean;
}

export interface QualityPreset {
  resolutionScale: number;
  shadows: boolean;
  bloom: boolean;
  particles: ParticleLevel;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { resolutionScale: 0.75, shadows: false, bloom: false, particles: 'off' },
  medium: { resolutionScale: 0.9, shadows: true, bloom: true, particles: 'low' },
  high: { resolutionScale: 1, shadows: true, bloom: true, particles: 'high' },
  ultra: { resolutionScale: 1, shadows: true, bloom: true, particles: 'high' },
};

/** Per-level limits that are not user-tweakable individually. */
export interface QualityProfile {
  maxPixelRatio: number;
  textureSize: number;
  normalMaps: boolean;
  shadowMapSize: number;
  skySize: number;
  planetTextureSize: number;
  asteroids: number;
  lensFlares: boolean;
  msaa: number;
  maxNpcs: number;
  maxTraffic: number;
  detailDistance: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    maxPixelRatio: 1, textureSize: 256, normalMaps: false, shadowMapSize: 512, skySize: 256, planetTextureSize: 512,
    asteroids: 120, lensFlares: false, msaa: 1, maxNpcs: 24, maxTraffic: 2, detailDistance: 140,
  },
  medium: {
    maxPixelRatio: 1.5, textureSize: 512, normalMaps: true, shadowMapSize: 1024, skySize: 512, planetTextureSize: 1024,
    asteroids: 300, lensFlares: true, msaa: 1, maxNpcs: 48, maxTraffic: 4, detailDistance: 220,
  },
  high: {
    maxPixelRatio: 2, textureSize: 1024, normalMaps: true, shadowMapSize: 2048, skySize: 1024, planetTextureSize: 2048,
    asteroids: 600, lensFlares: true, msaa: 4, maxNpcs: 90, maxTraffic: 6, detailDistance: 320,
  },
  ultra: {
    maxPixelRatio: 2.5, textureSize: 1024, normalMaps: true, shadowMapSize: 4096, skySize: 2048, planetTextureSize: 2048,
    asteroids: 1100, lensFlares: true, msaa: 4, maxNpcs: 160, maxTraffic: 9, detailDistance: 480,
  },
};

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function defaultQuality(): QualityLevel {
  if (!isMobileDevice()) return 'high';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return memory <= 3 ? 'low' : 'medium';
}

export function defaultSettings(): Settings {
  const quality = defaultQuality();
  return {
    quality,
    ...QUALITY_PRESETS[quality],
    fpsLimit: isMobileDevice() ? 30 : 60,
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.8,
    cameraSensitivity: 1,
    language: detectLanguage(),
    autoPauseEvents: true,
    showFps: false,
  };
}

/** Accepts unknown persisted data and returns a valid settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const num = (value: unknown, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
  return {
    quality: pick(r.quality, ['low', 'medium', 'high', 'ultra'] as const, d.quality),
    resolutionScale: num(r.resolutionScale, 0.5, 1, d.resolutionScale),
    shadows: bool(r.shadows, d.shadows),
    bloom: bool(r.bloom, d.bloom),
    particles: pick(r.particles, ['off', 'low', 'high'] as const, d.particles),
    fpsLimit: pick(r.fpsLimit, [30, 60, 0] as const, d.fpsLimit),
    masterVolume: num(r.masterVolume, 0, 1, d.masterVolume),
    musicVolume: num(r.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: num(r.sfxVolume, 0, 1, d.sfxVolume),
    cameraSensitivity: num(r.cameraSensitivity, 0.3, 3, d.cameraSensitivity),
    language: pick(r.language, ['en', 'tr'] as const, d.language),
    autoPauseEvents: bool(r.autoPauseEvents, d.autoPauseEvents),
    showFps: bool(r.showFps, d.showFps),
  };
}

export interface SettingsEvents {
  changed: { settings: Settings; keys: (keyof Settings)[] };
}

/** Observable settings store. Persistence is handled by the save layer. */
export class SettingsStore {
  readonly bus = new EventBus<SettingsEvents>();
  private value: Settings;

  constructor(initial: Settings) {
    this.value = initial;
  }

  get current(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    const keys = (Object.keys(patch) as (keyof Settings)[]).filter((k) => patch[k] !== this.value[k]);
    if (keys.length === 0) return;
    this.value = sanitizeSettings({ ...this.value, ...patch });
    this.bus.emit('changed', { settings: this.value, keys });
  }

  /** Applies a quality preset, resetting the dependent individual options. */
  applyPreset(quality: QualityLevel): void {
    this.update({ quality, ...QUALITY_PRESETS[quality] });
  }
}
