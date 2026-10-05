import { Game } from '../game/Game';
import { createNewGameState } from '../game/newGame';
import { setLanguage, t } from '../i18n/i18n';
import { SettingsStore, defaultSettings } from '../settings/Settings';
import type { SoundId, UIContext } from '../ui/context';
import { ResourceStrip } from '../ui/hud/ResourceStrip';
import { UIManager } from '../ui/UIManager';
import { ResourcesWindow } from '../ui/windows/ResourcesWindow';
import { World } from '../world/World';

/** Top-level application: owns the 3D world, the active game session and the UI. */
export class App {
  private world: World | null = null;
  private game: Game | null = null;
  private ui: UIManager | null = null;
  readonly settings = new SettingsStore(defaultSettings());

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {}

  async boot(): Promise<void> {
    setLanguage(this.settings.current.language);
    const world = new World(this.canvas, this.settings.current);
    this.world = world;
    const ctx = this.createContext(world);
    const ui = new UIManager(this.uiRoot, ctx);
    this.ui = ui;
    this.uiRoot.dataset.quality = this.settings.current.quality;
    this.setupHud(ui, ctx);

    world.onFrame((dt) => {
      this.game?.update(dt);
      ui.update(dt);
    });
    world.start();
    this.startGame(new Game(createNewGameState()));
    await new Promise<void>((resolve) => world.scene.executeWhenReady(() => resolve()));
    document.getElementById('boot')?.classList.add('hidden');
    if (import.meta.env.DEV) (window as unknown as { __ssm: unknown }).__ssm = { app: this, world, game: () => this.game };
  }

  private createContext(world: World): UIContext {
    return {
      world,
      settings: this.settings,
      game: () => this.game,
      playSound: (_id: SoundId) => undefined,
      openMainMenu: () => undefined,
      saveGame: () => undefined,
    };
  }

  private setupHud(ui: UIManager, ctx: UIContext): void {
    ui.registerWindow(new ResourcesWindow(ctx));
    const strip = new ResourceStrip(ctx, () => ui.toggleWindow('resources'));
    ui.setStrip(strip.el, () => strip.refresh());
    ui.setNav([], [{ id: 'resources', icon: 'energy', label: () => t('hud.resources') }]);
  }

  private startGame(game: Game): void {
    this.game = game;
    this.world?.attachGame(game);
    this.ui?.bindGame(game);
    this.ui?.showHud(true);
  }
}
