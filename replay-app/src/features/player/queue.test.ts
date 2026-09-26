import {
  createQueue,
  currentId,
  cycleRepeat,
  EMPTY_QUEUE,
  jumpTo,
  next,
  peekNext,
  previous,
  setRepeat,
  setShuffle,
  syncItems,
  upcoming,
  type QueueState,
} from './queue';

/** Deterministic PRNG (mulberry32) so shuffles are reproducible. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEMS = ['a', 'b', 'c', 'd', 'e'];

function playAll(queue: QueueState, limit = 50): string[] {
  const seen = [currentId(queue)!];
  let q = queue;
  for (let i = 0; i < limit; i++) {
    const step = next(q, { auto: true });
    if (step.ended) break;
    q = step.queue;
    seen.push(currentId(q)!);
  }
  return seen;
}

describe('createQueue', () => {
  it('starts at the first track by default', () => {
    const q = createQueue(ITEMS);
    expect(currentId(q)).toBe('a');
    expect(q.order).toEqual(ITEMS);
  });

  it('starts at the requested track', () => {
    expect(currentId(createQueue(ITEMS, { startId: 'c' }))).toBe('c');
  });

  it('ignores an unknown start track', () => {
    expect(currentId(createQueue(ITEMS, { startId: 'zzz' }))).toBe('a');
  });

  it('removes duplicate ids', () => {
    expect(createQueue(['a', 'b', 'a']).items).toEqual(['a', 'b']);
  });

  it('puts the chosen track first when shuffling', () => {
    const q = createQueue(ITEMS, { startId: 'd', shuffle: true }, seeded(1));
    expect(currentId(q)).toBe('d');
    expect(q.cursor).toBe(0);
    expect([...q.order].sort()).toEqual(ITEMS);
  });

  it('handles an empty playlist', () => {
    const q = createQueue([]);
    expect(currentId(q)).toBeNull();
    expect(next(q).ended).toBe(true);
  });
});

describe('next / previous', () => {
  it('plays straight through and ends when repeat is off', () => {
    expect(playAll(createQueue(ITEMS))).toEqual(ITEMS);
  });

  it('wraps around with repeat all', () => {
    const q = createQueue(ITEMS, { startId: 'e', repeat: 'all' });
    const step = next(q, { auto: true });
    expect(step.ended).toBe(false);
    expect(currentId(step.queue)).toBe('a');
  });

  it('restarts the same track on auto-advance with repeat one', () => {
    const q = createQueue(ITEMS, { startId: 'b', repeat: 'one' });
    const step = next(q, { auto: true });
    expect(step.restart).toBe(true);
    expect(currentId(step.queue)).toBe('b');
  });

  it('still moves on for a manual next with repeat one', () => {
    const q = createQueue(ITEMS, { startId: 'e', repeat: 'one' });
    const step = next(q);
    expect(step.restart).toBe(false);
    expect(currentId(step.queue)).toBe('a');
  });

  it('flags a restart when a single track wraps', () => {
    const step = next(createQueue(['a'], { repeat: 'all' }));
    expect(step.restart).toBe(true);
    expect(currentId(step.queue)).toBe('a');
  });

  it('goes back one track, restarting the first track at the start', () => {
    const q = createQueue(ITEMS, { startId: 'c' });
    expect(currentId(previous(q).queue)).toBe('b');
    const first = previous(createQueue(ITEMS));
    expect(first.restart).toBe(true);
    expect(currentId(first.queue)).toBe('a');
  });

  it('wraps backwards with repeat on', () => {
    const q = createQueue(ITEMS, { repeat: 'all' });
    expect(currentId(previous(q).queue)).toBe('e');
  });
});

describe('peekNext / upcoming', () => {
  it('peeks the next track respecting repeat', () => {
    expect(peekNext(createQueue(ITEMS, { startId: 'b' }))).toBe('c');
    expect(peekNext(createQueue(ITEMS, { startId: 'e' }))).toBeNull();
    expect(peekNext(createQueue(ITEMS, { startId: 'e', repeat: 'all' }))).toBe('a');
    expect(peekNext(createQueue(ITEMS, { startId: 'e', repeat: 'one' }))).toBe('e');
  });

  it('lists upcoming tracks, wrapping only with repeat', () => {
    expect(upcoming(createQueue(ITEMS, { startId: 'd' }), 3)).toEqual(['e']);
    expect(upcoming(createQueue(ITEMS, { startId: 'd', repeat: 'all' }), 3)).toEqual([
      'e',
      'a',
      'b',
    ]);
    expect(upcoming(createQueue(ITEMS, { startId: 'a', repeat: 'all' }), 10)).toEqual([
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(upcoming(EMPTY_QUEUE, 3)).toEqual([]);
  });
});

describe('shuffle', () => {
  it('plays every track exactly once when shuffled', () => {
    const q = createQueue(ITEMS, { startId: 'c', shuffle: true }, seeded(42));
    const played = playAll(q);
    expect(played[0]).toBe('c');
    expect([...played].sort()).toEqual(ITEMS);
  });

  it('keeps the current track when toggling shuffle on and off', () => {
    const q = createQueue(ITEMS, { startId: 'c' });
    const on = setShuffle(q, true, seeded(7));
    expect(currentId(on)).toBe('c');
    expect(on.cursor).toBe(0);
    const off = setShuffle(jumpTo(on, 'e'), false);
    expect(currentId(off)).toBe('e');
    expect(off.order).toEqual(ITEMS);
    expect(off.cursor).toBe(4);
  });

  it('is a no-op when the flag does not change', () => {
    const q = createQueue(ITEMS);
    expect(setShuffle(q, false)).toBe(q);
  });
});

describe('repeat', () => {
  it('cycles off → all → one → off', () => {
    expect(cycleRepeat('off')).toBe('all');
    expect(cycleRepeat('all')).toBe('one');
    expect(cycleRepeat('one')).toBe('off');
  });

  it('sets the repeat mode', () => {
    expect(setRepeat(createQueue(ITEMS), 'all').repeat).toBe('all');
  });
});

describe('jumpTo', () => {
  it('moves to a known track and ignores unknown ones', () => {
    const q = createQueue(ITEMS);
    expect(currentId(jumpTo(q, 'd'))).toBe('d');
    expect(jumpTo(q, 'zzz')).toBe(q);
  });
});

describe('syncItems (playlist edited while playing)', () => {
  it('keeps the current track when others are added or reordered', () => {
    const q = createQueue(ITEMS, { startId: 'c' });
    const synced = syncItems(q, ['e', 'c', 'a', 'f']);
    expect(currentId(synced)).toBe('c');
    expect(synced.order).toEqual(['e', 'c', 'a', 'f']);
    expect(synced.cursor).toBe(1);
  });

  it('continues with the next track when the current one is removed', () => {
    const q = createQueue(ITEMS, { startId: 'b' });
    expect(currentId(syncItems(q, ['a', 'c', 'd', 'e']))).toBe('c');
  });

  it('clamps to the last track when the removed track was last', () => {
    const q = createQueue(ITEMS, { startId: 'e' });
    expect(currentId(syncItems(q, ['a', 'b', 'c']))).toBe('c');
  });

  it('empties the queue when the playlist is cleared', () => {
    const q = syncItems(createQueue(ITEMS, { repeat: 'all' }), []);
    expect(currentId(q)).toBeNull();
    expect(q.repeat).toBe('all');
  });

  it('preserves the shuffled history and shuffles new tracks into the remainder', () => {
    let q = createQueue(ITEMS, { startId: 'a', shuffle: true }, seeded(3));
    q = next(q).queue;
    q = next(q).queue;
    const before = q.order.slice(0, q.cursor + 1);
    const synced = syncItems(q, [...ITEMS, 'f', 'g'], seeded(9));
    expect(synced.order.slice(0, synced.cursor + 1)).toEqual(before);
    expect(currentId(synced)).toBe(currentId(q));
    expect([...synced.order].sort()).toEqual([...ITEMS, 'f', 'g']);
  });

  it('moves on when the current track is removed while shuffled', () => {
    let q = createQueue(ITEMS, { startId: 'a', shuffle: true }, seeded(5));
    q = next(q).queue;
    const current = currentId(q)!;
    const following = q.order[q.cursor + 1];
    const synced = syncItems(q, ITEMS.filter((id) => id !== current), seeded(6));
    expect(currentId(synced)).toBe(following);
  });
});
