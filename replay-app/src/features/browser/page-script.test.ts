/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://m.youtube.com/"}
 */
import { TextDecoder, TextEncoder } from 'util';

import {
  buildPageScript,
  pageCommandScript,
  parsePageMessage,
  type PageMessage,
} from './page-script';

// jsdom's URL implementation needs these; real WebViews always have them.
Object.assign(globalThis, { TextEncoder, TextDecoder });

type Bridge = { postMessage: jest.Mock };
type PageGlobal = { __replayPage?: { dispose: () => void } };

const CHECK = String.fromCharCode(0x2713);

const ID_A = 'aaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbb';

function install(options = { quickAdd: true, addedIds: [] as string[] }) {
  const bridge: Bridge = { postMessage: jest.fn() };
  (window as unknown as { ReactNativeWebView: Bridge }).ReactNativeWebView = bridge;
  // Indirect eval runs the script in global scope, like the WebView does.
  (0, eval)(buildPageScript(options));
  return {
    messages: () => bridge.postMessage.mock.calls.map(([raw]) => JSON.parse(raw) as PageMessage),
    last: <T extends PageMessage['type']>(type: T) =>
      bridge.postMessage.mock.calls
        .map(([raw]) => JSON.parse(raw) as PageMessage)
        .filter((m): m is Extract<PageMessage, { type: T }> => m.type === type)
        .at(-1),
    run: (command: Parameters<typeof pageCommandScript>[0]) => (0, eval)(pageCommandScript(command)),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  document.head.innerHTML = '<title>YouTube</title>';
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  (window as unknown as PageGlobal).__replayPage?.dispose();
  jest.useRealTimers();
});

async function flush() {
  // Let MutationObserver callbacks (microtasks) and debounced timers run.
  await Promise.resolve();
  jest.advanceTimersByTime(300);
  await Promise.resolve();
}

describe('page script: current video detection', () => {
  it('reports a non-video page on start', () => {
    const page = install();
    expect(page.last('page')).toEqual({
      type: 'page',
      url: 'https://m.youtube.com/',
      video: null,
    });
  });

  it('trusts the server-rendered title on a direct watch-page load', () => {
    window.history.replaceState({}, '', `/watch?v=${ID_A}`);
    document.title = 'First Song - YouTube';
    const page = install();
    expect(page.last('page')?.video).toEqual({ videoId: ID_A, title: 'First Song' });
  });

  it('follows in-page navigations and ignores the stale title', async () => {
    window.history.replaceState({}, '', `/watch?v=${ID_A}`);
    document.title = 'First Song - YouTube';
    const page = install();

    window.history.pushState({}, '', `/watch?v=${ID_B}&pp=xyz`);
    jest.advanceTimersByTime(1);
    expect(page.last('page')?.video).toEqual({ videoId: ID_B });

    document.title = 'Second Song - YouTube';
    await flush();
    jest.advanceTimersByTime(1500);
    expect(page.last('page')?.video).toEqual({ videoId: ID_B, title: 'Second Song' });
  });

  it('prefers metadata from the YouTube player when it matches the video', () => {
    window.history.replaceState({}, '', `/shorts/${ID_A}`);
    const player = document.createElement('div');
    player.id = 'movie_player';
    Object.assign(player, {
      getVideoData: () => ({ video_id: ID_A, title: 'Player Title', author: 'Channel' }),
      getDuration: () => 212.4,
    });
    document.body.appendChild(player);
    const page = install();
    expect(page.last('page')?.video).toEqual({
      videoId: ID_A,
      title: 'Player Title',
      author: 'Channel',
      durationSec: 212,
    });
  });

  it('ignores player metadata that belongs to the previous video', () => {
    window.history.replaceState({}, '', `/watch?v=${ID_B}`);
    const player = document.createElement('div');
    player.id = 'movie_player';
    Object.assign(player, {
      getVideoData: () => ({ video_id: ID_A, title: 'Old', author: 'Old channel' }),
      getDuration: () => 100,
    });
    document.body.appendChild(player);
    const page = install();
    expect(page.last('page')?.video).toEqual({ videoId: ID_B });
  });

  it('does not repeat identical state messages', () => {
    const page = install();
    const count = page.messages().length;
    jest.advanceTimersByTime(1500 * 3);
    expect(page.messages()).toHaveLength(count);
    page.run({ type: 'requestState' });
    expect(page.messages()).toHaveLength(count + 1);
  });

  it('is idempotent when injected twice', () => {
    const page = install();
    (0, eval)(buildPageScript({ quickAdd: true, addedIds: [] }));
    window.history.pushState({}, '', `/watch?v=${ID_A}`);
    jest.advanceTimersByTime(1);
    expect(page.messages().filter((m) => m.type === 'page')).toHaveLength(2);
  });
});

describe('page script: quick-add buttons', () => {
  function addThumbnail(href: string, label?: string) {
    const anchor = document.createElement('a');
    anchor.setAttribute('href', href);
    if (label) anchor.setAttribute('aria-label', label);
    const frame = document.createElement('div');
    frame.appendChild(document.createElement('img'));
    anchor.appendChild(frame);
    document.body.appendChild(anchor);
    return anchor;
  }

  it('decorates video thumbnails and adds on tap without navigating', async () => {
    const page = install();
    addThumbnail(`/watch?v=${ID_A}`, 'Great Song - 3 minutes');
    addThumbnail('/feed/library');
    await flush();

    const buttons = document.querySelectorAll<HTMLButtonElement>('.replay-add');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('+');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(page.last('add')).toEqual({
      type: 'add',
      source: 'thumbnail',
      video: { videoId: ID_A, title: 'Great Song' },
    });
    expect(buttons[0].textContent).toBe(CHECK);
  });

  it('marks videos that are already in the playlist', async () => {
    const page = install({ quickAdd: true, addedIds: [ID_A] });
    addThumbnail(`/watch?v=${ID_A}`);
    addThumbnail(`/shorts/${ID_B}`);
    await flush();
    const text = () =>
      [...document.querySelectorAll('.replay-add')].map((b) => b.textContent).join(',');
    expect(text()).toBe(`${CHECK},+`);
    page.run({ type: 'markAdded', videoIds: [ID_B] });
    expect(text()).toBe(`+,${CHECK}`);
  });

  it('can be switched off and on', async () => {
    const page = install({ quickAdd: false, addedIds: [] });
    addThumbnail(`/watch?v=${ID_A}`);
    await flush();
    expect(document.querySelectorAll('.replay-add')).toHaveLength(0);
    page.run({ type: 'setQuickAdd', enabled: true });
    expect(document.querySelectorAll('.replay-add')).toHaveLength(1);
    page.run({ type: 'setQuickAdd', enabled: false });
    expect(document.querySelector<HTMLElement>('.replay-add')?.style.display).toBe('none');
  });
});

describe('page script: media', () => {
  it('reports page playback and pauses page media on command', () => {
    const page = install();
    const video = document.createElement('video');
    document.body.appendChild(video);
    const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    video.dispatchEvent(new Event('playing'));
    expect(page.last('media')).toEqual({ type: 'media', state: 'playing' });

    page.run({ type: 'pauseMedia' });
    expect(pause).toHaveBeenCalled();
    video.dispatchEvent(new Event('pause'));
    expect(page.last('media')).toEqual({ type: 'media', state: 'paused' });
    pause.mockRestore();
  });
});

describe('parsePageMessage', () => {
  it('accepts well-formed messages and rejects everything else', () => {
    expect(parsePageMessage('{"type":"media","state":"playing"}')).toEqual({
      type: 'media',
      state: 'playing',
    });
    expect(parsePageMessage('{"type":"add","video":{"videoId":"x"}}')).not.toBeNull();
    expect(parsePageMessage('{"type":"add","video":{}}')).toBeNull();
    expect(parsePageMessage('{"type":"page"}')).toBeNull();
    expect(parsePageMessage('{"type":"evil"}')).toBeNull();
    expect(parsePageMessage('not json')).toBeNull();
    expect(parsePageMessage('null')).toBeNull();
  });
});
