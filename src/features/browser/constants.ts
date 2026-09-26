import { Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

export const HOME_URL = 'https://m.youtube.com/';

/**
 * Browser-like user agents so YouTube serves its regular mobile site (and,
 * during stream capture on iOS, Safari's HLS fallback). Both the visible
 * browser and the hidden capture view use the same identity and cookies.
 */
export const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

/** Appended to WKWebView's default UA to make it Safari-like. */
export const IOS_APPLICATION_NAME = 'Version/18.5 Mobile/15E148 Safari/604.1';

export const userAgentProps: Pick<WebViewProps, 'userAgent' | 'applicationNameForUserAgent'> =
  Platform.OS === 'android' ? { userAgent: ANDROID_USER_AGENT } : { applicationNameForUserAgent: IOS_APPLICATION_NAME };

/** Keeps navigation inside the web (blocks intent://, vnd.youtube:, app store links…). */
export function allowWebNavigation(request: { url: string }): boolean {
  return /^(https?|about|blob|data):/i.test(request.url);
}

/** Turns address-bar input into a URL: a link, a domain, or a YouTube search. */
export function toBrowserUrl(input: string): string {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`;
  return `https://m.youtube.com/results?search_query=${encodeURIComponent(text)}`;
}
