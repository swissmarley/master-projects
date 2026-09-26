import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { thumbnailUrl, type ThumbnailQuality } from '@/features/youtube/url';
import { colors, radius } from '@/theme';

import { Icon } from './Icon';

type Props = {
  videoId?: string | null;
  uri?: string;
  width: number;
  /** Defaults to 16:9. */
  height?: number;
  rounded?: number;
  /**
   * `hq` is 4:3 with letterbox bars that `cover` crops away in 16:9 frames;
   * `mq` is a true 16:9 image, better for square crops.
   */
  quality?: ThumbnailQuality;
  style?: StyleProp<ViewStyle>;
};

export function Thumbnail({ videoId, uri, width, height, rounded = radius.sm, quality = 'hq', style }: Props) {
  const source = uri ?? (videoId ? thumbnailUrl(videoId, quality) : undefined);
  const h = height ?? Math.round((width * 9) / 16);
  return (
    <View style={[styles.frame, { width, height: h, borderRadius: rounded }, style]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          recyclingKey={source}
          transition={150}
        />
      ) : (
        <Icon name="musical-notes" size={Math.min(width, h) / 2.5} color={colors.textTertiary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
