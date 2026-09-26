import type { StateStorage } from 'zustand/middleware';

import { createSettingsStore, DEFAULT_SETTINGS, pickSettings } from './store';

function memoryStorage(initial: Record<string, string> = {}): StateStorage {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe('settings store', () => {
  it('starts with defaults', () => {
    expect(pickSettings(createSettingsStore(memoryStorage()).getState())).toEqual(DEFAULT_SETTINGS);
  });

  it('updates, persists and sanitises values', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.getState().update({ defaultMode: 'video', videoMaxHeight: 480, remoteKind: 'piped', remoteUrl: '  https://p.example  ' });
    const reloaded = createSettingsStore(storage).getState();
    expect(reloaded.defaultMode).toBe('video');
    expect(reloaded.videoMaxHeight).toBe(480);
    expect(reloaded.remoteUrl).toBe('https://p.example');
  });

  it('repairs invalid persisted data', () => {
    const storage = memoryStorage({
      'replay-settings': JSON.stringify({
        state: { defaultMode: 'hologram', videoMaxHeight: 4320, remoteKind: 'ftp', quickAdd: false },
        version: 1,
      }),
    });
    const state = createSettingsStore(storage).getState();
    expect(state.defaultMode).toBe('audio');
    expect(state.videoMaxHeight).toBe(720);
    expect(state.remoteKind).toBe('off');
    expect(state.quickAdd).toBe(false);
  });

  it('resets to defaults', () => {
    const store = createSettingsStore(memoryStorage());
    store.getState().update({ quickAdd: false });
    store.getState().reset();
    expect(store.getState().quickAdd).toBe(true);
  });
});
