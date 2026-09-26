import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Thumbnail } from '@/components/Thumbnail';
import { formatDuration } from '@/lib/format';
import { colors, spacing } from '@/theme';

import type { Track } from '../types';

type Props = {
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  isBusy: boolean;
  onPress: (track: Track) => void;
  onMore: (track: Track) => void;
};

export const TrackRow = memo(function TrackRow({ track, isCurrent, isPlaying, isBusy, onPress, onMore }: Props) {
  const meta = [track.author, track.durationSec ? formatDuration(track.durationSec) : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title}`}
      onPress={() => onPress(track)}
      onLongPress={() => onMore(track)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View>
        <Thumbnail videoId={track.id} uri={track.thumbnailUrl} width={112} />
        {isCurrent ? (
          <View style={styles.nowPlaying}>
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Icon name={isPlaying ? 'volume-high' : 'pause'} size={20} color={colors.text} />
            )}
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <AppText numberOfLines={2} style={isCurrent && styles.current}>
          {track.title}
        </AppText>
        {meta ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <IconButton icon="ellipsis-vertical" label={`More options for ${track.title}`} size={18} onPress={() => onMore(track)} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  nowPlaying: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  current: {
    color: colors.accent,
  },
});
