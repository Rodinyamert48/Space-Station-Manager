import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';

interface Label {
  rect: Rectangle;
  text: TextBlock;
  node: TransformNode;
}

/**
 * World-anchored labels (module alerts, ship names) drawn with Babylon GUI on a full-screen
 * texture so they follow 3D objects without DOM layout work.
 */
export class WorldLabels {
  private readonly adt: AdvancedDynamicTexture;
  private readonly labels = new Map<string, Label>();
  private scale = 1;

  constructor(
    scene: Scene,
    private readonly engine: Engine,
  ) {
    this.adt = AdvancedDynamicTexture.CreateFullscreenUI('worldLabels', true, scene);
    this.adt.isForeground = true;
    this.updateScale();
  }

  /** Keeps label sizes constant in CSS pixels regardless of render resolution. */
  updateScale(): void {
    const canvas = this.engine.getRenderingCanvas();
    const css = canvas?.clientWidth || this.engine.getRenderWidth();
    const next = this.engine.getRenderWidth() / Math.max(1, css);
    if (Math.abs(next - this.scale) < 0.01) return;
    this.scale = next;
    for (const l of this.labels.values()) this.style(l.rect, l.text, l.text.color, Number(l.rect.metadata ?? 0));
  }

  private style(rect: Rectangle, text: TextBlock, color: string, offsetY: number): void {
    const s = this.scale;
    text.fontSize = 12 * s;
    rect.height = `${22 * s}px`;
    rect.paddingLeft = `${8 * s}px`;
    rect.paddingRight = `${8 * s}px`;
    rect.cornerRadius = 6 * s;
    rect.thickness = 1 * s;
    rect.linkOffsetY = offsetY * s;
    rect.color = color;
    text.color = color;
    rect.metadata = offsetY;
  }

  set(key: string, node: TransformNode, content: string, color: string, offsetY = -40): void {
    let label = this.labels.get(key);
    if (!label) {
      const rect = new Rectangle(`label-${key}`);
      rect.adaptWidthToChildren = true;
      rect.background = 'rgba(6, 12, 20, 0.82)';
      rect.isPointerBlocker = false;
      const text = new TextBlock(`label-${key}-text`, content);
      text.fontFamily = 'Rajdhani, system-ui, sans-serif';
      text.fontWeight = '700';
      text.resizeToFit = true;
      rect.addControl(text);
      this.adt.addControl(rect);
      rect.linkWithMesh(node);
      label = { rect, text, node };
      this.labels.set(key, label);
    } else if (label.node !== node) {
      label.rect.linkWithMesh(node);
      label.node = node;
    }
    if (label.text.text !== content) label.text.text = content;
    this.style(label.rect, label.text, color, offsetY);
  }

  remove(key: string): void {
    const label = this.labels.get(key);
    if (!label) return;
    label.rect.dispose();
    this.labels.delete(key);
  }

  /** Removes every label whose key starts with `prefix` and is not in `keep`. */
  prune(prefix: string, keep: Set<string>): void {
    for (const key of [...this.labels.keys()]) if (key.startsWith(prefix) && !keep.has(key)) this.remove(key);
  }

  setVisible(visible: boolean): void {
    this.adt.rootContainer.isVisible = visible;
  }
}
