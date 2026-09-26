import * as Haptics from 'expo-haptics';

import { showToast } from '@/components/Toast';
import { player } from '@/features/player/runtime';
import { fetchVideoSummary } from '@/features/youtube/oembed';
import { thumbnailUrl } from '@/features/youtube/url';

import { useLibrary } from './index';
import type { AddResult } from './types';

export type VideoInput = {
  videoId: string;
  title?: string;
  author?: string;
  durationSec?: number;
};

/**
 * Adds a video to a playlist (the active one by default) with user feedback,
 * then fills in title/channel from oEmbed when the page did not provide them.
 */
export function addVideo(video: VideoInput, playlistId?: string): AddResult {
  const library = useLibrary.getState();
  const target = playlistId ?? library.activePlaylistId;
  const result = library.addTrack(
    {
      id: video.videoId,
      title: video.title?.trim() ?? '',
      author: video.author,
      durationSec: video.durationSec,
      thumbnailUrl: thumbnailUrl(video.videoId),
    },
    target,
  );
  const name = useLibrary.getState().playlists[target]?.name ?? 'playlist';

  if (result === 'added') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(`Added to ${name}`, {
      icon: 'checkmark-circle',
      action: { label: 'Play', onPress: () => player.playPlaylist(target, { startId: video.videoId }) },
    });
    if (!video.title || !video.author) void enrich(video.videoId);
  } else if (result === 'exists') {
    showToast(`Already in ${name}`, { icon: 'information-circle' });
  } else {
    showToast('That playlist no longer exists', { icon: 'alert-circle' });
  }
  return result;
}

async function enrich(videoId: string): Promise<void> {
  const summary = await fetchVideoSummary(videoId);
  if (!summary) return;
  const track = useLibrary.getState().tracks[videoId];
  if (!track) return;
  useLibrary.getState().updateTrack(videoId, {
    title: !track.title || track.title === 'Untitled video' ? summary.title : undefined,
    author: track.author ? undefined : summary.author,
  });
}
