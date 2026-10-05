import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { MODULES, type ModuleType } from '../data/modules';
import type { ShipTypeId } from '../data/ships';
import { DETAIL_SLOTS, type MaterialLibrary, type Slot } from './Materials';
import { buildModuleModels, type ModelLibraryParts } from './models/ModuleModels';
import { buildShipModels } from './models/ShipModels';
import type { V3 } from './models/ModelKit';

export interface Template {
  meshes: Mesh[];
}

export interface ShipTemplate extends Template {
  length: number;
  engines: V3[];
  engineColor: string;
}

export interface ModuleTemplate {
  base: Template;
  rotor?: Template;
  rotorPivot?: V3;
  top: number;
}

/**
 * Hidden source meshes for every procedural model. Views place `InstancedMesh` copies of these,
 * so each module type costs one draw call per material no matter how many are built.
 */
export class ModelLibrary {
  readonly modules: Record<ModuleType, ModuleTemplate>;
  readonly connector: Template;
  readonly hatch: Template;
  readonly scaffold: Template;
  readonly ships: Record<ShipTypeId, ShipTemplate>;
  private readonly allSources: Mesh[] = [];

  constructor(
    scene: Scene,
    private readonly materials: MaterialLibrary,
    detailDistance: number,
  ) {
    const parts: ModelLibraryParts = buildModuleModels(scene);
    const modules = {} as Record<ModuleType, ModuleTemplate>;
    for (const type of Object.keys(parts.modules) as ModuleType[]) {
      const p = parts.modules[type];
      const accent = MODULES[type].accent;
      modules[type] = {
        base: this.prepare(p.base, accent, detailDistance),
        rotor: p.rotor ? this.prepare(p.rotor, accent, detailDistance) : undefined,
        rotorPivot: p.rotorPivot,
        top: p.top,
      };
    }
    this.modules = modules;
    this.connector = this.prepare(parts.connector, '#7fd8ff', detailDistance);
    this.hatch = this.prepare(parts.hatch, '#5fd8ff', detailDistance);
    this.scaffold = this.prepare(parts.scaffold, '#ffb347', detailDistance);
    const ships = {} as Record<ShipTypeId, ShipTemplate>;
    for (const [type, p] of Object.entries(buildShipModels(scene)) as [ShipTypeId, ReturnType<typeof buildShipModels>[ShipTypeId]][]) {
      ships[type] = { ...this.prepare(p.parts, p.engineColor, detailDistance * 1.5), length: p.length, engines: p.engines, engineColor: p.engineColor };
    }
    this.ships = ships;
  }

  private prepare(map: Map<Slot, Mesh>, accent: string, detailDistance: number): Template {
    const meshes: Mesh[] = [];
    for (const [slot, mesh] of map) {
      mesh.material = this.materials.get(slot, accent);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.receiveShadows = slot !== 'glass' && slot !== 'windows' && !slot.startsWith('light') && slot !== 'accent';
      mesh.metadata = { slot };
      if (DETAIL_SLOTS.has(slot)) mesh.addLODLevel(detailDistance, null);
      meshes.push(mesh);
      this.allSources.push(mesh);
    }
    return { meshes };
  }

  /** Creates instances of a template under `parent`. */
  instantiate(template: Template, parent: TransformNode, name: string, pickable = false): InstancedMesh[] {
    return template.meshes.map((src) => {
      const inst = src.createInstance(`${name}-${src.name}`);
      inst.parent = parent;
      inst.isPickable = pickable;
      return inst;
    });
  }

  /** Non-instanced clones used for the build-mode ghost, all with one override material. */
  cloneTemplate(template: Template, parent: TransformNode, name: string): Mesh[] {
    return template.meshes.map((src) => {
      const clone = src.clone(`${name}-${src.name}`, parent, true, false);
      if (!clone) throw new Error('Clone failed');
      clone.isVisible = true;
      clone.isPickable = false;
      clone.receiveShadows = false;
      return clone;
    });
  }

  get sources(): readonly Mesh[] {
    return this.allSources;
  }
}
