import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ParticleLevel } from '../settings/Settings';
import { createGlowTexture } from './textures';

export interface EffectHandle {
  stop(): void;
}

/**
 * Particle effects with pooling. Respects the particle quality setting: "off" creates nothing,
 * "low" halves emission rates.
 */
export class Effects {
  private readonly sparkTexture: Texture;
  private readonly softTexture: Texture;
  private level: ParticleLevel = 'high';
  private readonly pool: ParticleSystem[] = [];
  private readonly active = new Set<ParticleSystem>();

  constructor(private readonly scene: Scene) {
    this.sparkTexture = createGlowTexture(scene, 'sparkTex', [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,230,170,0.9)'],
      [1, 'rgba(255,160,60,0)'],
    ], 64);
    this.softTexture = createGlowTexture(scene, 'softTex', [
      [0, 'rgba(255,255,255,0.8)'],
      [0.5, 'rgba(255,255,255,0.25)'],
      [1, 'rgba(255,255,255,0)'],
    ], 64);
  }

  setLevel(level: ParticleLevel): void {
    this.level = level;
    if (level === 'off') for (const ps of [...this.active]) this.release(ps);
  }

  get enabled(): boolean {
    return this.level !== 'off';
  }

  private acquire(capacity: number): ParticleSystem {
    let ps: ParticleSystem | undefined;
    // Pooled systems can be disposed by Babylon when a mesh they emitted from is disposed.
    while (!ps && this.pool.length > 0) {
      const candidate = this.pool.pop() as ParticleSystem;
      if (this.scene.particleSystems.includes(candidate) && candidate.getCapacity() >= capacity) ps = candidate;
      else if (this.scene.particleSystems.includes(candidate)) candidate.dispose();
    }
    ps ??= new ParticleSystem('fx', capacity, this.scene);
    ps.reset();
    this.active.add(ps);
    return ps;
  }

  private release(ps: ParticleSystem): void {
    ps.stop();
    // Detach from any mesh emitter so disposing that mesh does not dispose the pooled system.
    ps.emitter = Vector3.Zero();
    this.active.delete(ps);
    this.pool.push(ps);
  }

  private rate(base: number): number {
    return this.level === 'low' ? base * 0.4 : base;
  }

  /** Welding sparks around a construction site until stopped. */
  constructionSparks(center: Vector3, radius: number): EffectHandle | null {
    if (!this.enabled) return null;
    const ps = this.acquire(220);
    ps.particleTexture = this.sparkTexture;
    ps.emitter = center.clone();
    ps.minEmitBox = new Vector3(-radius, -radius, -radius);
    ps.maxEmitBox = new Vector3(radius, radius, radius);
    ps.color1 = new Color4(1, 0.85, 0.45, 1);
    ps.color2 = new Color4(1, 0.55, 0.15, 1);
    ps.colorDead = new Color4(0.6, 0.2, 0, 0);
    ps.minSize = 0.08;
    ps.maxSize = 0.28;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.7;
    ps.emitRate = this.rate(90);
    ps.direction1 = new Vector3(-1, -1, -1);
    ps.direction2 = new Vector3(1, 1, 1);
    ps.minEmitPower = 1.5;
    ps.maxEmitPower = 5;
    ps.gravity = Vector3.Zero();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.manualEmitCount = -1;
    ps.targetStopDuration = 0;
    ps.start();
    return { stop: () => this.release(ps) };
  }

  /** One-shot burst (construction finished, docking clamp release, impacts). */
  burst(center: Vector3, color: Color4, count = 120, power = 6, size = 0.5): void {
    if (!this.enabled) return;
    const ps = this.acquire(Math.max(count, 60));
    ps.particleTexture = this.softTexture;
    ps.emitter = center.clone();
    ps.minEmitBox = new Vector3(-0.5, -0.5, -0.5);
    ps.maxEmitBox = new Vector3(0.5, 0.5, 0.5);
    ps.color1 = color;
    ps.color2 = new Color4(color.r * 0.8, color.g * 0.9, color.b, color.a);
    ps.colorDead = new Color4(color.r, color.g, color.b, 0);
    ps.minSize = size * 0.4;
    ps.maxSize = size;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.4;
    ps.emitRate = 0;
    ps.manualEmitCount = this.level === 'low' ? Math.round(count * 0.4) : count;
    ps.direction1 = new Vector3(-1, -1, -1);
    ps.direction2 = new Vector3(1, 1, 1);
    ps.minEmitPower = power * 0.3;
    ps.maxEmitPower = power;
    ps.gravity = Vector3.Zero();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.targetStopDuration = 1.5;
    ps.onStoppedObservable.addOnce(() => {
      if (this.active.has(ps)) this.release(ps);
    });
    ps.start();
  }

  /** Continuous soft stream attached to a moving node (engine exhaust, venting gas). */
  stream(
    emitter: AbstractMesh | Vector3,
    opts: { color: Color4; direction: Vector3; spread: number; rate: number; size: number; life: number; power: number },
  ): EffectHandle | null {
    if (!this.enabled) return null;
    const ps = this.acquire(Math.ceil(opts.rate * opts.life * 1.5) + 10);
    ps.particleTexture = this.softTexture;
    ps.emitter = emitter instanceof Vector3 ? emitter.clone() : emitter;
    ps.minEmitBox = new Vector3(-opts.spread, -opts.spread, -opts.spread);
    ps.maxEmitBox = new Vector3(opts.spread, opts.spread, opts.spread);
    ps.color1 = opts.color;
    ps.color2 = opts.color;
    ps.colorDead = new Color4(opts.color.r, opts.color.g, opts.color.b, 0);
    ps.minSize = opts.size * 0.6;
    ps.maxSize = opts.size;
    ps.minLifeTime = opts.life * 0.6;
    ps.maxLifeTime = opts.life;
    ps.emitRate = this.rate(opts.rate);
    ps.manualEmitCount = -1;
    ps.direction1 = opts.direction.scale(0.9);
    ps.direction2 = opts.direction.scale(1.1);
    ps.minEmitPower = opts.power * 0.7;
    ps.maxEmitPower = opts.power;
    ps.gravity = Vector3.Zero();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.targetStopDuration = 0;
    ps.start();
    return { stop: () => this.release(ps) };
  }
}
