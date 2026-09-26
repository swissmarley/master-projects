import { VIDEO_ID, errorResponse, liveResponse, okResponse } from '@/features/youtube/__fixtures__/player-response';
import { buildPlayerRequest, INNERTUBE_PROFILES, parseVisitorDataFromSwJs } from '@/features/youtube/innertube';

import { InnertubeResolver } from './innertube-resolver';
import { ResolveError } from './types';

const NOW = 1_789_000_000_000;

type Route = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;

function fakeFetch(route: Route) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = route(url, init) ?? { status: 404 };
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
      text: async () => JSON.stringify(answer.body),
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

function playerBody(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as { context: { client: Record<string, unknown> }; videoId: string };
}

function resolver(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof InnertubeResolver>[0]> = {}) {
  return new InnertubeResolver({
    platform: 'ios',
    getPreferences: () => ({ audioQuality: 'high', videoMaxHeight: 720 }),
    fetchImpl,
    now: () => NOW,
    ...overrides,
  });
}

describe('buildPlayerRequest', () => {
  it('builds a visionos request like yt-dlp does', () => {
    const request = buildPlayerRequest(VIDEO_ID, INNERTUBE_PROFILES.visionos, { visitorData: 'CgtWSVNJVE9S' });
    expect(request.url).toBe('https://www.youtube.com/youtubei/v1/player?prettyPrint=false');
    expect(request.headers).toMatchObject({
      'X-YouTube-Client-Name': '101',
      'X-YouTube-Client-Version': '1.02',
      'X-Goog-Visitor-Id': 'CgtWSVNJVE9S',
      Origin: 'https://www.youtube.com',
    });
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      videoId: VIDEO_ID,
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
    });
    expect(body.context.client).toMatchObject({
      clientName: 'VISIONOS',
      deviceMake: 'Apple',
      osName: 'visionOS',
      visitorData: 'CgtWSVNJVE9S',
    });
  });

  it('omits visitor headers when unknown', () => {
    const request = buildPlayerRequest(VIDEO_ID, INNERTUBE_PROFILES.android_vr);
    expect(request.headers['X-Goog-Visitor-Id']).toBeUndefined();
    expect(JSON.parse(request.body).context.client.androidSdkVersion).toBe(32);
  });
});

describe('InnertubeResolver', () => {
  it('resolves audio (AAC on iOS) and muxed video with the client user agent', async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.includes('/youtubei/') ? { status: 200, body: okResponse() } : { status: 206 },
    );
    const streams = await resolver(impl).resolve(VIDEO_ID);
    expect(streams.source).toBe('innertube');
    expect(streams.audio.itag).toBe(140);
    expect(streams.audio.headers?.['User-Agent']).toBe(INNERTUBE_PROFILES.visionos.userAgent);
    expect(streams.video?.itag).toBe(18);
    expect(streams.expiresAt).toBe(NOW + 21_540_000);
    expect(streams.details).toMatchObject({ title: 'Never Gonna Give You Up', durationSec: 212 });
    // player request + 1-byte probe of the audio URL
    expect(calls).toHaveLength(2);
    expect((calls[1].init?.headers as Record<string, string>).Range).toBe('bytes=0-0');
  });

  it('picks Opus on Android', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/youtubei/') ? { status: 200, body: okResponse() } : { status: 206 },
    );
    const streams = await resolver(impl, { platform: 'android' }).resolve(VIDEO_ID);
    expect(streams.audio.itag).toBe(251);
  });

  it('passes the visitor id from the browser session', async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.includes('/youtubei/') ? { status: 200, body: okResponse() } : { status: 206 },
    );
    await resolver(impl, { getVisitorData: async () => 'CgtWSVNJVE9S', probe: false }).resolve(VIDEO_ID);
    expect(playerBody(calls[0].init).context.client.visitorData).toBe('CgtWSVNJVE9S');
  });

  it('falls back to the next profile when a stream URL is rejected', async () => {
    const { impl, calls } = fakeFetch((url, init) => {
      if (url.includes('/youtubei/')) {
        const client = playerBody(init).context.client.clientName;
        const body = okResponse();
        if (client === 'ANDROID_VR') body.videoDetails.title = 'From VR';
        return { status: 200, body };
      }
      // First probe fails (403), second succeeds.
      return { status: calls.filter((c) => !c.url.includes('/youtubei/')).length === 1 ? 403 : 206 };
    });
    const streams = await resolver(impl).resolve(VIDEO_ID);
    expect(streams.details?.title).toBe('From VR');
  });

  it('uses HLS for live streams', async () => {
    const { impl } = fakeFetch((url) =>
      url.includes('/youtubei/') ? { status: 200, body: liveResponse() } : { status: 200 },
    );
    const streams = await resolver(impl).resolve(VIDEO_ID);
    expect(streams.audio.contentType).toBe('hls');
    expect(streams.video).toBe(streams.audio);
    expect(streams.details?.isLive).toBe(true);
  });

  it('reports age gates as login-required with YouTube\'s reason', async () => {
    const { impl } = fakeFetch(() => ({
      status: 200,
      body: errorResponse('LOGIN_REQUIRED', 'Sign in to confirm your age'),
    }));
    await expect(resolver(impl).resolve(VIDEO_ID)).rejects.toMatchObject({
      code: 'login-required',
      message: 'Sign in to confirm your age',
    });
  });

  it('stops early for unavailable videos', async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 200, body: errorResponse('ERROR', 'Video unavailable') }));
    await expect(resolver(impl).resolve(VIDEO_ID)).rejects.toMatchObject({ code: 'unavailable' });
    expect(calls).toHaveLength(1);
  });

  it('turns HTTP failures into network errors', async () => {
    const { impl } = fakeFetch(() => ({ status: 500 }));
    const error = await resolver(impl).resolve(VIDEO_ID).catch((e) => e);
    expect(error).toBeInstanceOf(ResolveError);
    expect(error.code).toBe('network');
  });

  it('explains when only ciphered formats exist', async () => {
    const body = okResponse();
    body.streamingData.formats = [];
    body.streamingData.adaptiveFormats = body.streamingData.adaptiveFormats.filter((f) => 'signatureCipher' in f);
    const { impl } = fakeFetch(() => ({ status: 200, body }));
    await expect(resolver(impl, { profiles: ['visionos'] }).resolve(VIDEO_ID)).rejects.toMatchObject({
      code: 'no-streams',
      message: 'Only protected streams were returned for this client.',
    });
  });
});

describe('parseVisitorDataFromSwJs', () => {
  it('reads the documented position', () => {
    const payload = [[null, null, [[[null, null, null, null, null, null, null, null, null, null, null, null, null, 'CgtWSVNJVE9SX0lE']]]]];
    expect(parseVisitorDataFromSwJs(`)]}'\n${JSON.stringify(payload)}`)).toBe('CgtWSVNJVE9SX0lE');
  });

  it('falls back to pattern search and handles garbage', () => {
    expect(parseVisitorDataFromSwJs(`)]}' [["x","CgtAbCdEfGhIjK%3D%3D"]]`)).toBe('CgtAbCdEfGhIjK%3D%3D');
    expect(parseVisitorDataFromSwJs('nope')).toBeNull();
  });
});
