import { InvidiousResolver, PipedResolver, normalizeBaseUrl } from './remote-resolver';

const ID = 'dQw4w9WgXcQ';

function jsonFetch(status: number, body: unknown) {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return { ok: status < 300, status, json: async () => body } as Response;
  }) as typeof fetch;
  return { impl, urls };
}

const prefs = (platform: 'ios' | 'android', audioQuality: 'high' | 'low' = 'high') => ({
  platform,
  getPreferences: () => ({ audioQuality, videoMaxHeight: 720 }),
  now: () => 0,
});

describe('normalizeBaseUrl', () => {
  it('accepts instance URLs and strips trailing slashes', () => {
    expect(normalizeBaseUrl(' https://pipedapi.example.org/ ')).toBe('https://pipedapi.example.org');
    expect(normalizeBaseUrl('http://192.168.1.5:3000')).toBe('http://192.168.1.5:3000');
    expect(normalizeBaseUrl('http://localhost:3000/api')).toBe('http://localhost:3000/api');
  });

  it('rejects junk', () => {
    expect(normalizeBaseUrl('pipedapi.example.org')).toBeNull();
    expect(normalizeBaseUrl('https://')).toBeNull();
    expect(normalizeBaseUrl('ftp://example.org')).toBeNull();
    expect(normalizeBaseUrl('https://intranet')).toBeNull();
  });
});

describe('PipedResolver', () => {
  const body = {
    title: 'Song',
    uploader: 'Artist',
    duration: 212,
    thumbnailUrl: 'https://proxy/thumb.jpg',
    livestream: false,
    hls: null,
    audioStreams: [
      { url: 'https://proxy/a140?expire=1790000000', mimeType: 'audio/mp4', bitrate: 130000, itag: 140 },
      { url: 'https://proxy/a251', mimeType: 'audio/webm', bitrate: 160000, itag: 251 },
      { url: 'https://proxy/a139', mimeType: 'audio/mp4', bitrate: 48000, itag: 139 },
    ],
    videoStreams: [
      { url: 'https://proxy/v18', mimeType: 'video/mp4', quality: '360p', videoOnly: false, itag: 18 },
      { url: 'https://proxy/v137', mimeType: 'video/mp4', quality: '1080p', videoOnly: true, itag: 137 },
    ],
  };

  it('maps Piped streams and prefers AAC on iOS', async () => {
    const { impl, urls } = jsonFetch(200, body);
    const streams = await new PipedResolver('https://pipedapi.example.org', { ...prefs('ios'), fetchImpl: impl }).resolve(ID);
    expect(urls).toEqual([`https://pipedapi.example.org/streams/${ID}`]);
    expect(streams).toMatchObject({
      source: 'piped',
      audio: { uri: 'https://proxy/a140?expire=1790000000', itag: 140 },
      video: { uri: 'https://proxy/v18', height: 360 },
      expiresAt: 1_790_000_000_000,
      details: { title: 'Song', author: 'Artist', durationSec: 212 },
    });
  });

  it('uses the highest bitrate on Android and the lowest for data saver', async () => {
    const { impl } = jsonFetch(200, body);
    const high = await new PipedResolver('https://p.example', { ...prefs('android'), fetchImpl: impl }).resolve(ID);
    const low = await new PipedResolver('https://p.example', { ...prefs('android', 'low'), fetchImpl: impl }).resolve(ID);
    expect(high.audio.itag).toBe(251);
    expect(low.audio.itag).toBe(139);
  });

  it('surfaces instance errors', async () => {
    const { impl } = jsonFetch(500, { error: 'Could not extract' });
    await expect(
      new PipedResolver('https://p.example', { ...prefs('ios'), fetchImpl: impl }).resolve(ID),
    ).rejects.toMatchObject({ code: 'network', message: 'Could not extract', resolver: 'piped' });
  });
});

describe('InvidiousResolver', () => {
  it('maps adaptive and muxed formats, resolving relative proxy URLs', async () => {
    const { impl, urls } = jsonFetch(200, {
      title: 'Song',
      author: 'Artist',
      lengthSeconds: 212,
      liveNow: false,
      videoThumbnails: [{ url: 'https://inv/thumb.jpg' }],
      adaptiveFormats: [
        { url: '/videoplayback?itag=140&expire=1790000000', type: 'audio/mp4; codecs="mp4a.40.2"', bitrate: '130000', itag: '140' },
        { url: '/videoplayback?itag=251', type: 'audio/webm; codecs="opus"', bitrate: '160000', itag: '251' },
        { url: '/videoplayback?itag=137', type: 'video/mp4; codecs="avc1"', bitrate: '4000000', itag: '137' },
      ],
      formatStreams: [
        { url: '/latest_version?id=x&itag=18&local=true', type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', resolution: '360p', itag: '18' },
      ],
    });
    const streams = await new InvidiousResolver('https://inv.example', { ...prefs('ios'), fetchImpl: impl }).resolve(ID);
    expect(urls).toEqual([`https://inv.example/api/v1/videos/${ID}?local=true`]);
    expect(streams.audio.uri).toBe('https://inv.example/videoplayback?itag=140&expire=1790000000');
    expect(streams.video).toMatchObject({ uri: 'https://inv.example/latest_version?id=x&itag=18&local=true', height: 360 });
    expect(streams.details?.thumbnailUrl).toBe('https://inv/thumb.jpg');
  });

  it('treats 404 as an unavailable video', async () => {
    const { impl } = jsonFetch(404, { error: 'This video may no longer exist.' });
    await expect(
      new InvidiousResolver('https://inv.example', { ...prefs('ios'), fetchImpl: impl }).resolve(ID),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('uses HLS for live streams', async () => {
    const { impl } = jsonFetch(200, { title: 'Live', liveNow: true, hlsUrl: '/api/manifest/hls_variant/x', adaptiveFormats: [], formatStreams: [] });
    const streams = await new InvidiousResolver('https://inv.example', { ...prefs('android'), fetchImpl: impl }).resolve(ID);
    expect(streams.audio).toEqual({ uri: 'https://inv.example/api/manifest/hls_variant/x', contentType: 'hls' });
  });
});
