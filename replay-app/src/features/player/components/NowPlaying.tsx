import { router } from 'expo-router';
import { VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Sheet, SheetItem } from '@/components/Sheet';
import { Thumbnail } from '@/components/Thumbnail';
import { useBrowserRequests } from '@/features/browser/browser-store';
import { useLibrary } from '@/features/library';
import type { ResolverName } from '@/features/resolver/types';
import { useSettings, type PlaybackMode } from '@/features/settings';
import { shareUrl, watchUrl } from '@/features/youtube/url';
import { colors, radius, spacing } from '@/theme';

import { engine, player, usePlayer } from '../runtime';
import { SeekBar } from './SeekBar';
import { TransportControls } from './TransportControls';

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];

const SOURCE_LABEL: Record<ResolverName, string> = {
  innertube: 'On-device stream',
  webview: 'Captured from the YouTube page',
  piped: 'Streaming via Piped',
  invidious: 'Streaming via Invidious',
};

/** Re-renders every `ms` so countdowns stay fresh. */
function useNow(ms: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, enabled]);
  return now;
}

function ModeSwitch({ mode, videoAvailable }: { mode: PlaybackMode; videoAvailable: boolean }) {
  const options: { value: PlaybackMode; label: string; icon: 'musical-notes' | 'videocam' }[] = [
    { value: 'audio', label: 'Audio', icon: 'musical-notes' },
    { value: 'video', label: 'Video', icon: 'videocam' },
  ];
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === mode;
        const disabled = option.value === 'video' && !videoAvailable;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${option.label} mode`}
            disabled={disabled}
            onPress={() => player.setMode(option.value)}
            style={[styles.segment, selected && styles.segmentSelected, disabled && styles.segmentDisabled]}>
            <Icon name={option.icon} size={16} color={selected ? colors.background : colors.textSecondary} />
            <AppText variant="small" style={{ color: selected ? colors.background : colors.textSecondary }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NowPlaying() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const currentId = usePlayer((s) => s.currentId);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const mode = usePlayer((s) => s.mode);
  const hasVideo = usePlayer((s) => s.hasVideo);
  const source = usePlayer((s) => s.source);
  const sleepAt = usePlayer((s) => s.sleepAt);
  const playlistId = usePlayer((s) => s.playlistId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const playlistName = useLibrary((s) => (playlistId ? s.playlists[playlistId]?.name : undefined));
  const pictureInPicture = useSettings((s) => s.pictureInPicture);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const now = useNow(15_000, sleepAt !== null);

  const container = [styles.container, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }];

  if (!currentId) {
    return (
      <View style={container}>
        <EmptyState icon="musical-notes-outline" title="Nothing is playing" message="Open a playlist and press play.">
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const mediaWidth = Math.min(width - spacing.xl * 2, 560);
  const resolved = status !== 'resolving' && status !== 'idle';
  const showVideo = mode === 'video' && hasVideo;
  const sleepMinutes = sleepAt ? Math.max(1, Math.ceil((sleepAt - now) / 60_000)) : null;

  return (
    <View style={container}>
      <View style={styles.header}>
        <IconButton icon="chevron-down" label="Close player" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <AppText variant="label" tone="tertiary">
            Playing from
          </AppText>
          <AppText variant="small" numberOfLines={1} style={styles.bold}>
            {playlistName ?? 'Playlist'}
          </AppText>
        </View>
        <IconButton icon="ellipsis-horizontal" label="More options" onPress={() => setMenuOpen(true)} />
      </View>

      <View style={styles.media}>
        {showVideo ? (
          <VideoView
            player={engine.player}
            style={{ width: mediaWidth, height: (mediaWidth * 9) / 16, borderRadius: radius.md }}
            contentFit="contain"
            nativeControls
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture={pictureInPicture}
            startsPictureInPictureAutomatically={pictureInPicture}
          />
        ) : (
          <Thumbnail videoId={currentId} uri={track?.thumbnailUrl} width={mediaWidth} rounded={radius.lg} />
        )}
      </View>

      <ModeSwitch mode={mode} videoAvailable={!resolved || hasVideo} />
      {mode === 'video' && resolved && !hasVideo ? (
        <AppText variant="caption" tone="tertiary" style={styles.center}>
          Only audio is available for this video.
        </AppText>
      ) : null}

      <View style={styles.titleBlock}>
        <AppText variant="heading" numberOfLines={2}>
          {track?.title ?? 'YouTube video'}
        </AppText>
        <AppText tone="secondary" numberOfLines={1}>
          {track?.author ?? ' '}
        </AppText>
      </View>

      {status === 'error' && error ? (
        <View style={styles.error}>
          <Icon name="alert-circle" size={18} color={colors.danger} />
          <AppText variant="small" style={styles.errorText}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => player.play()} hitSlop={8}>
            <AppText variant="small" tone="accent" style={styles.bold}>
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <SeekBar />
      <TransportControls />

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sleepMinutes ? `Sleep timer: ${sleepMinutes} minutes left` : 'Sleep timer'}
          onPress={() => setSleepOpen(true)}
          style={styles.footerButton}
          hitSlop={8}>
          <Icon name="moon-outline" size={18} color={sleepMinutes ? colors.accent : colors.textSecondary} />
          <AppText variant="caption" tone={sleepMinutes ? 'accent' : 'secondary'}>
            {sleepMinutes ? `${sleepMinutes} min` : 'Sleep'}
          </AppText>
        </Pressable>
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
          {source ? SOURCE_LABEL[source] : ''}
        </AppText>
      </View>

      <Sheet visible={sleepOpen} onClose={() => setSleepOpen(false)} title="Sleep timer">
        {SLEEP_OPTIONS.map((minutes) => (
          <SheetItem
            key={minutes}
            icon="moon-outline"
            label={`${minutes} minutes`}
            onPress={() => {
              player.setSleepTimer(minutes);
              setSleepOpen(false);
            }}
          />
        ))}
        {sleepAt ? (
          <SheetItem
            icon="close-circle-outline"
            label="Turn off timer"
            onPress={() => {
              player.setSleepTimer(null);
              setSleepOpen(false);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={track?.title}>
        {playlistId ? (
          <SheetItem
            icon="list"
            label="Go to playlist"
            onPress={() => {
              setMenuOpen(false);
              router.navigate({ pathname: '/playlist/[id]', params: { id: playlistId } });
            }}
          />
        ) : null}
        <SheetItem
          icon="globe-outline"
          label="Open in browser"
          onPress={() => {
            setMenuOpen(false);
            player.pause();
            useBrowserRequests.getState().open(watchUrl(currentId));
            router.navigate('/');
          }}
        />
        <SheetItem
          icon="share-outline"
          label="Share link"
          onPress={() => {
            setMenuOpen(false);
            void Share.share({ message: shareUrl(currentId) });
          }}
        />
        <SheetItem
          icon="stop-circle-outline"
          label="Stop playback"
          destructive
          onPress={() => {
            setMenuOpen(false);
            player.stop();
            router.back();
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -spacing.md,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  bold: {
    fontWeight: '700',
  },
  media: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  segmented: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  segmentSelected: {
    backgroundColor: colors.text,
  },
  segmentDisabled: {
    opacity: 0.4,
  },
  center: {
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 90, 95, 0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
