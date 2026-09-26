import { thumbnailUrl } from './url';

export type VideoSummary = {
  title: string;
  author?: string;
  thumbnailUrl?: string;
};

type OEmbedResponse = {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
};

/**
 * Looks up a video's title and channel through YouTube's public oEmbed
 * endpoint (no API key, no cookies). Returns null for private, removed or
 * non-embeddable videos, and on network errors.
 */
export async function fetchVideoSummary(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<VideoSummary | null> {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  try {
    const response = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${target}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as OEmbedResponse;
    if (typeof body.title !== 'string' || !body.title.trim()) return null;
    return {
      title: body.title.trim(),
      author: typeof body.author_name === 'string' ? body.author_name : undefined,
      // oEmbed returns hqdefault; keep our canonical URL so caches line up.
      thumbnailUrl: thumbnailUrl(videoId),
    };
  } catch {
    return null;
  }
}
