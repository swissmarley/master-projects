import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

import { player, usePlayer } from '../runtime';

export function SeekBar() {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const isLive = usePlayer((s) => s.isLive);
  // While dragging, show the finger's value instead of the playback position.
  const [dragValue, setDragValue] = useState<number | null>(null);

  if (isLive) {
    return (
      <View style={styles.liveRow}>
        <View style={styles.liveBadge}>
          <AppText variant="caption" style={styles.liveText}>
            LIVE
          </AppText>
        </View>
      </View>
    );
  }

  const value = dragValue ?? position;
  const max = Math.max(duration, 1);
  return (
    <View>
      <Slider
        accessibilityLabel="Seek"
        value={Math.min(value, max)}
        minimumValue={0}
        maximumValue={max}
        disabled={duration <= 0}
        onSlidingStart={(v) => setDragValue(v)}
        onValueChange={(v) => setDragValue((current) => (current === null ? current : v))}
        onSlidingComplete={(v) => {
          player.seekTo(v);
          setDragValue(null);
        }}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
        style={styles.slider}
      />
      <View style={styles.times}>
        <AppText variant="caption" tone="secondary">
          {formatDuration(value)}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {duration > 0 ? `-${formatDuration(Math.max(duration - value, 0))}` : '--:--'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: {
    height: 36,
    marginHorizontal: -spacing.xs,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  liveRow: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  liveText: {
    color: colors.text,
    fontWeight: '700',
  },
});
