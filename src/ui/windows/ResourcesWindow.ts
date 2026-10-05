import type { UIContext } from '../context';
import { ResourcePanel } from '../hud/ResourcePanel';
import { GameWindow } from './Window';

/** Full resource list as a sheet (used by the mobile layout). */
export class ResourcesWindow extends GameWindow {
  private readonly panel: ResourcePanel;

  constructor(ctx: UIContext) {
    super('resources', 'hud.resources', 'energy');
    this.panel = new ResourcePanel(ctx);
    this.body.append(this.panel.el);
  }

  rebuild(): void {
    this.panel.rebuild();
  }

  override refresh(): void {
    this.panel.refresh();
  }
}
