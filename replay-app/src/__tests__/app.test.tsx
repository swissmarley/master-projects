/**
 * Integration tests: mount the real Expo Router tree (layouts, tabs, screens,
 * stores, controller) with only the native edges faked.
 * (Testing Library 14: render, fireEvent and act are async; renderRouter
 * switches Jest to fake timers, which waitFor/findBy advance automatically.)
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { useLibrary } from '@/features/library';
import { initialLibrary } from '@/features/library/store';
import { player, playerStore } from '@/features/player/runtime';
import { useSettings } from '@/features/settings';

jest.mock('expo-sqlite/kv-store', () => {
  const data = new Map<string, string>();
  const storage = {
    getItemSync: (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
  return { __esModule: true, default: storage, Storage: storage, AsyncStorage: storage };
});

jest.mock('expo-video', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    createVideoPlayer: () => ({
      playing: false,
      currentTime: 0,
      duration: 0,
      addListener: () => ({ remove: () => {} }),
      replaceAsync: jest.fn(async () => {}),
      replace: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
    }),
    VideoView: () => React.createElement(View, { testID: 'video-view' }),
  };
});

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const WebView = React.forwardRef(function WebView(_props: object, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      injectJavaScript: jest.fn(),
      goBack: jest.fn(),
      goForward: jest.fn(),
      reload: jest.fn(),
      stopLoading: jest.fn(),
    }));
    return React.createElement(View, { testID: 'webview' });
  });
  return { __esModule: true, WebView, default: WebView };
});

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success' },
}));

const VIDEO_ID = 'dQw4w9WgXcQ';

beforeAll(() => {
  // No network in tests: oEmbed/Innertube lookups fail fast.
  global.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
});

beforeEach(async () => {
  await act(() => {
    player.stop();
    useLibrary.setState(initialLibrary());
    useSettings.getState().reset();
  });
});

describe('Replay app', () => {
  it('opens on the YouTube browser, with the tab bar', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByLabelText('Search YouTube or enter an address')).toBeOnTheScreen();
    expect(screen.getByTestId('webview')).toBeOnTheScreen();
    expect(screen.getByText('Browse')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });

  it('lists playlists and marks where new videos go', async () => {
    await renderRouter('./src/app', { initialUrl: '/library' });
    expect(await screen.findByText('My Playlist')).toBeOnTheScreen();
    expect(screen.getByText('New videos go here')).toBeOnTheScreen();
    expect(screen.getByText('0 videos')).toBeOnTheScreen();
  });

  it('shows a playlist, starts a track, and explains why it cannot play', async () => {
    await act(() => {
      useLibrary.getState().addTrack({ id: VIDEO_ID, title: 'Never Gonna Give You Up', author: 'Rick Astley', durationSec: 212 });
      useSettings.getState().update({ useInnertube: false, useWebViewCapture: false });
    });
    await renderRouter('./src/app', { initialUrl: '/playlist/default' });
    expect(await screen.findByText('1 video · 4 min')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Play Never Gonna Give You Up'));
    await waitFor(() => expect(playerStore.getState().status).toBe('error'));
    expect(playerStore.getState()).toMatchObject({
      currentId: VIDEO_ID,
      playlistId: 'default',
      error: 'All stream sources are turned off in Settings.',
    });
  });

  it('adds a video from a replay:// or YouTube deep link', async () => {
    await renderRouter('./src/app', { initialUrl: `/add?v=${VIDEO_ID}` });
    await waitFor(() => expect(useLibrary.getState().playlists.default.trackIds).toEqual([VIDEO_ID]));
    expect(await screen.findByText('Added to My Playlist')).toBeOnTheScreen();
  });

  it('shows the settings', async () => {
    await renderRouter('./src/app', { initialUrl: '/settings' });
    expect(await screen.findByText('Stream sources')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Data saver'));
    expect(useSettings.getState().audioQuality).toBe('low');
  });

  it('shows an empty player when nothing is loaded', async () => {
    await renderRouter('./src/app', { initialUrl: '/player' });
    expect(await screen.findByText('Nothing is playing')).toBeOnTheScreen();
  });
});
