import {
  findVideoIdInText,
  isValidVideoId,
  parsePlaylistId,
  parseStartSeconds,
  parseVideoId,
  splitUrl,
  thumbnailUrl,
} from './url';

const ID = 'dQw4w9WgXcQ';

describe('parseVideoId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}&list=PL123&index=2`],
    [`https://music.youtube.com/watch?v=${ID}&si=abc`],
    [`https://youtube.com/watch?feature=share&v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}#t=30`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=Xyz&t=42`],
    [`youtu.be/${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}?autoplay=1`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/v/${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc`],
    [`https://www.youtube.com/attribution_link?a=x&u=%2Fwatch%3Fv%3D${ID}%26feature%3Dshare`],
    [`  ${ID}  `],
  ])('extracts the id from %s', (input) => {
    expect(parseVideoId(input)).toBe(ID);
  });

  it.each([
    [''],
    ['not a url'],
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/feed/subscriptions'],
    ['https://www.youtube.com/@SomeChannel'],
    ['https://www.youtube.com/watch?v=tooShort'],
    [`https://evil-youtube.com/watch?v=${ID}`],
    [`https://youtube.com.evil.example/watch?v=${ID}`],
    [`https://vimeo.com/${ID}`],
    [`javascript:alert('${ID}')`],
    [`ftp://youtube.com/watch?v=${ID}`],
  ])('rejects %s', (input) => {
    expect(parseVideoId(input)).toBeNull();
  });

  it('handles null and undefined', () => {
    expect(parseVideoId(null)).toBeNull();
    expect(parseVideoId(undefined)).toBeNull();
  });
});

describe('isValidVideoId', () => {
  it('accepts base64url ids of length 11 only', () => {
    expect(isValidVideoId(ID)).toBe(true);
    expect(isValidVideoId('a-b_c-d_e-f')).toBe(true);
    expect(isValidVideoId('dQw4w9WgXc')).toBe(false);
    expect(isValidVideoId('dQw4w9WgXcQQ')).toBe(false);
    expect(isValidVideoId('dQw4w9WgX!Q')).toBe(false);
  });
});

describe('parsePlaylistId', () => {
  it('reads list= from watch and playlist URLs', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabc123_-')).toBe('PLabc123_-');
    expect(parsePlaylistId(`https://m.youtube.com/watch?v=${ID}&list=RDdQw4w9WgXcQ`)).toBe(
      'RDdQw4w9WgXcQ',
    );
    expect(parsePlaylistId(`https://www.youtube.com/watch?v=${ID}`)).toBeNull();
    expect(parsePlaylistId('https://example.com/playlist?list=PLabc')).toBeNull();
  });
});

describe('parseStartSeconds', () => {
  it('supports plain seconds and h/m/s notation', () => {
    expect(parseStartSeconds(`https://youtu.be/${ID}?t=42`)).toBe(42);
    expect(parseStartSeconds(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toBe(90);
    expect(parseStartSeconds(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)).toBe(3723);
    expect(parseStartSeconds(`https://www.youtube.com/embed/${ID}?start=15`)).toBe(15);
    expect(parseStartSeconds(`https://youtu.be/${ID}`)).toBeNull();
    expect(parseStartSeconds(`https://youtu.be/${ID}?t=abc`)).toBeNull();
  });
});

describe('findVideoIdInText', () => {
  it('finds a link inside shared text', () => {
    expect(findVideoIdInText(`Check this out! https://youtu.be/${ID}?si=abc via YouTube`)).toBe(ID);
    expect(findVideoIdInText(`Watch "Song" on YouTube\nhttps://www.youtube.com/watch?v=${ID}`)).toBe(
      ID,
    );
  });

  it('finds scheme-less links and bare ids', () => {
    expect(findVideoIdInText(`see youtu.be/${ID} now`)).toBe(ID);
    expect(findVideoIdInText(ID)).toBe(ID);
  });

  it('ignores unrelated text', () => {
    expect(findVideoIdInText('nothing to see at https://example.com/abc')).toBeNull();
    expect(findVideoIdInText(null)).toBeNull();
  });
});

describe('splitUrl', () => {
  it('lowercases the host and strips credentials and port', () => {
    expect(splitUrl('https://user:pw@WWW.YouTube.com:443/watch?v=x&v=y')).toEqual({
      host: 'www.youtube.com',
      path: '/watch',
      query: { v: 'x' },
    });
  });
});

describe('thumbnailUrl', () => {
  it('builds i.ytimg.com urls', () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(thumbnailUrl(ID, 'default')).toBe(`https://i.ytimg.com/vi/${ID}/default.jpg`);
    expect(thumbnailUrl(ID, 'maxres')).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  });
});
