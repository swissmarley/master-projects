/** A saved YouTube video. Tracks are shared between playlists by video ID. */
export type Track = {
  /** YouTube video ID. */
  id: string;
  title: string;
  /** Channel name. */
  author?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  addedAt: number;
};

export type TrackInput = Omit<Track, 'addedAt'> & { addedAt?: number };

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
};

export const DEFAULT_PLAYLIST_ID = 'default';
export const DEFAULT_PLAYLIST_NAME = 'My Playlist';

export type AddResult = 'added' | 'exists' | 'missing-playlist';
