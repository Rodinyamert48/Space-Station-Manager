import type { ModuleType } from '../../data/modules';
import type { UIContext } from '../context';
import { BuildPanel } from '../hud/BuildPanel';
import { GameWindow } from './Window';

/** Module catalogue as a bottom sheet (mobile layout). */
export class BuildWindow extends GameWindow {
  readonly panel: BuildPanel;

  constructor(ctx: UIContext, onSelect: (type: ModuleType) => void) {
    super('build', 'build.title', 'build');
    this.panel = new BuildPanel(ctx, onSelect);
    this.body.append(this.panel.el);
  }

  rebuild(): void {
    this.panel.rebuild();
  }

  override refresh(): void {
    this.panel.refresh();
  }
}
