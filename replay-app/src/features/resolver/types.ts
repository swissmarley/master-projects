export type ResolverName = 'innertube' | 'webview' | 'piped' | 'invidious';

export type ContentType = 'progressive' | 'hls' | 'dash';

/** Everything the player needs to open one stream. */
export type MediaStreamRef = {
  uri: string;
  contentType: ContentType;
  headers?: Record<string, string>;
  mimeType?: string;
  bitrate?: number;
  height?: number;
  itag?: number;
};

export type StreamDetails = {
  title?: string;
  author?: string;
  durationSec?: number;
  isLive?: boolean;
  thumbnailUrl?: string;
};

export type ResolvedStreams = {
  videoId: string;
  source: ResolverName;
  /** Audio-only stream when available, otherwise a muxed/HLS stream. */
  audio: MediaStreamRef;
  /** Stream with picture (muxed progressive or HLS); null if only audio exists. */
  video: MediaStreamRef | null;
  /** Epoch ms after which the URLs stop working. */
  expiresAt: number;
  details?: StreamDetails;
};

export interface StreamResolver {
  readonly name: ResolverName;
  resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedStreams>;
}

export type ResolveErrorCode =
  | 'unavailable' // removed / private / does not exist
  | 'login-required' // age gate or "confirm you're not a bot"
  | 'unplayable' // region block, made for kids on some clients, etc.
  | 'offline' // live stream not live
  | 'no-streams' // response had no usable (direct-url) streams
  | 'blocked' // stream URL rejected on probe (e.g. 403, token enforcement)
  | 'network'
  | 'timeout'
  | 'consent' // YouTube cookie-consent wall in the hidden WebView
  | 'capture-unavailable' // capture host not mounted
  | 'disabled'
  | 'aborted';

export class ResolveError extends Error {
  readonly code: ResolveErrorCode;
  readonly resolver?: ResolverName;

  constructor(code: ResolveErrorCode, message: string, resolver?: ResolverName) {
    super(message);
    this.name = 'ResolveError';
    this.code = code;
    this.resolver = resolver;
  }
}

/** Codes that describe the video itself rather than one way of reaching it. */
const VIDEO_LEVEL: ResolveErrorCode[] = ['unavailable', 'login-required', 'unplayable', 'offline'];

export function isVideoLevelError(error: unknown): boolean {
  return error instanceof ResolveError && VIDEO_LEVEL.includes(error.code);
}

/** Short, human-readable explanation for the player UI. */
export function describeResolveError(error: unknown): string {
  if (!(error instanceof ResolveError)) return 'Could not load this video.';
  switch (error.code) {
    case 'unavailable':
    case 'login-required':
    case 'unplayable':
    case 'offline':
      return error.message || 'This video is not available.';
    case 'consent':
      return 'Open YouTube in the Browse tab once and accept the cookie dialog, then try again.';
    case 'network':
      return 'Network error while loading the stream.';
    case 'timeout':
      return 'Loading the stream took too long.';
    default:
      return error.message || 'Could not load this video.';
  }
}
