import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AudioManager } from '../audio/AudioManager';
import { Game } from '../game/Game';
import { createNewGameState } from '../game/newGame';
import { createShowcaseGame } from '../game/showcase';
import type { GameSpeed } from '../game/state';
import { setLanguage, t } from '../i18n/i18n';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageBackend, MemoryBackend } from '../save/StorageBackend';
import { SettingsStore, defaultSettings, type Settings } from '../settings/Settings';
import type { SoundId, UIContext } from '../ui/context';
import { confirmDialog } from '../ui/Dialog';
import { Menus } from '../ui/menus/Menus';
import { UIManager } from '../ui/UIManager';
import { DEFAULT_VIEW } from '../world/CameraController';
import { World } from '../world/World';
import { GameUI } from './GameUI';

const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Top-level application: owns the 3D world, the active game session, menus, audio and
 * persistence, and moves between the title screen and play.
 */
export class App {
  private world!: World;
  private ui!: UIManager;
  private gameUI!: GameUI;
  private menus!: Menus;
  private saves!: SaveManager;
  private settings!: SettingsStore;
  private readonly audio = new AudioManager();
  private game: Game | null = null;
  private showcase: Game | null = null;
  private playing = false;
  private storageWarning = false;
  private speedBeforePause: GameSpeed = 1;
  private gameSubs: (() => void)[] = [];
  private lastAutosave = performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {}

  async boot(): Promise<void> {
    const persistent = LocalStorageBackend.available();
    this.storageWarning = !persistent;
    this.saves = new SaveManager(persistent ? new LocalStorageBackend(window.localStorage) : new MemoryBackend());
    this.settings = new SettingsStore((await this.saves.loadSettings()) ?? defaultSettings());
    setLanguage(this.settings.current.language);

    this.world = new World(this.canvas, this.settings.current);
    const ctx = this.createContext();
    this.ui = new UIManager(this.uiRoot, ctx);
    this.gameUI = new GameUI(this.ui, this.world, ctx);
    this.menus = new Menus(this.ui.menuLayer, this.settings, {
      continueGame: () => void this.continueGame(),
      newGame: () => void this.newGame(),
      resume: () => this.resume(),
      save: () => void this.saveGame(),
      toMainMenu: () => void this.toMainMenu(),
      loadLast: () => void this.continueGame(),
      click: () => this.audio.play('click'),
    });
    this.applySettings(this.settings.current);
    this.settings.bus.on('changed', ({ settings }) => {
      this.applySettings(settings);
      void this.saves.saveSettings(settings);
    });

    this.world.onFrame((dt) => this.frame(dt));
    this.world.start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.autosave();
    });
    window.addEventListener('pagehide', () => void this.autosave());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.playing && !this.ui.activeWindowId && !this.world.build.active && this.ui.overlayLayer.childElementCount === 0) {
        if (this.menus.visible) this.resume();
        else this.openPauseMenu();
      }
    });

    await this.showMainMenu();
    await new Promise<void>((resolve) => this.world.scene.executeWhenReady(() => resolve()));
    document.getElementById('boot')?.classList.add('hidden');
    this.audio.startMusic();
    if (import.meta.env.DEV) this.exposeDevHandle();
  }

  private createContext(): UIContext {
    return {
      world: this.world,
      settings: this.settings,
      game: () => (this.playing ? this.game : null),
      playSound: (id: SoundId) => this.audio.play(id),
      openMainMenu: () => this.openPauseMenu(),
      saveGame: () => void this.saveGame(),
    };
  }

  private applySettings(s: Settings): void {
    this.world.applySettings(s);
    this.world.camera.setSensitivity(s.cameraSensitivity);
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    setLanguage(s.language);
    this.uiRoot.dataset.quality = s.quality;
  }

  private frame(dt: number): void {
    const active = this.playing ? this.game : this.showcase;
    active?.update(dt);
    if (this.playing && this.game) {
      this.ui.update(dt, this.game.economy.netToday());
      this.gameUI.update(dt);
      if (performance.now() - this.lastAutosave > AUTOSAVE_INTERVAL_MS) void this.autosave();
    }
  }

  // ------------------------------------------------------------ flow

  private async showMainMenu(): Promise<void> {
    this.playing = false;
    this.unbindGame();
    this.ui.showHud(false);
    this.ui.bindGame(null);
    this.showcase = createShowcaseGame();
    this.world.attachGame(this.showcase);
    const cam = this.world.camera;
    cam.cancelTween();
    cam.camera.target = new Vector3(-4, 4, 12);
    cam.camera.radius = this.ui.layout === 'mobile' ? 150 : 105;
    cam.camera.beta = 1.18;
    cam.setMenuFraming(this.ui.layout === 'desktop');
    cam.setIdleOrbit(0.035);
    cam.setInputEnabled(false);
    this.world.labels.setVisible(false);
    const latest = await this.safeLatest();
    this.menus.showMain(latest, this.storageWarning);
  }

  private async safeLatest() {
    try {
      return await this.saves.latest();
    } catch {
      return null;
    }
  }

  private startGame(game: Game, intro: boolean): void {
    this.unbindGame();
    this.showcase = null;
    this.game = game;
    this.playing = true;
    this.menus.hide();
    const cam = this.world.camera;
    cam.setIdleOrbit(0);
    cam.setMenuFraming(false);
    cam.setInputEnabled(true);
    this.world.labels.setVisible(true);
    this.world.attachGame(game);
    this.ui.bindGame(game);
    this.gameUI.bind(game);
    this.ui.showHud(true);
    this.bindAudio(game);
    this.gameSubs.push(
      game.bus.on('day', () => void this.autosave()),
      game.bus.on('bankrupt', () => this.gameOver()),
    );
    this.lastAutosave = performance.now();
    if (intro) {
      game.setSpeed(0);
      cam.playIntro(() => {
        game.setSpeed(1);
        game.notify('success', 'notice.welcome');
        this.audio.play('notify');
      });
    } else {
      cam.flyTo(Vector3.Zero(), { ...DEFAULT_VIEW, duration: 1.2 });
    }
  }

  private unbindGame(): void {
    for (const fn of this.gameSubs.splice(0)) fn();
    this.world.detachGame();
  }

  private bindAudio(game: Game): void {
    const play = (id: SoundId) => () => this.audio.play(id);
    this.gameSubs.push(
      game.bus.on('moduleAdded', play('construct')),
      game.bus.on('moduleCompleted', play('complete')),
      game.bus.on('shipAdded', play('engine')),
      game.bus.on('shipChanged', ({ ship }) => {
        if (ship.status === 'docked') this.audio.play('docking');
      }),
      game.bus.on('researchCompleted', play('research')),
      game.bus.on('stageChanged', play('research')),
      game.bus.on('missionCompleted', play('complete')),
      game.bus.on('notice', (n) => {
        if (n.level === 'danger') this.audio.play('warning');
      }),
    );
  }

  private async continueGame(): Promise<void> {
    const latest = await this.safeLatest();
    if (!latest) return;
    try {
      const loaded = await this.saves.load(latest.slot);
      if (!loaded) return;
      const game = new Game(loaded.state);
      if (game.speed === 0) game.setSpeed(1);
      this.startGame(game, false);
    } catch (err) {
      this.menus.hide();
      await confirmDialog(this.ui.overlayLayer, t('menu.loadFailed', { error: err instanceof Error ? err.message : String(err) }), { danger: true });
      await this.showMainMenu();
    }
  }

  private async newGame(): Promise<void> {
    if (!this.playing && (await this.safeLatest())) {
      this.menus.hide();
      const ok = await confirmDialog(this.ui.overlayLayer, t('menu.confirmNew'), { danger: true });
      if (!ok) {
        await this.showMainMenu();
        return;
      }
    }
    this.startGame(new Game(createNewGameState()), true);
  }

  private openPauseMenu(): void {
    if (!this.playing || !this.game) return;
    this.speedBeforePause = this.game.speed === 0 ? this.speedBeforePause : this.game.speed;
    this.game.setSpeed(0);
    this.ui.closeWindow();
    this.menus.showPause();
  }

  private resume(): void {
    this.menus.hide();
    if (this.game && !this.game.state.economy.bankrupt) this.game.setSpeed(this.speedBeforePause || 1);
  }

  private async saveGame(): Promise<void> {
    if (!this.game) return;
    try {
      await this.saves.save('manual', this.game, this.settings.current);
      this.game.notify('success', 'menu.saved');
      this.audio.play('notify');
      this.resume();
    } catch (err) {
      this.game.notify('danger', 'menu.saveFailed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async autosave(): Promise<void> {
    if (!this.playing || !this.game || this.game.state.economy.bankrupt) return;
    this.lastAutosave = performance.now();
    try {
      await this.saves.save('auto', this.game, this.settings.current);
    } catch (err) {
      this.game.notify('danger', 'menu.saveFailed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async toMainMenu(): Promise<void> {
    await this.autosave();
    this.menus.hide();
    await this.showMainMenu();
  }

  private gameOver(): void {
    if (!this.game) return;
    this.game.setSpeed(0);
    this.ui.closeWindow();
    void this.saves.list().then((list) => this.menus.showGameOver(this.game?.state.economy.debtDays ?? 3, list.some((m) => m.slot === 'manual')));
  }

  // ------------------------------------------------------------ dev

  private exposeDevHandle(): void {
    const world = this.world;
    (window as unknown as { __ssm: unknown }).__ssm = {
      app: this,
      world,
      game: () => this.game,
      project: (x: number, y: number, z: number) => {
        const engine = world.engine;
        const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), world.scene.getTransformMatrix(), world.camera.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
        const rect = this.canvas.getBoundingClientRect();
        const scale = rect.width / engine.getRenderWidth();
        return { x: rect.left + p.x * scale, y: rect.top + p.y * scale };
      },
    };
  }
}
