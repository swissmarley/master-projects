/**
 * Parsing of Innertube `player` responses and stream selection.
 *
 * Only formats with a direct `url` are kept: formats that need
 * `signatureCipher` / n-parameter solving require YouTube's JS player, which
 * the on-device resolver deliberately avoids (the WebView-capture fallback
 * covers those cases).
 */

export type MediaPlatform = 'ios' | 'android' | 'web';
export type AudioQuality = 'high' | 'low';

export type StreamFormat = {
  itag: number;
  url: string;
  mimeType: string;
  /** e.g. "mp4" or "webm". */
  container: string;
  codecs: string[];
  hasAudio: boolean;
  hasVideo: boolean;
  bitrate: number;
  width?: number;
  height?: number;
  fps?: number;
  contentLength?: number;
  /** Dynamic-range-compressed ("stable volume") audio variant. */
  isDrc: boolean;
  audioTrackId?: string;
  isDefaultAudioTrack: boolean;
};

export type PlayabilityStatus =
  | 'OK'
  | 'LOGIN_REQUIRED'
  | 'UNPLAYABLE'
  | 'ERROR'
  | 'LIVE_STREAM_OFFLINE'
  | 'AGE_CHECK_REQUIRED'
  | 'CONTENT_CHECK_REQUIRED'
  | (string & {});

export type VideoDetails = {
  videoId?: string;
  title?: string;
  author?: string;
  durationSec?: number;
  isLive: boolean;
  thumbnailUrl?: string;
};

export type ParsedPlayerResponse = {
  status: PlayabilityStatus;
  reason?: string;
  details: VideoDetails;
  /** Formats with a direct URL (muxed first, then adaptive). */
  formats: StreamFormat[];
  /** Formats skipped because they need signature deciphering. */
  cipheredCount: number;
  hlsManifestUrl?: string;
  /** Epoch ms after which the URLs stop working. */
  expiresAt?: number;
};

const AUDIO_CODEC_RE = /^(mp4a|opus|vorbis|ac-3|ec-3|flac)/i;
const VIDEO_CODEC_RE = /^(avc1|avc3|vp9|vp09|vp8|av01|hev1|hvc1)/i;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Splits `video/mp4; codecs="avc1.42001E, mp4a.40.2"`. */
export function parseMimeType(mimeType: string): { type: string; container: string; codecs: string[] } {
  const [essence, ...params] = mimeType.split(';');
  const [type = '', container = ''] = essence.trim().toLowerCase().split('/');
  const codecParam = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith('codecs='));
  const codecs = codecParam
    ? codecParam
        .slice('codecs='.length)
        .replace(/"/g, '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : [];
  return { type, container, codecs };
}

function toFormat(raw: unknown): StreamFormat | null {
  if (!isObject(raw)) return null;
  const url = str(raw.url);
  const mimeType = str(raw.mimeType);
  const itag = num(raw.itag);
  if (!url || !mimeType || itag === undefined) return null;
  if (!/^https:\/\//i.test(url)) return null;
  // DRM-protected formats can't be played.
  if (raw.drmFamilies !== undefined) return null;

  const { type, container, codecs } = parseMimeType(mimeType);
  const hasAudio = type === 'audio' || codecs.some((c) => AUDIO_CODEC_RE.test(c));
  const hasVideo = type === 'video' && (codecs.length === 0 || codecs.some((c) => VIDEO_CODEC_RE.test(c)));
  const audioTrack = isObject(raw.audioTrack) ? raw.audioTrack : undefined;
  return {
    itag,
    url,
    mimeType,
    container,
    codecs,
    hasAudio,
    hasVideo,
    bitrate: num(raw.averageBitrate) ?? num(raw.bitrate) ?? 0,
    width: num(raw.width),
    height: num(raw.height),
    fps: num(raw.fps),
    contentLength: num(raw.contentLength),
    isDrc: raw.isDrc === true || /drc/i.test(str(raw.xtags) ?? ''),
    audioTrackId: audioTrack ? str(audioTrack.id) : undefined,
    isDefaultAudioTrack: audioTrack ? audioTrack.audioIsDefault === true : true,
  };
}

/** Reads `expire=<epoch seconds>` from a googlevideo URL. */
export function expiryFromUrl(url: string): number | undefined {
  const match = /[?&/]expire[=/](\d{9,11})(?:[&/]|$)/.exec(url);
  return match ? Number(match[1]) * 1000 : undefined;
}

function bestThumbnail(details: Json): string | undefined {
  const thumbs = isObject(details.thumbnail) ? details.thumbnail.thumbnails : undefined;
  if (!Array.isArray(thumbs) || thumbs.length === 0) return undefined;
  const sorted = [...thumbs]
    .filter(isObject)
    .sort((a, b) => (num(b.width) ?? 0) - (num(a.width) ?? 0));
  return sorted.length ? str(sorted[0].url) : undefined;
}

export function parsePlayerResponse(json: unknown, now: number = Date.now()): ParsedPlayerResponse {
  const root = isObject(json) ? json : {};
  const playability = isObject(root.playabilityStatus) ? root.playabilityStatus : {};
  const streaming = isObject(root.streamingData) ? root.streamingData : {};
  const detailsRaw = isObject(root.videoDetails) ? root.videoDetails : {};

  const rawFormats = [
    ...(Array.isArray(streaming.formats) ? streaming.formats : []),
    ...(Array.isArray(streaming.adaptiveFormats) ? streaming.adaptiveFormats : []),
  ];
  const formats: StreamFormat[] = [];
  let cipheredCount = 0;
  for (const raw of rawFormats) {
    const format = toFormat(raw);
    if (format) formats.push(format);
    else if (isObject(raw) && (raw.signatureCipher || raw.cipher)) cipheredCount++;
  }

  const hlsManifestUrl = str(streaming.hlsManifestUrl);
  const expiresIn = num(streaming.expiresInSeconds);
  const expiresAt =
    expiresIn !== undefined
      ? now + expiresIn * 1000
      : expiryFromUrl(formats[0]?.url ?? hlsManifestUrl ?? '');

  const reason =
    str(playability.reason) ??
    (isObject(playability.errorScreen) && isObject(playability.errorScreen.playerErrorMessageRenderer)
      ? extractText(playability.errorScreen.playerErrorMessageRenderer.reason)
      : undefined);

  return {
    status: str(playability.status) ?? 'ERROR',
    reason,
    details: {
      videoId: str(detailsRaw.videoId),
      title: str(detailsRaw.title),
      author: str(detailsRaw.author),
      durationSec: num(detailsRaw.lengthSeconds) || undefined,
      isLive: detailsRaw.isLive === true,
      thumbnailUrl: bestThumbnail(detailsRaw),
    },
    formats,
    cipheredCount,
    hlsManifestUrl,
    expiresAt,
  };
}

/** Innertube text: `{simpleText}` or `{runs:[{text}]}`. */
function extractText(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((r) => (isObject(r) && typeof r.text === 'string' ? r.text : '')).join('') || undefined;
  }
  return undefined;
}

function canPlayAudio(format: StreamFormat, platform: MediaPlatform): boolean {
  // AVPlayer cannot demux WebM, so iOS only gets AAC in MP4.
  if (platform === 'ios') return format.container === 'mp4' && format.codecs.every((c) => /^mp4a/i.test(c));
  return true;
}

/** Picks the audio-only stream for audio mode. */
export function selectAudioFormat(
  formats: StreamFormat[],
  { platform, quality }: { platform: MediaPlatform; quality: AudioQuality },
): StreamFormat | null {
  let candidates = formats.filter((f) => f.hasAudio && !f.hasVideo && canPlayAudio(f, platform));
  if (candidates.length === 0) return null;

  // Multi-language videos: stay on the default (usually original) track.
  const defaults = candidates.filter((f) => f.isDefaultAudioTrack);
  if (defaults.length) candidates = defaults;
  const normal = candidates.filter((f) => !f.isDrc);
  if (normal.length) candidates = normal;

  const sorted = [...candidates].sort((a, b) => a.bitrate - b.bitrate);
  return quality === 'low' ? sorted[0] : sorted[sorted.length - 1];
}

/** Picks the best muxed (audio+video) progressive stream up to `maxHeight`. */
export function selectMuxedFormat(
  formats: StreamFormat[],
  { platform, maxHeight }: { platform: MediaPlatform; maxHeight: number },
): StreamFormat | null {
  const muxed = formats.filter(
    (f) => f.hasAudio && f.hasVideo && (platform !== 'ios' || f.container === 'mp4'),
  );
  if (muxed.length === 0) return null;
  const byQuality = (a: StreamFormat, b: StreamFormat) =>
    (a.height ?? 0) - (b.height ?? 0) || a.bitrate - b.bitrate;
  const fitting = muxed.filter((f) => (f.height ?? 0) <= maxHeight).sort(byQuality);
  if (fitting.length) return fitting[fitting.length - 1];
  return [...muxed].sort(byQuality)[0];
}
