import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { ModelKit, type V3 } from './models/ModelKit';

/** Pulsing corner brackets around the selected module. */
export class SelectionMarker {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private time = 0;

  constructor(scene: Scene) {
    const kit = new ModelKit(scene, 'selection');
    const s = 5.6;
    const l = 1.6;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const c: V3 = [x * s, y * s, z * s];
          kit.beam({ slot: 'accent', from: c, to: [c[0] - x * l, c[1], c[2]], w: 0.16 });
          kit.beam({ slot: 'accent', from: c, to: [c[0], c[1] - y * l, c[2]], w: 0.16 });
          kit.beam({ slot: 'accent', from: c, to: [c[0], c[1], c[2] - z * l], w: 0.16 });
        }
    const built = [...kit.build().values()][0];
    if (!built) throw new Error('Selection marker failed to build');
    this.mesh = built;
    this.material = new StandardMaterial('selectionMat', scene);
    this.material.disableLighting = true;
    this.material.emissiveColor = new Color3(0.4, 0.9, 1);
    this.material.alphaMode = Constants.ALPHA_ADD;
    this.material.alpha = 0.9;
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.setEnabled(false);
  }

  show(position: Vector3, scale = 1): void {
    this.mesh.position.copyFrom(position);
    this.mesh.scaling.setAll(scale);
    this.mesh.setEnabled(true);
  }

  hide(): void {
    this.mesh.setEnabled(false);
  }

  update(dt: number): void {
    if (!this.mesh.isEnabled()) return;
    this.time += dt;
    this.material.alpha = 0.55 + 0.35 * Math.sin(this.time * 4);
  }
}
