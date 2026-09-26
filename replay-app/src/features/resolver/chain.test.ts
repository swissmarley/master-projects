import { EXPIRY_MARGIN_MS, ResolverChain, StreamCache, pickMostUseful } from './chain';
import { ResolveError, type ResolvedStreams, type ResolverName, type StreamResolver } from './types';

let clock = 1_000_000;
const now = () => clock;

function streams(videoId: string, source: ResolverName = 'innertube', ttl = 60 * 60 * 1000): ResolvedStreams {
  return {
    videoId,
    source,
    audio: { uri: `https://a/${videoId}`, contentType: 'progressive' },
    video: null,
    expiresAt: now() + ttl,
  };
}

function fakeResolver(name: ResolverName, impl: (id: string) => Promise<ResolvedStreams>): StreamResolver & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    name,
    calls,
    resolve: (id: string) => {
      calls.push(id);
      return impl(id);
    },
  };
}

beforeEach(() => {
  clock = 1_000_000;
});

describe('StreamCache', () => {
  it('expires entries within the safety margin', () => {
    const cache = new StreamCache(10, now);
    cache.set(streams('a', 'innertube', EXPIRY_MARGIN_MS + 1000));
    expect(cache.get('a')).not.toBeNull();
    clock += 1001;
    expect(cache.get('a')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry', () => {
    const cache = new StreamCache(2, now);
    cache.set(streams('a'));
    cache.set(streams('b'));
    cache.get('a');
    cache.set(streams('c'));
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });
});

describe('ResolverChain', () => {
  it('uses the first resolver that succeeds and caches the result', async () => {
    const failing = fakeResolver('innertube', async () => {
      throw new ResolveError('blocked', 'nope', 'innertube');
    });
    const capture = fakeResolver('webview', async (id) => streams(id, 'webview'));
    const chain = new ResolverChain(() => [failing, capture], new StreamCache(10, now));

    expect((await chain.resolve('a')).source).toBe('webview');
    expect((await chain.resolve('a')).source).toBe('webview');
    expect(failing.calls).toEqual(['a']);
    expect(capture.calls).toEqual(['a']);
  });

  it('shares one resolution between concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = fakeResolver('innertube', async (id) => {
      await gate;
      return streams(id);
    });
    const chain = new ResolverChain(() => [slow], new StreamCache(10, now));
    const first = chain.resolve('a');
    const second = chain.resolve('a');
    release();
    expect(await first).toBe(await second);
    expect(slow.calls).toEqual(['a']);
  });

  it('re-resolves when forced (after a playback failure)', async () => {
    const resolver = fakeResolver('innertube', async (id) => streams(id));
    const chain = new ResolverChain(() => [resolver], new StreamCache(10, now));
    await chain.resolve('a');
    await chain.resolve('a', { force: true });
    expect(resolver.calls).toEqual(['a', 'a']);
  });

  it('prefetch swallows errors', async () => {
    const failing = fakeResolver('innertube', async () => {
      throw new ResolveError('network', 'offline');
    });
    const chain = new ResolverChain(() => [failing]);
    expect(() => chain.prefetch('a')).not.toThrow();
    await Promise.resolve();
  });

  it('reports the most useful error when everything fails', async () => {
    const age = fakeResolver('innertube', async () => {
      throw new ResolveError('login-required', 'Sign in to confirm your age', 'innertube');
    });
    const capture = fakeResolver('webview', async () => {
      throw new ResolveError('timeout', 'slow', 'webview');
    });
    const failures: string[] = [];
    const chain = new ResolverChain(() => [age, capture], undefined, (name) => failures.push(name));
    await expect(chain.resolve('a')).rejects.toMatchObject({ code: 'login-required' });
    expect(failures).toEqual(['innertube', 'webview']);
  });

  it('explains when every source is disabled', async () => {
    const chain = new ResolverChain(() => []);
    await expect(chain.resolve('a')).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('pickMostUseful', () => {
  it('skips capture-unavailable in favour of real errors', () => {
    const picked = pickMostUseful([
      new ResolveError('capture-unavailable', 'no host'),
      new ResolveError('network', 'offline'),
    ]);
    expect(picked.code).toBe('network');
  });

  it('wraps unknown errors', () => {
    expect(pickMostUseful([new Error('x')]).code).toBe('no-streams');
  });
});
