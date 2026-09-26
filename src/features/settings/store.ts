import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { AudioQuality } from '@/features/youtube/formats';

export type PlaybackMode = 'audio' | 'video';
export type RemoteKind = 'off' | 'piped' | 'invidious';
export const VIDEO_HEIGHTS = [360, 480, 720, 1080] as const;
export type VideoHeight = (typeof VIDEO_HEIGHTS)[number];

export type Settings = {
  /** Mode new playback starts in. */
  defaultMode: PlaybackMode;
  audioQuality: AudioQuality;
  videoMaxHeight: VideoHeight;
  /** "+" buttons on YouTube thumbnails in the browser. */
  quickAdd: boolean;
  /** Picture-in-picture when leaving the app in video mode. */
  pictureInPicture: boolean;
  useInnertube: boolean;
  useWebViewCapture: boolean;
  remoteKind: RemoteKind;
  remoteUrl: string;
};

export const DEFAULT_SETTINGS: Settings = {
  defaultMode: 'audio',
  audioQuality: 'high',
  videoMaxHeight: 720,
  quickAdd: true,
  pictureInPicture: true,
  useInnertube: true,
  useWebViewCapture: true,
  remoteKind: 'off',
  remoteUrl: '',
};

export type SettingsState = Settings & {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
};

function sanitize(input: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    defaultMode: merged.defaultMode === 'video' ? 'video' : 'audio',
    audioQuality: merged.audioQuality === 'low' ? 'low' : 'high',
    videoMaxHeight: (VIDEO_HEIGHTS as readonly number[]).includes(merged.videoMaxHeight)
      ? merged.videoMaxHeight
      : DEFAULT_SETTINGS.videoMaxHeight,
    quickAdd: merged.quickAdd !== false,
    pictureInPicture: merged.pictureInPicture !== false,
    useInnertube: merged.useInnertube !== false,
    useWebViewCapture: merged.useWebViewCapture !== false,
    remoteKind: ['piped', 'invidious'].includes(merged.remoteKind) ? merged.remoteKind : 'off',
    remoteUrl: typeof merged.remoteUrl === 'string' ? merged.remoteUrl.trim() : '',
  };
}

export function createSettingsStore(storage: StateStorage, name = 'replay-settings') {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...DEFAULT_SETTINGS,
        update: (patch) => set((state) => sanitize({ ...pickSettings(state), ...patch })),
        reset: () => set(DEFAULT_SETTINGS),
      }),
      {
        name,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => pickSettings(state),
        merge: (persisted, current) => ({ ...current, ...sanitize(persisted as Partial<Settings>) }),
      },
    ),
  );
}

export function pickSettings(state: Settings): Settings {
  const {
    defaultMode,
    audioQuality,
    videoMaxHeight,
    quickAdd,
    pictureInPicture,
    useInnertube,
    useWebViewCapture,
    remoteKind,
    remoteUrl,
  } = state;
  return {
    defaultMode,
    audioQuality,
    videoMaxHeight,
    quickAdd,
    pictureInPicture,
    useInnertube,
    useWebViewCapture,
    remoteKind,
    remoteUrl,
  };
}
