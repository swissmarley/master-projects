import { getKnownVisitorData, getVisitorData, rememberVisitorData, resetVisitorData } from './session';

beforeEach(() => resetVisitorData());

describe('visitor session', () => {
  it('prefers the id reported by the browser', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    rememberVisitorData('CgtWSVNJVE9SX0lE');
    await expect(getVisitorData(fetchImpl)).resolves.toBe('CgtWSVNJVE9SX0lE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ignores malformed ids', () => {
    rememberVisitorData('<script>');
    rememberVisitorData('');
    expect(getKnownVisitorData()).toBeUndefined();
  });

  it('fetches sw.js_data once when nothing is known', async () => {
    const payload = [[null, null, [[[null, null, null, null, null, null, null, null, null, null, null, null, null, 'CgtGRVRDSEVEX0lE']]]]];
    const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => `)]}'${JSON.stringify(payload)}` })) as unknown as typeof fetch;
    const [a, b] = await Promise.all([getVisitorData(fetchImpl), getVisitorData(fetchImpl)]);
    expect(a).toBe('CgtGRVRDSEVEX0lE');
    expect(b).toBe('CgtGRVRDSEVEX0lE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when offline', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(getVisitorData(fetchImpl)).resolves.toBeUndefined();
  });
});
