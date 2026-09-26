/**
 * JavaScript injected into every page of the in-app browser before its own
 * scripts run. It is plain ES2017 (it executes inside the WebView, not Hermes)
 * and talks to the app through `window.ReactNativeWebView.postMessage`.
 *
 * Responsibilities:
 * - report which YouTube video is on screen, across YouTube's single-page
 *   navigations (pushState/replaceState/popstate + title changes + polling);
 * - add "+" quick-add buttons to video thumbnails (search results, feeds);
 * - report when the page itself starts/stops playing media, so the app can
 *   pause its own player (one audio source at a time);
 * - accept commands from the app (pause page media, toggle quick-add, mark
 *   videos already in the playlist).
 */

export type PageMeta = {
  videoId: string;
  title?: string;
  author?: string;
  durationSec?: number;
};

export type PageMessage =
  | { type: 'page'; url: string; title?: string; video: PageMeta | null }
  | { type: 'add'; source: 'thumbnail'; video: PageMeta }
  | { type: 'media'; state: 'playing' | 'paused' }
  | { type: 'session'; visitorData: string };

export type PageCommand =
  | { type: 'pauseMedia' }
  | { type: 'setQuickAdd'; enabled: boolean }
  | { type: 'markAdded'; videoIds: string[] }
  | { type: 'requestState' };

export type PageScriptOptions = {
  quickAdd: boolean;
  addedIds: string[];
};

/** Name of the global the script installs; also used to guard re-injection. */
export const PAGE_GLOBAL = '__replayPage';

const SCRIPT = String.raw`
(function () {
  if (window.__replayPage) return;
  var options = __OPTIONS__;
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var HOST_RE = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
  var CHECK = String.fromCharCode(0x2713);
  var added = {};
  (options.addedIds || []).forEach(function (id) { added[id] = true; });
  var quickAdd = !!options.quickAdd;

  // Everything installed on the page is tracked so dispose() can undo it.
  var cleanups = [];
  function listen(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    cleanups.push(function () { target.removeEventListener(type, handler, opts); });
  }
  function observe(target, callback, config) {
    var observer = new MutationObserver(callback);
    observer.observe(target, config);
    cleanups.push(function () { observer.disconnect(); });
  }

  function post(message) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } catch (e) {}
  }

  function videoIdFromUrl(href) {
    try {
      var u = new URL(href, location.href);
      var host = u.hostname.toLowerCase();
      if (host === 'youtu.be' || host === 'www.youtu.be') {
        var first = u.pathname.split('/')[1];
        return ID_RE.test(first) ? first : null;
      }
      if (!HOST_RE.test(host)) return null;
      var v = u.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      var m = /^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})(?:[\/?#]|$)/.exec(u.pathname);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function cleanTitle(text) {
    if (!text) return undefined;
    var t = String(text).replace(/\s*-\s*YouTube(?: Music)?\s*$/i, '').replace(/^\(\d+\)\s*/, '').trim();
    return t && t !== 'YouTube' && t !== 'YouTube Music' ? t : undefined;
  }

  // ---- Current video ----------------------------------------------------------
  var lastState = '';
  var lastVideoId = null;
  var staleTitle = null;
  var initialized = false;

  function currentMeta(videoId) {
    var meta = { videoId: videoId };
    var player = document.getElementById('movie_player');
    try {
      var data = player && typeof player.getVideoData === 'function' ? player.getVideoData() : null;
      if (data && data.video_id === videoId) {
        if (data.title) meta.title = data.title;
        if (data.author) meta.author = data.author;
        var duration = typeof player.getDuration === 'function' ? player.getDuration() : 0;
        if (duration > 0) meta.durationSec = Math.round(duration);
      }
    } catch (e) {}
    if (!meta.title) {
      var fromTitle = cleanTitle(document.title);
      if (fromTitle && fromTitle !== staleTitle) meta.title = fromTitle;
    }
    return meta;
  }

  function emitState(force) {
    var videoId = videoIdFromUrl(location.href);
    if (videoId !== lastVideoId) {
      // After an in-page navigation document.title still shows the previous
      // page for a moment; remember it so it is not attributed to the new
      // video. On the initial load the server-rendered title is correct.
      staleTitle = initialized ? cleanTitle(document.title) || null : null;
      lastVideoId = videoId;
    }
    initialized = true;
    var message = {
      type: 'page',
      url: location.href,
      title: cleanTitle(document.title),
      video: videoId ? currentMeta(videoId) : null
    };
    var serialized = JSON.stringify(message);
    if (force === true || serialized !== lastState) {
      lastState = serialized;
      post(message);
    }
  }

  function emitSoon() { setTimeout(emitState, 0); }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    var wrapped = function () {
      var result = original.apply(this, arguments);
      emitSoon();
      return result;
    };
    history[name] = wrapped;
    cleanups.push(function () { if (history[name] === wrapped) history[name] = original; });
  });
  listen(window, 'popstate', emitSoon);
  listen(window, 'hashchange', emitSoon);
  listen(document, 'yt-navigate-finish', emitSoon);
  listen(document, 'state-navigateend', emitSoon);

  // ---- Quick-add buttons on thumbnails ----------------------------------------
  // Styled through CSSOM (element.style) because YouTube's CSP may block
  // injected <style> elements, while CSSOM changes are always allowed.
  var BUTTON_STYLE = {
    position: 'absolute', top: '6px', right: '6px', zIndex: '20', width: '32px', height: '32px',
    borderRadius: '16px', border: '0', margin: '0', padding: '0', color: '#fff',
    font: '700 20px/32px -apple-system, system-ui, sans-serif', textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,.45)', touchAction: 'manipulation'
  };

  function titleNear(anchor) {
    var label = anchor.getAttribute('aria-label') || anchor.getAttribute('title');
    // Accessibility labels look like "Title - 3 minutes, 20 seconds - Go to channel".
    if (label) return label.replace(/\s+-\s+\d.*$/, '').trim();
    var container = anchor.closest('ytm-media-item, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-shorts-lockup-view-model, ytm-reel-item-renderer, ytd-rich-item-renderer, ytd-video-renderer') || anchor.parentElement;
    var heading = container && container.querySelector('h3, h4, .media-item-headline, #video-title');
    if (heading && heading.textContent) return heading.textContent.trim();
    var img = anchor.querySelector('img[alt]');
    return img && img.alt ? img.alt.trim() : undefined;
  }

  function setButtonState(button, isAdded) {
    button.textContent = isAdded ? CHECK : '+';
    button.style.background = isAdded ? '#ff3b5c' : 'rgba(15,15,15,.78)';
    button.style.display = quickAdd ? 'block' : 'none';
    button.setAttribute('data-added', isAdded ? '1' : '0');
    button.setAttribute('aria-label', isAdded ? 'In your Replay playlist' : 'Add to Replay playlist');
  }

  function decorate() {
    if (!quickAdd || !document.body) return;
    var anchors = document.querySelectorAll('a[href*="/watch?"], a[href*="/shorts/"]');
    for (var i = 0; i < anchors.length; i++) {
      var anchor = anchors[i];
      if (anchor.getAttribute('data-replay') === '1') continue;
      var img = anchor.querySelector('img');
      if (!img) continue;
      var id = videoIdFromUrl(anchor.getAttribute('href'));
      if (!id) continue;
      anchor.setAttribute('data-replay', '1');
      var host = img.parentElement || anchor;
      if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'replay-add';
      for (var key in BUTTON_STYLE) button.style[key] = BUTTON_STYLE[key];
      button.style.webkitTapHighlightColor = 'transparent';
      button.setAttribute('data-replay-id', id);
      setButtonState(button, !!added[id]);
      host.appendChild(button);
    }
  }

  function refreshButtons() {
    var buttons = document.querySelectorAll('.replay-add');
    for (var i = 0; i < buttons.length; i++) {
      setButtonState(buttons[i], !!added[buttons[i].getAttribute('data-replay-id')]);
    }
  }

  function buttonFromEvent(event) {
    var target = event.target;
    return target && target.closest ? target.closest('.replay-add') : null;
  }

  var lastAddAt = 0;
  function onActivate(event) {
    var button = buttonFromEvent(event);
    if (!button) return;
    // Stop the surrounding link from navigating and keep the event away from
    // YouTube's own handlers (window capture runs before any of them).
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    // touchend and the synthetic click that may follow arrive as a pair.
    var now = Date.now();
    if (now - lastAddAt < 400) return;
    lastAddAt = now;
    var id = button.getAttribute('data-replay-id');
    var anchor = button.closest('a');
    added[id] = true;
    setButtonState(button, true);
    post({ type: 'add', source: 'thumbnail', video: { videoId: id, title: anchor ? titleNear(anchor) : undefined } });
  }

  function onPress(event) {
    // Keep YouTube's tap/long-press handlers (previews, menus) off our button.
    if (buttonFromEvent(event)) event.stopPropagation();
  }

  listen(window, 'touchstart', onPress, { capture: true, passive: true });
  listen(window, 'pointerdown', onPress, true);
  listen(window, 'touchend', onActivate, { capture: true, passive: false });
  listen(window, 'click', onActivate, true);

  var decoratePending = false;
  function scheduleDecorate() {
    if (decoratePending) return;
    decoratePending = true;
    setTimeout(function () {
      decoratePending = false;
      decorate();
    }, 250);
  }

  // ---- Session ----------------------------------------------------------------
  // YouTube's anonymous visitor ID, reused by the app's own stream requests.
  var sessionSent = false;
  function emitSession() {
    if (sessionSent) return;
    try {
      var config = window.ytcfg;
      var visitorData = config && typeof config.get === 'function' ? config.get('VISITOR_DATA') : null;
      if (visitorData) {
        sessionSent = true;
        post({ type: 'session', visitorData: String(visitorData) });
      }
    } catch (e) {}
  }

  // ---- Page media -------------------------------------------------------------
  function isMedia(target) {
    return target && target.tagName && /^(VIDEO|AUDIO)$/.test(target.tagName);
  }
  listen(document, 'playing', function (event) {
    if (isMedia(event.target)) post({ type: 'media', state: 'playing' });
  }, true);
  listen(document, 'pause', function (event) {
    if (isMedia(event.target)) post({ type: 'media', state: 'paused' });
  }, true);

  function pauseMedia() {
    var media = document.querySelectorAll('video, audio');
    for (var i = 0; i < media.length; i++) {
      try { media[i].pause(); } catch (e) {}
    }
    var player = document.getElementById('movie_player');
    try { if (player && typeof player.pauseVideo === 'function') player.pauseVideo(); } catch (e) {}
  }

  // ---- Lifecycle --------------------------------------------------------------
  function start() {
    emitState(true);
    emitSession();
    decorate();
    observe(document.documentElement, scheduleDecorate, { childList: true, subtree: true });
    var titleEl = document.querySelector('title');
    if (titleEl) observe(titleEl, function () { emitState(); }, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', start);
  else start();

  // Cheap safety net for navigations that bypass the hooks above and for
  // metadata (duration, player title) that appears after the URL changes.
  var interval = setInterval(function () {
    emitState();
    emitSession();
  }, 1500);
  cleanups.push(function () { clearInterval(interval); });

  window.__replayPage = {
    command: function (command) {
      if (!command) return;
      if (command.type === 'pauseMedia') pauseMedia();
      else if (command.type === 'setQuickAdd') {
        quickAdd = !!command.enabled;
        refreshButtons();
        decorate();
      } else if (command.type === 'markAdded') {
        added = {};
        (command.videoIds || []).forEach(function (id) { added[id] = true; });
        refreshButtons();
      } else if (command.type === 'requestState') emitState(true);
    },
    videoIdFromUrl: videoIdFromUrl,
    dispose: function () {
      cleanups.splice(0).forEach(function (undo) { undo(); });
      var buttons = document.querySelectorAll('.replay-add');
      for (var i = 0; i < buttons.length; i++) buttons[i].remove();
      var marked = document.querySelectorAll('[data-replay]');
      for (var j = 0; j < marked.length; j++) marked[j].removeAttribute('data-replay');
      delete window.__replayPage;
    }
  };
})();
true;
`;

export function buildPageScript(options: PageScriptOptions): string {
  return SCRIPT.replace('__OPTIONS__', JSON.stringify(options));
}

/** JavaScript that forwards a command to the injected page script. */
export function pageCommandScript(command: PageCommand): string {
  return `window.${PAGE_GLOBAL} && window.${PAGE_GLOBAL}.command(${JSON.stringify(command)}); true;`;
}

export function parsePageMessage(raw: string): PageMessage | null {
  try {
    const message = JSON.parse(raw) as PageMessage;
    if (!message || typeof message !== 'object') return null;
    switch (message.type) {
      case 'page':
        return typeof message.url === 'string' ? message : null;
      case 'add':
        return message.video && typeof message.video.videoId === 'string' ? message : null;
      case 'media':
        return message.state === 'playing' || message.state === 'paused' ? message : null;
      case 'session':
        return typeof message.visitorData === 'string' ? message : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
