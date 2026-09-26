import { Platform } from 'react-native';

import { useSettings } from '@/features/settings';
import type { MediaPlatform } from '@/features/youtube/formats';
import { getVisitorData } from '@/features/youtube/session';

import { captureService, WebViewCaptureResolver } from './capture-service';
import { ResolverChain, StreamCache } from './chain';
import { InnertubeResolver } from './innertube-resolver';
import { InvidiousResolver, normalizeBaseUrl, PipedResolver } from './remote-resolver';
import type { StreamResolver } from './types';

const platform: MediaPlatform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

const getPreferences = () => {
  const { audioQuality, videoMaxHeight } = useSettings.getState();
  return { audioQuality, videoMaxHeight };
};

const innertube = new InnertubeResolver({ platform, getPreferences, getVisitorData: () => getVisitorData() });
const webview = new WebViewCaptureResolver(captureService);

let remote: { key: string; resolver: StreamResolver } | null = null;

function remoteResolver(kind: 'piped' | 'invidious', baseUrl: string): StreamResolver {
  const key = `${kind}|${baseUrl}`;
  if (remote?.key !== key) {
    const options = { platform, getPreferences };
    remote = {
      key,
      resolver: kind === 'piped' ? new PipedResolver(baseUrl, options) : new InvidiousResolver(baseUrl, options),
    };
  }
  return remote.resolver;
}

/**
 * On-device Innertube first (fast, works in the background), then the user's
 * own Piped/Invidious instance if configured, then Brave-style WebView capture
 * (slowest, needs the app in the foreground).
 */
export function enabledResolvers(): StreamResolver[] {
  const settings = useSettings.getState();
  const list: StreamResolver[] = [];
  if (settings.useInnertube) list.push(innertube);
  const baseUrl = settings.remoteKind !== 'off' ? normalizeBaseUrl(settings.remoteUrl) : null;
  if (baseUrl && settings.remoteKind !== 'off') list.push(remoteResolver(settings.remoteKind, baseUrl));
  if (settings.useWebViewCapture) list.push(webview);
  return list;
}

export const streamResolver = new ResolverChain(enabledResolvers, new StreamCache(), (name, videoId, error) => {
  if (__DEV__) {
    console.log(`[replay] ${name} could not resolve ${videoId}:`, error instanceof Error ? error.message : error);
  }
});

export { captureService };
export * from './types';
