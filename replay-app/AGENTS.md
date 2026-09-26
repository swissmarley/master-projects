# Replay: notes for coding agents

Replay replicates Brave's Playlist mode for YouTube: an in-app YouTube browser
to add videos, and a native player that keeps playing in the background and
on the lock screen. Read `docs/01-brainstorm.md` (why) and `docs/02-plan.md`
(architecture) before larger changes.

## Architecture in one minute

- `src/features/player/controller.ts` is the only writer of player state
  (`player/store.ts`). It orchestrates the queue (`queue.ts`), stream resolution
  and the `MediaEngine` (`expo-video-engine.ts` wraps one long-lived
  `expo-video` player with `staysActiveInBackground` + `showNowPlayingNotification`).
- Streams come from `src/features/resolver/`: a `ResolverChain` over
  Innertube (on-device, `visionos` client), an optional Piped/Invidious
  server, and Brave-style WebView capture (`capture-script.ts` + `CaptureHost.tsx`).
- The browser (`src/features/browser/`) injects `page-script.ts` into
  m.youtube.com; messages are validated by `parsePageMessage`.
- Library and settings are zustand stores persisted to `expo-sqlite/kv-store`
  (sync reads). Pure factories live in `store.ts`; app singletons live in `index.ts`.

## Rules

- Keep decision logic in pure TypeScript with unit tests (fakes, not mocks of
  internals). Native modules stay behind small adapters.
- Injected WebView scripts are plain ES2017 strings, ASCII-only (use
  `String.fromCharCode` for symbols), styled via CSSOM (YouTube's CSP), and
  tested under jsdom by running the real script source.
- When YouTube breaks on-device resolution, update `INNERTUBE_PROFILES` in
  `src/features/youtube/innertube.ts` against yt-dlp's `INNERTUBE_CLIENTS`
  and its PO Token Guide.
- Don't add custom native code casually: it can't be compiled in CI here.
  Prefer first-party Expo modules and verify with `npx expo prebuild` into a
  temp copy.
- Testing Library 14: `render`, `fireEvent` and `act` are async; `renderRouter`
  must be awaited.

## Commands

```bash
npm run check      # typecheck + lint + tests (run before declaring done)
npx expo export    # proves the app bundles for iOS and Android
```

---

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Expo commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules from the template

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
