import { Engine } from '@babylonjs/core/Engines/engine';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo';
import '@babylonjs/core/Culling/ray';
import { Scene } from '@babylonjs/core/scene';
import type { Game } from '../game/Game';
import { QUALITY_PROFILES, type QualityProfile, type Settings } from '../settings/Settings';
import { BuildController } from './BuildController';
import { CameraController } from './CameraController';
import { CrewView } from './CrewView';
import { Effects } from './Effects';
import { EventFx } from './EventFx';
import { WorldLabels } from './Labels';
import { Environment } from './Environment';
import { MaterialLibrary } from './Materials';
import { MegaStructure } from './MegaStructure';
import { ModelLibrary } from './ModelLibrary';
import { SelectionMarker } from './SelectionMarker';
import { ShadowManager } from './ShadowManager';
import { ShipView } from './ShipView';
import { StationView } from './StationView';

export interface TapEvent {
  x: number;
  y: number;
  pick: PickingInfo | null;
}

/**
 * Owns the Babylon engine, scene, camera, post-processing and the views that mirror game state.
 */
export class World {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: CameraController;
  readonly env: Environment;
  readonly materials: MaterialLibrary;
  readonly models: ModelLibrary;
  readonly shadows: ShadowManager;
  readonly station: StationView;
  readonly effects: Effects;
  readonly build: BuildController;
  readonly selection: SelectionMarker;
  readonly labels: WorldLabels;
  readonly ships: ShipView;
  readonly crew: CrewView;
  readonly mega: MegaStructure;
  readonly fx: EventFx;
  private profile: QualityProfile;
  private pipeline: DefaultRenderingPipeline | null = null;
  private glow: GlowLayer | null = null;
  private fpsLimit = 60;
  private lastFrame = performance.now();
  private elapsed = 0;
  private game: Game | null = null;
  private readonly unsubscribe: (() => void)[] = [];
  private tapListeners = new Set<(e: TapEvent) => void>();
  private frameListeners = new Set<(dt: number) => void>();
  private pointerDown: { x: number; y: number; t: number; id: number } | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    settings: Settings,
  ) {
    this.profile = QUALITY_PROFILES[settings.quality];
    this.engine = new Engine(
      canvas,
      false,
      { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance', disableWebGL2Support: false },
      false,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);
    this.scene.skipPointerMovePicking = true;
    this.scene.ambientColor.set(0, 0, 0);
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.scene.imageProcessingConfiguration.exposure = 1.05;
    this.scene.imageProcessingConfiguration.contrast = 1.15;

    this.camera = new CameraController(this.scene, canvas);
    this.env = new Environment(this.scene, {
      skySize: this.profile.skySize,
      planetTextureSize: this.profile.planetTextureSize,
      asteroids: this.profile.asteroids,
      lensFlares: this.profile.lensFlares,
    });
    this.materials = new MaterialLibrary(this.scene, { textureSize: this.profile.textureSize, normalMaps: this.profile.normalMaps });
    this.models = new ModelLibrary(this.scene, this.materials, this.profile.detailDistance);
    this.shadows = new ShadowManager(this.env.sun);
    this.effects = new Effects(this.scene);
    this.labels = new WorldLabels(this.scene, this.engine);
    this.station = new StationView(this.scene, this.models, this.shadows, this.effects, this.labels, this.env.sunDirection);
    this.crew = new CrewView(this.scene);
    this.mega = new MegaStructure(this.scene, this.materials, this.effects, this.shadows);
    this.fx = new EventFx(this.scene, this.materials, this.effects, this.camera);
    this.ships = new ShipView(this.scene, this.models, this.materials, this.effects, this.labels, this.shadows);
    this.build = new BuildController(this.scene, this.models, () => this.game, (mesh) => this.excludeFromGlow(mesh));
    this.selection = new SelectionMarker(this.scene);
    for (const rock of this.env.nearRocks) rock.receiveShadows = true;

    // Meshes get their metadata right after creation; tag them on the next frame.
    this.scene.onNewMeshAddedObservable.add((mesh) => {
      this.scene.onBeforeRenderObservable.addOnce(() => this.tagGlow(mesh));
    });
    this.scene.autoClear = false;
    this.applySettings(settings);
    this.installPointerHandling();
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
  }

  private readonly onResize = (): void => {
    this.engine.resize();
    this.labels.updateScale();
  };

  /** Applies render-related settings live. */
  applySettings(settings: Settings): void {
    this.materials.setFrozen(false);
    this.profile = QUALITY_PROFILES[settings.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / Math.max(0.35, dpr * settings.resolutionScale));
    this.labels?.updateScale();
    this.fpsLimit = settings.fpsLimit;
    this.effects.setLevel(settings.particles);
    this.ships?.setTrafficLimit(this.profile.maxTraffic);
    this.crew?.setMaxVisible(this.profile.maxNpcs);
    this.shadows.configure(settings.shadows, this.profile.shadowMapSize);
    this.env.setLensFlaresEnabled(this.profile.lensFlares);

    const wantPipeline = settings.quality === 'high' || settings.quality === 'ultra';
    if (wantPipeline && !this.pipeline) {
      const p = new DefaultRenderingPipeline('pipeline', true, this.scene, [this.camera.camera]);
      p.imageProcessingEnabled = true;
      p.imageProcessing.toneMappingEnabled = true;
      p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      p.imageProcessing.exposure = 1.05;
      p.imageProcessing.contrast = 1.18;
      p.imageProcessing.vignetteEnabled = true;
      p.imageProcessing.vignetteWeight = 1.6;
      p.imageProcessing.vignetteStretch = 0.4;
      p.bloomThreshold = 0.72;
      p.bloomWeight = 0.38;
      p.bloomKernel = 64;
      p.bloomScale = 0.5;
      this.pipeline = p;
    } else if (!wantPipeline && this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (this.pipeline) {
      this.pipeline.samples = this.profile.msaa;
      this.pipeline.fxaaEnabled = this.profile.msaa <= 1;
      this.pipeline.bloomEnabled = settings.bloom;
      this.pipeline.chromaticAberrationEnabled = settings.quality === 'ultra';
      if (this.pipeline.chromaticAberrationEnabled) {
        // Lens-like: invisible at the centre of the screen, a faint fringe towards the edges.
        this.pipeline.chromaticAberration.aberrationAmount = 12;
        this.pipeline.chromaticAberration.radialIntensity = 1.6;
      }
    }
    this.env.setLinearOutput(this.pipeline !== null);
    // Refreeze static materials once the new shader variants have compiled.
    window.setTimeout(() => this.materials.setFrozen(true), 1500);

    if (settings.bloom && !this.glow) {
      // Only emissive meshes are rendered into the glow map: far fewer draw calls.
      this.glow = new GlowLayer('glow', this.scene, { mainTextureRatio: settings.quality === 'medium' ? 0.35 : 0.5, blurKernelSize: 32 });
      this.glow.intensity = 0.75;
      for (const mesh of this.scene.meshes) this.tagGlow(mesh);
    } else if (!settings.bloom && this.glow) {
      this.glow.dispose();
      this.glow = null;
    }
  }

  /** Adds meshes tagged with `metadata.glow` to the glow layer's inclusion list. */
  private tagGlow(mesh: AbstractMesh): void {
    const glow = (mesh.metadata as { glow?: boolean } | null)?.glow;
    if (glow && this.glow && mesh instanceof Mesh) this.glow.addIncludedOnlyMesh(mesh);
  }

  /** Keeps a hologram (build preview) out of the glow layer even if its source mesh was tagged. */
  excludeFromGlow(mesh: Mesh): void {
    this.glow?.removeIncludedOnlyMesh(mesh);
  }

  attachGame(game: Game): void {
    this.detachGame();
    this.game = game;
    this.station.syncAll(game);
    this.ships.syncAll(game);
    this.crew.syncAll(game);
    this.mega.setStage(game.state.stage, false);
    this.updateCameraLimits(game);
    const bus = game.bus;
    this.unsubscribe.push(
      bus.on('moduleAdded', ({ module }) => {
        this.station.addModule(module);
        this.station.rebuildLinks(game);
        this.updateCameraLimits(game);
      }),
      bus.on('moduleRemoved', ({ module }) => {
        this.station.removeModule(module.id);
        this.station.rebuildLinks(game);
      }),
      bus.on('moduleChanged', ({ module }) => this.station.updateModule(module)),
      bus.on('layoutChanged', () => {
        this.build.refresh();
        this.ships.syncBerths(game);
      }),
      bus.on('moduleCompleted', () => {
        this.station.rebuildLinks(game);
        this.ships.syncBerths(game);
      }),
      bus.on('shipAdded', ({ ship }) => this.ships.addShip(ship, game)),
      bus.on('shipChanged', ({ ship }) => {
        this.ships.shipChanged(ship, game);
        this.crew.syncVisitors(ship.id, game);
      }),
      bus.on('shipRemoved', ({ ship }) => {
        this.ships.removeShip(ship.id);
        this.crew.syncVisitors(ship.id, game);
      }),
      bus.on('crewAdded', ({ member }) => this.crew.addCrew(member, game)),
      bus.on('stageChanged', ({ stage }) => {
        this.mega.setStage(stage, true);
        this.updateCameraLimits(game);
      }),
      bus.on('pirateAttack', ({ repelled }) => {
        const turrets = game.station.modules.filter((m) => m.type === 'defense' && m.status === 'active').map((m) => this.station.modulePosition(m.id)).filter((p): p is NonNullable<typeof p> => !!p);
        this.fx.pirateRaid(repelled, turrets, this.station.radius(game));
      }),
      bus.on('eventResolved', ({ event }) => {
        if (event.eventId === 'meteorShower') this.fx.meteorShower(this.station.radius(game));
      }),
      bus.on('meteorImpact', ({ moduleId }) => {
        const pos = this.station.modulePosition(moduleId);
        if (pos) window.setTimeout(() => this.fx.impact(pos), 1800);
      }),
      bus.on('crewRemoved', ({ member }) => this.crew.removeCrew(member.id)),
      bus.on('crewMoved', ({ member, from, to }) => this.crew.moveCrew(member, from, to, game)),
      bus.on('traded', ({ ship, qty }) => {
        if (ship) this.ships.launchDrones(ship, qty);
      }),
    );
  }

  private updateCameraLimits(game: Game): void {
    this.camera.setStationRadius(Math.max(this.station.radius(game), this.mega.radius));
  }

  detachGame(): void {
    for (const fn of this.unsubscribe.splice(0)) fn();
    this.build.end();
    this.selection.hide();
    this.game = null;
  }

  onFrame(fn: (dt: number) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  onTap(fn: (e: TapEvent) => void): () => void {
    this.tapListeners.add(fn);
    return () => this.tapListeners.delete(fn);
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      const now = performance.now();
      if (this.fpsLimit > 0 && now - this.lastFrame < 1000 / this.fpsLimit - 2) return;
      const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.elapsed += dt;
      for (const fn of this.frameListeners) fn(dt);
      this.camera.update(dt);
      this.env.update(dt, this.camera.camera.position);
      this.materials.update(this.elapsed);
      if (this.game) {
        this.station.update(dt, this.game);
        this.ships.update(dt, this.game);
        this.crew.update(dt, this.game);
        const ratio = this.game.resources.flows.powerRatio;
        this.materials.setBrownout(ratio < 0.98 ? 0.3 + 0.7 * ratio : 1);
      }
      this.build.update(dt);
      this.mega.update(dt);
      this.fx.update(dt);
      this.selection.update(dt);
      this.scene.render();
    });
  }

  get fps(): number {
    return this.engine.getFps();
  }

  pick(x: number, y: number, predicate?: (mesh: AbstractMesh) => boolean): PickingInfo | null {
    return this.scene.pick(x, y, predicate ?? ((m) => m.isPickable && m.isEnabled() && m.isVisible));
  }

  private installPointerHandling(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) {
        this.pointerDown = null;
        return;
      }
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    });
    c.addEventListener('pointerup', (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || down.id !== e.pointerId || e.button > 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > 8 || performance.now() - down.t > 600) return;
      // Babylon picks in CSS pixels and applies the hardware scaling level itself.
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pick = this.pick(x, y);
      for (const fn of this.tapListeners) fn({ x, y, pick });
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    let lastHover = 0;
    c.addEventListener('pointermove', (e) => {
      if (!this.build.active || e.pointerType !== 'mouse' || e.buttons !== 0) return;
      const now = performance.now();
      if (now - lastHover < 50) return;
      lastHover = now;
      const rect = c.getBoundingClientRect();
      const pick = this.pick(e.clientX - rect.left, e.clientY - rect.top, (m) => this.build.isMarker(m));
      this.build.hover(pick?.pickedMesh ?? null);
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
