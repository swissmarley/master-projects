import Storage from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * SQLite-backed key-value storage.
 * Reads are synchronous so persisted stores hydrate before the first render
 * (no empty-library flash); writes are asynchronous and off the hot path.
 */
export const kvStorage: StateStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: (key) => Storage.removeItem(key),
};

export function readJson<T>(key: string): T | null {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  Storage.setItem(key, JSON.stringify(value)).catch(() => {});
}

export function removeKey(key: string): void {
  Storage.removeItem(key).catch(() => {});
}
