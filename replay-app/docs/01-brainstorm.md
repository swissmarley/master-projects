# Replay — Brainstorm

> Goal: a phone app that works like **Brave's Playlist mode**. You browse YouTube,
> tap **Add to playlist**, then switch to **Playlist mode** and listen to the
> songs (or watch the videos) while the app is hidden, closed to the
> background, or the phone is locked.

Research date: 2026-09-26. Facts below are from primary sources (Brave's and
yt-dlp's source code and docs, and the type definitions and native code of the
libraries considered) rather than memory. Sources are listed at the end.

---

## 1. What the user actually needs

| # | Need | What it implies technically |
|---|------|------------------------------|
| 1 | "Go to YouTube" | A real browser surface (a WebView on `m.youtube.com`), not a search API clone |
| 2 | "Add the videos to the playlist" | Detect the video on screen, including YouTube's in-page navigation; one-tap add; persistent playlists |
| 3 | "Switch to playlist mode" | A separate player UI (queue, next/previous, shuffle, repeat) |
| 4 | "Listen to the songs or watch video" | An audio-only mode (small, good in the background) and a video mode |
| 5 | "…closing/hiding the app … and when locking the phone" | **Native** background media playback plus lock-screen and notification controls. This is the hard part. |

## 2. How Brave Playlist really works (from Brave's source)

- **Detection.** Brave injects a script that finds `<video>`/`<audio>` elements
  and reads their `src`. For YouTube it has a site-specific script
  (`youtube.com.js`) that reads title, author, duration and thumbnail from
  `window.ytplayer.bootstrapPlayerResponse.videoDetails`.
- **The key trick: kill MediaSource.** YouTube normally streams through Media
  Source Extensions, so `video.src` is an unusable `blob:` URL. Brave's
  `media_source_api_suppressor.js` / iOS "compatibility mode" script simply runs
  `delete window.MediaSource; delete window.ManagedMediaSource`. YouTube's own
  player then falls back to a plain, network-fetchable HTTPS URL (HLS on iOS
  WebKit, a progressive MP4 elsewhere). Brave captures that URL.
- **Playback** happens in a **native player** (AVPlayer on iOS, Media3/ExoPlayer
  on Android), not in the web page. That is why it survives backgrounding and
  locking: native players plus the OS media-session integration are what the OS
  allows to run in the background.
- **Expiry.** Captured URLs expire after a few hours and are tied to the device's
  IP. Brave's 2026 iOS code probes the stored URL; if it is no longer streamable,
  it reloads the page in a (hidden) WebView to capture a fresh one. It can also
  cache items for offline playback.
- **Desktop/Android** do the same capture in a hidden "background web contents".

**Takeaway.** Brave does not decode YouTube itself. It lets YouTube's own web
player do the hard work (signatures, tokens, bot checks), captures the
resulting media URL, and hands it to a native player. Replay copies this idea
as one of its strategies.

## 3. Why "just keep the YouTube page playing" is not enough

YouTube's mobile site pauses playback when the page is hidden (that is its
Premium upsell). The usual hacks (spoofing `document.visibilityState`,
swallowing `visibilitychange`) are fragile:

- **iOS**: WKWebView media runs in a separate WebKit process that iOS may suspend.
  There are no reliable lock-screen next/previous controls, and one ad or UI
  change breaks it.
- **Android**: the WebView pauses with the Activity. You still need a foreground
  service, and there is no proper media session.

So the browser is only for **browsing and adding**. Playback must be native.

## 4. Hard platform constraints

### iOS
- Background playback needs `UIBackgroundModes: audio` and an
  `AVAudioSession` with category `.playback`, both of which the expo-video
  config plugin sets up.
- The app keeps running in the background only **while audio is playing**.
  Gaps between tracks are dangerous: the next stream URL should already be
  resolved before the current track ends, so the switch takes milliseconds.
- A video layer attached in the background pauses video playback. Players
  handle this by detaching the layer (expo-video does).

### Android
- Needs a foreground service of type `mediaPlayback` and a Media3
  `MediaSession` for the notification and lock screen. expo-video ships
  `ExpoVideoPlaybackService` for this, enabled by its config plugin.

### YouTube stream access (the moving target)
From yt-dlp's PO Token Guide (updated 2026-08-26) and its source (2026-09-16):

| Innertube client | PO token needed? | JS player needed? | Notes |
|---|---|---|---|
| `visionos` | **no** | **no** | yt-dlp's current *default* client when no JS runtime is available |
| `android_vr` | yes for HTTPS/DASH, no for HLS | no | removed from yt-dlp defaults in 2026.08 |
| `ios`, `android` | yes (GVS or Player) | no | unusable without an attestation token |
| `web`, `mweb` | yes (GVS) | yes | only SABR formats for `web` |
| `web_safari` | not for **HLS** | yes | HLS formats currently need no token |
| `web_embedded` | no | yes | embeddable videos only |
| `tv` | no | yes | DRM'd without cookies |

- Stream URLs are **IP-bound and expire** (typically about 6 h). They must be
  resolved **on the phone** (or proxied by a server), and re-resolved when stale.
- "Made for kids" videos are unavailable to `visionos`/`android_vr`. The
  WebView-capture fallback covers them.
- **This will change again.** The design must allow client profiles to be
  updated and have more than one way to get a stream.

## 5. App platform options

| Option | Browse YouTube in-app | True background + lock screen | Effort | Verdict |
|---|---|---|---|---|
| **PWA + self-hosted server** (yt-dlp proxy) | ✗ (youtube.com can't be framed; share/paste links only) | ◑ Android good, iOS flaky | Low | Doesn't feel like Brave and needs a server |
| **WebView-only app with visibility hacks** | ✓ | ✗ fragile, no proper controls | Low | Rejected (see §3) |
| **Native Kotlin + Swift** (Media3, AVPlayer, NewPipeExtractor) | ✓ | ✓ best possible | Very high (2 codebases) | Best quality, but twice the work |
| **Flutter** (`flutter_inappwebview`, `just_audio` + `audio_service`, `youtube_explode_dart`) | ✓ | ✓ | Medium | Solid alternative |
| **React Native / Expo** (WebView + expo-video) | ✓ | ✓ | Medium | **Chosen**: one TypeScript codebase for iOS and Android, first-party Expo media modules, cloud builds with EAS |

## 6. Player library options (Expo SDK 57 / React Native 0.86, New Architecture only)

| Library | Background | Lock screen | Next/prev on lock screen | New-arch status | Verdict |
|---|---|---|---|---|---|
| **expo-video 57** | ✓ `staysActiveInBackground` | ✓ `showNowPlayingNotification`, per-source `metadata` (title/artist/artwork), `headers` | ✗ (±10 s skip + scrubbing only) | first-party | **Chosen**: one player for audio *and* video mode |
| expo-audio 57 | ✓ | ✓ `setActiveForLockScreen` | ✗ (its Android session explicitly removes next/prev commands) | first-party | audio only, so no video mode |
| react-native-track-player 4.1.2 | ✓ | ✓ | ✓ | ✗ no codegen; Kotlin build failures reported on RN 0.82+ | Rejected |
| `@rntp/player` 5.9.2 (RNTP v5) | ✓ | ✓ | ✓ | ✓ | **Commercial license**, so not a default dependency |
| react-native-video 6.19 | ✓ | ✓ | ✗ | interop | no advantage over expo-video |

Lock-screen next/previous is the one gap. Options for later: a small Expo
native module registering `MPRemoteCommandCenter.nextTrackCommand` (iOS) plus a
patched media-session layout (Android), or adopting `@rntp/player` under its
license. Until then, tracks **auto-advance in the background**, and next/previous
are in the app, the mini player, and the notification's ±10 s buttons.

## 7. Stream-resolution strategies

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **A. On-device Innertube** | `POST /youtubei/v1/player` with the `visionos` client (no PO token, no JS) | Fast (one request), works in the background, adaptive audio-only streams | Breaks when YouTube changes rules, so client profiles must be updatable |
| **B. WebView capture (Brave's way)** | Hidden WebView loads the watch page with `MediaSource` deleted, captures the `src` YouTube's own player sets | YouTube's player solves tokens and signatures for us; covers kids/edge cases | Slow (2–6 s), needs a foreground WebView, 360p progressive on Android |
| **C. Remote resolver** | User-configured Piped or Invidious instance (self-hosted recommended) returning proxied streams | Independent of on-device breakage | Needs a server; public instances are unreliable |
| D. Bundle youtubei.js | Full JS client in Hermes | Rich | Needs a JS evaluator and polyfills, large bundle; still tokens |
| E. Own yt-dlp server | Server extracts + proxies | Most robust extractor | Infrastructure, bandwidth |

**Decision:** chain **A → B → C** with a cache keyed by video ID (respecting
each URL's `expire`), and prefetch the next track while the current one plays.
When playback fails on a cached URL (403/expired), invalidate it, re-resolve
and resume at the same position.

## 8. UX brainstorm

**Must have (v1)**
- Browse tab: `m.youtube.com` with back/forward/reload/home, a floating
  **Add to playlist** button whenever a video is on screen, and a long-press
  playlist picker.
- **Quick-add "+" buttons on thumbnails** (search results, feeds), so you can
  add without opening each video (✓ turns red when added).
- Paste a link / share a link into the app.
- Playlists: default "My Playlist", create/rename/delete, reorder, remove, play
  all, shuffle.
- Player: mini player above the tabs, full-screen player with video or artwork,
  seek bar, previous/play/next, shuffle, repeat (off/all/one), audio⇄video
  toggle, sleep timer.
- Background + lock screen: title, channel and artwork, play/pause/seek.
- One audio source at a time: playing something in the page pauses Replay
  and vice versa. Autoplay in the browser is blocked, so browsing never
  interrupts your music.

**Nice to have (later)**
- Offline downloads (audio) like Brave's cache.
- Lock-screen next/previous (see §6).
- HD video on Android by synthesising a DASH manifest from adaptive streams.
- Import a whole YouTube playlist (`list=`).
- Sponsor-segment skipping, playback speed, crossfade.
- Remote-updatable Innertube client profiles.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| YouTube changes break on-device extraction | Three independent strategies; client profile isolated in one file; clear error messages |
| URL expiry mid-session | Expiry-aware cache, re-resolve on 403, prefetch |
| iOS suspends the app between tracks | Prefetch next stream; immediate `replaceAsync` on `playToEnd` |
| Browser media hijacks the audio session | Autoplay blocked in WebView; page `playing` pauses Replay deliberately |
| WebView capture unavailable in background | Prefetch while in foreground; A and C don't need a WebView |
| Can't compile native code in this dev container | Only first-party Expo native modules; everything custom is TypeScript and tested |

## 10. Legal note

Playing YouTube content outside YouTube's own player, in the background, or
offline, may violate YouTube's Terms of Service. Brave ships the same feature,
but this project is for **personal and educational use**. It contains no ad
blocking and no DRM circumvention, and it only plays what the user could
already stream in a browser.

## Sources

- Brave: `brave-core/components/playlist` (background web contents,
  `media_source_api_suppressor.js`, `youtube.com.js` from the playlist component),
  `brave-core/ios/browser/playlist` (compatibility-mode script, stream fallback),
  Brave iOS `PlaylistSwizzlerScript.js`.
- yt-dlp wiki *PO Token Guide* (2026-08-26) and `yt_dlp/extractor/youtube/_base.py`,
  `_video.py` (master, 2026-09-16), yt-dlp changelog 2026.08.19.
- `expo-video@57.0.5` / `expo-audio@57.0.5` type definitions and iOS/Android
  sources; `react-native-track-player@4.1.2`, `@rntp/player@5.9.2` (license);
  `react-native-video@6.19.3`.
