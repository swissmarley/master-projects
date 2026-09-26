import {
  EXPIRE,
  VIDEO_ID,
  errorResponse,
  liveResponse,
  multiAudioResponse,
  okResponse,
} from './__fixtures__/player-response';
import {
  expiryFromUrl,
  parseMimeType,
  parsePlayerResponse,
  selectAudioFormat,
  selectMuxedFormat,
} from './formats';

const NOW = 1_789_000_000_000;

describe('parseMimeType', () => {
  it('splits type, container and codecs', () => {
    expect(parseMimeType('video/mp4; codecs="avc1.42001E, mp4a.40.2"')).toEqual({
      type: 'video',
      container: 'mp4',
      codecs: ['avc1.42001E', 'mp4a.40.2'],
    });
    expect(parseMimeType('audio/webm; codecs="opus"').codecs).toEqual(['opus']);
    expect(parseMimeType('audio/mp4').codecs).toEqual([]);
  });
});

describe('parsePlayerResponse', () => {
  const parsed = parsePlayerResponse(okResponse(), NOW);

  it('reads status, details and expiry', () => {
    expect(parsed.status).toBe('OK');
    expect(parsed.details).toEqual({
      videoId: VIDEO_ID,
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      durationSec: 212,
      isLive: false,
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    expect(parsed.expiresAt).toBe(NOW + 21_540_000);
  });

  it('keeps direct-url formats and counts ciphered ones', () => {
    expect(parsed.formats.map((f) => f.itag)).toEqual([18, 137, 140, 140, 139, 251, 249]);
    expect(parsed.cipheredCount).toBe(1);
  });

  it('classifies audio, video and muxed formats', () => {
    const byItag = (itag: number) => parsed.formats.find((f) => f.itag === itag)!;
    expect(byItag(18)).toMatchObject({ hasAudio: true, hasVideo: true, height: 360 });
    expect(byItag(137)).toMatchObject({ hasAudio: false, hasVideo: true });
    expect(byItag(251)).toMatchObject({ hasAudio: true, hasVideo: false, container: 'webm' });
    expect(parsed.formats.filter((f) => f.isDrc)).toHaveLength(1);
  });

  it('falls back to the expire= URL parameter', () => {
    const response = okResponse();
    delete (response.streamingData as Record<string, unknown>).expiresInSeconds;
    expect(parsePlayerResponse(response, NOW).expiresAt).toBe(EXPIRE * 1000);
  });

  it('reads live HLS manifests', () => {
    const live = parsePlayerResponse(liveResponse(), NOW);
    expect(live.details.isLive).toBe(true);
    expect(live.hlsManifestUrl).toContain('hls_variant');
    expect(live.formats).toEqual([]);
  });

  it('reports errors with the most specific reason', () => {
    const error = parsePlayerResponse(errorResponse('LOGIN_REQUIRED', 'Sign in to confirm your age'));
    expect(error.status).toBe('LOGIN_REQUIRED');
    expect(error.reason).toBe('Sign in to confirm your age');
    const nested = errorResponse('UNPLAYABLE', 'Video unavailable');
    delete (nested.playabilityStatus as Record<string, unknown>).reason;
    expect(parsePlayerResponse(nested).reason).toBe('Video unavailable');
  });

  it('survives garbage', () => {
    expect(parsePlayerResponse(null).status).toBe('ERROR');
    expect(parsePlayerResponse({ streamingData: { formats: [{}, null, 'x'] } }).formats).toEqual([]);
  });

  it('drops DRM and non-https formats', () => {
    const response = okResponse();
    const muxed = response.streamingData.formats[0];
    (response.streamingData as Record<string, unknown>).formats = [
      { ...muxed, drmFamilies: ['WIDEVINE'] },
      { ...muxed, url: 'http://insecure.example/x' },
    ];
    expect(parsePlayerResponse(response).formats.filter((f) => f.itag === 18)).toEqual([]);
  });
});

describe('selectAudioFormat', () => {
  const { formats } = parsePlayerResponse(okResponse(), NOW);

  it('gives iOS AAC only (AVPlayer cannot play WebM)', () => {
    expect(selectAudioFormat(formats, { platform: 'ios', quality: 'high' })?.itag).toBe(140);
    expect(selectAudioFormat(formats, { platform: 'ios', quality: 'low' })?.itag).toBe(139);
  });

  it('prefers the highest bitrate on Android (Opus) and the lowest for data saver', () => {
    expect(selectAudioFormat(formats, { platform: 'android', quality: 'high' })?.itag).toBe(251);
    expect(selectAudioFormat(formats, { platform: 'android', quality: 'low' })?.itag).toBe(249);
  });

  it('avoids the DRC variant', () => {
    const pick = selectAudioFormat(formats, { platform: 'ios', quality: 'high' });
    expect(pick?.isDrc).toBe(false);
  });

  it('stays on the default audio track of dubbed videos', () => {
    const multi = parsePlayerResponse(multiAudioResponse(), NOW).formats;
    expect(selectAudioFormat(multi, { platform: 'android', quality: 'high' })?.url).toContain('lang=en');
  });

  it('returns null without audio-only formats', () => {
    expect(selectAudioFormat(formats.filter((f) => f.hasVideo), { platform: 'android', quality: 'high' })).toBeNull();
  });
});

describe('selectMuxedFormat', () => {
  const { formats } = parsePlayerResponse(okResponse(), NOW);

  it('picks the best muxed stream within the height limit', () => {
    expect(selectMuxedFormat(formats, { platform: 'ios', maxHeight: 720 })?.itag).toBe(18);
  });

  it('falls back to the smallest muxed stream when none fits', () => {
    expect(selectMuxedFormat(formats, { platform: 'android', maxHeight: 240 })?.itag).toBe(18);
  });

  it('returns null when only adaptive streams exist', () => {
    expect(selectMuxedFormat(formats.filter((f) => f.itag !== 18), { platform: 'android', maxHeight: 720 })).toBeNull();
  });
});

describe('expiryFromUrl', () => {
  it('handles query and path styles', () => {
    expect(expiryFromUrl(`https://x.googlevideo.com/videoplayback?expire=${EXPIRE}&a=b`)).toBe(EXPIRE * 1000);
    expect(expiryFromUrl(`https://manifest.googlevideo.com/api/manifest/hls_variant/expire/${EXPIRE}/id/x`)).toBe(
      EXPIRE * 1000,
    );
    expect(expiryFromUrl('https://example.com/a.mp4')).toBeUndefined();
  });
});
