/**
 * Async key/value storage. The game only talks to this interface, so the localStorage
 * implementation can later be swapped for IndexedDB without touching the save logic.
 */
export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly reason: 'quota' | 'unavailable' | 'corrupt' | 'version',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class LocalStorageBackend implements StorageBackend {
  constructor(private readonly storage: Storage) {}

  static available(): boolean {
    try {
      const k = '__ssm_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch (err) {
      throw new StorageError(`Could not write ${key}: ${String(err)}`, 'quota');
    }
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }

  async keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}

/** Fallback when persistent storage is blocked (private browsing) and for tests. */
export class MemoryBackend implements StorageBackend {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}
