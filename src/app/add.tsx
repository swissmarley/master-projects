import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { showToast } from '@/components/Toast';
import { useLibrary } from '@/features/library';
import { addVideo } from '@/features/library/add-video';
import { findVideoIdInText, parseVideoId } from '@/features/youtube/url';
import { colors } from '@/theme';

/**
 * Handles `replay://add?v=<id>`, `replay://add?url=<link>` and YouTube links
 * opened with Replay (rewritten here by +native-intent).
 */
export default function AddRoute() {
  const params = useLocalSearchParams<{ v?: string; url?: string; playlist?: string }>();

  useEffect(() => {
    const videoId = parseVideoId(params.v) ?? findVideoIdInText(params.url);
    const library = useLibrary.getState();
    const target = params.playlist && library.playlists[params.playlist] ? params.playlist : library.activePlaylistId;
    if (videoId) {
      addVideo({ videoId }, target);
      router.replace({ pathname: '/playlist/[id]', params: { id: target } });
    } else {
      showToast("That link isn't a YouTube video", { icon: 'alert-circle' });
      router.replace('/');
    }
    // Runs once per incoming link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
});
