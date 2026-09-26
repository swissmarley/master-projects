# Replay

**Replay** is a phone app that does what **Brave's Playlist mode** does for YouTube:

1. **Browse YouTube** inside the app.
2. Tap **Add** on a video (or the **+** on any thumbnail) to save it to a playlist.
3. Open **Playlists** and press play. It keeps playing when you **switch apps,
   close the app to the background, or lock the phone**, with controls on the
   lock screen and in the notification shade.

Listen to audio only (the default, which saves data and battery) or switch to
**video**, with picture-in-picture when you leave the app.

> Built with Expo SDK 57 / React Native 0.86 for **iOS and Android**. How it was
> designed: [docs/01-brainstorm.md](docs/01-brainstorm.md) (research and
> options) and [docs/02-plan.md](docs/02-plan.md) (architecture and milestones).

---

## Features

| | |
|---|---|
| **In-app YouTube** | `m.youtube.com` with back/forward/reload/home and search. Autoplay is blocked while browsing, so your music is never interrupted. |
| **Add to playlist** | A floating **Add** button for the video on screen (long-press to pick a playlist) and **+** buttons on thumbnails in search results and feeds. Videos already added show ✓. |
| **Other ways in** | Paste a copied link (Playlists tab 📋), open YouTube links *with Replay* on Android, or deep-link `replay://add?v=<id>` / `replay://add?url=<link>` (e.g. from an iOS Shortcut). |
| **Playlists** | A default playlist plus your own: rename, delete, reorder, copy between playlists, play or shuffle. |
| **Playlist mode** | Mini player above the tabs and a full-screen player with seek, previous/next, shuffle, repeat (all/one), audio ⇄ video, sleep timer, share and "open in browser". |
| **Background and lock screen** | Keeps playing when hidden or locked. Title, channel, artwork, play/pause and seek on the lock screen and notification. Advances to the next video automatically. |
| **Resilient streams** | Three independent ways to get a stream (see below), with an expiry-aware cache, prefetching of the next track, and automatic recovery when a stream URL expires. |
| **Resume** | Remembers what was playing, and where, across app restarts. |

## How it works (short version)

```
 Browse tab (WebView: m.youtube.com) ──add──▶ Library (SQLite)
                                                   │ play
                                                   ▼
          PlayerController ──resolve──▶ ① on-device YouTube API  (visionos client)
               │                        ② your Piped / Invidious server (optional)
               │                        ③ Brave-style page capture (hidden WebView)
               ▼
      expo-video native player  ──▶  AVPlayer + Now Playing (iOS)
      (background + lock screen)      Media3 + MediaSession service (Android)
```

The key idea comes straight from Brave: **don't keep the web page playing**
(YouTube pauses hidden pages). Get a real stream URL and hand it to the phone's
**native media player**, which the OS allows to run in the background. The
[brainstorm](docs/01-brainstorm.md) explains the options and the evidence behind
each choice.

---

## Run it on your phone

Background playback needs native configuration, so Replay runs as a
**development build** or a regular installed build. It does **not** run in
Expo Go.

### Prerequisites

- Node.js 20.19.4+, 22.13+ or 24.3+ (what React Native 0.86 supports) and npm
- *Either* an [Expo account](https://expo.dev/signup) (free) to build in the
  cloud with EAS, *or* Android Studio (Android) / Xcode on a Mac (iOS) to build
  locally.

```bash
cd replay-app
npm install
```

### Option A: install an APK on Android (quickest)

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

When it finishes, open the link on your phone and install the APK. That's the
full app, and no computer is needed afterwards.

### Option B: development build (for hacking on the code)

```bash
# Android: cloud build of the dev client, or build locally with Android Studio
npx eas-cli@latest build --platform android --profile development
npx expo run:android            # local alternative

# iOS: needs an Apple Developer account for devices (EAS registers your device)
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
npx expo run:ios --device       # local alternative on a Mac with Xcode

# then start the JS server and open the dev build on the phone
npx expo start
```

### Using it

1. **Browse**: search YouTube, open a video, tap **Add** (or **+** on
   thumbnails). Long-press **Add** to choose or create a playlist.
2. **Playlists**: open a playlist and tap a video (or **Play** / **Shuffle**).
3. Lock the phone or switch apps. The music keeps playing, with controls on
   the lock screen.
4. Tap the mini player for the full player: switch **Audio / Video**, set a
   **sleep timer**, and more.
5. Europe/UK: if videos won't load, open the **Browse** tab once and accept
   YouTube's cookie dialog (the stream capture shares the browser's cookies).

---

## Stream sources and troubleshooting

Replay tries these in order (configurable in **Settings → Stream sources**):

1. **On-device**: asks YouTube's player API from your phone as the `visionos`
   client, which currently needs neither a "PO token" nor YouTube's JavaScript
   (per yt-dlp, Sept 2026). It is fast and works in the background. Before using
   a URL, Replay probes it with a 1-byte request, so if YouTube starts rejecting
   it, the next source takes over automatically.
2. **Server fallback** *(optional)*: your own [Piped](https://github.com/TeamPiped/Piped)
   or [Invidious](https://invidious.io) instance. It is the most robust option
   when YouTube changes things, because those projects update quickly.
3. **YouTube page capture**: Brave's technique. A hidden WebView opens the
   video with `MediaSource` disabled, YouTube's own player picks a plain stream
   (HLS on iOS, MP4 on Android), and Replay captures its URL. Slower (a few
   seconds), and it only runs while the app is open, so Replay prefetches the
   next track in advance.

| Symptom | Fix |
|---|---|
| "Sign in to confirm your age" | Age-restricted videos need a signed-in session, which Replay doesn't do. |
| Every video fails suddenly | YouTube changed something. Enable the server fallback, or update the client profile in `src/features/youtube/innertube.ts` (compare with yt-dlp's `INNERTUBE_CLIENTS`). |
| "Cookie dialog" message | Open the Browse tab and accept YouTube's consent dialog once. |
| Video mode shows only artwork | That stream has no picture (audio-only source). Switch sources or use audio mode. |

---

## Development

```bash
npm test            # unit + integration tests (Jest; jsdom for the injected scripts)
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint-config-expo, React Compiler rules
npm run check       # all of the above
npx expo export     # bundle both platforms with Metro/Hermes
```

### Project structure

```
src/
├── app/                       Expo Router routes (thin screens)
│   ├── _layout.tsx            root stack, capture host, toasts
│   ├── (tabs)/                Browse · Playlists · Settings (+ mini player)
│   ├── playlist/[id].tsx      playlist detail
│   ├── player.tsx             full-screen player (modal)
│   ├── add.tsx                /add?v=… deep link
│   └── +native-intent.tsx     "Open with Replay" YouTube links → /add
├── features/
│   ├── browser/               WebView browser + injected page script
│   ├── library/               playlists & tracks (zustand + SQLite)
│   ├── player/                queue, PlayerController, expo-video engine, UI
│   ├── resolver/              stream resolver chain, cache, capture, Piped/Invidious
│   ├── settings/              settings store
│   └── youtube/               URL parsing, Innertube client, formats, oEmbed
├── components/                shared UI primitives
├── theme/                     colours and spacing
└── lib/                       storage and formatting helpers
```

Design rule: everything that decides *what* plays (queue, resolvers, format
choice, retries) is plain TypeScript and unit-tested with fakes. Native pieces
are first-party Expo modules behind small adapters.

### What's verified, and what needs a phone

Verified in CI-like conditions (this repo's container):

- Tests: queue, library, resolvers (with realistic YouTube response fixtures),
  controller (auto-advance, retries, mode switching…), the injected browser and
  capture scripts (run in jsdom), and full-app rendering through Expo Router.
- Strict typecheck, lint, Metro/Hermes bundles for iOS and Android.
- `expo prebuild` output: iOS `UIBackgroundModes: audio`, Android
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + Media3 session service, PiP, intent filters.

Needs a real device (the container can't reach YouTube or compile native code):

- [ ] Browse, add from the page and from thumbnails, links and ✓ states
- [ ] Audio playback starts; lock the phone: keeps playing, lock-screen controls work
- [ ] Track ends while locked: next one starts
- [ ] Video mode, fullscreen, picture-in-picture
- [ ] Leave it paused for 6+ hours, press play: the expired URL is recovered
- [ ] Turn off "On-device" in Settings: page capture still plays
- [ ] Android: "Open with Replay" on a YouTube link adds it

## Limitations and roadmap

- **Lock-screen next/previous**: Expo's media modules only expose play/pause,
  seek and ±10 s there. Tracks still auto-advance. Planned: a small native module
  ([plan §10](docs/02-plan.md#10-roadmap)).
- **Video quality**: progressive streams are 360p; higher quality uses HLS where
  YouTube provides it. Planned: HD on Android via a generated DASH manifest.
- **No sign-in**, so no age-restricted or members-only videos.
- Not yet: offline downloads, importing whole YouTube playlists, share-sheet
  target on iOS.

## Legal

Replay plays YouTube videos outside YouTube's official player, including in the
background. This may conflict with YouTube's Terms of Service. The project is
for **personal and educational use**. It doesn't block ads, bypass DRM, or
download anything you can't already stream.
