import { kvStorage } from '@/lib/storage';

import { createLibraryStore } from './store';

/** The app's playlist library (persisted in SQLite). */
export const useLibrary = createLibraryStore(kvStorage);

export { playlistsContaining, selectPlaylistTracks } from './store';
export * from './types';
