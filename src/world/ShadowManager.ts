import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { ShadowSink } from './StationView';

/** Tracks shadow casters so shadows can be toggled or resized at runtime without losing them. */
export class ShadowManager implements ShadowSink {
  private generator: ShadowGenerator | null = null;
  private readonly casters = new Set<AbstractMesh>();

  constructor(private readonly light: DirectionalLight) {}

  addCaster(mesh: AbstractMesh): void {
    this.casters.add(mesh);
    this.generator?.addShadowCaster(mesh, false);
  }

  removeCaster(mesh: AbstractMesh): void {
    this.casters.delete(mesh);
    this.generator?.removeShadowCaster(mesh, false);
  }

  configure(enabled: boolean, mapSize: number): void {
    const current = this.generator?.getShadowMap()?.getSize().width ?? 0;
    if (!enabled) {
      this.generator?.dispose();
      this.generator = null;
      return;
    }
    if (this.generator && current === mapSize) return;
    this.generator?.dispose();
    const gen = new ShadowGenerator(mapSize, this.light, true);
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = mapSize >= 2048 ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    gen.bias = 0.0008;
    gen.normalBias = 0.015;
    gen.darkness = 0.15;
    for (const mesh of this.casters) gen.addShadowCaster(mesh, false);
    this.generator = gen;
  }
}
