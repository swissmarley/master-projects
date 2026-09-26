import { rewriteIncomingLink } from './incoming-link';

const ID = 'dQw4w9WgXcQ';

describe('rewriteIncomingLink', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}&feature=share`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://m.youtube.com/shorts/${ID}`],
    [`/watch?v=${ID}`],
    [`/shorts/${ID}`],
  ])('sends %s to the add route', (path) => {
    expect(rewriteIncomingLink(path)).toBe(`/add?v=${ID}`);
  });

  it('leaves add links alone', () => {
    expect(rewriteIncomingLink(`replay://add?v=${ID}`)).toBe(`replay://add?v=${ID}`);
    expect(rewriteIncomingLink(`/add?url=https%3A%2F%2Fyoutu.be%2F${ID}`)).toBe(`/add?url=https%3A%2F%2Fyoutu.be%2F${ID}`);
  });

  it('leaves app routes and unrelated links alone', () => {
    expect(rewriteIncomingLink('replay://playlist/pl_abc')).toBe('replay://playlist/pl_abc');
    expect(rewriteIncomingLink('/player')).toBe('/player');
    expect(rewriteIncomingLink('/playlist/pl_abcdefghij')).toBe('/playlist/pl_abcdefghij');
    expect(rewriteIncomingLink('https://example.com/watch?v=abc')).toBe('https://example.com/watch?v=abc');
    expect(
      rewriteIncomingLink('exp+replay://expo-development-client/?url=http%3A%2F%2F192.168.1.5%3A8081'),
    ).toBe('exp+replay://expo-development-client/?url=http%3A%2F%2F192.168.1.5%3A8081');
  });

  it('survives malformed input', () => {
    expect(rewriteIncomingLink('%E0%A4%A')).toBe('%E0%A4%A');
  });
});
