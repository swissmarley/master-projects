import { createStore } from 'zustand/vanilla';

import type { ResolverName } from '@/features/resolver/types';
import type { PlaybackMode } from '@/features/settings/store';

import { EMPTY_QUEUE, type QueueState, type RepeatMode } from './queue';

export type PlayerStatus =
  | 'idle' // nothing loaded (possibly a restored track waiting to resume)
  | 'resolving' // looking up stream URLs
  | 'loading' // native player is opening the stream
  | 'playing'
  | 'paused'
  | 'ended' // reached the end of the queue
  | 'error';

export type PlayerSnapshot = {
  playlistId: string | null;
  queue: QueueState;
  currentId: string | null;
  status: PlayerStatus;
  buffering: boolean;
  mode: PlaybackMode;
  position: number;
  duration: number;
  buffered: number;
  error: string | null;
  /** Which resolver produced the current stream. */
  source: ResolverName | null;
  /** Whether the current stream has a picture. */
  hasVideo: boolean;
  /** Epoch ms when the sleep timer pauses playback. */
  sleepAt: number | null;
};

export const INITIAL_SNAPSHOT: PlayerSnapshot = {
  playlistId: null,
  queue: EMPTY_QUEUE,
  currentId: null,
  status: 'idle',
  buffering: false,
  mode: 'audio',
  position: 0,
  duration: 0,
  buffered: 0,
  error: null,
  source: null,
  hasVideo: false,
  sleepAt: null,
};

export function createPlayerStore(initial: Partial<PlayerSnapshot> = {}) {
  return createStore<PlayerSnapshot>()(() => ({ ...INITIAL_SNAPSHOT, ...initial }));
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;

/** What survives an app restart so the mini player can offer "resume". */
export type ResumeState = {
  playlistId: string;
  currentId: string;
  position: number;
  mode: PlaybackMode;
  shuffle: boolean;
  repeat: RepeatMode;
};

export type ResumePersistence = {
  load(): ResumeState | null;
  save(state: ResumeState | null): void;
};
