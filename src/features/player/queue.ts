/**
 * Pure, immutable playback-queue logic (play order, shuffle, repeat).
 *
 * The queue is bound to a playlist: `items` mirrors the playlist's track IDs
 * (unique within a playlist) and `order` is the order they are played in —
 * identical to `items` unless shuffle is on.
 */

export type RepeatMode = 'off' | 'all' | 'one';

export type QueueState = {
  /** Track IDs in playlist order. */
  readonly items: readonly string[];
  /** Track IDs in play order (a permutation of `items`). */
  readonly order: readonly string[];
  /** Index into `order` of the current track, or -1 when the queue is empty. */
  readonly cursor: number;
  readonly shuffle: boolean;
  readonly repeat: RepeatMode;
};

export type Rng = () => number;

export const EMPTY_QUEUE: QueueState = {
  items: [],
  order: [],
  cursor: -1,
  shuffle: false,
  repeat: 'off',
};

function shuffled<T>(values: readonly T[], rng: Rng): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Puts `first` at the front and shuffles everything else behind it. */
function shuffledStartingWith(items: readonly string[], first: string | null, rng: Rng): string[] {
  if (first === null) return shuffled(items, rng);
  return [first, ...shuffled(items.filter((id) => id !== first), rng)];
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}

export function createQueue(
  items: readonly string[],
  options: { startId?: string | null; shuffle?: boolean; repeat?: RepeatMode } = {},
  rng: Rng = Math.random,
): QueueState {
  const unique = dedupe(items);
  const shuffle = options.shuffle ?? false;
  const repeat = options.repeat ?? 'off';
  if (unique.length === 0) return { ...EMPTY_QUEUE, shuffle, repeat };

  const startId =
    options.startId && unique.includes(options.startId)
      ? options.startId
      : shuffle
        ? null
        : unique[0];
  const order = shuffle ? shuffledStartingWith(unique, startId, rng) : unique;
  const cursor = shuffle ? 0 : order.indexOf(startId as string);
  return { items: unique, order, cursor, shuffle, repeat };
}

export function currentId(queue: QueueState): string | null {
  return queue.cursor >= 0 ? (queue.order[queue.cursor] ?? null) : null;
}

export type Advance = {
  queue: QueueState;
  /** True when playback reached the end of the queue and should stop. */
  ended: boolean;
  /** True when the same track should restart (repeat-one or single-track wrap). */
  restart: boolean;
};

/**
 * Moves to the next track.
 *
 * `auto` means the current track finished by itself: repeat-one then restarts
 * it. A manual "next" always moves on, wrapping around when repeat is on.
 */
export function next(queue: QueueState, { auto = false }: { auto?: boolean } = {}): Advance {
  if (queue.cursor < 0) return { queue, ended: true, restart: false };
  if (auto && queue.repeat === 'one') return { queue, ended: false, restart: true };

  if (queue.cursor < queue.order.length - 1) {
    return { queue: { ...queue, cursor: queue.cursor + 1 }, ended: false, restart: false };
  }
  if (queue.repeat === 'off') return { queue, ended: true, restart: false };
  const wrapped = { ...queue, cursor: 0 };
  return { queue: wrapped, ended: false, restart: queue.order.length === 1 };
}

/** Moves to the previous track (wrapping around only when repeat is on). */
export function previous(queue: QueueState): Advance {
  if (queue.cursor < 0) return { queue, ended: true, restart: false };
  if (queue.cursor > 0) {
    return { queue: { ...queue, cursor: queue.cursor - 1 }, ended: false, restart: false };
  }
  if (queue.repeat !== 'off' && queue.order.length > 1) {
    return { queue: { ...queue, cursor: queue.order.length - 1 }, ended: false, restart: false };
  }
  return { queue, ended: false, restart: true };
}

/** The track that `next({auto: true})` would play, for prefetching. */
export function peekNext(queue: QueueState): string | null {
  const { queue: after, ended } = next(queue, { auto: true });
  return ended ? null : currentId(after);
}

/** Up to `count` upcoming track IDs in play order (wrapping when repeat-all). */
export function upcoming(queue: QueueState, count: number): string[] {
  const out: string[] = [];
  if (queue.cursor < 0) return out;
  for (let step = 1; step < queue.order.length && out.length < count; step++) {
    const index = queue.cursor + step;
    if (index < queue.order.length) out.push(queue.order[index]);
    else if (queue.repeat !== 'off') out.push(queue.order[index - queue.order.length]);
    else break;
  }
  return out;
}

export function jumpTo(queue: QueueState, id: string): QueueState {
  const cursor = queue.order.indexOf(id);
  return cursor === -1 ? queue : { ...queue, cursor };
}

export function setShuffle(queue: QueueState, shuffle: boolean, rng: Rng = Math.random): QueueState {
  if (shuffle === queue.shuffle) return queue;
  const current = currentId(queue);
  if (shuffle) {
    const order = shuffledStartingWith(queue.items, current, rng);
    return { ...queue, shuffle, order, cursor: order.length ? 0 : -1 };
  }
  const order = queue.items;
  return { ...queue, shuffle, order, cursor: current === null ? -1 : order.indexOf(current) };
}

export function setRepeat(queue: QueueState, repeat: RepeatMode): QueueState {
  return repeat === queue.repeat ? queue : { ...queue, repeat };
}

export function cycleRepeat(repeat: RepeatMode): RepeatMode {
  return repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
}

/**
 * Reconciles the queue after the underlying playlist changed (tracks added,
 * removed or reordered) while it is playing.
 *
 * - The current track keeps playing if it still exists.
 * - If it was removed, the track that took its place in play order becomes
 *   current (the caller notices `currentId` changed and loads it).
 * - With shuffle on, the existing shuffled order is preserved and new tracks
 *   are shuffled into the part of the queue that has not played yet.
 */
export function syncItems(
  queue: QueueState,
  items: readonly string[],
  rng: Rng = Math.random,
): QueueState {
  const unique = dedupe(items);
  if (unique.length === 0) return { ...EMPTY_QUEUE, shuffle: queue.shuffle, repeat: queue.repeat };

  const present = new Set(unique);
  const current = currentId(queue);

  if (!queue.shuffle) {
    let cursor = current !== null ? unique.indexOf(current) : -1;
    if (cursor === -1) {
      // Current track removed: continue with whatever now sits at its position,
      // counting only the tracks before it that survived.
      const survivorsBefore = queue.order.slice(0, Math.max(queue.cursor, 0)).filter((id) => present.has(id));
      const anchor = survivorsBefore.length;
      cursor = Math.min(anchor, unique.length - 1);
    }
    return { ...queue, items: unique, order: unique, cursor };
  }

  const known = new Set(queue.order);
  const played = queue.order.slice(0, Math.max(queue.cursor, 0)).filter((id) => present.has(id));
  const rest = queue.order.slice(Math.max(queue.cursor, 0)).filter((id) => present.has(id));
  const added = unique.filter((id) => !known.has(id));

  let order: string[];
  let cursor: number;
  if (current !== null && present.has(current)) {
    // rest[0] is the current track; shuffle new tracks into what comes after it.
    order = [...played, current, ...shuffled([...rest.slice(1), ...added], rng)];
    cursor = played.length;
  } else {
    order = [...played, ...rest, ...shuffled(added, rng)];
    cursor = Math.min(played.length, order.length - 1);
  }
  return { ...queue, items: unique, order, cursor };
}
