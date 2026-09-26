/**
 * Helpers for recognising YouTube links and extracting video / playlist IDs.
 *
 * Deliberately dependency-free and independent of the `URL` global so it
 * behaves identically on device (Hermes), in Jest, and when a copy of the same
 * rules runs inside the in-app browser.
 */

/** YouTube video IDs are always 11 characters of base64url. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** Playlist IDs (PL…, OLAK…, RD…, UU…, LL, WL, …). */
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

const YOUTUBE_HOST_RE = /^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtube-nocookie\.com)$/;
const SHORT_HOST_RE = /^(?:www\.)?youtu\.be$/;

/** Path prefixes whose next segment is a video ID. */
const ID_PATH_PREFIXES = ['shorts', 'embed', 'v', 'e', 'live', 'watch'];

export type ParsedUrl = {
  host: string;
  path: string;
  query: Record<string, string>;
};

export function isValidVideoId(id: string | null | undefined): id is string {
  return typeof id === 'string' && VIDEO_ID_RE.test(id);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = safeDecode(eq === -1 ? part : part.slice(0, eq));
    const value = eq === -1 ? '' : safeDecode(part.slice(eq + 1));
    // First occurrence wins, like URLSearchParams#get.
    if (!(key in query)) query[key] = value;
  }
  return query;
}

/**
 * Minimal absolute-URL splitter. Accepts inputs without a scheme
 * ("youtu.be/abc") because that is what people paste.
 */
export function splitUrl(input: string): ParsedUrl | null {
  const trimmed = input.trim();
  const match = /^(?:([a-z][a-z0-9+.-]*):)?\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i.exec(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//') ? trimmed : `//${trimmed}`,
  );
  if (!match) return null;
  const scheme = match[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return null;
  // Strip credentials and port.
  const host = match[2].replace(/^.*@/, '').replace(/:\d+$/, '').toLowerCase();
  if (!host || !host.includes('.')) return null;
  return { host, path: match[3] || '/', query: parseQuery(match[4] ?? '') };
}

export function isYouTubeHost(host: string): boolean {
  return YOUTUBE_HOST_RE.test(host) || SHORT_HOST_RE.test(host);
}

/**
 * Extracts the video ID from any common YouTube URL shape, or from a bare ID.
 *
 * Supported: watch?v=, youtu.be/, /shorts/, /embed/, /v/, /e/, /live/,
 * music.youtube.com, youtube-nocookie.com, attribution_link?u=… and
 * m./www./music. subdomains.
 */
export function parseVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (isValidVideoId(trimmed)) return trimmed;

  const url = splitUrl(trimmed);
  if (!url || !isYouTubeHost(url.host)) return null;

  if (SHORT_HOST_RE.test(url.host)) {
    const id = url.path.split('/')[1];
    return isValidVideoId(id) ? id : null;
  }

  if (isValidVideoId(url.query.v)) return url.query.v;

  // youtube.com/attribution_link?u=/watch%3Fv%3D<id>%26feature%3Dshare
  if (url.path === '/attribution_link' && url.query.u) {
    return parseVideoId(`https://www.youtube.com${url.query.u}`);
  }

  const segments = url.path.split('/').filter(Boolean);
  if (segments.length >= 2 && ID_PATH_PREFIXES.includes(segments[0])) {
    return isValidVideoId(segments[1]) ? segments[1] : null;
  }
  return null;
}

/** Extracts the `list=` playlist ID from a YouTube URL, if present. */
export function parsePlaylistId(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = splitUrl(input);
  if (!url || !isYouTubeHost(url.host)) return null;
  const list = url.query.list;
  return list && PLAYLIST_ID_RE.test(list) ? list : null;
}

/** Reads a start offset (`t=90`, `t=1m30s`, `start=90`) in seconds. */
export function parseStartSeconds(input: string | null | undefined): number | null {
  if (!input) return null;
  const url = splitUrl(input);
  const raw = url?.query.t ?? url?.query.start;
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Finds all http(s) URLs in free text (e.g. a shared "Check this out: https://…"). */
export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/** Finds the first YouTube video referenced anywhere in a block of text. */
export function findVideoIdInText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const url of extractUrls(text)) {
    const id = parseVideoId(url);
    if (id) return id;
  }
  // Fall back to scheme-less links such as "youtu.be/abc…".
  for (const token of text.split(/\s+/)) {
    const id = parseVideoId(token);
    if (id && token.includes('/')) return id;
  }
  return parseVideoId(text);
}

export function watchUrl(videoId: string): string {
  return `https://m.youtube.com/watch?v=${videoId}`;
}

export function shareUrl(videoId: string): string {
  return `https://youtu.be/${videoId}`;
}

export type ThumbnailQuality = 'default' | 'mq' | 'hq' | 'sd' | 'maxres';

export function thumbnailUrl(videoId: string, quality: ThumbnailQuality = 'hq'): string {
  const file = quality === 'default' ? 'default' : `${quality}default`;
  return `https://i.ytimg.com/vi/${videoId}/${file}.jpg`;
}
