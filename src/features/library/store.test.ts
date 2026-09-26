import type { StateStorage } from 'zustand/middleware';

import {
  createLibraryStore,
  normalizeLibrary,
  playlistsContaining,
  selectPlaylistTracks,
} from './store';
import { DEFAULT_PLAYLIST_ID } from './types';

function memoryStorage(initial: Record<string, string> = {}): StateStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const song = (id: string, title = `Song ${id}`) => ({ id, title, author: 'Artist' });

describe('library store', () => {
  it('starts with a default playlist', () => {
    const store = createLibraryStore(memoryStorage());
    const state = store.getState();
    expect(state.playlistOrder).toEqual([DEFAULT_PLAYLIST_ID]);
    expect(state.activePlaylistId).toBe(DEFAULT_PLAYLIST_ID);
  });

  it('adds tracks to the active playlist and refuses duplicates', () => {
    const store = createLibraryStore(memoryStorage());
    expect(store.getState().addTrack(song('aaaaaaaaaaa'))).toBe('added');
    expect(store.getState().addTrack(song('aaaaaaaaaaa'))).toBe('exists');
    expect(store.getState().addTrack(song('bbbbbbbbbbb'))).toBe('added');
    const tracks = selectPlaylistTracks(store.getState(), DEFAULT_PLAYLIST_ID);
    expect(tracks.map((t) => t.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(tracks[0].addedAt).toBeGreaterThan(0);
  });

  it('shares one track between playlists and makes the target active', () => {
    const store = createLibraryStore(memoryStorage());
    const road = store.getState().createPlaylist('  Road   trip ');
    store.getState().addTrack(song('aaaaaaaaaaa'));
    expect(store.getState().addTrack(song('aaaaaaaaaaa', 'New title'), road)).toBe('added');
    const state = store.getState();
    expect(state.playlists[road].name).toBe('Road trip');
    expect(state.activePlaylistId).toBe(road);
    expect(Object.keys(state.tracks)).toEqual(['aaaaaaaaaaa']);
    expect(state.tracks.aaaaaaaaaaa.title).toBe('New title');
    expect(playlistsContaining(state, 'aaaaaaaaaaa')).toEqual([DEFAULT_PLAYLIST_ID, road]);
  });

  it('reports a missing playlist', () => {
    const store = createLibraryStore(memoryStorage());
    expect(store.getState().addTrack(song('aaaaaaaaaaa'), 'nope')).toBe('missing-playlist');
  });

  it('removes tracks and prunes orphans', () => {
    const store = createLibraryStore(memoryStorage());
    const other = store.getState().createPlaylist('Other');
    store.getState().addTrack(song('aaaaaaaaaaa'), DEFAULT_PLAYLIST_ID);
    store.getState().addTrack(song('aaaaaaaaaaa'), other);
    store.getState().removeTrack(DEFAULT_PLAYLIST_ID, 'aaaaaaaaaaa');
    expect(store.getState().tracks.aaaaaaaaaaa).toBeDefined();
    store.getState().removeTrack(other, 'aaaaaaaaaaa');
    expect(store.getState().tracks.aaaaaaaaaaa).toBeUndefined();
  });

  it('reorders tracks and ignores out-of-range moves', () => {
    const store = createLibraryStore(memoryStorage());
    for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']) store.getState().addTrack(song(id));
    store.getState().moveTrack(DEFAULT_PLAYLIST_ID, 0, 2);
    expect(store.getState().playlists[DEFAULT_PLAYLIST_ID].trackIds).toEqual([
      'bbbbbbbbbbb',
      'ccccccccccc',
      'aaaaaaaaaaa',
    ]);
    const before = store.getState().playlists;
    store.getState().moveTrack(DEFAULT_PLAYLIST_ID, 0, 9);
    expect(store.getState().playlists).toBe(before);
  });

  it('never deletes the default playlist and falls back to it', () => {
    const store = createLibraryStore(memoryStorage());
    const id = store.getState().createPlaylist('Temp');
    store.getState().addTrack(song('aaaaaaaaaaa'), id);
    store.getState().deletePlaylist(DEFAULT_PLAYLIST_ID);
    expect(store.getState().playlists[DEFAULT_PLAYLIST_ID]).toBeDefined();
    store.getState().deletePlaylist(id);
    const state = store.getState();
    expect(state.playlists[id]).toBeUndefined();
    expect(state.playlistOrder).toEqual([DEFAULT_PLAYLIST_ID]);
    expect(state.activePlaylistId).toBe(DEFAULT_PLAYLIST_ID);
    expect(state.tracks).toEqual({});
  });

  it('updates track metadata without clobbering with empty values', () => {
    const store = createLibraryStore(memoryStorage());
    store.getState().addTrack(song('aaaaaaaaaaa'));
    store.getState().updateTrack('aaaaaaaaaaa', { durationSec: 212, title: '' });
    const track = store.getState().tracks.aaaaaaaaaaa;
    expect(track.durationSec).toBe(212);
    expect(track.title).toBe('Song aaaaaaaaaaa');
  });

  it('persists and rehydrates', () => {
    const storage = memoryStorage();
    const first = createLibraryStore(storage);
    const id = first.getState().createPlaylist('Gym');
    first.getState().addTrack(song('aaaaaaaaaaa'), id);

    const second = createLibraryStore(storage);
    const state = second.getState();
    expect(state.playlists[id].trackIds).toEqual(['aaaaaaaaaaa']);
    expect(state.playlistOrder).toEqual([DEFAULT_PLAYLIST_ID, id]);
    expect(state.activePlaylistId).toBe(id);
  });
});

describe('normalizeLibrary', () => {
  it('repairs partial or corrupted persisted data', () => {
    const repaired = normalizeLibrary({
      tracks: { aaaaaaaaaaa: { id: 'aaaaaaaaaaa', title: 'A', addedAt: 1 } },
      playlists: {
        x: { id: 'x', name: 'X', trackIds: ['aaaaaaaaaaa', 'aaaaaaaaaaa', 'ghost'], createdAt: 1, updatedAt: 1 },
      },
      playlistOrder: ['x', 'x', 'missing'],
      activePlaylistId: 'missing',
    });
    expect(repaired.playlists.x.trackIds).toEqual(['aaaaaaaaaaa']);
    expect(repaired.playlistOrder).toEqual(['x', DEFAULT_PLAYLIST_ID]);
    expect(repaired.activePlaylistId).toBe(DEFAULT_PLAYLIST_ID);
  });

  it('returns a fresh library for undefined input', () => {
    expect(normalizeLibrary(undefined).playlistOrder).toEqual([DEFAULT_PLAYLIST_ID]);
  });
});
