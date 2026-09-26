import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Thumbnail } from '@/components/Thumbnail';
import { colors, radius } from '@/theme';

type Props = {
  videoIds: string[];
  size: number;
};

/** 2×2 mosaic of the first four videos (or a single cover). */
export function PlaylistCover({ videoIds, size }: Props) {
  const ids = videoIds.slice(0, 4);
  if (ids.length === 0) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Icon name="musical-notes" size={size / 3} color={colors.textTertiary} />
      </View>
    );
  }
  if (ids.length < 4) {
    return <Thumbnail videoId={ids[0]} width={size} height={size} rounded={radius.md} quality="mq" />;
  }
  const half = size / 2;
  return (
    <View style={[styles.grid, { width: size, height: size }]}>
      {ids.map((id) => (
        <Thumbnail key={id} videoId={id} width={half} height={half} rounded={0} quality="mq" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
