import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/IconButton';
import { colors } from '@/theme';

import { player, usePlayer } from '../runtime';

/** Shuffle · previous · play/pause · next · repeat */
export function TransportControls() {
  const status = usePlayer((s) => s.status);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.queue.shuffle);
  const repeat = usePlayer((s) => s.queue.repeat);
  const hasQueue = usePlayer((s) => s.queue.order.length > 0);

  const playing = status === 'playing';
  const busy = status === 'resolving' || status === 'loading' || (playing && buffering);

  return (
    <View style={styles.row}>
      <IconButton
        icon="shuffle"
        label={shuffle ? 'Shuffle on' : 'Shuffle off'}
        active={shuffle}
        size={22}
        disabled={!hasQueue}
        onPress={() => player.toggleShuffle()}
      />
      <IconButton icon="play-skip-back" label="Previous" size={30} disabled={!hasQueue} onPress={() => player.previous()} />
      <View style={styles.main}>
        <IconButton
          icon={playing || busy ? 'pause' : 'play'}
          label={playing || busy ? 'Pause' : 'Play'}
          filled
          size={30}
          disabled={!hasQueue}
          onPress={() => player.togglePlay()}
        />
        {busy ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.accent} size="large" /> : null}
      </View>
      <IconButton icon="play-skip-forward" label="Next" size={30} disabled={!hasQueue} onPress={() => player.next()} />
      <View>
        <IconButton
          icon="repeat"
          label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          active={repeat !== 'off'}
          size={22}
          disabled={!hasQueue}
          onPress={() => player.cycleRepeat()}
        />
        {repeat === 'one' ? (
          <View pointerEvents="none" style={styles.oneBadge}>
            <AppText variant="caption" style={styles.oneText}>
              1
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  main: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  oneBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oneText: {
    color: colors.text,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
});
