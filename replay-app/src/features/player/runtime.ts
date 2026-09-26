import { useStore } from 'zustand';

import { useLibrary } from '@/features/library';
import { streamResolver } from '@/features/resolver';
import { useSettings } from '@/features/settings';
import { readJson, removeKey, writeJson } from '@/lib/storage';

import { PlayerController } from './controller';
import { ExpoVideoEngine } from './expo-video-engine';
import { createPlayerStore, type PlayerSnapshot, type ResumeState } from './store';

const RESUME_KEY = 'replay-resume';

/** One native player for the whole app lifetime (keeps playing across screens). */
export const engine = new ExpoVideoEngine();

export const playerStore = createPlayerStore();

export const player = new PlayerController({
  engine,
  streams: streamResolver,
  library: useLibrary,
  store: playerStore,
  getDefaultMode: () => useSettings.getState().defaultMode,
  persistence: {
    load: () => readJson<ResumeState>(RESUME_KEY),
    save: (state) => (state ? writeJson(RESUME_KEY, state) : removeKey(RESUME_KEY)),
  },
});

/** Subscribe a component to part of the player state. */
export function usePlayer<T>(selector: (state: PlayerSnapshot) => T): T {
  return useStore(playerStore, selector);
}
