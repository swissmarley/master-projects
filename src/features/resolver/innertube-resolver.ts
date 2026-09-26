import {
  parsePlayerResponse,
  selectAudioFormat,
  selectMuxedFormat,
  type AudioQuality,
  type MediaPlatform,
  type ParsedPlayerResponse,
  type StreamFormat,
} from '@/features/youtube/formats';
import {
  DEFAULT_PROFILE_ORDER,
  fetchPlayerResponse,
  INNERTUBE_PROFILES,
  type InnertubeProfile,
  type InnertubeProfileId,
} from '@/features/youtube/innertube';

import {
  ResolveError,
  type MediaStreamRef,
  type ResolvedStreams,
  type StreamResolver,
} from './types';

const DEFAULT_LIFETIME_MS = 5 * 60 * 60 * 1000;

export type InnertubeResolverOptions = {
  platform: MediaPlatform;
  getPreferences: () => { audioQuality: AudioQuality; videoMaxHeight: number };
  getVisitorData?: () => Promise<string | undefined> | string | undefined;
  profiles?: InnertubeProfileId[];
  /** Verify the chosen URL answers before trusting it (default true). */
  probe?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

function statusError(parsed: ParsedPlayerResponse): ResolveError {
  const reason = parsed.reason ?? 'This video is not available.';
  switch (parsed.status) {
    case 'LOGIN_REQUIRED':
    case 'AGE_CHECK_REQUIRED':
    case 'CONTENT_CHECK_REQUIRED':
      return new ResolveError('login-required', reason, 'innertube');
    case 'LIVE_STREAM_OFFLINE':
      return new ResolveError('offline', reason, 'innertube');
    case 'UNPLAYABLE':
      return new ResolveError('unplayable', reason, 'innertube');
    default:
      return new ResolveError('unavailable', reason, 'innertube');
  }
}

function toRef(format: StreamFormat, headers: Record<string, string>): MediaStreamRef {
  return {
    uri: format.url,
    contentType: 'progressive',
    headers,
    mimeType: format.mimeType,
    bitrate: format.bitrate,
    height: format.height,
    itag: format.itag,
  };
}

/** Turns a parsed player response into the streams the player needs. */
export function buildStreams(
  videoId: string,
  parsed: ParsedPlayerResponse,
  profile: InnertubeProfile,
  options: { platform: MediaPlatform; audioQuality: AudioQuality; videoMaxHeight: number; now: number },
): ResolvedStreams {
  const headers = { 'User-Agent': profile.userAgent };
  const hls: MediaStreamRef | null = parsed.hlsManifestUrl
    ? { uri: parsed.hlsManifestUrl, contentType: 'hls', headers }
    : null;
  const expiresAt = parsed.expiresAt ?? options.now + DEFAULT_LIFETIME_MS;
  const details = { ...parsed.details };
  delete details.videoId;

  if (parsed.details.isLive) {
    if (!hls) throw new ResolveError('no-streams', 'No live stream manifest was returned.', 'innertube');
    return { videoId, source: 'innertube', audio: hls, video: hls, expiresAt, details };
  }

  const audioFormat = selectAudioFormat(parsed.formats, {
    platform: options.platform,
    quality: options.audioQuality,
  });
  const muxed = selectMuxedFormat(parsed.formats, {
    platform: options.platform,
    maxHeight: options.videoMaxHeight,
  });

  // HLS adapts up to the device's capability; prefer it when the user allows
  // more than the (usually 360p) muxed stream offers.
  const video =
    hls && (!muxed || options.videoMaxHeight > (muxed.height ?? 0)) ? hls : muxed ? toRef(muxed, headers) : null;
  const audio = audioFormat ? toRef(audioFormat, headers) : (video ?? null);

  if (!audio) {
    throw new ResolveError(
      'no-streams',
      parsed.cipheredCount > 0
        ? 'Only protected streams were returned for this client.'
        : 'No playable streams were returned.',
      'innertube',
    );
  }
  return { videoId, source: 'innertube', audio, video, expiresAt, details };
}

/** Issues a 1-byte range request; YouTube answers 403 when a URL is not usable. */
export async function probeStream(
  ref: MediaStreamRef,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(ref.uri, {
      method: 'GET',
      headers: { ...ref.headers, Range: 'bytes=0-0' },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new ResolveError('aborted', 'Aborted', 'innertube');
    throw new ResolveError('network', `Stream check failed: ${String(error)}`, 'innertube');
  }
  if (response.status >= 400) {
    throw new ResolveError('blocked', `Stream was rejected (HTTP ${response.status}).`, 'innertube');
  }
}

export class InnertubeResolver implements StreamResolver {
  readonly name = 'innertube' as const;

  constructor(private readonly options: InnertubeResolverOptions) {}

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedStreams> {
    const {
      platform,
      getPreferences,
      getVisitorData,
      profiles = DEFAULT_PROFILE_ORDER,
      probe = true,
      fetchImpl = fetch,
      now = Date.now,
    } = this.options;

    let visitorData: string | undefined;
    try {
      visitorData = await getVisitorData?.();
    } catch {
      visitorData = undefined;
    }

    let lastError: ResolveError = new ResolveError('no-streams', 'No client profiles configured.', 'innertube');
    for (const id of profiles) {
      const profile = INNERTUBE_PROFILES[id];
      if (signal?.aborted) throw new ResolveError('aborted', 'Aborted', 'innertube');
      try {
        const json = await fetchPlayerResponse(videoId, profile, { fetchImpl, signal, visitorData });
        const parsed = parsePlayerResponse(json, now());
        if (parsed.status !== 'OK') throw statusError(parsed);
        const streams = buildStreams(videoId, parsed, profile, { platform, ...getPreferences(), now: now() });
        if (probe) await probeStream(streams.audio, fetchImpl, signal);
        return streams;
      } catch (error) {
        if (signal?.aborted) throw new ResolveError('aborted', 'Aborted', 'innertube');
        lastError =
          error instanceof ResolveError
            ? error
            : new ResolveError('network', error instanceof Error ? error.message : String(error), 'innertube');
        // A removed/private video will not appear through another client.
        if (lastError.code === 'unavailable') break;
      }
    }
    throw lastError;
  }
}
