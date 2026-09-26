/**
 * Brave-style stream capture, injected into a hidden WebView that loads
 * `m.youtube.com/watch?v=<id>` before any of YouTube's scripts run.
 *
 * With MediaSource removed, YouTube's own player falls back to a plain
 * network URL (HLS on iOS WebKit, progressive MP4 on Android) after doing
 * all of its signature/token work. We capture that URL and hand it to the
 * native player. Plain ES2017: this runs inside the WebView.
 */

export type CaptureMessage =
  | {
      type: 'captured';
      videoId: string;
      url: string;
      kind: 'hls' | 'progressive';
      userAgent: string;
      meta: { title?: string; author?: string; durationSec?: number; isLive?: boolean } | null;
    }
  | { type: 'capture-error'; videoId: string; code: 'unplayable' | 'consent'; reason: string };

const SCRIPT = String.raw`
(function () {
  if (window.__replayCapture) return;
  window.__replayCapture = true;
  var expected = __VIDEO_ID__;
  var done = false;

  function post(message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  }

  // 1. Remove Media Source Extensions so the player uses a fetchable URL.
  ['MediaSource', 'ManagedMediaSource', 'WebKitMediaSource'].forEach(function (name) {
    try { delete window[name]; } catch (e) {}
    if (window[name]) {
      try { Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true }); } catch (e) {}
    }
  });

  function playerResponse() {
    return window.ytInitialPlayerResponse || (window.ytplayer && window.ytplayer.bootstrapPlayerResponse) || null;
  }

  function readMeta() {
    var response = playerResponse();
    var details = response && response.videoDetails;
    if (!details || details.videoId !== expected) return null;
    return {
      title: details.title || undefined,
      author: details.author || undefined,
      durationSec: Number(details.lengthSeconds) || undefined,
      isLive: details.isLive === true
    };
  }

  function adShowing() {
    var player = document.querySelector('#movie_player, .html5-video-player');
    return !!(player && player.classList && player.classList.contains('ad-showing'));
  }

  function silence(media) {
    try { media.muted = true; media.volume = 0; } catch (e) {}
  }

  // 2. Capture the first real https media URL YouTube assigns.
  function consider(url, media) {
    if (done || !url || typeof url !== 'string') return;
    if (/^(blob|data|about):/i.test(url)) return;
    var absolute;
    try { absolute = new URL(url, location.href).href; } catch (e) { return; }
    if (absolute.indexOf('https://') !== 0) return;
    if (adShowing()) return; // wait for the actual video after a pre-roll
    done = true;
    var kind = /hls_variant|hls_playlist|\/manifest\/hls|\.m3u8(\?|$)/i.test(absolute) ? 'hls' : 'progressive';
    post({ type: 'captured', videoId: expected, url: absolute, kind: kind, userAgent: navigator.userAgent, meta: readMeta() });
    if (media) {
      silence(media);
      try { media.pause(); } catch (e) {}
    }
  }

  var mediaSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (mediaSrc && mediaSrc.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      enumerable: mediaSrc.enumerable,
      get: mediaSrc.get,
      set: function (value) {
        silence(this);
        consider(value, this);
        return mediaSrc.set.call(this, value);
      }
    });
  }
  var sourceSrc = window.HTMLSourceElement && Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
  if (sourceSrc && sourceSrc.set) {
    Object.defineProperty(HTMLSourceElement.prototype, 'src', {
      configurable: true,
      enumerable: sourceSrc.enumerable,
      get: sourceSrc.get,
      set: function (value) {
        consider(value, this.parentElement);
        return sourceSrc.set.call(this, value);
      }
    });
  }
  var setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === 'src') {
      if (this instanceof HTMLMediaElement) consider(value, this);
      else if (window.HTMLSourceElement && this instanceof HTMLSourceElement) consider(value, this.parentElement);
    }
    return setAttribute.apply(this, arguments);
  };
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    silence(this);
    consider(this.currentSrc || this.src, this);
    return play.apply(this, arguments);
  };

  // 3. Safety net: poll media elements, fail fast on errors, nudge playback.
  var started = Date.now();
  var timer = setInterval(function () {
    if (done) { clearInterval(timer); return; }
    if (/(^|\.)consent\.(youtube|google)\.com$/.test(location.hostname)) {
      done = true;
      post({ type: 'capture-error', videoId: expected, code: 'consent', reason: 'YouTube is asking for cookie consent.' });
      return;
    }
    var media = document.querySelectorAll('video, audio');
    for (var i = 0; i < media.length; i++) {
      silence(media[i]);
      consider(media[i].currentSrc || media[i].src, media[i]);
    }
    var response = playerResponse();
    var status = response && response.playabilityStatus;
    if (status && status.status && status.status !== 'OK' &&
        (!response.videoDetails || response.videoDetails.videoId === expected)) {
      done = true;
      post({ type: 'capture-error', videoId: expected, code: 'unplayable', reason: status.reason || 'This video is not available.' });
      return;
    }
    // Autoplay can be refused; ask the page's player to start (muted).
    if (Date.now() - started > 2500) {
      var player = document.getElementById('movie_player');
      try {
        if (player && typeof player.mute === 'function') player.mute();
        if (player && typeof player.playVideo === 'function') player.playVideo();
      } catch (e) {}
    }
  }, 400);
})();
true;
`;

export function buildCaptureScript(videoId: string): string {
  return SCRIPT.replace('__VIDEO_ID__', JSON.stringify(videoId));
}

export function parseCaptureMessage(raw: string): CaptureMessage | null {
  try {
    const message = JSON.parse(raw) as CaptureMessage;
    if (!message || typeof message.videoId !== 'string') return null;
    if (message.type === 'captured' && typeof message.url === 'string' && /^https:\/\//.test(message.url)) {
      return message;
    }
    if (message.type === 'capture-error' && typeof message.reason === 'string') return message;
    return null;
  } catch {
    return null;
  }
}
