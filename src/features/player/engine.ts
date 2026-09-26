import type { ContentType } from '@/features/resolver/types';

/** What the controller asks the native player to open. */
export type EngineSource = {
  uri: string;
  contentType: ContentType;
  headers?: Record<string, string>;
  /** Shown on the lock screen and in the media notification. */
  metadata: { title: string; artist?: string; artwork?: string };
};

export type EngineEvents = {
  /** The current item played to its end. */
  ended: () => void;
  error: (message: string) => void;
  playingChange: (isPlaying: boolean) => void;
  bufferingChange: (isBuffering: boolean) => void;
  timeUpdate: (position: number, duration: number, buffered: number) => void;
};

/**
 * The slice of a media player the controller needs. The app uses
 * `ExpoVideoEngine`; tests use an in-memory fake.
 */
export interface MediaEngine {
  load(source: EngineSource, startAt?: number): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  /** Unloads the current item and removes the lock-screen controls. */
  stop(): void;
  /** Keep the screen awake while a video is being watched. */
  setVideoVisible(visible: boolean): void;
  readonly position: number;
  readonly duration: number;
  readonly isPlaying: boolean;
  on<E extends keyof EngineEvents>(event: E, handler: EngineEvents[E]): () => void;
}

/** Minimal typed event emitter shared by engine implementations. */
export class Emitter<Events extends Record<string, (...args: never[]) => void>> {
  private readonly handlers = new Map<keyof Events, Set<(...args: never[]) => void>>();

  on<E extends keyof Events>(event: E, handler: Events[E]): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      (handler as (...a: Parameters<Events[E]>) => void)(...args);
    }
  }
}
