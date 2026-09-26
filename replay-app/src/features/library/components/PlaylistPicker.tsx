import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { PromptModal } from '@/components/PromptModal';
import { Sheet, SheetItem } from '@/components/Sheet';

import { useLibrary } from '../index';

type Props = {
  visible: boolean;
  title?: string;
  /** Video being added; playlists that already contain it are marked. */
  videoId?: string | null;
  onClose: () => void;
  onPick: (playlistId: string) => void;
};

/** Bottom sheet to choose (or create) the playlist to add to. */
export function PlaylistPicker({ visible, title = 'Add to playlist', videoId, onClose, onPick }: Props) {
  const playlists = useLibrary(
    useShallow((s) => s.playlistOrder.map((id) => s.playlists[id]).filter((p) => p !== undefined)),
  );
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Sheet visible={visible && !creating} onClose={onClose} title={title}>
        {playlists.map((playlist) => {
          const contains = videoId ? playlist.trackIds.includes(videoId) : false;
          return (
            <SheetItem
              key={playlist.id}
              icon="list"
              label={playlist.name}
              detail={`${playlist.trackIds.length} ${playlist.trackIds.length === 1 ? 'video' : 'videos'}${contains ? ' · already added' : ''}`}
              selected={contains}
              onPress={() => onPick(playlist.id)}
            />
          );
        })}
        <SheetItem icon="add-circle-outline" label="New playlist…" onPress={() => setCreating(true)} />
      </Sheet>
      <PromptModal
        visible={visible && creating}
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          const id = useLibrary.getState().createPlaylist(name);
          setCreating(false);
          onPick(id);
        }}
      />
    </>
  );
}
