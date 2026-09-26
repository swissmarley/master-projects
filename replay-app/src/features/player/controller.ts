import type { LibraryStore } from '@/features/library/store';
import type { Track } from '@/features/library/types';
import { describeResolveError, type MediaStreamRef, type ResolvedStreams } from '@/features/resolver/types';
import type { PlaybackMode } from '@/features/settings/store';
import { thumbnailUrl } from '@/features/youtube/url';

import type { EngineSource, MediaEngine } from './engine';
import {
  createQueue,
  currentId,
  cycleRepeat,
  jumpTo,
  next as nextInQueue,
  peekNext,
  previous as previousInQueue,
  setShuffle,
  syncItems,
  type Advance,
  type QueueState,
  type Rng,
} from './queue';
import type { PlayerSnapshot, PlayerStore, ResumePersistence } from './store';

export type StreamSource = {
  resolve(videoId: string, options?: { force?: boolean }): Promise<ResolvedStreams>;
  prefetch(videoId: string): void;
  invalidate(videoId: string): void;
};

export type ControllerDeps = {
  engine: MediaEngine;
  streams: StreamSource;
  library: LibraryStore;
  store: PlayerStore;
  getDefaultMode: () => PlaybackMode;
  persistence?: ResumePersistence;
  now?: () => number;
  rng?: Rng;
  /** Delay before skipping a track that cannot be played. */
  skipDelayMs?: number;
};

/** Restart the current track instead of going back when past this point. */
export const RESTART_THRESHOLD_SEC = 3;
/** Stop auto-skipping after this many consecutive unplayable tracks. */
export const MAX_CONSECUTIVE_FAILURES = 3;

type LoadOptions = { autoplay: boolean; startAt?: number; forceResolve?: boolean };

/**
 * Orchestrates queue, stream resolution and the native engine. All state the
 * UI needs lives in `store`; the controller is the only writer.
 */
export class PlayerController {
  private readonly engine: MediaEngine;
  private readonly streams: StreamSource;
  private readonly library: LibraryStore;
  private readonly store: PlayerStore;
  private readonly deps: ControllerDeps;
  private readonly rng: Rng;
  private readonly now: () => number;

  private loadToken = 0;
  /** Streams of the current track (valid when `loadedId === currentId`). */
  private current: ResolvedStreams | null = null;
  /** Track whose stream is currently open in the engine. */
  private loadedId: string | null = null;
  /** A `loadCurrent` is in flight; engine events meanwhile belong to the old item. */
  private loading = false;
  /** Whether playback should run once the current load finishes. */
  private playIntent = false;
  private retriedCurrent = false;
  private consecutiveFailures = 0;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedAt = 0;
  private readonly disposers: (() => void)[] = [];

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.engine = deps.engine;
    this.streams = deps.streams;
    this.library = deps.library;
    this.store = deps.store;
    this.rng = deps.rng ?? Math.random;
    this.now = deps.now ?? Date.now;

    this.disposers.push(
      this.engine.on('playingChange', (isPlaying) => this.onPlayingChange(isPlaying)),
      this.engine.on('bufferingChange', (buffering) => this.set({ buffering })),
      this.engine.on('timeUpdate', (position, duration, buffered) => this.onTimeUpdate(position, duration, buffered)),
      this.engine.on('ended', () => this.onEnded()),
      this.engine.on('error', (message) => this.onEngineError(message)),
      this.library.subscribe((state, previous) => {
        const id = this.get().playlistId;
        if (id && state.playlists[id]?.trackIds !== previous.playlists[id]?.trackIds) this.onPlaylistEdited();
      }),
    );
    this.restore();
  }

  // ---------------------------------------------------------------------------
  // Public API (called by the UI)
  // ---------------------------------------------------------------------------

  get snapshot(): PlayerSnapshot {
    return this.get();
  }

  /** Starts a playlist, optionally at a given track and/or shuffled. */
  playPlaylist(playlistId: string, options: { startId?: string; shuffle?: boolean } = {}): void {
    const playlist = this.library.getState().playlists[playlistId];
    if (!playlist || playlist.trackIds.length === 0) return;
    const state = this.get();
    const queue = createQueue(
      playlist.trackIds,
      { startId: options.startId, shuffle: options.shuffle ?? state.queue.shuffle, repeat: state.queue.repeat },
      this.rng,
    );
    const mode = state.status === 'idle' && !state.currentId ? this.deps.getDefaultMode() : state.mode;
    this.consecutiveFailures = 0;
    this.set({ playlistId, queue, mode });
    void this.loadCurrent({ autoplay: true });
  }

  /** Plays a specific track of the current queue. */
  jumpTo(trackId: string): void {
    const queue = jumpTo(this.get().queue, trackId);
    if (queue === this.get().queue && currentId(queue) !== trackId) return;
    this.consecutiveFailures = 0;
    this.set({ queue });
    void this.loadCurrent({ autoplay: true });
  }

  play(): void {
    const state = this.get();
    if (!state.currentId) return;
    this.playIntent = true;
    if (this.loading) {
      // The in-flight load starts playback when it finishes.
      if (state.status === 'paused') this.set({ status: this.current ? 'loading' : 'resolving' });
      return;
    }
    if (this.loadedId !== state.currentId || state.status === 'idle' || state.status === 'error') {
      this.consecutiveFailures = 0;
      void this.loadCurrent({ autoplay: true, startAt: state.position });
      return;
    }
    if (state.status === 'ended') this.engine.seekTo(0);
    this.engine.play();
  }

  pause(): void {
    this.playIntent = false;
    this.clearSkipTimer();
    this.engine.pause();
    const status = this.get().status;
    if (status === 'resolving' || status === 'loading') this.set({ status: 'paused' });
    this.persist(true);
  }

  togglePlay(): void {
    const status = this.get().status;
    if (status === 'playing' || status === 'resolving' || status === 'loading') this.pause();
    else this.play();
  }

  next(): void {
    this.consecutiveFailures = 0;
    this.advance(nextInQueue(this.get().queue));
  }

  previous(): void {
    if (this.engine.position > RESTART_THRESHOLD_SEC && this.loadedId === this.get().currentId && !this.loading) {
      this.engine.seekTo(0);
      return;
    }
    this.consecutiveFailures = 0;
    this.advance(previousInQueue(this.get().queue));
  }

  seekTo(seconds: number): void {
    const { duration } = this.get();
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration - 0.5) : seconds);
    this.engine.seekTo(target);
    this.set({ position: target });
  }

  seekBy(delta: number): void {
    this.seekTo(this.engine.position + delta);
  }

  setMode(mode: PlaybackMode): void {
    const state = this.get();
    if (state.mode === mode) return;
    this.set({ mode });
    this.engine.setVideoVisible(mode === 'video');
    const streams = this.current;
    if (!streams || !state.currentId || this.loadedId !== state.currentId || this.loading) return;
    // Swap the stream in place, keeping the position and play state.
    if (this.pickStream(streams, mode).uri === this.pickStream(streams, state.mode).uri) return;
    const wasPlaying = state.status === 'playing' || state.status === 'loading';
    void this.loadCurrent({ autoplay: wasPlaying, startAt: this.engine.position });
  }

  toggleMode(): void {
    this.setMode(this.get().mode === 'audio' ? 'video' : 'audio');
  }

  toggleShuffle(): void {
    const queue = setShuffle(this.get().queue, !this.get().queue.shuffle, this.rng);
    this.set({ queue });
    this.prefetchNext();
    this.persist(true);
  }

  cycleRepeat(): void {
    const queue = this.get().queue;
    this.set({ queue: { ...queue, repeat: cycleRepeat(queue.repeat) } });
    this.prefetchNext();
    this.persist(true);
  }

  /** Pauses after `minutes`; `null` cancels. */
  setSleepTimer(minutes: number | null): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (minutes === null || minutes <= 0) {
      this.set({ sleepAt: null });
      return;
    }
    const ms = minutes * 60_000;
    this.set({ sleepAt: this.now() + ms });
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = null;
      this.set({ sleepAt: null });
      this.pause();
    }, ms);
  }

  /** Something else (e.g. a video in the browser) started playing. */
  yieldToOtherMedia(): void {
    const status = this.get().status;
    if (status === 'playing' || status === 'loading' || status === 'resolving') this.pause();
  }

  stop(): void {
    this.loadToken++;
    this.loading = false;
    this.playIntent = false;
    this.clearSkipTimer();
    this.setSleepTimer(null);
    this.engine.stop();
    this.current = null;
    this.loadedId = null;
    this.store.setState({
      playlistId: null,
      currentId: null,
      status: 'idle',
      buffering: false,
      position: 0,
      duration: 0,
      buffered: 0,
      error: null,
      source: null,
      hasVideo: false,
      queue: { ...this.get().queue, items: [], order: [], cursor: -1 },
    });
    this.deps.persistence?.save(null);
  }

  dispose(): void {
    this.disposers.splice(0).forEach((dispose) => dispose());
    this.clearSkipTimer();
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private async loadCurrent({ autoplay, startAt = 0, forceResolve = false }: LoadOptions): Promise<void> {
    const id = currentId(this.get().queue);
    if (!id) {
      this.stop();
      return;
    }
    const token = ++this.loadToken;
    const switchingTrack = id !== this.loadedId;
    if (id !== this.get().currentId) this.retriedCurrent = false;
    this.playIntent = autoplay;
    this.loading = true;
    this.clearSkipTimer();
    // Silence the previous track right away when the user switches.
    if (switchingTrack && this.engine.isPlaying) this.engine.pause();
    const track = this.track(id);
    this.set({
      currentId: id,
      status: 'resolving',
      error: null,
      buffering: false,
      position: startAt,
      duration: switchingTrack ? (track?.durationSec ?? 0) : this.get().duration,
    });

    let streams: ResolvedStreams;
    try {
      streams = await this.streams.resolve(id, { force: forceResolve });
    } catch (error) {
      if (token === this.loadToken) {
        this.loading = false;
        this.fail(describeResolveError(error), this.playIntent);
      }
      return;
    }
    if (token !== this.loadToken) return;

    this.current = streams;
    const mode = this.get().mode;
    const ref = this.pickStream(streams, mode);
    this.set({ status: 'loading', source: streams.source, hasVideo: streams.video !== null });
    this.enrichTrack(id, streams);

    try {
      await this.engine.load(this.toEngineSource(id, ref, streams), startAt);
    } catch (error) {
      if (token === this.loadToken) {
        this.loading = false;
        this.loadedId = id;
        this.onEngineError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (token !== this.loadToken) return;

    this.loading = false;
    this.loadedId = id;
    this.engine.setVideoVisible(mode === 'video');
    if (this.playIntent) this.engine.play();
    else this.set({ status: 'paused' });
    this.prefetchNext();
    this.persist(true);
  }

  private pickStream(streams: ResolvedStreams, mode: PlaybackMode): MediaStreamRef {
    return mode === 'video' && streams.video ? streams.video : streams.audio;
  }

  private toEngineSource(id: string, ref: MediaStreamRef, streams: ResolvedStreams): EngineSource {
    const track = this.track(id);
    return {
      uri: ref.uri,
      contentType: ref.contentType,
      headers: ref.headers,
      metadata: {
        title: track?.title ?? streams.details?.title ?? 'YouTube video',
        artist: track?.author ?? streams.details?.author,
        artwork: track?.thumbnailUrl ?? thumbnailUrl(id, 'hq'),
      },
    };
  }

  /** Fill in details the page did not provide (duration, channel, title). */
  private enrichTrack(id: string, streams: ResolvedStreams): void {
    const track = this.track(id);
    const details = streams.details;
    if (!track || !details) return;
    const patch: Partial<Track> = {};
    if (!track.durationSec && details.durationSec) patch.durationSec = details.durationSec;
    if (!track.author && details.author) patch.author = details.author;
    if ((!track.title || track.title === 'Untitled video') && details.title) patch.title = details.title;
    if (Object.keys(patch).length) this.library.getState().updateTrack(id, patch);
  }

  private prefetchNext(): void {
    const upcoming = peekNext(this.get().queue);
    if (upcoming && upcoming !== this.get().currentId) this.streams.prefetch(upcoming);
  }

  // ---------------------------------------------------------------------------
  // Queue movement
  // ---------------------------------------------------------------------------

  private advance(step: Advance, auto = false): void {
    if (step.ended) {
      if (auto) {
        this.set({ status: 'ended', position: this.get().duration });
        this.persist(true);
      }
      return;
    }
    this.set({ queue: step.queue });
    if (step.restart && this.loadedId === currentId(step.queue) && !this.loading && this.get().status !== 'error') {
      this.engine.seekTo(0);
      this.engine.play();
      return;
    }
    void this.loadCurrent({ autoplay: true });
  }

  private onEnded(): void {
    if (this.loading) return; // stale event from the previous item
    this.consecutiveFailures = 0;
    this.advance(nextInQueue(this.get().queue, { auto: true }), true);
  }

  // ---------------------------------------------------------------------------
  // Failures
  // ---------------------------------------------------------------------------

  private onEngineError(message: string): void {
    const state = this.get();
    if (!state.currentId || this.loading) return;
    // Most playback errors on a previously good stream are expired URLs:
    // resolve again (bypassing the cache) and resume where we were.
    if (!this.retriedCurrent) {
      this.retriedCurrent = true;
      this.streams.invalidate(state.currentId);
      void this.loadCurrent({
        autoplay: this.playIntent,
        startAt: Math.max(this.engine.position, state.position),
        forceResolve: true,
      });
      return;
    }
    this.fail(message || 'Playback failed.', true);
  }

  private fail(message: string, autoSkip: boolean): void {
    this.consecutiveFailures++;
    this.set({ status: 'error', error: message, buffering: false });
    const { queue } = this.get();
    const canSkip =
      autoSkip &&
      this.consecutiveFailures < Math.min(MAX_CONSECUTIVE_FAILURES, queue.order.length) &&
      peekNext(queue) !== null;
    if (!canSkip) return;
    const failedId = this.get().currentId;
    this.skipTimer = setTimeout(() => {
      this.skipTimer = null;
      if (this.get().status === 'error' && this.get().currentId === failedId) {
        this.advance(nextInQueue(this.get().queue, { auto: false }));
      }
    }, this.deps.skipDelayMs ?? 3000);
  }

  private clearSkipTimer(): void {
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Engine and library events
  // ---------------------------------------------------------------------------

  private onPlayingChange(isPlaying: boolean): void {
    if (this.loading) return;
    const status = this.get().status;
    if (isPlaying) {
      this.playIntent = true;
      this.set({ status: 'playing', error: null });
      this.consecutiveFailures = 0;
    } else if (status === 'playing') {
      this.set({ status: 'paused' });
      this.persist(true);
    }
  }

  private onTimeUpdate(position: number, duration: number, buffered: number): void {
    if (this.loading) return;
    const patch: Partial<PlayerSnapshot> = { position, buffered };
    if (Number.isFinite(duration) && duration > 0) patch.duration = duration;
    this.set(patch);
    this.persist(false);
  }

  private onPlaylistEdited(): void {
    const state = this.get();
    const playlist = state.playlistId ? this.library.getState().playlists[state.playlistId] : undefined;
    if (!playlist) {
      this.stop();
      return;
    }
    const before = state.currentId;
    const queue: QueueState = syncItems(state.queue, playlist.trackIds, this.rng);
    this.set({ queue });
    const after = currentId(queue);
    if (!after) {
      this.stop();
    } else if (after !== before) {
      const wasPlaying = state.status === 'playing' || state.status === 'loading' || state.status === 'resolving';
      void this.loadCurrent({ autoplay: wasPlaying });
    } else {
      this.prefetchNext();
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private restore(): void {
    const saved = this.deps.persistence?.load();
    if (!saved) return;
    const playlist = this.library.getState().playlists[saved.playlistId];
    if (!playlist || !playlist.trackIds.includes(saved.currentId)) return;
    const queue = createQueue(
      playlist.trackIds,
      { startId: saved.currentId, shuffle: saved.shuffle, repeat: saved.repeat },
      this.rng,
    );
    this.set({
      playlistId: saved.playlistId,
      queue,
      currentId: saved.currentId,
      position: saved.position,
      duration: this.track(saved.currentId)?.durationSec ?? 0,
      mode: saved.mode,
      status: 'idle',
    });
  }

  private persist(force: boolean): void {
    const persistence = this.deps.persistence;
    if (!persistence) return;
    const now = this.now();
    if (!force && now - this.lastSavedAt < 10_000) return;
    this.lastSavedAt = now;
    const { playlistId, currentId: id, position, mode, queue } = this.get();
    persistence.save(
      playlistId && id ? { playlistId, currentId: id, position, mode, shuffle: queue.shuffle, repeat: queue.repeat } : null,
    );
  }

  // ---------------------------------------------------------------------------

  private get(): PlayerSnapshot {
    return this.store.getState();
  }

  private set(patch: Partial<PlayerSnapshot>): void {
    this.store.setState(patch);
  }

  private track(id: string): Track | undefined {
    return this.library.getState().tracks[id];
  }
}
