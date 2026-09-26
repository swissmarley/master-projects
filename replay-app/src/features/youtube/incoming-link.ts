import { findVideoIdInText, parseVideoId } from './url';

/**
 * Maps a URL the OS hands to the app onto an app route:
 * - `replay://add?…` / `/add?…`            → unchanged (handled by the /add route)
 * - any YouTube video link (full or path)  → `/add?v=<id>`
 * - everything else                        → unchanged
 * Never throws (a throw here would crash the app on launch).
 */
export function rewriteIncomingLink(path: string): string {
  try {
    if (/^(?:[a-z][\w+.-]*:\/\/)?\/?add(?:[/?]|$)/i.test(path)) return path;
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      decoded = path;
    }
    const videoId =
      findVideoIdInText(decoded) ?? (decoded.startsWith('/') ? parseVideoId(`https://www.youtube.com${decoded}`) : null);
    return videoId ? `/add?v=${videoId}` : path;
  } catch {
    return '/';
  }
}
