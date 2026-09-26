import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Share, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { PromptModal } from '@/components/PromptModal';
import { Sheet, SheetItem } from '@/components/Sheet';
import { showToast } from '@/components/Toast';
import { useBrowserRequests } from '@/features/browser/browser-store';
import { DEFAULT_PLAYLIST_ID, selectPlaylistTracks, useLibrary, type Track } from '@/features/library';
import { PlaylistCover } from '@/features/library/components/PlaylistCover';
import { PlaylistPicker } from '@/features/library/components/PlaylistPicker';
import { TrackRow } from '@/features/library/components/TrackRow';
import { player, usePlayer } from '@/features/player/runtime';
import { shareUrl, watchUrl } from '@/features/youtube/url';
import { summarizeDurations } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlist = useLibrary((s) => s.playlists[id]);
  const tracks = useLibrary(useShallow((s) => selectPlaylistTracks(s, id)));
  const isTarget = useLibrary((s) => s.activePlaylistId === id);
  const currentId = usePlayer((s) => (s.playlistId === id ? s.currentId : null));
  const status = usePlayer((s) => s.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [trackMenu, setTrackMenu] = useState<Track | null>(null);
  const [copying, setCopying] = useState<Track | null>(null);

  const onPlayTrack = useCallback(
    (track: Track) => {
      if (track.id === currentId) player.togglePlay();
      else player.playPlaylist(id, { startId: track.id });
    },
    [currentId, id],
  );
  const onMore = useCallback((track: Track) => setTrackMenu(track), []);

  if (!playlist) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="alert-circle-outline" title="Playlist not found">
          <Button label="Back to playlists" variant="secondary" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const index = trackMenu ? playlist.trackIds.indexOf(trackMenu.id) : -1;
  const last = playlist.trackIds.length - 1;
  const move = (to: number) => {
    if (index >= 0) useLibrary.getState().moveTrack(id, index, to);
    setTrackMenu(null);
  };

  const confirm = (title: string, message: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onConfirm },
    ]);

  const header = (
    <View style={styles.hero}>
      <PlaylistCover videoIds={playlist.trackIds} size={148} />
      <AppText variant="heading" style={styles.center} numberOfLines={2}>
        {playlist.name}
      </AppText>
      <AppText variant="small" tone="secondary">
        {summarizeDurations(tracks.map((t) => t.durationSec))}
      </AppText>
      {tracks.length > 0 ? (
        <View style={styles.actions}>
          <Button label="Play" icon="play" onPress={() => player.playPlaylist(id, { shuffle: false })} style={styles.action} />
          <Button
            label="Shuffle"
            icon="shuffle"
            variant="secondary"
            onPress={() => player.playPlaylist(id, { shuffle: true })}
            style={styles.action}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: playlist.name,
          headerRight: () => (
            <IconButton icon="ellipsis-horizontal" label="Playlist options" onPress={() => setMenuOpen(true)} />
          ),
        }}
      />
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            isCurrent={item.id === currentId}
            isPlaying={item.id === currentId && status === 'playing'}
            isBusy={item.id === currentId && (status === 'resolving' || status === 'loading')}
            onPress={onPlayTrack}
            onMore={onMore}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="add-circle-outline"
            title="No videos yet"
            message="Open the Browse tab, find a video on YouTube and tap Add.">
            <Button
              label="Browse YouTube"
              icon="logo-youtube"
              variant="secondary"
              onPress={() => {
                useLibrary.getState().setActivePlaylist(id);
                router.navigate('/');
              }}
            />
          </EmptyState>
        }
        contentContainerStyle={styles.list}
      />

      <Sheet visible={trackMenu !== null} onClose={() => setTrackMenu(null)} title={trackMenu?.title}>
        {trackMenu ? (
          <>
            <SheetItem
              icon="play"
              label="Play"
              onPress={() => {
                player.playPlaylist(id, { startId: trackMenu.id });
                setTrackMenu(null);
              }}
            />
            {index > 0 ? <SheetItem icon="arrow-up-circle-outline" label="Move to top" onPress={() => move(0)} /> : null}
            {index > 0 ? <SheetItem icon="arrow-up" label="Move up" onPress={() => move(index - 1)} /> : null}
            {index < last ? <SheetItem icon="arrow-down" label="Move down" onPress={() => move(index + 1)} /> : null}
            {index < last ? (
              <SheetItem icon="arrow-down-circle-outline" label="Move to bottom" onPress={() => move(last)} />
            ) : null}
            <SheetItem
              icon="copy-outline"
              label="Add to another playlist…"
              onPress={() => {
                setCopying(trackMenu);
                setTrackMenu(null);
              }}
            />
            <SheetItem
              icon="globe-outline"
              label="Open in browser"
              onPress={() => {
                useBrowserRequests.getState().open(watchUrl(trackMenu.id));
                setTrackMenu(null);
                router.navigate('/');
              }}
            />
            <SheetItem
              icon="share-outline"
              label="Share link"
              onPress={() => {
                void Share.share({ message: shareUrl(trackMenu.id) });
                setTrackMenu(null);
              }}
            />
            <SheetItem
              icon="trash-outline"
              label="Remove from playlist"
              destructive
              onPress={() => {
                useLibrary.getState().removeTrack(id, trackMenu.id);
                setTrackMenu(null);
              }}
            />
          </>
        ) : null}
      </Sheet>

      <PlaylistPicker
        visible={copying !== null}
        title="Add to playlist"
        videoId={copying?.id}
        onClose={() => setCopying(null)}
        onPick={(target) => {
          if (copying) {
            const result = useLibrary.getState().addTrack(copying, target);
            const name = useLibrary.getState().playlists[target]?.name ?? 'playlist';
            showToast(result === 'added' ? `Added to ${name}` : `Already in ${name}`, { icon: 'checkmark-circle' });
          }
          setCopying(null);
        }}
      />

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={playlist.name}>
        {!isTarget ? (
          <SheetItem
            icon="add-circle-outline"
            label="Add new videos here"
            detail="The browser's Add button will use this playlist"
            onPress={() => {
              useLibrary.getState().setActivePlaylist(id);
              setMenuOpen(false);
            }}
          />
        ) : null}
        <SheetItem
          icon="pencil"
          label="Rename"
          onPress={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
        {tracks.length > 0 ? (
          <SheetItem
            icon="remove-circle-outline"
            label="Remove all videos"
            destructive
            onPress={() => {
              setMenuOpen(false);
              confirm('Remove all videos?', `This empties "${playlist.name}".`, 'Remove all', () =>
                useLibrary.getState().clearPlaylist(id),
              );
            }}
          />
        ) : null}
        {id !== DEFAULT_PLAYLIST_ID ? (
          <SheetItem
            icon="trash-outline"
            label="Delete playlist"
            destructive
            onPress={() => {
              setMenuOpen(false);
              confirm('Delete playlist?', `"${playlist.name}" will be deleted.`, 'Delete', () => {
                router.back();
                useLibrary.getState().deletePlaylist(id);
              });
            }}
          />
        ) : null}
      </Sheet>

      <PromptModal
        visible={renaming}
        title="Rename playlist"
        initialValue={playlist.name}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          useLibrary.getState().renamePlaylist(id, name);
          setRenaming(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  action: {
    minWidth: 128,
  },
});
