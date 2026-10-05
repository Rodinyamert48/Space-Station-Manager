import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Constants } from '@babylonjs/core/Engines/constants';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { LensFlare } from '@babylonjs/core/LensFlares/lensFlare';
import { LensFlareSystem } from '@babylonjs/core/LensFlares/lensFlareSystem';
import '@babylonjs/core/LensFlares/lensFlareSystemSceneComponent';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import type { Scene } from '@babylonjs/core/scene';
import { Rng } from '../core/Rng';
import { registerShaders } from './shaders';
import { createGlowTexture, createRockTexture } from './textures';

export interface EnvironmentQuality {
  skySize: number;
  planetTextureSize: number;
  asteroids: number;
  lensFlares: boolean;
}

/** Rendering group for far-away backdrop objects; the station and ships render on top. */
export const BACKDROP_GROUP = 0;

function noise3(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number): number => {
    let n = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 974711) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Lumpy rock: a smooth icosphere displaced by layered noise. */
function createRock(scene: Scene, name: string, seed: number): Mesh {
  const mesh = CreateIcoSphere(name, { radius: 1, subdivisions: 3, flat: false }, scene);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return mesh;
  const stretch = [1 + (seed % 3) * 0.25, 0.75 + (seed % 2) * 0.15, 0.9];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] as number;
    const y = positions[i + 1] as number;
    const z = positions[i + 2] as number;
    const big = noise3(x * 1.6 + seed, y * 1.6, z * 1.6, seed) - 0.5;
    const small = noise3(x * 5 + seed, y * 5, z * 5, seed + 7) - 0.5;
    const crater = Math.max(0, noise3(x * 3, y * 3 + seed, z * 3, seed + 3) - 0.72) * 1.4;
    const r = 1 + big * 0.7 + small * 0.16 - crater;
    positions[i] = x * r * (stretch[0] as number);
    positions[i + 1] = y * r * (stretch[1] as number);
    positions[i + 2] = z * r * (stretch[2] as number);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  return mesh;
}

/**
 * The space around the station: baked procedural sky (also used as the PBR environment map),
 * sun with lens flares, an inhabited planet below, a distant gas giant and an asteroid belt.
 */
export class Environment {
  readonly sun: DirectionalLight;
  readonly fill: HemisphericLight;
  /** Normalised direction pointing towards the sun. */
  readonly sunDirection: Vector3;
  private readonly sky: Mesh;
  private readonly skyBakeMaterial: ShaderMaterial;
  private readonly skyboxMaterial: ShaderMaterial;
  private readonly probe: ReflectionProbe;
  private readonly shaderMaterials: ShaderMaterial[] = [];
  private readonly planetMaterial: ShaderMaterial;
  private readonly beltRoot: TransformNode;
  private readonly tumblers: Mesh[] = [];
  private readonly rocks: Mesh[] = [];
  private flares: LensFlareSystem | null = null;
  private readonly sunBillboard: Mesh;
  private baked = false;
  private elapsed = 0;

  constructor(
    private readonly scene: Scene,
    private readonly quality: EnvironmentQuality,
  ) {
    registerShaders();
    this.sunDirection = new Vector3(0.62, 0.38, 0.68).normalize();

    this.sun = new DirectionalLight('sun', this.sunDirection.scale(-1), scene);
    this.sun.intensity = 3.2;
    this.sun.diffuse = new Color3(1, 0.96, 0.9);
    this.sun.specular = new Color3(1, 0.95, 0.88);
    this.sun.position = this.sunDirection.scale(160);

    this.fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    this.fill.intensity = 0.6;
    this.fill.diffuse = new Color3(0.45, 0.55, 0.75);
    this.fill.groundColor = new Color3(0.12, 0.26, 0.45);
    this.fill.specular = Color3.Black();

    // Sky: render the expensive procedural shader once into a cube map, then sample that.
    this.sky = CreateSphere('sky', { diameter: 9000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.sky.infiniteDistance = true;
    this.sky.isPickable = false;
    this.sky.renderingGroupId = BACKDROP_GROUP;
    this.skyBakeMaterial = new ShaderMaterial('skyBake', scene, { vertex: 'sky', fragment: 'sky' }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection'],
    });
    this.skyBakeMaterial.backFaceCulling = false;
    this.skyBakeMaterial.disableDepthWrite = true;
    this.sky.material = this.skyBakeMaterial;

    this.probe = new ReflectionProbe('skyProbe', quality.skySize, scene, true, false, false);
    this.probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.probe.renderList?.push(this.sky);
    this.probe.cubeTexture.gammaSpace = true;

    this.skyboxMaterial = new ShaderMaterial('skybox', scene, { vertex: 'skybox', fragment: 'skybox' }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'uLinear', 'uIntensity'],
      samplers: ['skyTexture'],
    });
    this.skyboxMaterial.backFaceCulling = false;
    this.skyboxMaterial.disableDepthWrite = true;
    this.skyboxMaterial.setTexture('skyTexture', this.probe.cubeTexture);
    this.skyboxMaterial.setFloat('uIntensity', 1);
    this.shaderMaterials.push(this.skyboxMaterial);

    scene.environmentTexture = this.probe.cubeTexture;
    scene.environmentIntensity = 1.6;

    scene.executeWhenReady(() => {
      this.probe.cubeTexture.resetRefreshCounter();
      scene.onAfterRenderObservable.addOnce(() => {
        this.sky.material = this.skyboxMaterial;
        this.baked = true;
      });
    });

    this.planetMaterial = this.createPlanet();
    this.createGasGiant();
    this.sunBillboard = this.createSun();
    this.beltRoot = this.createAsteroids();
  }

  get isSkyBaked(): boolean {
    return this.baked;
  }

  private shader(name: string, vertex: string, fragment: string, uniforms: string[], samplers: string[] = []): ShaderMaterial {
    const mat = new ShaderMaterial(name, this.scene, { vertex, fragment }, {
      attributes: ['position', 'normal', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'sunDir', 'camPos', 'uLinear', ...uniforms],
      samplers,
    });
    mat.setVector3('sunDir', this.sunDirection);
    mat.setFloat('uLinear', 0);
    this.shaderMaterials.push(mat);
    return mat;
  }

  private createPlanet(): ShaderMaterial {
    const size = this.quality.planetTextureSize;
    const surface = new ProceduralTexture('planetSurface', { width: size, height: size / 2 }, 'planetSurface', this.scene, null, true);
    surface.refreshRate = 0;
    surface.wrapU = Texture.WRAP_ADDRESSMODE;
    const clouds = new ProceduralTexture('planetClouds', { width: size, height: size / 2 }, 'planetClouds', this.scene, null, true);
    clouds.refreshRate = 0;
    clouds.wrapU = Texture.WRAP_ADDRESSMODE;

    const radius = 2000;
    const center = new Vector3(-1500, -3300, 900);
    const planet = CreateSphere('planet', { diameter: radius * 2, segments: 64 }, this.scene);
    planet.position = center;
    planet.rotation = new Vector3(0.35, 0.8, 0.1);
    planet.renderingGroupId = BACKDROP_GROUP;
    planet.isPickable = false;
    const mat = this.shader('planetMat', 'planet', 'planet', ['time'], ['surfaceTex', 'cloudTex']);
    mat.setTexture('surfaceTex', surface);
    mat.setTexture('cloudTex', clouds);
    mat.setFloat('time', 0);
    planet.material = mat;

    const atmo = CreateSphere('atmosphere', { diameter: radius * 2 * 1.022, segments: 48 }, this.scene);
    atmo.position = center;
    atmo.renderingGroupId = BACKDROP_GROUP;
    atmo.isPickable = false;
    const atmoMat = this.shader('atmosphereMat', 'atmosphere', 'atmosphere', ['tint']);
    atmoMat.setColor3('tint', new Color3(0.35, 0.62, 1.0));
    atmoMat.alphaMode = Constants.ALPHA_ADD;
    atmoMat.needAlphaBlending = () => true;
    atmoMat.disableDepthWrite = true;
    atmo.material = atmoMat;

    // Small grey moon.
    const moon = CreateSphere('moon', { diameter: 160, segments: 32 }, this.scene);
    moon.position = new Vector3(-2600, -500, 2400);
    moon.renderingGroupId = BACKDROP_GROUP;
    moon.isPickable = false;
    const moonMat = new PBRMaterial('moonMat', this.scene);
    moonMat.albedoTexture = createRockTexture(this.scene, 256);
    moonMat.albedoColor = new Color3(0.8, 0.8, 0.82);
    moonMat.metallic = 0;
    moonMat.roughness = 1;
    moon.material = moonMat;
    return mat;
  }

  private createGasGiant(): void {
    const giant = CreateSphere('gasGiant', { diameter: 520, segments: 48 }, this.scene);
    giant.position = new Vector3(3200, 1400, -3800);
    giant.rotation = new Vector3(0.2, 0, 0.35);
    giant.renderingGroupId = BACKDROP_GROUP;
    giant.isPickable = false;
    giant.material = this.shader('gasGiantMat', 'gasGiant', 'gasGiant', []);

    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 256;
    ringCanvas.height = 4;
    const ctx = ringCanvas.getContext('2d');
    if (ctx) {
      const rng = new Rng(9);
      for (let x = 0; x < 256; x++) {
        const t = x / 255;
        const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 4);
        const a = (0.25 + rng.next() * 0.5) * fade * (Math.sin(t * 40) * 0.2 + 0.8);
        ctx.fillStyle = `rgba(${200 + rng.int(0, 40)},${170 + rng.int(0, 40)},${130 + rng.int(0, 30)},${a})`;
        ctx.fillRect(x, 0, 1, 4);
      }
    }
    const ringTex = new Texture(ringCanvas.toDataURL(), this.scene);
    ringTex.hasAlpha = true;
    const ring = CreateDisc('gasGiantRing', { radius: 520, tessellation: 96, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    // Remap UVs radially so the 1D band texture runs from the inner to the outer edge.
    const pos = ring.getVerticesData(VertexBuffer.PositionKind);
    if (pos) {
      const uvs = new Float32Array((pos.length / 3) * 2);
      for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
        const r = Math.hypot(pos[i] as number, pos[i + 1] as number) / 520;
        uvs[j] = (r - 0.55) / 0.45;
        uvs[j + 1] = 0.5;
      }
      ring.setVerticesData(VertexBuffer.UVKind, uvs);
    }
    ring.parent = giant;
    ring.rotation.x = Math.PI / 2;
    ring.renderingGroupId = BACKDROP_GROUP;
    ring.isPickable = false;
    const ringMat = new StandardMaterial('ringMat', this.scene);
    ringMat.diffuseTexture = ringTex;
    ringMat.useAlphaFromDiffuseTexture = true;
    ringMat.emissiveColor = new Color3(0.25, 0.2, 0.15);
    ringMat.specularColor = Color3.Black();
    ringMat.backFaceCulling = false;
    ringTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    ring.material = ringMat;
  }

  private createSun(): Mesh {
    const glow = createGlowTexture(this.scene, 'sunGlow', [
      [0, 'rgba(255,255,250,1)'],
      [0.06, 'rgba(255,250,235,1)'],
      [0.14, 'rgba(255,220,170,0.55)'],
      [0.4, 'rgba(255,170,90,0.12)'],
      [1, 'rgba(255,140,60,0)'],
    ]);
    const sun = CreatePlane('sunBillboard', { size: 900 }, this.scene);
    sun.position = this.sunDirection.scale(4200);
    sun.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sun.renderingGroupId = BACKDROP_GROUP;
    sun.isPickable = false;
    const mat = new StandardMaterial('sunMat', this.scene);
    mat.emissiveTexture = glow;
    mat.opacityTexture = glow;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    sun.material = mat;
    if (this.quality.lensFlares) this.createFlares(sun);
    return sun;
  }

  private createFlares(emitter: Mesh): void {
    const url = (stops: [number, string][]): string => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      if (!ctx) return '';
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, col] of stops) g.addColorStop(o, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return c.toDataURL();
    };
    const soft = url([[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    const ring = url([[0, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,255,255,0.0)'], [0.85, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    const system = new LensFlareSystem('sunFlares', emitter, this.scene);
    system.borderLimit = 120;
    new LensFlare(0.25, 0, new Color3(1, 0.95, 0.85), soft, system);
    new LensFlare(0.06, 0.25, new Color3(0.5, 0.7, 1), soft, system);
    new LensFlare(0.12, 0.45, new Color3(0.9, 0.5, 1), ring, system);
    new LensFlare(0.04, 0.6, new Color3(1, 0.8, 0.4), soft, system);
    new LensFlare(0.18, 0.85, new Color3(0.4, 0.9, 0.8), ring, system);
    new LensFlare(0.08, 1.1, new Color3(0.7, 0.6, 1), soft, system);
    this.flares = system;
  }

  private createAsteroids(): TransformNode {
    const root = new TransformNode('asteroidBelt', this.scene);
    root.position = new Vector3(0, -90, 0);
    root.rotation = new Vector3(0.16, 0, 0.08);
    const mat = new PBRMaterial('rockMat', this.scene);
    mat.albedoTexture = createRockTexture(this.scene, 256);
    mat.metallic = 0.05;
    mat.roughness = 0.95;
    mat.albedoColor = new Color3(0.62, 0.6, 0.58);

    const rng = new Rng(77);
    const kinds = 3;
    const perKind = Math.ceil(this.quality.asteroids / kinds);
    for (let k = 0; k < kinds; k++) {
      const rock = createRock(this.scene, `rock${k}`, k * 13 + 5);
      rock.material = mat;
      rock.parent = root;
      rock.isPickable = false;
      rock.alwaysSelectAsActiveMesh = true;
      const buffer = new Float32Array(perKind * 16);
      const m = new Matrix();
      for (let i = 0; i < perKind; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const dist = 680 + Math.pow(rng.next(), 0.8) * 700;
        const y = rng.range(-1, 1) * rng.range(5, 45);
        const scale = Math.pow(rng.next(), 3) * 11 + 0.8;
        Matrix.ComposeToRef(
          new Vector3(scale, scale, scale),
          Quaternion.FromEulerAngles(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)),
          new Vector3(Math.cos(angle) * dist, y, Math.sin(angle) * dist),
          m,
        );
        m.copyToArray(buffer, i * 16);
      }
      rock.thinInstanceSetBuffer('matrix', buffer, 16, true);
      this.rocks.push(rock);
    }
    // A few large rocks drifting closer to the station for depth.
    const near: [number, number, number, number][] = [
      [-260, 40, -330, 14],
      [310, -70, 260, 18],
      [-380, -110, 210, 10],
      [190, 90, -420, 9],
    ];
    near.forEach(([x, y, z, s], i) => {
      const rock = createRock(this.scene, `nearRock${i}`, 40 + i * 9);
      rock.material = mat;
      rock.position = new Vector3(x, y, z);
      rock.scaling = new Vector3(s, s, s);
      rock.isPickable = false;
      rock.metadata = { spin: new Vector3(rng.range(-0.05, 0.05), rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)) };
      this.tumblers.push(rock);
    });
    return root;
  }

  /** Large rocks that should cast/receive shadows with the station. */
  get nearRocks(): readonly Mesh[] {
    return this.tumblers;
  }

  /** Called when the post-process pipeline toggles so shader output stays in the right colour space. */
  setLinearOutput(linear: boolean): void {
    for (const m of this.shaderMaterials) m.setFloat('uLinear', linear ? 1 : 0);
  }

  setLensFlaresEnabled(enabled: boolean): void {
    if (enabled && !this.flares) this.createFlares(this.sunBillboard);
    if (this.flares) this.flares.isEnabled = enabled;
  }

  update(dt: number, cameraPosition: Vector3): void {
    this.elapsed += dt;
    this.planetMaterial.setFloat('time', this.elapsed);
    for (const m of this.shaderMaterials) m.setVector3('camPos', cameraPosition);
    this.beltRoot.rotation.y += dt * 0.004;
    for (const rock of this.tumblers) {
      const spin = (rock.metadata as { spin: Vector3 }).spin;
      rock.rotation.addInPlace(spin.scale(dt));
    }
  }
}
