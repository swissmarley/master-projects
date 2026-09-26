import type { StateStorage } from 'zustand/middleware';

import { createLibraryStore } from '@/features/library/store';
import { DEFAULT_PLAYLIST_ID } from '@/features/library/types';
import { ResolveError, type ResolvedStreams } from '@/features/resolver/types';

import { PlayerController, type StreamSource } from './controller';
import { Emitter, type EngineEvents, type EngineSource, type MediaEngine } from './engine';
import { createPlayerStore, type ResumeState } from './store';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEngine implements MediaEngine {
  private readonly events = new Emitter<EngineEvents>();
  loads: { source: EngineSource; startAt: number }[] = [];
  position = 0;
  duration = 0;
  isPlaying = false;
  videoVisible = false;
  stopped = 0;
  loadGate: Promise<void> | null = null;
  loadError: Error | null = null;

  async load(source: EngineSource, startAt = 0) {
    this.loads.push({ source, startAt });
    if (this.loadGate) await this.loadGate;
    if (this.loadError) throw this.loadError;
    this.isPlaying = false;
    this.position = startAt;
  }
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.events.emit('playingChange', true);
  }
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.events.emit('playingChange', false);
  }
  seekTo(seconds: number) {
    this.position = seconds;
  }
  stop() {
    this.pause();
    this.stopped++;
  }
  setVideoVisible(visible: boolean) {
    this.videoVisible = visible;
  }
  on<E extends keyof EngineEvents>(event: E, handler: EngineEvents[E]) {
    return this.events.on(event, handler);
  }

  // Test helpers
  lastUri() {
    return this.loads.at(-1)?.source.uri;
  }
  tick(position: number, duration = 200) {
    this.position = position;
    this.events.emit('timeUpdate', position, duration, position);
  }
  finish() {
    this.isPlaying = false;
    this.events.emit('playingChange', false);
    this.events.emit('ended');
  }
  fail(message = 'HTTP 403') {
    this.isPlaying = false;
    this.events.emit('error', message);
  }
}

function streamsFor(videoId: string, withVideo = true): ResolvedStreams {
  return {
    videoId,
    source: 'innertube',
    audio: { uri: `https://audio/${videoId}`, contentType: 'progressive', headers: { 'User-Agent': 'UA' } },
    video: withVideo ? { uri: `https://video/${videoId}`, contentType: 'progressive' } : null,
    expiresAt: Date.now() + 3_600_000,
    details: { durationSec: 180, author: 'Resolved Channel' },
  };
}

class FakeStreams implements StreamSource {
  calls: { id: string; force: boolean }[] = [];
  prefetched: string[] = [];
  invalidated: string[] = [];
  failing = new Set<string>();
  gates = new Map<string, Promise<void>>();

  async resolve(id: string, options: { force?: boolean } = {}) {
    this.calls.push({ id, force: options.force ?? false });
    const gate = this.gates.get(id);
    if (gate) await gate;
    if (this.failing.has(id)) throw new ResolveError('login-required', 'Sign in to confirm your age', 'innertube');
    return streamsFor(id);
  }
  prefetch(id: string) {
    this.prefetched.push(id);
  }
  invalidate(id: string) {
    this.invalidated.push(id);
  }
}

function memoryStorage(): StateStorage {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const IDS = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];

function setup(options: { saved?: ResumeState | null; ids?: string[] } = {}) {
  const library = createLibraryStore(memoryStorage());
  for (const id of options.ids ?? IDS) library.getState().addTrack({ id, title: `Title ${id[0]}` });
  const engine = new FakeEngine();
  const streams = new FakeStreams();
  const store = createPlayerStore();
  const saved: (ResumeState | null)[] = [];
  const controller = new PlayerController({
    engine,
    streams,
    library,
    store,
    getDefaultMode: () => 'audio',
    persistence: { load: () => options.saved ?? null, save: (s) => saved.push(s) },
    skipDelayMs: 1000,
    rng: () => 0.5,
  });
  const state = () => store.getState();
  return { library, engine, streams, store, controller, state, saved };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// ---------------------------------------------------------------------------

describe('PlayerController: playing a playlist', () => {
  it('resolves, loads the audio stream with lock-screen metadata and plays', async () => {
    const { controller, engine, streams, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    expect(state().status).toBe('resolving');
    await settle();

    expect(engine.loads).toHaveLength(1);
    expect(engine.loads[0].source).toEqual({
      uri: 'https://audio/aaaaaaaaaaa',
      contentType: 'progressive',
      headers: { 'User-Agent': 'UA' },
      metadata: {
        title: 'Title a',
        artist: 'Resolved Channel',
        artwork: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
      },
    });
    expect(state()).toMatchObject({ status: 'playing', currentId: 'aaaaaaaaaaa', source: 'innertube', hasVideo: true });
    expect(streams.prefetched).toEqual(['bbbbbbbbbbb']);
  });

  it('fills in missing track details from the stream', async () => {
    const { controller, library } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    expect(library.getState().tracks.aaaaaaaaaaa).toMatchObject({ durationSec: 180, author: 'Resolved Channel' });
  });

  it('starts at the chosen track', async () => {
    const { controller, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID, { startId: 'ccccccccccc' });
    await settle();
    expect(state().currentId).toBe('ccccccccccc');
  });

  it('ignores empty playlists', () => {
    const { controller, state } = setup({ ids: [] });
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    expect(state().status).toBe('idle');
  });
});

describe('PlayerController: background auto-advance', () => {
  it('moves to the next track when one ends and stops at the end of the queue', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    engine.finish();
    await settle();
    expect(state()).toMatchObject({ currentId: 'bbbbbbbbbbb', status: 'playing' });
    engine.finish();
    await settle();
    engine.finish();
    await settle();
    expect(state()).toMatchObject({ currentId: 'ccccccccccc', status: 'ended' });
    expect(engine.loads).toHaveLength(3);
  });

  it('restarts the same track with repeat one, without reloading', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.cycleRepeat(); // all
    controller.cycleRepeat(); // one
    engine.tick(179);
    engine.finish();
    await settle();
    expect(state()).toMatchObject({ currentId: 'aaaaaaaaaaa', status: 'playing' });
    expect(engine.position).toBe(0);
    expect(engine.loads).toHaveLength(1);
  });

  it('wraps around with repeat all', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID, { startId: 'ccccccccccc' });
    await settle();
    controller.cycleRepeat();
    engine.finish();
    await settle();
    expect(state().currentId).toBe('aaaaaaaaaaa');
  });
});

describe('PlayerController: transport controls', () => {
  it('previous restarts the track after 3 seconds, otherwise goes back', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID, { startId: 'bbbbbbbbbbb' });
    await settle();
    engine.tick(42);
    controller.previous();
    expect(engine.position).toBe(0);
    expect(state().currentId).toBe('bbbbbbbbbbb');
    controller.previous();
    await settle();
    expect(state().currentId).toBe('aaaaaaaaaaa');
  });

  it('manual next at the end of the queue does nothing', async () => {
    const { controller, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID, { startId: 'ccccccccccc' });
    await settle();
    controller.next();
    await settle();
    expect(state()).toMatchObject({ currentId: 'ccccccccccc', status: 'playing' });
  });

  it('pausing while a stream loads finishes paused; play resumes without reloading', async () => {
    const { controller, engine, streams, state } = setup();
    const gate = deferred();
    streams.gates.set('aaaaaaaaaaa', gate.promise);
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    controller.pause();
    gate.release();
    await settle();
    expect(state().status).toBe('paused');
    expect(engine.isPlaying).toBe(false);
    controller.play();
    expect(engine.isPlaying).toBe(true);
    expect(engine.loads).toHaveLength(1);
  });

  it('only the last of several quick "next" taps is loaded', async () => {
    const { controller, engine, streams, state } = setup();
    const slow = deferred();
    streams.gates.set('bbbbbbbbbbb', slow.promise);
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.next(); // b (slow)
    controller.next(); // c
    await settle();
    slow.release();
    await settle();
    expect(state().currentId).toBe('ccccccccccc');
    expect(engine.lastUri()).toBe('https://audio/ccccccccccc');
    expect(engine.loads.map((l) => l.source.uri)).not.toContain('https://audio/bbbbbbbbbbb');
  });

  it('seeks within the duration', async () => {
    const { controller, engine } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    engine.tick(10, 200);
    controller.seekTo(500);
    expect(engine.position).toBe(199.5);
    controller.seekBy(-1000);
    expect(engine.position).toBe(0);
  });
});

describe('PlayerController: failures', () => {
  it('re-resolves an expired stream once and resumes at the same position', async () => {
    const { controller, engine, streams, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    engine.tick(95);
    engine.fail('HTTP 403');
    await settle();
    expect(streams.invalidated).toEqual(['aaaaaaaaaaa']);
    expect(streams.calls.at(-1)).toEqual({ id: 'aaaaaaaaaaa', force: true });
    expect(engine.loads.at(-1)?.startAt).toBe(95);
    expect(state().status).toBe('playing');
  });

  it('shows the error after a second failure and skips to the next track', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    engine.fail();
    await settle();
    engine.fail('Decoder error');
    await settle();
    expect(state()).toMatchObject({ status: 'error', error: 'Decoder error' });
    jest.advanceTimersByTime(1000);
    await settle();
    expect(state()).toMatchObject({ currentId: 'bbbbbbbbbbb', status: 'playing' });
  });

  it('shows why a video cannot be resolved and skips it', async () => {
    const { controller, streams, state } = setup();
    streams.failing.add('aaaaaaaaaaa');
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    expect(state()).toMatchObject({ status: 'error', error: 'Sign in to confirm your age' });
    jest.advanceTimersByTime(1000);
    await settle();
    expect(state().currentId).toBe('bbbbbbbbbbb');
  });

  it('stops auto-skipping after repeated failures (e.g. offline)', async () => {
    const ids = [...IDS, 'ddddddddddd', 'eeeeeeeeeee'];
    const { controller, streams, state } = setup({ ids });
    ids.forEach((id) => streams.failing.add(id));
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(1000);
      await settle();
    }
    expect(state()).toMatchObject({ status: 'error', currentId: 'ccccccccccc' });
    expect(streams.calls.map((c) => c.id)).toEqual(IDS);
  });
});

describe('PlayerController: audio / video mode', () => {
  it('switches stream in place at the current position', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    engine.tick(33);
    controller.setMode('video');
    await settle();
    expect(engine.lastUri()).toBe('https://video/aaaaaaaaaaa');
    expect(engine.loads.at(-1)?.startAt).toBe(33);
    expect(engine.videoVisible).toBe(true);
    expect(state()).toMatchObject({ mode: 'video', status: 'playing' });
  });

  it('keeps a paused track paused when switching', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.pause();
    controller.toggleMode();
    await settle();
    expect(state().status).toBe('paused');
    expect(engine.isPlaying).toBe(false);
  });
});

describe('PlayerController: playlist edited while playing', () => {
  it('continues with the next track when the current one is removed', async () => {
    const { controller, library, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    library.getState().removeTrack(DEFAULT_PLAYLIST_ID, 'aaaaaaaaaaa');
    await settle();
    expect(state()).toMatchObject({ currentId: 'bbbbbbbbbbb', status: 'playing' });
  });

  it('keeps playing when tracks are added and prefetches the new next track', async () => {
    const { controller, library, engine, streams, state } = setup({ ids: ['aaaaaaaaaaa'] });
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    library.getState().addTrack({ id: 'ddddddddddd', title: 'New' });
    await settle();
    expect(state().queue.items).toEqual(['aaaaaaaaaaa', 'ddddddddddd']);
    expect(engine.loads).toHaveLength(1);
    expect(streams.prefetched).toContain('ddddddddddd');
  });

  it('stops when the playlist is deleted', async () => {
    const { controller, library, engine, state } = setup();
    const id = library.getState().createPlaylist('Temp');
    library.getState().addTrack({ id: 'aaaaaaaaaaa', title: 'x' }, id);
    controller.playPlaylist(id);
    await settle();
    library.getState().deletePlaylist(id);
    expect(state()).toMatchObject({ status: 'idle', currentId: null, playlistId: null });
    expect(engine.stopped).toBe(1);
  });
});

describe('PlayerController: persistence and extras', () => {
  it('restores the last track and resumes where it left off', async () => {
    const { controller, engine, state } = setup({
      saved: {
        playlistId: DEFAULT_PLAYLIST_ID,
        currentId: 'bbbbbbbbbbb',
        position: 61,
        mode: 'audio',
        shuffle: false,
        repeat: 'all',
      },
    });
    expect(state()).toMatchObject({ status: 'idle', currentId: 'bbbbbbbbbbb', position: 61 });
    expect(state().queue.repeat).toBe('all');
    controller.togglePlay();
    await settle();
    expect(engine.loads[0]).toMatchObject({ startAt: 61 });
    expect(state().status).toBe('playing');
  });

  it('ignores saved state that no longer matches the library', () => {
    const { state } = setup({
      saved: { playlistId: 'gone', currentId: 'x', position: 1, mode: 'audio', shuffle: false, repeat: 'off' },
    });
    expect(state().currentId).toBeNull();
  });

  it('saves progress when a track loads and when paused', async () => {
    const { controller, saved } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.pause();
    expect(saved.at(-1)).toMatchObject({ playlistId: DEFAULT_PLAYLIST_ID, currentId: 'aaaaaaaaaaa' });
  });

  it('sleep timer pauses playback', async () => {
    const { controller, engine, state } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.setSleepTimer(15);
    expect(state().sleepAt).not.toBeNull();
    jest.advanceTimersByTime(15 * 60_000);
    expect(engine.isPlaying).toBe(false);
    expect(state()).toMatchObject({ status: 'paused', sleepAt: null });
  });

  it('pauses when other media (the browser) starts playing', async () => {
    const { controller, engine } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.yieldToOtherMedia();
    expect(engine.isPlaying).toBe(false);
  });

  it('stop clears the player', async () => {
    const { controller, state, saved } = setup();
    controller.playPlaylist(DEFAULT_PLAYLIST_ID);
    await settle();
    controller.stop();
    expect(state()).toMatchObject({ status: 'idle', currentId: null });
    expect(saved.at(-1)).toBeNull();
  });
});
