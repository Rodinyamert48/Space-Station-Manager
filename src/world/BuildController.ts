import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { CELL_SIZE, cellKey, sameCell, type Rotation, type Vec3i } from '../data/grid';
import { MODULES, type ModuleType } from '../data/modules';
import type { BuildError, Game } from '../game/Game';
import { ModelKit } from './models/ModelKit';
import type { ModelLibrary } from './ModelLibrary';
import { cellToWorld } from './StationView';

export interface BuildPreview {
  type: ModuleType;
  cell: Vec3i | null;
  rotation: Rotation;
  /** Placement problem at the selected cell, or 'cost' when only resources are missing. */
  error: BuildError | null;
  snapCount: number;
}

interface Marker {
  cell: Vec3i;
  node: TransformNode;
  pickBox: Mesh;
}

/**
 * Build mode in the 3D world: shows connection points where the selected module fits, a
 * holographic preview that can be rotated, and the clearance it needs.
 */
export class BuildController {
  private type: ModuleType | null = null;
  private cell: Vec3i | null = null;
  private rotation: Rotation = 0;
  private markers: Marker[] = [];
  private ghost: TransformNode | null = null;
  private ghostMeshes: Mesh[] = [];
  private clearance: Mesh[] = [];
  private readonly markerTemplate: Mesh[];
  private readonly ghostValid: StandardMaterial;
  private readonly ghostInvalid: StandardMaterial;
  private readonly markerMat: StandardMaterial;
  private readonly clearanceMat: StandardMaterial;
  private time = 0;
  onChange: ((preview: BuildPreview | null) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly models: ModelLibrary,
    private readonly game: () => Game | null,
    private readonly excludeFromGlow: (mesh: Mesh) => void,
  ) {
    const holo = (name: string, color: Color3, alpha: number): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.disableLighting = true;
      m.emissiveColor = color;
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.alpha = alpha;
      m.alphaMode = Constants.ALPHA_ADD;
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
      return m;
    };
    this.ghostValid = holo('ghostValid', new Color3(0.12, 0.42, 0.62), 0.5);
    this.ghostInvalid = holo('ghostInvalid', new Color3(0.7, 0.14, 0.1), 0.5);
    this.markerMat = holo('buildMarker', new Color3(0.35, 0.9, 1), 0.9);
    this.clearanceMat = holo('buildClearance', new Color3(1, 0.7, 0.2), 0.12);

    const kit = new ModelKit(scene, 'buildMarker');
    const h = 2.6;
    for (const a of [-h, h])
      for (const b of [-h, h]) {
        kit.beam({ slot: 'accent', from: [-h, a, b], to: [h, a, b], w: 0.12 });
        kit.beam({ slot: 'accent', from: [a, -h, b], to: [a, h, b], w: 0.12 });
        kit.beam({ slot: 'accent', from: [a, b, -h], to: [a, b, h], w: 0.12 });
      }
    kit.sphere({ slot: 'accent', d: 1.1, seg: 6 });
    this.markerTemplate = [...kit.build().values()];
    for (const m of this.markerTemplate) {
      m.material = this.markerMat;
      m.isVisible = false;
      m.isPickable = false;
    }
  }

  get active(): boolean {
    return this.type !== null;
  }

  get selectedType(): ModuleType | null {
    return this.type;
  }

  begin(type: ModuleType): void {
    this.end(false);
    this.type = type;
    this.rotation = 0;
    this.cell = null;
    this.rebuildMarkers();
    this.emit();
  }

  end(emit = true): void {
    this.type = null;
    this.cell = null;
    this.clearMarkers();
    this.clearGhost();
    if (emit) this.onChange?.(null);
  }

  /** Recomputes markers after the layout or resources change. */
  refresh(): void {
    if (!this.type) return;
    this.rebuildMarkers();
    if (this.cell && !this.markers.some((m) => sameCell(m.cell, this.cell as Vec3i))) {
      this.cell = null;
      this.clearGhost();
    } else if (this.cell) this.placeGhost();
    this.emit();
  }

  private clearMarkers(): void {
    for (const m of this.markers) m.node.dispose();
    this.markers = [];
  }

  private rebuildMarkers(): void {
    this.clearMarkers();
    const game = this.game();
    if (!game || !this.type) return;
    for (const cell of game.station.snapCells(this.type)) {
      const node = new TransformNode(`marker-${cellKey(cell)}`, this.scene);
      cellToWorld(cell, node.position);
      for (const src of this.markerTemplate) {
        const inst = src.createInstance(`${node.name}-${src.name}`);
        inst.parent = node;
        inst.isPickable = false;
      }
      const pickBox = CreateBox(`${node.name}-pick`, { size: CELL_SIZE * 0.7 }, this.scene);
      pickBox.parent = node;
      pickBox.metadata = { buildCell: cell };
      pickBox.isPickable = true;
      // Invisible but pickable through the build-mode pick predicate.
      pickBox.isVisible = false;
      this.markers.push({ cell, node, pickBox });
    }
  }

  isMarker(mesh: AbstractMesh): boolean {
    return !!(mesh.metadata as { buildCell?: Vec3i } | null)?.buildCell;
  }

  /** Selects a connection point. Returns true when the same point was selected twice. */
  select(mesh: AbstractMesh | null): boolean {
    const cell = (mesh?.metadata as { buildCell?: Vec3i } | null)?.buildCell;
    if (!cell || !this.type) return false;
    const repeat = !!this.cell && sameCell(cell, this.cell);
    if (!repeat) this.setCell(cell);
    return repeat;
  }

  /** Desktop hover preview. */
  hover(mesh: AbstractMesh | null): void {
    const cell = (mesh?.metadata as { buildCell?: Vec3i } | null)?.buildCell;
    if (cell && (!this.cell || !sameCell(cell, this.cell))) this.setCell(cell);
  }

  private setCell(cell: Vec3i): void {
    const game = this.game();
    if (!game || !this.type) return;
    this.cell = { ...cell };
    const valid = game.station.validRotations(this.type, cell);
    if (!valid.includes(this.rotation) && valid.length > 0) this.rotation = valid[0] as Rotation;
    this.placeGhost();
    this.emit();
  }

  rotate(): void {
    const game = this.game();
    if (!game || !this.type) return;
    if (!this.cell) {
      this.rotation = ((this.rotation + 1) % 4) as Rotation;
      this.emit();
      return;
    }
    const valid = game.station.validRotations(this.type, this.cell);
    if (valid.length === 0) return;
    const idx = valid.indexOf(this.rotation);
    this.rotation = valid[(idx + 1) % valid.length] as Rotation;
    this.placeGhost();
    this.emit();
  }

  preview(): BuildPreview | null {
    if (!this.type) return null;
    return { type: this.type, cell: this.cell, rotation: this.rotation, error: this.error(), snapCount: this.markers.length };
  }

  private error(): BuildError | null {
    const game = this.game();
    if (!game || !this.type || !this.cell) return null;
    const check = game.station.checkPlacement(this.type, this.cell, this.rotation);
    if (!check.ok) return check.reason ?? 'noConnection';
    if (!game.resources.canAfford(MODULES[this.type].cost)) return 'cost';
    return null;
  }

  /** Attempts to build at the selected point. */
  confirm(): ReturnType<Game['buildModule']> | null {
    const game = this.game();
    if (!game || !this.type || !this.cell) return null;
    const result = game.buildModule(this.type, this.cell, this.rotation);
    if (result.ok) {
      this.cell = null;
      this.clearGhost();
      this.rebuildMarkers();
      this.emit();
    }
    return result;
  }

  private clearGhost(): void {
    this.ghost?.dispose();
    this.ghost = null;
    this.ghostMeshes = [];
    for (const c of this.clearance) c.dispose();
    this.clearance = [];
  }

  private placeGhost(): void {
    const game = this.game();
    if (!game || !this.type || !this.cell) return;
    if (!this.ghost || (this.ghost.metadata as { type?: ModuleType }).type !== this.type) {
      this.clearGhost();
      this.ghost = new TransformNode('buildGhost', this.scene);
      this.ghost.metadata = { type: this.type };
      const template = this.models.modules[this.type];
      const body = new TransformNode('buildGhostBody', this.scene);
      body.parent = this.ghost;
      this.ghostMeshes = this.models.cloneTemplate(template.base, body, 'ghost');
      if (template.rotor && template.rotorPivot) {
        const rotor = new TransformNode('buildGhostRotor', this.scene);
        rotor.parent = body;
        rotor.position.set(...template.rotorPivot);
        this.ghostMeshes.push(...this.models.cloneTemplate(template.rotor, rotor, 'ghostRotor'));
      }
      for (const m of this.ghostMeshes) this.excludeFromGlow(m);
    }
    cellToWorld(this.cell, this.ghost.position);
    this.ghost.rotation.y = (this.rotation * Math.PI) / 2;
    const mat = this.error() ? this.ghostInvalid : this.ghostValid;
    for (const m of this.ghostMeshes) m.material = mat;

    for (const c of this.clearance) c.dispose();
    this.clearance = game.station.reserveCells(this.type, this.cell, this.rotation).map((r, i) => {
      const box = CreateBox(`clearance-${i}`, { size: CELL_SIZE * 0.9 }, this.scene);
      cellToWorld(r, box.position);
      box.material = this.clearanceMat;
      box.isPickable = false;
      this.excludeFromGlow(box);
      return box;
    });
  }

  private emit(): void {
    this.onChange?.(this.preview());
  }

  update(dt: number): void {
    if (!this.type) return;
    this.time += dt;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
    this.markerMat.alpha = 0.55 + 0.4 * pulse;
    for (const m of this.markers) {
      const selected = this.cell && sameCell(m.cell, this.cell);
      m.node.scaling.setAll(selected ? 0.5 : 0.85 + 0.08 * pulse);
    }
    const ghostAlpha = 0.35 + 0.12 * Math.sin(this.time * 3);
    this.ghostValid.alpha = ghostAlpha;
    this.ghostInvalid.alpha = ghostAlpha;
  }
}
