import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/IconButton';
import { Thumbnail } from '@/components/Thumbnail';
import { useLibrary } from '@/features/library';
import { colors, spacing } from '@/theme';

import { player, usePlayer } from '../runtime';

/** Docked above the tab bar whenever something is loaded. */
export function MiniPlayer() {
  const currentId = usePlayer((s) => s.currentId);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const progress = usePlayer((s) => (s.duration > 0 ? Math.min(s.position / s.duration, 1) : 0));
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));

  if (!currentId) return null;

  const playing = status === 'playing';
  const busy = status === 'resolving' || status === 'loading';
  const subtitle = status === 'error' ? error : status === 'idle' ? 'Tap play to resume' : track?.author;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Now playing: ${track?.title ?? 'video'}. Open player`}
      onPress={() => router.push('/player')}
      style={styles.container}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      <Thumbnail videoId={currentId} uri={track?.thumbnailUrl} width={64} height={40} rounded={4} />
      <View style={styles.text}>
        <AppText variant="small" numberOfLines={1} style={styles.title}>
          {track?.title ?? 'YouTube video'}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone={status === 'error' ? 'danger' : 'secondary'} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : (
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? 'Pause' : 'Play'}
          size={26}
          onPress={() => player.togglePlay()}
        />
      )}
      <IconButton icon="play-skip-forward" label="Next" size={22} onPress={() => player.next()} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  text: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  spinner: {
    width: 44,
  },
});
