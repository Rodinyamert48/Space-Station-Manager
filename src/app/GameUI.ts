import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ModuleType } from '../data/modules';
import type { Game } from '../game/Game';
import { t } from '../i18n/i18n';
import type { UIContext } from '../ui/context';
import { h } from '../ui/dom';
import { BuildBar } from '../ui/hud/BuildBar';
import { BuildPanel } from '../ui/hud/BuildPanel';
import { ResourceStrip } from '../ui/hud/ResourceStrip';
import { icon } from '../ui/icons';
import type { UIManager } from '../ui/UIManager';
import { BuildWindow } from '../ui/windows/BuildWindow';
import { CrewWindow } from '../ui/windows/CrewWindow';
import { EconomyWindow } from '../ui/windows/EconomyWindow';
import { MarketWindow } from '../ui/windows/MarketWindow';
import { ModuleWindow } from '../ui/windows/ModuleWindow';
import { ResourcesWindow } from '../ui/windows/ResourcesWindow';
import { ShipsWindow } from '../ui/windows/ShipsWindow';
import { TradeWindow } from '../ui/windows/TradeWindow';
import type { TapEvent, World } from '../world/World';

/**
 * Wires the in-game HUD to the world: module selection, build mode, keyboard shortcuts and
 * camera focus. Lives for the whole session; re-binds when a new game starts.
 */
export class GameUI {
  private readonly buildPanel: BuildPanel;
  private readonly buildBar: BuildBar;
  private readonly buildWindow: BuildWindow;
  private readonly moduleWindow: ModuleWindow;
  private readonly shipsWindow: ShipsWindow;
  private readonly tradeWindow: TradeWindow;
  private selectedModule: number | null = null;
  private refreshTimer = 0;

  constructor(
    private readonly ui: UIManager,
    private readonly world: World,
    private readonly ctx: UIContext,
  ) {
    this.buildPanel = new BuildPanel(ctx, (type) => this.beginBuild(type));
    const sidebar = h('div', { class: 'panel build-dock' }, h('div', { class: 'panel-title' }, icon('build'), t('build.title')), this.buildPanel.el);
    ui.setLeftContent(sidebar);

    this.buildWindow = new BuildWindow(ctx, (type) => this.beginBuild(type));
    this.moduleWindow = new ModuleWindow(ctx, ui.overlayLayer, (id) => this.focusModule(id));
    ui.registerWindow(this.buildWindow);
    ui.registerWindow(this.moduleWindow);
    ui.registerWindow(new ResourcesWindow(ctx));
    this.shipsWindow = new ShipsWindow(ctx, { trade: (id) => this.openTrade(id), focus: (id) => this.focusShip(id) });
    this.tradeWindow = new TradeWindow(ctx);
    ui.registerWindow(this.shipsWindow);
    ui.registerWindow(this.tradeWindow);
    ui.registerWindow(new MarketWindow(ctx));
    ui.registerWindow(new EconomyWindow(ctx));
    ui.registerWindow(new CrewWindow(ctx, ui.overlayLayer, (id) => {
      this.selectModule(id);
      this.focusModule(id);
    }));

    this.buildBar = new BuildBar(ctx, {
      rotate: () => this.rotate(),
      confirm: () => this.confirmBuild(),
      cancel: () => this.cancelBuild(),
    });
    ui.mountBuildBar(this.buildBar.el);
    world.build.onChange = (preview) => {
      this.buildBar.update(preview);
      this.buildPanel.setSelected(preview?.type ?? null);
      this.buildWindow.panel.setSelected(preview?.type ?? null);
    };

    const strip = new ResourceStrip(ctx, () => ui.toggleWindow('resources'));
    ui.setStrip(strip.el, () => strip.refresh());
    ui.setNav(
      [
        { id: 'ships', icon: 'ship', label: () => t('ships.nav') },
        { id: 'market', icon: 'market', label: () => t('market.nav') },
        { id: 'crew', icon: 'crew', label: () => t('crew.nav') },
        { id: 'economy', icon: 'credits', label: () => t('eco.nav') },
      ],
      [
        { id: 'build', icon: 'build', label: () => t('hud.build') },
        { id: 'ships', icon: 'ship', label: () => t('ships.nav') },
        { id: 'market', icon: 'market', label: () => t('market.nav') },
        { id: 'crew', icon: 'crew', label: () => t('crew.nav') },
        { id: 'economy', icon: 'credits', label: () => t('eco.nav') },
        { id: 'resources', icon: 'energy', label: () => t('hud.resources') },
      ],
    );
    ui.focusNotice = (n) => {
      if (n.moduleId) {
        this.selectModule(n.moduleId);
        this.focusModule(n.moduleId);
      } else if (n.shipId && this.ctx.game()?.ships.get(n.shipId)) {
        this.showShip(n.shipId);
      }
    };

    world.onTap((e) => this.onTap(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  bind(game: Game): void {
    this.cancelBuild();
    this.selectModule(null);
    this.buildPanel.rebuild();
    this.ui.track(game.bus.on('moduleRemoved', ({ module }) => {
      if (module.id === this.selectedModule) this.selectModule(null);
    }));
  }

  update(dt: number): void {
    this.refreshTimer += dt;
    if (this.refreshTimer < 0.25) return;
    this.refreshTimer = 0;
    this.buildPanel.refresh();
    this.buildBar.refresh();
    const game = this.ctx.game();
    if (game) {
      const pending = game.ships.list.filter((s) => s.status === 'pending').length;
      this.ui.setBadge('ships', pending);
    }
  }

  private openTrade(id: number): void {
    this.tradeWindow.setShip(id);
    this.ui.openWindow('trade');
  }

  private focusShip(id: number): void {
    const pos = this.world.ships.shipPosition(id);
    if (pos) this.world.camera.flyTo(pos, { radius: 40 });
  }

  /** Opens traffic control with a ship highlighted and frames it. */
  private showShip(id: number): void {
    this.selectModule(null);
    this.shipsWindow.highlightId = id;
    this.ui.openWindow('ships');
    this.focusShip(id);
  }

  private beginBuild(type: ModuleType): void {
    this.selectModule(null);
    if (this.ui.layout === 'mobile') this.ui.closeWindow();
    this.world.build.begin(type);
  }

  private rotate(): void {
    this.ctx.playSound('click');
    this.world.build.rotate();
  }

  private confirmBuild(): void {
    const game = this.ctx.game();
    const result = this.world.build.confirm();
    if (!result || !game) return;
    if (result.ok) this.ctx.playSound('build');
    else {
      this.ctx.playSound('error');
      game.notify('warning', `build.error.${result.reason}`);
    }
  }

  private cancelBuild(): void {
    if (this.world.build.active) this.world.build.end();
  }

  private onTap(e: TapEvent): void {
    if (this.world.build.active) {
      const pick = this.world.pick(e.x, e.y, (m) => this.world.build.isMarker(m));
      if (this.world.build.select(pick?.pickedMesh ?? null)) this.confirmBuild();
      else if (pick?.pickedMesh) this.ctx.playSound('click');
      return;
    }
    const shipId = this.world.ships.shipIdFromNode(e.pick?.pickedMesh ?? null);
    if (shipId !== null) {
      this.ctx.playSound('click');
      this.showShip(shipId);
      return;
    }
    const id = this.world.station.moduleIdFromMesh(e.pick?.pickedMesh ?? null);
    this.selectModule(id);
    if (id !== null) this.ctx.playSound('click');
  }

  selectModule(id: number | null): void {
    this.selectedModule = id;
    const pos = id !== null ? this.world.station.modulePosition(id) : null;
    if (id === null || !pos) {
      this.world.selection.hide();
      if (this.ui.activeWindowId === 'module') this.ui.closeWindow();
      return;
    }
    this.world.selection.show(pos);
    this.moduleWindow.setModule(id);
    this.ui.openWindow('module');
  }

  focusModule(id: number): void {
    const pos = this.world.station.modulePosition(id);
    if (pos) this.world.camera.flyTo(pos, { radius: 38 });
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const game = this.ctx.game();
    if (!game || this.ui.overlayLayer.childElementCount > 0) return;
    if (this.world.build.active) {
      if (e.code === 'KeyR') this.rotate();
      else if (e.code === 'Enter') this.confirmBuild();
      else if (e.code === 'Escape' && !this.ui.activeWindowId) this.cancelBuild();
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        game.setSpeed(game.speed === 0 ? 1 : 0);
        break;
      case 'Digit1':
        game.setSpeed(1);
        break;
      case 'Digit2':
        game.setSpeed(2);
        break;
      case 'Digit3':
        game.setSpeed(4);
        break;
      case 'Escape':
        if (!this.ui.activeWindowId) this.selectModule(null);
        break;
      case 'KeyH':
        this.world.camera.flyTo(Vector3.Zero(), { radius: 62 });
        break;
    }
  }
}
