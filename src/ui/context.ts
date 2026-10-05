import type { Game } from '../game/Game';
import type { SettingsStore } from '../settings/Settings';
import type { World } from '../world/World';

/** Services the UI needs. `game` changes when a campaign is started or loaded. */
export interface UIContext {
  readonly world: World;
  readonly settings: SettingsStore;
  game(): Game | null;
  playSound(id: SoundId): void;
  openMainMenu(): void;
  saveGame(): void;
}

export type SoundId =
  | 'click'
  | 'build'
  | 'construct'
  | 'complete'
  | 'docking'
  | 'engine'
  | 'warning'
  | 'notify'
  | 'research'
  | 'trade'
  | 'error';
