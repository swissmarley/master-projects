import { rewriteIncomingLink } from '@/features/youtube/incoming-link';

/**
 * Incoming links (Android "Open with Replay" on youtube.com / youtu.be links,
 * or `replay://…`) are rewritten to the /add route when they point at a video.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return rewriteIncomingLink(path);
}
