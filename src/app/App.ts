import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Game } from '../game/Game';
import { createNewGameState } from '../game/newGame';
import { setLanguage } from '../i18n/i18n';
import { SettingsStore, defaultSettings } from '../settings/Settings';
import type { SoundId, UIContext } from '../ui/context';
import { UIManager } from '../ui/UIManager';
import { World } from '../world/World';
import { GameUI } from './GameUI';

/** Top-level application: owns the 3D world, the active game session and the UI. */
export class App {
  private world: World | null = null;
  private game: Game | null = null;
  private ui: UIManager | null = null;
  private gameUI: GameUI | null = null;
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
    this.gameUI = new GameUI(ui, world, ctx);

    world.onFrame((dt) => {
      this.game?.update(dt);
      ui.update(dt, this.game?.economy.netToday() ?? 0);
      this.gameUI?.update(dt);
    });
    world.start();
    this.startGame(new Game(createNewGameState()));
    await new Promise<void>((resolve) => world.scene.executeWhenReady(() => resolve()));
    document.getElementById('boot')?.classList.add('hidden');
    if (import.meta.env.DEV) {
      // Development handle for automated browser tests.
      (window as unknown as { __ssm: unknown }).__ssm = {
        app: this,
        world,
        game: () => this.game,
        project: (x: number, y: number, z: number) => {
          const engine = world.engine;
          const p = Vector3.Project(
            new Vector3(x, y, z),
            Matrix.Identity(),
            world.scene.getTransformMatrix(),
            world.camera.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
          );
          const rect = this.canvas.getBoundingClientRect();
          const scale = rect.width / engine.getRenderWidth();
          return { x: rect.left + p.x * scale, y: rect.top + p.y * scale };
        },
      };
    }
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

  private startGame(game: Game): void {
    this.game = game;
    this.world?.attachGame(game);
    this.ui?.bindGame(game);
    this.gameUI?.bind(game);
    this.ui?.showHud(true);
  }
}
