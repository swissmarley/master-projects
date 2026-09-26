import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PromptModal } from '@/components/PromptModal';
import { useLibrary } from '@/features/library';
import { addVideo } from '@/features/library/add-video';
import { PlaylistPicker } from '@/features/library/components/PlaylistPicker';
import { player, playerStore } from '@/features/player/runtime';
import { useSettings } from '@/features/settings';
import { rememberVisitorData } from '@/features/youtube/session';
import { colors, radius, spacing } from '@/theme';

import { useBrowserRequests } from './browser-store';
import { allowWebNavigation, HOME_URL, toBrowserUrl, userAgentProps } from './constants';
import {
  buildPageScript,
  pageCommandScript,
  parsePageMessage,
  type PageCommand,
  type PageMeta,
} from './page-script';

type PageState = { url: string; title?: string; video: PageMeta | null };

const NO_IDS: string[] = [];

function addressLabel(page: PageState): string {
  if (page.video?.title) return page.video.title;
  if (page.title) return page.title;
  return page.url.replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/\/$/, '') || 'youtube.com';
}

/**
 * The "go to YouTube" part of the app: m.youtube.com in a WebView with an
 * Add button for the video on screen and "+" buttons on thumbnails.
 */
export function YouTubeBrowser() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [webKey, setWebKey] = useState(0);
  const [source] = useState(() => ({ uri: useBrowserRequests.getState().consume() ?? HOME_URL }));
  const [page, setPage] = useState<PageState>({ url: source.uri, video: null });
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, loading: true });
  const [progress, setProgress] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  const quickAdd = useSettings((s) => s.quickAdd);
  const addedIds = useLibrary((s) => s.playlists[s.activePlaylistId]?.trackIds ?? NO_IDS);
  const activeName = useLibrary((s) => s.playlists[s.activePlaylistId]?.name ?? 'playlist');

  const send = useCallback((command: PageCommand) => {
    webRef.current?.injectJavaScript(pageCommandScript(command));
  }, []);

  const navigate = useCallback((url: string) => {
    webRef.current?.injectJavaScript(`location.href = ${JSON.stringify(url)}; true;`);
  }, []);

  // Injected on every page load with the current options; live pages get commands.
  const injectedScript = useMemo(() => buildPageScript({ quickAdd, addedIds }), [quickAdd, addedIds]);
  useEffect(() => send({ type: 'setQuickAdd', enabled: quickAdd }), [quickAdd, send]);
  useEffect(() => send({ type: 'markAdded', videoIds: addedIds }), [addedIds, send]);

  // One audio source at a time: when Replay starts playing, pause the page.
  useEffect(
    () =>
      playerStore.subscribe((state, previous) => {
        if (state.status === 'playing' && previous.status !== 'playing') send({ type: 'pauseMedia' });
      }),
    [send],
  );

  // "Open in browser" requests from other screens.
  const pendingUrl = useBrowserRequests((s) => s.pendingUrl);
  useEffect(() => {
    if (!pendingUrl) return;
    const url = useBrowserRequests.getState().consume();
    if (url) navigate(url);
  }, [pendingUrl, navigate]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parsePageMessage(event.nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case 'page':
        setPage({ url: message.url, title: message.title, video: message.video });
        break;
      case 'add':
        addVideo(message.video);
        break;
      case 'media':
        if (message.state === 'playing') player.yieldToOtherMedia();
        break;
      case 'session':
        rememberVisitorData(message.visitorData);
        break;
    }
  }, []);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setNav({ canGoBack: state.canGoBack, canGoForward: state.canGoForward, loading: state.loading });
  }, []);

  // Android back button walks the page history before leaving the tab.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!nav.canGoBack) return false;
        webRef.current?.goBack();
        return true;
      });
      return () => subscription.remove();
    }, [nav.canGoBack]),
  );

  const video = page.video;
  const isAdded = video ? addedIds.includes(video.videoId) : false;

  const onAdd = () => {
    if (!video) return;
    if (isAdded) setPickerOpen(true);
    else addVideo(video);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <IconButton icon="chevron-back" label="Back" disabled={!nav.canGoBack} onPress={() => webRef.current?.goBack()} />
        <IconButton
          icon="chevron-forward"
          label="Forward"
          disabled={!nav.canGoForward}
          onPress={() => webRef.current?.goForward()}
        />
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search YouTube or enter an address"
          onPress={() => setAddressOpen(true)}
          style={({ pressed }) => [styles.address, pressed && styles.pressed]}>
          <Icon name="search" size={16} color={colors.textTertiary} />
          <AppText variant="small" tone="secondary" numberOfLines={1} style={styles.addressText}>
            {addressLabel(page)}
          </AppText>
        </Pressable>
        <IconButton
          icon={nav.loading ? 'close' : 'refresh'}
          label={nav.loading ? 'Stop loading' : 'Reload'}
          size={20}
          onPress={() => (nav.loading ? webRef.current?.stopLoading() : webRef.current?.reload())}
        />
        <IconButton icon="home-outline" label="YouTube home" size={20} onPress={() => navigate(HOME_URL)} />
      </View>
      <View style={styles.progressTrack}>
        {nav.loading ? <View style={[styles.progressBar, { width: `${Math.max(progress, 0.05) * 100}%` }]} /> : null}
      </View>

      <WebView
        key={webKey}
        ref={webRef}
        source={source}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={injectedScript}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onMessage={onMessage}
        onNavigationStateChange={onNavigationStateChange}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onShouldStartLoadWithRequest={allowWebNavigation}
        // Browsing must never interrupt what Replay is playing.
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        webviewDebuggingEnabled={__DEV__}
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        onRenderProcessGone={() => setWebKey((k) => k + 1)}
        {...userAgentProps}
      />

      {video ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isAdded ? `In ${activeName}. Choose another playlist` : `Add to ${activeName}`}
          accessibilityHint="Long press to choose a playlist"
          onPress={onAdd}
          onLongPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.addButton, isAdded && styles.addButtonDone, pressed && styles.pressed]}>
          <Icon name={isAdded ? 'checkmark' : 'add'} size={22} color={isAdded ? colors.text : colors.background} />
          <View>
            <AppText variant="title" style={[styles.addLabel, isAdded && styles.addLabelDone]}>
              {isAdded ? 'Added' : 'Add'}
            </AppText>
            <AppText variant="caption" numberOfLines={1} style={[styles.addTarget, isAdded && styles.addTargetDone]}>
              {activeName}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      <PlaylistPicker
        visible={pickerOpen}
        videoId={video?.videoId}
        onClose={() => setPickerOpen(false)}
        onPick={(playlistId) => {
          setPickerOpen(false);
          useLibrary.getState().setActivePlaylist(playlistId);
          if (video) addVideo(video, playlistId);
        }}
      />
      <PromptModal
        visible={addressOpen}
        title="Search YouTube"
        placeholder="Search, or paste a link"
        confirmLabel="Go"
        onCancel={() => setAddressOpen(false)}
        onSubmit={(text) => {
          setAddressOpen(false);
          navigate(toBrowserUrl(text));
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  address: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
  },
  addressText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  progressTrack: {
    height: 2,
  },
  progressBar: {
    height: 2,
    backgroundColor: colors.accent,
  },
  web: {
    flex: 1,
    backgroundColor: colors.background,
  },
  addButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addButtonDone: {
    backgroundColor: colors.surfaceRaised,
  },
  addLabel: {
    color: colors.background,
    fontSize: 15,
    lineHeight: 18,
  },
  addLabelDone: {
    color: colors.text,
  },
  addTarget: {
    color: 'rgba(11, 11, 15, 0.75)',
  },
  addTargetDone: {
    color: colors.textSecondary,
  },
});
