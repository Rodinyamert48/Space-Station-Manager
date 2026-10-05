import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import type { ArcRotateCameraPointersInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import type { ArcRotateCameraMouseWheelInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { clamp, easeInOutCubic, lerp } from '../core/math';

interface CameraTween {
  from: { alpha: number; beta: number; radius: number; target: Vector3 };
  to: { alpha: number; beta: number; radius: number; target: Vector3 };
  duration: number;
  elapsed: number;
  done?: () => void;
}

/** Default framing: three-quarter view from the sunlit side with the planet below. */
export const DEFAULT_VIEW = { alpha: -0.15, beta: 1.12, radius: 62 };

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Orbit camera around the station. Mouse: left-drag orbit, right-drag pan, wheel zoom.
 * Touch: one finger orbit, pinch zoom, two-finger drag pan. Keyboard: WASD/arrows pan,
 * Q/E orbit, +/- zoom.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  private readonly keys = new Set<string>();
  private tween: CameraTween | null = null;
  private sensitivity = 1;
  private stationRadius = 30;
  private idleOrbit = 0;
  private shakeAmount = 0;
  private readonly shakeOffset = new Vector3();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e)) return;
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private readonly onBlur = (): void => this.keys.clear();

  constructor(
    scene: Scene,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const cam = new ArcRotateCamera('camera', DEFAULT_VIEW.alpha, DEFAULT_VIEW.beta, DEFAULT_VIEW.radius, Vector3.Zero(), scene);
    cam.minZ = 0.5;
    cam.maxZ = 12000;
    cam.fov = 0.9;
    cam.lowerRadiusLimit = 14;
    cam.upperRadiusLimit = 260;
    cam.lowerBetaLimit = 0.08;
    cam.upperBetaLimit = Math.PI - 0.08;
    cam.inertia = 0.88;
    cam.panningInertia = 0.85;
    cam.wheelDeltaPercentage = 0.012;
    cam.panningAxis = new Vector3(1, 1, 0);
    cam.mapPanning = false;
    cam.attachControl(canvas, true, false);
    const pointers = cam.inputs.attached['pointers'] as ArcRotateCameraPointersInput | undefined;
    if (pointers) {
      pointers.multiTouchPanning = true;
      pointers.multiTouchPanAndZoom = true;
      pointers.pinchZoom = true;
      pointers.pinchDeltaPercentage = 0.0045;
      pointers.useNaturalPinchZoom = false;
    }
    this.camera = cam;
    this.applySensitivity();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  setSensitivity(value: number): void {
    this.sensitivity = clamp(value, 0.3, 3);
    this.applySensitivity();
  }

  private applySensitivity(): void {
    const s = this.sensitivity;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.camera.angularSensibilityX = (coarse ? 900 : 1400) / s;
    this.camera.angularSensibilityY = (coarse ? 900 : 1400) / s;
    this.camera.panningSensibility = (coarse ? 55 : 90) / s;
    const wheel = this.camera.inputs.attached['mousewheel'] as ArcRotateCameraMouseWheelInput | undefined;
    if (wheel) wheel.wheelDeltaPercentage = 0.012 * s;
    const pointers = this.camera.inputs.attached['pointers'] as ArcRotateCameraPointersInput | undefined;
    if (pointers) pointers.pinchDeltaPercentage = 0.0045 * s;
  }

  /** Expands zoom/pan limits as the station grows. */
  setStationRadius(radius: number): void {
    this.stationRadius = Math.max(20, radius);
    this.camera.upperRadiusLimit = Math.max(160, this.stationRadius * 4.2);
  }

  setInputEnabled(enabled: boolean): void {
    if (enabled) this.camera.attachControl(this.canvas, true, false);
    else this.camera.detachControl();
  }

  /** Shifts the framing so the station sits to the right of a left-aligned menu. */
  setMenuFraming(enabled: boolean): void {
    this.camera.targetScreenOffset = enabled ? new Vector2(30, -6) : Vector2.Zero();
  }

  /** Slow automatic orbit (main menu background). Zero disables it. */
  setIdleOrbit(speed: number): void {
    this.idleOrbit = speed;
  }

  get busy(): boolean {
    return this.tween !== null;
  }

  flyTo(target: Vector3, opts: { radius?: number; alpha?: number; beta?: number; duration?: number; done?: () => void } = {}): void {
    const cam = this.camera;
    // Take the shortest way around when changing the orbit angle.
    let toAlpha = opts.alpha ?? cam.alpha;
    while (toAlpha - cam.alpha > Math.PI) toAlpha -= Math.PI * 2;
    while (toAlpha - cam.alpha < -Math.PI) toAlpha += Math.PI * 2;
    this.tween = {
      from: { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() },
      to: {
        alpha: toAlpha,
        beta: opts.beta ?? cam.beta,
        radius: clamp(opts.radius ?? cam.radius, cam.lowerRadiusLimit ?? 1, cam.upperRadiusLimit ?? 1e4),
        target: target.clone(),
      },
      duration: opts.duration ?? 0.9,
      elapsed: 0,
      done: opts.done,
    };
  }

  /** Cinematic approach used when a new campaign starts. */
  playIntro(done: () => void): void {
    const cam = this.camera;
    cam.alpha = DEFAULT_VIEW.alpha + 1.6;
    cam.beta = 1.4;
    cam.radius = cam.upperRadiusLimit ?? 260;
    cam.target = new Vector3(0, 0, 0);
    this.flyTo(Vector3.Zero(), { ...DEFAULT_VIEW, duration: 5.5, done });
  }

  /** Brief camera shake for impacts and explosions (0..1). */
  shake(intensity: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, intensity);
  }

  cancelTween(): void {
    this.tween = null;
  }

  update(dt: number): void {
    const cam = this.camera;
    // Undo last frame's shake offset before applying input and tweens.
    cam.target.subtractInPlace(this.shakeOffset);
    this.shakeOffset.setAll(0);
    if (this.shakeAmount > 0.001) {
      const s = this.shakeAmount * cam.radius * 0.012;
      this.shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shakeAmount *= Math.exp(-dt * 5);
    }
    this.applyMotion(dt);
    cam.target.addInPlace(this.shakeOffset);
  }

  private applyMotion(dt: number): void {
    const cam = this.camera;
    if (this.tween) {
      const tw = this.tween;
      tw.elapsed += dt;
      const t = easeInOutCubic(Math.min(1, tw.elapsed / tw.duration));
      cam.alpha = lerp(tw.from.alpha, tw.to.alpha, t);
      cam.beta = lerp(tw.from.beta, tw.to.beta, t);
      cam.radius = lerp(tw.from.radius, tw.to.radius, t);
      cam.target = Vector3.Lerp(tw.from.target, tw.to.target, t);
      if (tw.elapsed >= tw.duration) {
        this.tween = null;
        tw.done?.();
      }
      return;
    }
    if (this.idleOrbit !== 0) cam.alpha += this.idleOrbit * dt;

    let px = 0;
    let pz = 0;
    for (const code of this.keys) {
      const k = PAN_KEYS[code];
      if (k) {
        px += k[0];
        pz += k[1];
      }
    }
    const speed = cam.radius * 0.9 * dt * this.sensitivity;
    if (px !== 0 || pz !== 0) {
      // Pan on the horizontal plane relative to where the camera is looking.
      const forward = cam.target.subtract(cam.position);
      forward.y = 0;
      forward.normalize();
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();
      cam.target.addInPlace(right.scale(px * speed).add(forward.scale(pz * speed)));
    }
    if (this.keys.has('KeyQ')) cam.alpha += 1.4 * dt * this.sensitivity;
    if (this.keys.has('KeyE')) cam.alpha -= 1.4 * dt * this.sensitivity;
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) cam.radius = Math.max(cam.lowerRadiusLimit ?? 1, cam.radius * (1 - dt * 1.5));
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) cam.radius = Math.min(cam.upperRadiusLimit ?? 1e4, cam.radius * (1 + dt * 1.5));

    // Keep the focus point near the station so players cannot get lost in space.
    const limit = this.stationRadius * 1.4 + 20;
    const t = cam.target;
    const len = t.length();
    if (len > limit) t.scaleInPlace(limit / len);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.camera.dispose();
  }
}
