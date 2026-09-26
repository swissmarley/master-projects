import { expiryFromUrl } from '@/features/youtube/formats';

import { buildCaptureScript, parseCaptureMessage, type CaptureMessage } from './capture-script';
import { ResolveError, type MediaStreamRef, type ResolvedStreams, type StreamResolver } from './types';

export type CaptureResult = Extract<CaptureMessage, { type: 'captured' }>;

/** Implemented by the hidden WebView component (`CaptureHost`). */
export type CaptureHostHandle = {
  /** Load the watch page for `videoId` with the capture script injected. */
  start(videoId: string, script: string): void;
  /** Tear the page down (stops any playback). */
  stop(): void;
};

type Job = {
  videoId: string;
  resolve: (result: CaptureResult) => void;
  reject: (error: ResolveError) => void;
  timer?: ReturnType<typeof setTimeout>;
};

/** Runs WebView captures one at a time. */
export class CaptureService {
  private host: CaptureHostHandle | null = null;
  private readonly queue: Job[] = [];
  private active: Job | null = null;

  constructor(private readonly timeoutMs = 25_000) {}

  get isAvailable(): boolean {
    return this.host !== null;
  }

  /** Registers the WebView host; returns a detach function. */
  attach(host: CaptureHostHandle): () => void {
    this.host = host;
    this.pump();
    return () => {
      if (this.host !== host) return;
      this.host = null;
      const unavailable = () =>
        new ResolveError('capture-unavailable', 'The capture view was closed.', 'webview');
      if (this.active) this.finish(unavailable());
      for (const job of this.queue.splice(0)) job.reject(unavailable());
    };
  }

  capture(videoId: string): Promise<CaptureResult> {
    if (!this.host) {
      return Promise.reject(
        new ResolveError('capture-unavailable', 'The capture view is not ready.', 'webview'),
      );
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ videoId, resolve, reject });
      this.pump();
    });
  }

  /** Feed `onMessage` data from the capture WebView here. */
  handleMessage(raw: string): void {
    const message = parseCaptureMessage(raw);
    if (!message || !this.active || message.videoId !== this.active.videoId) return;
    if (message.type === 'captured') {
      this.finish(null, message);
    } else {
      this.finish(
        new ResolveError(message.code === 'consent' ? 'consent' : 'unplayable', message.reason, 'webview'),
      );
    }
  }

  private pump(): void {
    if (this.active || !this.host) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    job.timer = setTimeout(
      () => this.finish(new ResolveError('timeout', 'YouTube did not start the video in time.', 'webview')),
      this.timeoutMs,
    );
    this.host.start(job.videoId, buildCaptureScript(job.videoId));
  }

  private finish(error: ResolveError | null, result?: CaptureResult): void {
    const job = this.active;
    if (!job) return;
    clearTimeout(job.timer);
    this.active = null;
    this.host?.stop();
    if (error) job.reject(error);
    else job.resolve(result as CaptureResult);
    this.pump();
  }
}

const DEFAULT_LIFETIME_MS = 5 * 60 * 60 * 1000;

/** Adapts the capture service to the resolver chain. */
export class WebViewCaptureResolver implements StreamResolver {
  readonly name = 'webview' as const;

  constructor(
    private readonly service: CaptureService,
    private readonly now: () => number = Date.now,
  ) {}

  async resolve(videoId: string): Promise<ResolvedStreams> {
    const captured = await this.service.capture(videoId);
    const ref: MediaStreamRef = {
      uri: captured.url,
      contentType: captured.kind,
      headers: { 'User-Agent': captured.userAgent },
    };
    return {
      videoId,
      source: 'webview',
      audio: ref,
      video: ref,
      expiresAt: expiryFromUrl(captured.url) ?? this.now() + DEFAULT_LIFETIME_MS,
      details: captured.meta ?? undefined,
    };
  }
}

export const captureService = new CaptureService();
