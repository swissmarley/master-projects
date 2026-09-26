import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import {
  DEFAULT_PLAYLIST_ID,
  DEFAULT_PLAYLIST_NAME,
  type AddResult,
  type Playlist,
  type Track,
  type TrackInput,
} from './types';

export type LibraryData = {
  tracks: Record<string, Track>;
  playlists: Record<string, Playlist>;
  /** Display order of playlists. */
  playlistOrder: string[];
  /** Playlist that "Add to playlist" targets by default (the last one used). */
  activePlaylistId: string;
};

export type LibraryActions = {
  addTrack: (input: TrackInput, playlistId?: string) => AddResult;
  removeTrack: (playlistId: string, trackId: string) => void;
  moveTrack: (playlistId: string, from: number, to: number) => void;
  updateTrack: (trackId: string, patch: Partial<Omit<Track, 'id' | 'addedAt'>>) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;
  clearPlaylist: (playlistId: string) => void;
  setActivePlaylist: (playlistId: string) => void;
};

export type LibraryState = LibraryData & LibraryActions;

function makeId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 80) : fallback;
}

export function initialLibrary(now = Date.now()): LibraryData {
  return {
    tracks: {},
    playlists: {
      [DEFAULT_PLAYLIST_ID]: {
        id: DEFAULT_PLAYLIST_ID,
        name: DEFAULT_PLAYLIST_NAME,
        trackIds: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    playlistOrder: [DEFAULT_PLAYLIST_ID],
    activePlaylistId: DEFAULT_PLAYLIST_ID,
  };
}

/** Drops tracks that no playlist references any more. */
function pruneTracks(
  tracks: Record<string, Track>,
  playlists: Record<string, Playlist>,
): Record<string, Track> {
  const used = new Set(Object.values(playlists).flatMap((p) => p.trackIds));
  return Object.fromEntries(Object.entries(tracks).filter(([id]) => used.has(id)));
}

/**
 * Repairs persisted data that may be partial or from an older version, so the
 * UI can rely on the invariants (default playlist exists, order is complete,
 * every referenced track exists).
 */
export function normalizeLibrary(data: Partial<LibraryData> | undefined): LibraryData {
  const base = initialLibrary();
  const tracks = { ...(data?.tracks ?? {}) };
  const playlists: Record<string, Playlist> = {};
  for (const [id, playlist] of Object.entries(data?.playlists ?? {})) {
    if (!playlist || typeof playlist !== 'object') continue;
    playlists[id] = {
      ...playlist,
      id,
      trackIds: [...new Set((playlist.trackIds ?? []).filter((t) => t in tracks))],
    };
  }
  if (!playlists[DEFAULT_PLAYLIST_ID]) {
    playlists[DEFAULT_PLAYLIST_ID] = base.playlists[DEFAULT_PLAYLIST_ID];
  }
  const order = (data?.playlistOrder ?? []).filter((id, i, all) => id in playlists && all.indexOf(id) === i);
  for (const id of Object.keys(playlists)) if (!order.includes(id)) order.push(id);
  const active =
    data?.activePlaylistId && data.activePlaylistId in playlists
      ? data.activePlaylistId
      : DEFAULT_PLAYLIST_ID;
  return {
    tracks: pruneTracks(tracks, playlists),
    playlists,
    playlistOrder: order,
    activePlaylistId: active,
  };
}

export function createLibraryStore(storage: StateStorage, name = 'replay-library') {
  return create<LibraryState>()(
    persist(
      (set, get) => ({
        ...initialLibrary(),

        addTrack: (input, playlistId) => {
          const targetId = playlistId ?? get().activePlaylistId;
          const playlist = get().playlists[targetId];
          if (!playlist) return 'missing-playlist';
          if (playlist.trackIds.includes(input.id)) return 'exists';
          const now = Date.now();
          const existing = get().tracks[input.id];
          const track: Track = {
            ...existing,
            ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
            id: input.id,
            title: input.title || existing?.title || 'Untitled video',
            addedAt: existing?.addedAt ?? input.addedAt ?? now,
          };
          set((state) => ({
            tracks: { ...state.tracks, [track.id]: track },
            playlists: {
              ...state.playlists,
              [targetId]: { ...playlist, trackIds: [...playlist.trackIds, track.id], updatedAt: now },
            },
            activePlaylistId: targetId,
          }));
          return 'added';
        },

        removeTrack: (playlistId, trackId) =>
          set((state) => {
            const playlist = state.playlists[playlistId];
            if (!playlist || !playlist.trackIds.includes(trackId)) return state;
            const playlists = {
              ...state.playlists,
              [playlistId]: {
                ...playlist,
                trackIds: playlist.trackIds.filter((id) => id !== trackId),
                updatedAt: Date.now(),
              },
            };
            return { playlists, tracks: pruneTracks(state.tracks, playlists) };
          }),

        moveTrack: (playlistId, from, to) =>
          set((state) => {
            const playlist = state.playlists[playlistId];
            if (!playlist) return state;
            const ids = [...playlist.trackIds];
            if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) {
              return state;
            }
            const [moved] = ids.splice(from, 1);
            ids.splice(to, 0, moved);
            return {
              playlists: {
                ...state.playlists,
                [playlistId]: { ...playlist, trackIds: ids, updatedAt: Date.now() },
              },
            };
          }),

        updateTrack: (trackId, patch) =>
          set((state) => {
            const track = state.tracks[trackId];
            if (!track) return state;
            const defined = Object.fromEntries(
              Object.entries(patch).filter(([, v]) => v !== undefined && v !== ''),
            );
            return { tracks: { ...state.tracks, [trackId]: { ...track, ...defined } } };
          }),

        createPlaylist: (name) => {
          const id = makeId();
          const now = Date.now();
          set((state) => ({
            playlists: {
              ...state.playlists,
              [id]: {
                id,
                name: cleanName(name, `Playlist ${state.playlistOrder.length + 1}`),
                trackIds: [],
                createdAt: now,
                updatedAt: now,
              },
            },
            playlistOrder: [...state.playlistOrder, id],
          }));
          return id;
        },

        renamePlaylist: (playlistId, name) =>
          set((state) => {
            const playlist = state.playlists[playlistId];
            if (!playlist) return state;
            return {
              playlists: {
                ...state.playlists,
                [playlistId]: {
                  ...playlist,
                  name: cleanName(name, playlist.name),
                  updatedAt: Date.now(),
                },
              },
            };
          }),

        deletePlaylist: (playlistId) =>
          set((state) => {
            // The default playlist is the fallback target and always exists.
            if (playlistId === DEFAULT_PLAYLIST_ID || !state.playlists[playlistId]) return state;
            const playlists = { ...state.playlists };
            delete playlists[playlistId];
            return {
              playlists,
              playlistOrder: state.playlistOrder.filter((id) => id !== playlistId),
              tracks: pruneTracks(state.tracks, playlists),
              activePlaylistId:
                state.activePlaylistId === playlistId ? DEFAULT_PLAYLIST_ID : state.activePlaylistId,
            };
          }),

        clearPlaylist: (playlistId) =>
          set((state) => {
            const playlist = state.playlists[playlistId];
            if (!playlist) return state;
            const playlists = {
              ...state.playlists,
              [playlistId]: { ...playlist, trackIds: [], updatedAt: Date.now() },
            };
            return { playlists, tracks: pruneTracks(state.tracks, playlists) };
          }),

        setActivePlaylist: (playlistId) =>
          set((state) => (state.playlists[playlistId] ? { activePlaylistId: playlistId } : state)),
      }),
      {
        name,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: ({ tracks, playlists, playlistOrder, activePlaylistId }) => ({
          tracks,
          playlists,
          playlistOrder,
          activePlaylistId,
        }),
        merge: (persisted, current) => ({
          ...current,
          ...normalizeLibrary(persisted as Partial<LibraryData> | undefined),
        }),
      },
    ),
  );
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;

/** Tracks of a playlist in order, skipping any dangling references. */
export function selectPlaylistTracks(state: LibraryData, playlistId: string): Track[] {
  const playlist = state.playlists[playlistId];
  if (!playlist) return [];
  return playlist.trackIds.map((id) => state.tracks[id]).filter((t): t is Track => Boolean(t));
}

/** Playlists (by id) that contain the given video. */
export function playlistsContaining(state: LibraryData, trackId: string): string[] {
  return state.playlistOrder.filter((id) => state.playlists[id]?.trackIds.includes(trackId));
}
