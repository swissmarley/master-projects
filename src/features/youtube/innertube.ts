/**
 * Minimal Innertube (`/youtubei/v1/player`) client.
 *
 * Client profiles mirror yt-dlp's INNERTUBE_CLIENTS (master, 2026-09-16):
 * - `visionos`   no PO token, no JS player needed (yt-dlp's default JS-less client)
 * - `android_vr` no JS player; HTTPS formats may need a PO token now, so it is
 *                only a second attempt (URLs are probed before use).
 *
 * YouTube changes these rules regularly; when on-device resolution starts
 * failing, update the versions here (compare with yt-dlp's `_base.py`).
 */

export type InnertubeProfile = {
  id: string;
  clientName: string;
  /** Numeric id sent as X-YouTube-Client-Name. */
  clientNameId: number;
  clientVersion: string;
  userAgent: string;
  deviceMake?: string;
  deviceModel?: string;
  osName?: string;
  osVersion?: string;
  androidSdkVersion?: number;
};

export const INNERTUBE_PROFILES = {
  visionos: {
    id: 'visionos',
    clientName: 'VISIONOS',
    clientNameId: 101,
    clientVersion: '1.02',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice17,1',
    osName: 'visionOS',
    osVersion: '26.5.23O471',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  },
  android_vr: {
    id: 'android_vr',
    clientName: 'ANDROID_VR',
    clientNameId: 28,
    clientVersion: '1.65.10',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    osName: 'Android',
    osVersion: '12L',
    androidSdkVersion: 32,
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  },
} satisfies Record<string, InnertubeProfile>;

export type InnertubeProfileId = keyof typeof INNERTUBE_PROFILES;

export const DEFAULT_PROFILE_ORDER: InnertubeProfileId[] = ['visionos', 'android_vr'];

const PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

export type PlayerRequestOptions = {
  visitorData?: string;
  hl?: string;
  gl?: string;
};

export type HttpRequest = {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
};

export function buildPlayerRequest(
  videoId: string,
  profile: InnertubeProfile,
  { visitorData, hl = 'en', gl = 'US' }: PlayerRequestOptions = {},
): HttpRequest {
  const client: Record<string, unknown> = {
    clientName: profile.clientName,
    clientVersion: profile.clientVersion,
    userAgent: profile.userAgent,
    hl,
    gl,
  };
  if (profile.deviceMake) client.deviceMake = profile.deviceMake;
  if (profile.deviceModel) client.deviceModel = profile.deviceModel;
  if (profile.osName) client.osName = profile.osName;
  if (profile.osVersion) client.osVersion = profile.osVersion;
  if (profile.androidSdkVersion) client.androidSdkVersion = profile.androidSdkVersion;
  if (visitorData) client.visitorData = visitorData;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': profile.userAgent,
    'X-YouTube-Client-Name': String(profile.clientNameId),
    'X-YouTube-Client-Version': profile.clientVersion,
    Origin: 'https://www.youtube.com',
  };
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  return {
    url: PLAYER_ENDPOINT,
    method: 'POST',
    headers,
    body: JSON.stringify({
      context: { client },
      videoId,
      playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  };
}

export async function fetchPlayerResponse(
  videoId: string,
  profile: InnertubeProfile,
  options: PlayerRequestOptions & { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<unknown> {
  const { fetchImpl = fetch, signal, ...requestOptions } = options;
  const request = buildPlayerRequest(videoId, profile, requestOptions);
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Innertube player request failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Parses YouTube's `sw.js_data` payload (`)]}'` + JSON) for the visitor ID,
 * which lets anonymous requests look like an ongoing browser session.
 */
export function parseVisitorDataFromSwJs(text: string): string | null {
  try {
    const json = JSON.parse(text.replace(/^\)\]\}'\s*/, '')) as unknown;
    // Known location: [0][2][0][0][13]
    const candidate = (json as unknown[][][][][])?.[0]?.[2]?.[0]?.[0]?.[13];
    if (typeof candidate === 'string' && /^[A-Za-z0-9_%-]{10,}={0,2}$/.test(candidate)) return candidate;
  } catch {
    // fall through
  }
  const match = /"(Cg[A-Za-z0-9_-]{8,}(?:%3D|=){0,2})"/.exec(text);
  return match ? match[1] : null;
}
