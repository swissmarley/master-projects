import { createVideoPlayer, type VideoPlayer } from 'expo-video';

import { Emitter, type EngineEvents, type EngineSource, type MediaEngine } from './engine';

/**
 * `MediaEngine` backed by one long-lived expo-video player.
 *
 * - `staysActiveInBackground` keeps audio going when the app is hidden or the
 *   phone is locked (needs the plugin's `supportsBackgroundPlayback`).
 * - `showNowPlayingNotification` publishes title/artist/artwork and
 *   play/pause/seek controls to the lock screen and notification shade.
 * - The same player renders video when a `<VideoView player={engine.player}>`
 *   is mounted, so audio and video mode share one pipeline.
 */
export class ExpoVideoEngine implements MediaEngine {
  readonly player: VideoPlayer;
  private readonly events = new Emitter<EngineEvents>();
  private lastBuffering = false;

  constructor() {
    this.player = createVideoPlayer(null);
    this.player.staysActiveInBackground = true;
    this.player.showNowPlayingNotification = true;
    this.player.audioMixingMode = 'doNotMix';
    this.player.timeUpdateEventInterval = 0.5;
    this.player.keepScreenOnWhilePlaying = false;

    this.player.addListener('playToEnd', () => this.events.emit('ended'));
    this.player.addListener('playingChange', ({ isPlaying }) => this.events.emit('playingChange', isPlaying));
    this.player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') this.events.emit('error', error?.message ?? 'Playback failed');
      const buffering = status === 'loading';
      if (buffering !== this.lastBuffering) {
        this.lastBuffering = buffering;
        this.events.emit('bufferingChange', buffering);
      }
    });
    this.player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
      this.events.emit('timeUpdate', currentTime, this.player.duration, Math.max(bufferedPosition, 0));
    });
  }

  async load(source: EngineSource, startAt = 0): Promise<void> {
    await this.player.replaceAsync({
      uri: source.uri,
      headers: source.headers,
      contentType: source.contentType,
      metadata: source.metadata,
    });
    if (startAt > 0) this.player.currentTime = startAt;
  }

  play(): void {
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  seekTo(seconds: number): void {
    this.player.currentTime = Math.max(0, seconds);
  }

  stop(): void {
    this.player.pause();
    this.player.replace(null);
  }

  setVideoVisible(visible: boolean): void {
    this.player.keepScreenOnWhilePlaying = visible;
  }

  get position(): number {
    return this.player.currentTime;
  }

  get duration(): number {
    return this.player.duration;
  }

  get isPlaying(): boolean {
    return this.player.playing;
  }

  on<E extends keyof EngineEvents>(event: E, handler: EngineEvents[E]): () => void {
    return this.events.on(event, handler);
  }
}
