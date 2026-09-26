import { ResolveError, isVideoLevelError, type ResolvedStreams, type StreamResolver } from './types';

/** URLs this close to expiry are treated as stale. */
export const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/** Small LRU cache of resolved streams that respects URL expiry. */
export class StreamCache {
  private readonly entries = new Map<string, ResolvedStreams>();

  constructor(
    private readonly capacity = 64,
    private readonly now: () => number = Date.now,
  ) {}

  get(videoId: string): ResolvedStreams | null {
    const entry = this.entries.get(videoId);
    if (!entry) return null;
    if (entry.expiresAt - this.now() <= EXPIRY_MARGIN_MS) {
      this.entries.delete(videoId);
      return null;
    }
    // Refresh LRU position.
    this.entries.delete(videoId);
    this.entries.set(videoId, entry);
    return entry;
  }

  set(streams: ResolvedStreams): void {
    this.entries.delete(streams.videoId);
    this.entries.set(streams.videoId, streams);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  delete(videoId: string): void {
    this.entries.delete(videoId);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export type ResolveOptions = {
  /** Skip the cache (e.g. after the cached URL failed to play). */
  force?: boolean;
};

/**
 * Tries each enabled resolver in order until one produces playable streams.
 * Concurrent requests for the same video share one resolution.
 */
export class ResolverChain {
  private readonly inFlight = new Map<string, Promise<ResolvedStreams>>();

  constructor(
    private readonly getResolvers: () => StreamResolver[],
    readonly cache: StreamCache = new StreamCache(),
    private readonly onFailure?: (resolver: string, videoId: string, error: unknown) => void,
  ) {}

  resolve(videoId: string, { force = false }: ResolveOptions = {}): Promise<ResolvedStreams> {
    if (force) this.cache.delete(videoId);
    const cached = this.cache.get(videoId);
    if (cached) return Promise.resolve(cached);

    const pending = this.inFlight.get(videoId);
    if (pending && !force) return pending;

    const run = this.run(videoId).finally(() => {
      if (this.inFlight.get(videoId) === run) this.inFlight.delete(videoId);
    });
    this.inFlight.set(videoId, run);
    return run;
  }

  /** Resolves in the background so the next track starts instantly. */
  prefetch(videoId: string): void {
    this.resolve(videoId).catch(() => {
      // Errors surface again when the track is actually played.
    });
  }

  invalidate(videoId: string): void {
    this.cache.delete(videoId);
  }

  private async run(videoId: string): Promise<ResolvedStreams> {
    const resolvers = this.getResolvers();
    if (resolvers.length === 0) {
      throw new ResolveError('disabled', 'All stream sources are turned off in Settings.');
    }
    const errors: unknown[] = [];
    for (const resolver of resolvers) {
      try {
        const streams = await resolver.resolve(videoId);
        this.cache.set(streams);
        return streams;
      } catch (error) {
        errors.push(error);
        this.onFailure?.(resolver.name, videoId, error);
      }
    }
    throw pickMostUseful(errors);
  }
}

/**
 * Prefers errors that describe the video (e.g. "Sign in to confirm your age")
 * over transport errors from fallbacks, so the UI shows the real reason.
 */
export function pickMostUseful(errors: unknown[]): ResolveError {
  const videoLevel = errors.find(isVideoLevelError);
  if (videoLevel) return videoLevel as ResolveError;
  const typed = errors.filter((e): e is ResolveError => e instanceof ResolveError);
  const informative = typed.find((e) => e.code !== 'capture-unavailable' && e.code !== 'disabled');
  return informative ?? typed[0] ?? new ResolveError('no-streams', 'Could not load this video.');
}
