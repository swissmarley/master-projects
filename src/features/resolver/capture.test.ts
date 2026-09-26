/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://m.youtube.com/watch?v=dQw4w9WgXcQ"}
 */
import { TextDecoder, TextEncoder } from 'util';

import { buildCaptureScript, parseCaptureMessage, type CaptureMessage } from './capture-script';
import { CaptureService, WebViewCaptureResolver, type CaptureHostHandle } from './capture-service';
import { ResolveError } from './types';

// jsdom's URL implementation needs these; real WebViews always have them.
Object.assign(globalThis, { TextEncoder, TextDecoder });

const ID = 'dQw4w9WgXcQ';
const MEDIA_URL = `https://rr1---sn-x.googlevideo.com/videoplayback?expire=1790000000&itag=18&id=o-x`;
const HLS_URL = 'https://manifest.googlevideo.com/api/manifest/hls_variant/expire/1790000000/id/x/file/index.m3u8';

describe('capture script (runs inside the hidden WebView)', () => {
  // The script patches prototypes, so it is installed once for this file.
  const messages: CaptureMessage[] = [];
  const nativeSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
  let pause: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
    // jsdom does not implement media playback.
    pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    (window as unknown as { MediaSource: unknown }).MediaSource = function MediaSource() {};
    (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
      postMessage: (raw: string) => messages.push(JSON.parse(raw)),
    };
    (window as unknown as { ytInitialPlayerResponse: unknown }).ytInitialPlayerResponse = {
      playabilityStatus: { status: 'OK' },
      videoDetails: { videoId: ID, title: 'Song', author: 'Artist', lengthSeconds: '212' },
    };
    (0, eval)(buildCaptureScript(ID));
  });

  afterAll(() => {
    jest.useRealTimers();
    pause.mockRestore();
    Object.defineProperty(HTMLMediaElement.prototype, 'src', nativeSrc);
  });

  it('removes MediaSource so YouTube falls back to plain URLs', () => {
    expect((window as unknown as { MediaSource?: unknown }).MediaSource).toBeUndefined();
  });

  it('ignores blob: URLs and ad playback, then captures the real stream', () => {
    const player = document.createElement('div');
    player.id = 'movie_player';
    player.className = 'html5-video-player ad-showing';
    const video = document.createElement('video');
    player.appendChild(video);
    document.body.appendChild(player);

    video.src = 'blob:https://m.youtube.com/123';
    video.src = 'https://ads.example.com/preroll.mp4';
    expect(messages).toHaveLength(0);

    player.classList.remove('ad-showing');
    video.setAttribute('src', MEDIA_URL);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'captured',
      videoId: ID,
      url: MEDIA_URL,
      kind: 'progressive',
      meta: { title: 'Song', author: 'Artist', durationSec: 212, isLive: false },
    });
    expect(video.muted).toBe(true);
    expect(pause).toHaveBeenCalled();
  });

  it('reports only once', () => {
    const video = document.createElement('video');
    video.src = HLS_URL;
    expect(messages).toHaveLength(1);
  });
});

describe('parseCaptureMessage', () => {
  it('validates messages', () => {
    expect(parseCaptureMessage(JSON.stringify({ type: 'captured', videoId: ID, url: MEDIA_URL }))).not.toBeNull();
    expect(parseCaptureMessage(JSON.stringify({ type: 'captured', videoId: ID, url: 'http://x' }))).toBeNull();
    expect(
      parseCaptureMessage(JSON.stringify({ type: 'capture-error', videoId: ID, code: 'consent', reason: 'x' })),
    ).not.toBeNull();
    expect(parseCaptureMessage('{')).toBeNull();
  });
});

describe('CaptureService', () => {
  function makeHost() {
    const started: string[] = [];
    let stopped = 0;
    const host: CaptureHostHandle = {
      start: (videoId, script) => {
        expect(script).toContain(JSON.stringify(videoId));
        started.push(videoId);
      },
      stop: () => {
        stopped++;
      },
    };
    return { host, started, stopped: () => stopped };
  }

  const captured = (videoId: string, url = HLS_URL) =>
    JSON.stringify({ type: 'captured', videoId, url, kind: 'hls', userAgent: 'UA', meta: null });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fails fast when no host is mounted', async () => {
    await expect(new CaptureService().capture(ID)).rejects.toMatchObject({ code: 'capture-unavailable' });
  });

  it('runs captures one at a time', async () => {
    const service = new CaptureService();
    const { host, started, stopped } = makeHost();
    service.attach(host);
    const first = service.capture('aaaaaaaaaaa');
    const second = service.capture('bbbbbbbbbbb');
    expect(started).toEqual(['aaaaaaaaaaa']);

    service.handleMessage(captured('bbbbbbbbbbb')); // not active yet: ignored
    service.handleMessage(captured('aaaaaaaaaaa'));
    await expect(first).resolves.toMatchObject({ videoId: 'aaaaaaaaaaa' });
    expect(started).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    service.handleMessage(captured('bbbbbbbbbbb'));
    await expect(second).resolves.toMatchObject({ videoId: 'bbbbbbbbbbb' });
    expect(stopped()).toBe(2);
  });

  it('maps page errors and timeouts', async () => {
    const service = new CaptureService(1000);
    service.attach(makeHost().host);
    const consent = service.capture(ID);
    service.handleMessage(JSON.stringify({ type: 'capture-error', videoId: ID, code: 'consent', reason: 'cookies' }));
    await expect(consent).rejects.toMatchObject({ code: 'consent' });

    const slow = service.capture(ID);
    jest.advanceTimersByTime(1001);
    await expect(slow).rejects.toMatchObject({ code: 'timeout' });
  });

  it('rejects pending work when the host goes away', async () => {
    const service = new CaptureService();
    const detach = service.attach(makeHost().host);
    const pending = service.capture(ID);
    detach();
    await expect(pending).rejects.toBeInstanceOf(ResolveError);
    expect(service.isAvailable).toBe(false);
  });

  it('adapts captures to resolved streams', async () => {
    const service = new CaptureService();
    service.attach(makeHost().host);
    const resolver = new WebViewCaptureResolver(service, () => 0);
    const pending = resolver.resolve(ID);
    service.handleMessage(captured(ID, MEDIA_URL));
    const streams = await pending;
    expect(streams).toMatchObject({
      source: 'webview',
      audio: { uri: MEDIA_URL, contentType: 'hls', headers: { 'User-Agent': 'UA' } },
      expiresAt: 1_790_000_000_000,
    });
    expect(streams.video).toBe(streams.audio);
  });
});
