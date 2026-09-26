import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PromptModal } from '@/components/PromptModal';
import { showToast } from '@/components/Toast';
import { useLibrary, type Playlist } from '@/features/library';
import { addVideo } from '@/features/library/add-video';
import { PlaylistCover } from '@/features/library/components/PlaylistCover';
import { usePlayer } from '@/features/player/runtime';
import { findVideoIdInText } from '@/features/youtube/url';
import { summarizeDurations } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

function PlaylistRow({ playlist, isTarget, isPlaying }: { playlist: Playlist; isTarget: boolean; isPlaying: boolean }) {
  const durations = useLibrary(useShallow((s) => playlist.trackIds.map((id) => s.tracks[id]?.durationSec)));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, ${playlist.trackIds.length} videos`}
      onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: playlist.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <PlaylistCover videoIds={playlist.trackIds} size={64} />
      <View style={styles.rowText}>
        <AppText variant="title" numberOfLines={1} style={isPlaying && styles.playing}>
          {playlist.name}
        </AppText>
        <AppText variant="small" tone="secondary" numberOfLines={1}>
          {summarizeDurations(durations)}
        </AppText>
        {isTarget ? (
          <View style={styles.badge}>
            <Icon name="add-circle" size={12} color={colors.accent} />
            <AppText variant="caption" tone="accent">
              New videos go here
            </AppText>
          </View>
        ) : null}
      </View>
      {isPlaying ? <Icon name="volume-high" size={18} color={colors.accent} /> : null}
      <Icon name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const playlists = useLibrary(
    useShallow((s) => s.playlistOrder.map((id) => s.playlists[id]).filter((p) => p !== undefined)),
  );
  const activeId = useLibrary((s) => s.activePlaylistId);
  const playingId = usePlayer((s) => (s.currentId ? s.playlistId : null));
  const [creating, setCreating] = useState(false);
  const [pasting, setPasting] = useState(false);

  const addFromClipboard = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const videoId = findVideoIdInText(text);
    if (videoId) addVideo({ videoId });
    else setPasting(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="display">Playlists</AppText>
        <View style={styles.headerActions}>
          <IconButton icon="clipboard-outline" label="Add a copied YouTube link" onPress={addFromClipboard} />
          <IconButton icon="add" label="New playlist" size={28} onPress={() => setCreating(true)} />
        </View>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PlaylistRow playlist={item} isTarget={item.id === activeId} isPlaying={item.id === playingId} />
        )}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          <View style={styles.tip}>
            <Icon name="bulb-outline" size={18} color={colors.textTertiary} />
            <AppText variant="small" tone="tertiary" style={styles.tipText}>
              Browse YouTube and tap Add, or the + on any thumbnail. Playback keeps going when you leave the app
              or lock your phone.
            </AppText>
          </View>
        }
      />

      <PromptModal
        visible={creating}
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          const id = useLibrary.getState().createPlaylist(name);
          setCreating(false);
          router.push({ pathname: '/playlist/[id]', params: { id } });
        }}
      />
      <PromptModal
        visible={pasting}
        title="Add a YouTube link"
        message="Paste a link to a YouTube video, e.g. https://youtu.be/…"
        placeholder="https://youtu.be/…"
        keyboardType="url"
        confirmLabel="Add"
        onCancel={() => setPasting(false)}
        onSubmit={(text) => {
          const videoId = findVideoIdInText(text);
          if (!videoId) {
            showToast("That doesn't look like a YouTube video link", { icon: 'alert-circle' });
            return;
          }
          setPasting(false);
          addVideo({ videoId });
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
  },
  list: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  playing: {
    color: colors.accent,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginTop: 2,
  },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tipText: {
    flex: 1,
  },
});
