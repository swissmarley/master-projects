/**
 * Trimmed-down Innertube `player` responses with the same shape YouTube
 * returns, used by resolver tests (the build container cannot reach YouTube).
 */

export const VIDEO_ID = 'dQw4w9WgXcQ';
export const EXPIRE = 1_790_000_000; // epoch seconds

const gv = (itag: number) =>
  `https://rr3---sn-abc.googlevideo.com/videoplayback?expire=${EXPIRE}&ei=x&ip=1.2.3.4&id=o-A&itag=${itag}&source=youtube&mime=x`;

export function okResponse(overrides: Record<string, unknown> = {}) {
  return {
    responseContext: {},
    playabilityStatus: { status: 'OK', playableInEmbed: true },
    streamingData: {
      expiresInSeconds: '21540',
      formats: [
        {
          itag: 18,
          url: gv(18),
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          bitrate: 503_000,
          width: 640,
          height: 360,
          quality: 'medium',
          qualityLabel: '360p',
          audioQuality: 'AUDIO_QUALITY_LOW',
          approxDurationMs: '212091',
        },
      ],
      adaptiveFormats: [
        {
          itag: 137,
          url: gv(137),
          mimeType: 'video/mp4; codecs="avc1.640028"',
          bitrate: 4_000_000,
          width: 1920,
          height: 1080,
          qualityLabel: '1080p',
        },
        {
          itag: 140,
          url: gv(140),
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 130_000,
          averageBitrate: 129_502,
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
          contentLength: '3433514',
        },
        {
          itag: 140,
          url: `${gv(140)}&xtags=drc%3D1`,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 131_000,
          averageBitrate: 130_000,
          isDrc: true,
          xtags: 'CgcKA2RyYxIBMQ',
        },
        {
          itag: 139,
          url: gv(139),
          mimeType: 'audio/mp4; codecs="mp4a.40.5"',
          bitrate: 50_000,
          averageBitrate: 48_000,
          audioQuality: 'AUDIO_QUALITY_LOW',
        },
        {
          itag: 251,
          url: gv(251),
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 150_000,
          averageBitrate: 135_000,
          audioQuality: 'AUDIO_QUALITY_MEDIUM',
        },
        {
          itag: 249,
          url: gv(249),
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 55_000,
          averageBitrate: 46_000,
          audioQuality: 'AUDIO_QUALITY_LOW',
        },
        {
          itag: 250,
          signatureCipher: 's=AAA&sp=sig&url=https%3A%2F%2Frr3---sn-abc.googlevideo.com%2Fvideoplayback',
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 70_000,
        },
      ],
    },
    videoDetails: {
      videoId: VIDEO_ID,
      title: 'Never Gonna Give You Up',
      lengthSeconds: '212',
      author: 'Rick Astley',
      isLiveContent: false,
      thumbnail: {
        thumbnails: [
          { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 },
          { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360 },
        ],
      },
    },
    ...overrides,
  };
}

/** A video with two dubbed audio tracks. */
export function multiAudioResponse() {
  const base = okResponse();
  const track = (id: string, isDefault: boolean) => ({
    displayName: id,
    id,
    audioIsDefault: isDefault,
  });
  base.streamingData.adaptiveFormats = [
    {
      itag: 140,
      url: gv(140) + '&lang=de',
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 140_000,
      audioTrack: track('de-DE.3', false),
    } as never,
    {
      itag: 140,
      url: gv(140) + '&lang=en',
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 128_000,
      audioTrack: track('en-US.4', true),
    } as never,
  ];
  return base;
}

export function liveResponse() {
  return {
    playabilityStatus: { status: 'OK' },
    streamingData: {
      expiresInSeconds: '21540',
      hlsManifestUrl: `https://manifest.googlevideo.com/api/manifest/hls_variant/expire/${EXPIRE}/id/x/file/index.m3u8`,
      adaptiveFormats: [],
    },
    videoDetails: { videoId: VIDEO_ID, title: 'Live radio', author: 'Lofi', isLive: true, lengthSeconds: '0' },
  };
}

export function errorResponse(status: string, reason: string) {
  return {
    playabilityStatus: {
      status,
      reason,
      errorScreen: { playerErrorMessageRenderer: { reason: { simpleText: reason } } },
    },
    videoDetails: { videoId: VIDEO_ID, title: 'x' },
  };
}
