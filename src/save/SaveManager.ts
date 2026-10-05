import { RESOURCE_IDS } from '../data/resources';
import type { Game } from '../game/Game';
import { SAVE_VERSION, type GameState } from '../game/state';
import { sanitizeSettings, type Settings } from '../settings/Settings';
import { StorageError, type StorageBackend } from './StorageBackend';

const SAVE_PREFIX = 'ssm.save.';
const SETTINGS_KEY = 'ssm.settings';
const FORMAT = 'space-station-manager';

export type SaveSlot = 'auto' | 'manual';

export interface SaveMeta {
  slot: SaveSlot;
  savedAt: number;
  day: number;
  stage: number;
  credits: number;
  modules: number;
}

interface SaveEnvelope {
  format: string;
  version: number;
  meta: SaveMeta;
  settings: Settings;
  state: GameState;
}

type Migration = (state: Record<string, unknown>) => void;

/** Upgrades older save formats step by step (index = version being upgraded from). */
const MIGRATIONS: Record<number, Migration> = {};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural validation of a loaded state; throws on anything unusable. */
export function validateState(raw: unknown): GameState {
  if (!isObject(raw)) throw new StorageError('Save data is not an object', 'corrupt');
  const s = raw as Record<string, unknown>;
  const requireObject = (key: string): Record<string, unknown> => {
    const v = s[key];
    if (!isObject(v)) throw new StorageError(`Save is missing "${key}"`, 'corrupt');
    return v;
  };
  const time = requireObject('time');
  if (typeof time.hour !== 'number' || !Number.isFinite(time.hour)) throw new StorageError('Invalid time', 'corrupt');
  const resources = requireObject('resources');
  for (const id of RESOURCE_IDS) {
    if (typeof resources[id] !== 'number' || !Number.isFinite(resources[id])) throw new StorageError(`Invalid resource ${id}`, 'corrupt');
  }
  const station = requireObject('station');
  if (!Array.isArray(station.modules) || !station.modules.some((m) => isObject(m) && m.type === 'command')) {
    throw new StorageError('Save has no command module', 'corrupt');
  }
  for (const key of ['economy', 'market', 'crew', 'ships', 'research', 'missions', 'events', 'tutorial', 'stats']) requireObject(key);
  if (typeof s.stage !== 'number' || typeof s.reputation !== 'number') throw new StorageError('Invalid progression', 'corrupt');
  return raw as unknown as GameState;
}

/** Serialises campaigns and settings to a storage backend. */
export class SaveManager {
  constructor(private readonly backend: StorageBackend) {}

  serialize(game: Game, settings: Settings, slot: SaveSlot, now = Date.now()): string {
    const state = game.syncForSave();
    const envelope: SaveEnvelope = {
      format: FORMAT,
      version: SAVE_VERSION,
      meta: {
        slot,
        savedAt: now,
        day: game.day,
        stage: state.stage,
        credits: Math.round(state.resources.credits),
        modules: state.station.modules.length,
      },
      settings,
      state,
    };
    return JSON.stringify(envelope);
  }

  deserialize(text: string): { state: GameState; meta: SaveMeta; settings: Settings } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StorageError('Save file is not valid JSON', 'corrupt');
    }
    if (!isObject(parsed) || parsed.format !== FORMAT) throw new StorageError('Not a Space Station Manager save', 'corrupt');
    const version = typeof parsed.version === 'number' ? parsed.version : 0;
    if (version > SAVE_VERSION) throw new StorageError('Save was created by a newer version of the game', 'version');
    const state = parsed.state;
    if (!isObject(state)) throw new StorageError('Save has no game state', 'corrupt');
    for (let v = version; v < SAVE_VERSION; v++) MIGRATIONS[v]?.(state);
    state.version = SAVE_VERSION;
    return {
      state: validateState(state),
      meta: parsed.meta as SaveMeta,
      settings: sanitizeSettings(parsed.settings),
    };
  }

  async save(slot: SaveSlot, game: Game, settings: Settings): Promise<SaveMeta> {
    const text = this.serialize(game, settings, slot);
    await this.backend.set(SAVE_PREFIX + slot, text);
    return (JSON.parse(text) as SaveEnvelope).meta;
  }

  async load(slot: SaveSlot): Promise<{ state: GameState; meta: SaveMeta } | null> {
    const text = await this.backend.get(SAVE_PREFIX + slot);
    if (!text) return null;
    const { state, meta } = this.deserialize(text);
    return { state, meta };
  }

  async list(): Promise<SaveMeta[]> {
    const out: SaveMeta[] = [];
    for (const key of await this.backend.keys(SAVE_PREFIX)) {
      const text = await this.backend.get(key);
      if (!text) continue;
      try {
        out.push(this.deserialize(text).meta);
      } catch {
        // Corrupt slots are ignored in the listing; loading them reports the error.
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  async latest(): Promise<SaveMeta | null> {
    return (await this.list())[0] ?? null;
  }

  async remove(slot: SaveSlot): Promise<void> {
    await this.backend.remove(SAVE_PREFIX + slot);
  }

  async loadSettings(): Promise<Settings | null> {
    const text = await this.backend.get(SETTINGS_KEY);
    if (!text) return null;
    try {
      return sanitizeSettings(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.backend.set(SETTINGS_KEY, JSON.stringify(settings));
  }
}
