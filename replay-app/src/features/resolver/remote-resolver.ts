import type { AudioQuality, MediaPlatform } from '@/features/youtube/formats';
import { expiryFromUrl } from '@/features/youtube/formats';

import {
  ResolveError,
  type MediaStreamRef,
  type ResolvedStreams,
  type ResolverName,
  type StreamResolver,
} from './types';

/**
 * Optional resolvers backed by a Piped or Invidious instance (ideally
 * self-hosted). Their stream URLs are proxied by the instance, so they are
 * not bound to the phone's IP.
 */

const DEFAULT_LIFETIME_MS = 5 * 60 * 60 * 1000;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);
const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const number = (v: unknown) => {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

export type RemotePreferences = {
  platform: MediaPlatform;
  getPreferences: () => { audioQuality: AudioQuality; videoMaxHeight: number };
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/** Validates an instance URL such as `https://pipedapi.example.org` or `http://192.168.1.5:3000`. */
export function normalizeBaseUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const match = /^https?:\/\/([^\s/?#]+)(\/[^\s?#]*)?$/i.exec(trimmed);
  if (!match) return null;
  const host = match[1].replace(/^.*@/, '').replace(/:\d+$/, '');
  return host.includes('.') || host === 'localhost' ? trimmed : null;
}

async function getJson(url: string, fetchImpl: typeof fetch, name: ResolverName, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    throw new ResolveError('network', `Could not reach ${name}: ${String(error)}`, name);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = isObject(body) ? text(body.error) ?? text(body.message) : undefined;
    throw new ResolveError(
      response.status === 404 ? 'unavailable' : 'network',
      message ?? `${name} answered HTTP ${response.status}.`,
      name,
    );
  }
  if (!isObject(body)) throw new ResolveError('no-streams', `${name} returned an unexpected response.`, name);
  return body;
}

type Candidate = { url: string; mimeType: string; bitrate: number; height?: number; itag?: number };

function pickAudio(candidates: Candidate[], platform: MediaPlatform, quality: AudioQuality): Candidate | null {
  const usable = candidates.filter((c) => (platform === 'ios' ? /audio\/mp4|m4a/i.test(c.mimeType) : true));
  if (!usable.length) return null;
  const sorted = [...usable].sort((a, b) => a.bitrate - b.bitrate);
  return quality === 'low' ? sorted[0] : sorted[sorted.length - 1];
}

function pickMuxed(candidates: Candidate[], platform: MediaPlatform, maxHeight: number): Candidate | null {
  const usable = candidates.filter((c) => (platform === 'ios' ? /mp4/i.test(c.mimeType) : true));
  if (!usable.length) return null;
  const byHeight = [...usable].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  const fitting = byHeight.filter((c) => (c.height ?? 0) <= maxHeight);
  return fitting.length ? fitting[fitting.length - 1] : byHeight[0];
}

function toRef(c: Candidate): MediaStreamRef {
  return { uri: c.url, contentType: 'progressive', mimeType: c.mimeType, bitrate: c.bitrate, height: c.height, itag: c.itag };
}

function finish(
  name: ResolverName,
  videoId: string,
  audio: Candidate | null,
  muxed: Candidate | null,
  hls: string | undefined,
  isLive: boolean,
  details: ResolvedStreams['details'],
  now: number,
): ResolvedStreams {
  const hlsRef: MediaStreamRef | null = hls ? { uri: hls, contentType: 'hls' } : null;
  const video = isLive ? hlsRef : muxed ? toRef(muxed) : hlsRef;
  const audioRef = isLive ? hlsRef : audio ? toRef(audio) : video;
  if (!audioRef) throw new ResolveError('no-streams', `${name} returned no playable streams.`, name);
  return {
    videoId,
    source: name,
    audio: audioRef,
    video,
    expiresAt: expiryFromUrl(audioRef.uri) ?? now + DEFAULT_LIFETIME_MS,
    details,
  };
}

export class PipedResolver implements StreamResolver {
  readonly name = 'piped' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly options: RemotePreferences,
  ) {}

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedStreams> {
    const { platform, getPreferences, fetchImpl = fetch, now = Date.now } = this.options;
    const { audioQuality, videoMaxHeight } = getPreferences();
    const body = await getJson(`${this.baseUrl}/streams/${videoId}`, fetchImpl, this.name, signal);

    const audio = asArray(body.audioStreams)
      .map((s) => ({
        url: text(s.url) ?? '',
        mimeType: text(s.mimeType) ?? '',
        bitrate: number(s.bitrate) ?? 0,
        itag: number(s.itag),
      }))
      .filter((s) => s.url);
    const muxed = asArray(body.videoStreams)
      .filter((s) => s.videoOnly === false)
      .map((s) => ({
        url: text(s.url) ?? '',
        mimeType: text(s.mimeType) ?? '',
        bitrate: number(s.bitrate) ?? 0,
        height: number(s.height) ?? number(text(s.quality)),
        itag: number(s.itag),
      }))
      .filter((s) => s.url);

    return finish(
      this.name,
      videoId,
      pickAudio(audio, platform, audioQuality),
      pickMuxed(muxed, platform, videoMaxHeight),
      text(body.hls),
      body.livestream === true,
      {
        title: text(body.title),
        author: text(body.uploader),
        durationSec: number(body.duration) || undefined,
        thumbnailUrl: text(body.thumbnailUrl),
        isLive: body.livestream === true,
      },
      now(),
    );
  }
}

export class InvidiousResolver implements StreamResolver {
  readonly name = 'invidious' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly options: RemotePreferences,
  ) {}

  private absolute(url: string): string {
    return url.startsWith('/') ? `${this.baseUrl}${url}` : url;
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedStreams> {
    const { platform, getPreferences, fetchImpl = fetch, now = Date.now } = this.options;
    const { audioQuality, videoMaxHeight } = getPreferences();
    // local=true makes the instance proxy the streams.
    const body = await getJson(`${this.baseUrl}/api/v1/videos/${videoId}?local=true`, fetchImpl, this.name, signal);

    const audio = asArray(body.adaptiveFormats)
      .filter((f) => /^audio\//.test(text(f.type) ?? ''))
      .map((f) => ({
        url: this.absolute(text(f.url) ?? ''),
        mimeType: text(f.type) ?? '',
        bitrate: number(f.bitrate) ?? 0,
        itag: number(f.itag),
      }))
      .filter((f) => f.url);
    const muxed = asArray(body.formatStreams)
      .map((f) => ({
        url: this.absolute(text(f.url) ?? ''),
        mimeType: text(f.type) ?? '',
        bitrate: number(f.bitrate) ?? 0,
        height: number(text(f.resolution) ?? text(f.size)?.split('x')[1]),
        itag: number(f.itag),
      }))
      .filter((f) => f.url);

    const thumbs = asArray(body.videoThumbnails);
    return finish(
      this.name,
      videoId,
      pickAudio(audio, platform, audioQuality),
      pickMuxed(muxed, platform, videoMaxHeight),
      text(body.hlsUrl) ? this.absolute(text(body.hlsUrl)!) : undefined,
      body.liveNow === true,
      {
        title: text(body.title),
        author: text(body.author),
        durationSec: number(body.lengthSeconds) || undefined,
        thumbnailUrl: thumbs.length ? text(thumbs[0].url) : undefined,
        isLive: body.liveNow === true,
      },
      now(),
    );
  }
}
