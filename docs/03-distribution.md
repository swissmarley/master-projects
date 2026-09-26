# Replay — Getting it onto phones

| | Android | iOS |
|---|---|---|
| **File** | `Replay.apk` (signed, installable) | `Replay-unsigned.ipa` (needs signing on install) |
| **Latest build** | [Replay.apk](https://github.com/swissmarley/replay-app/releases/download/replay-android-latest/Replay.apk) | [Replay-unsigned.ipa](https://github.com/swissmarley/replay-app/releases/download/replay-ios-latest/Replay-unsigned.ipa) |
| **In the repo** | [`releases/Replay.apk`](../releases/Replay.apk) | — |
| **Built by** | [`.github/workflows/replay-app-android.yml`](../.github/workflows/replay-app-android.yml) | [`.github/workflows/replay-app-ios.yml`](../.github/workflows/replay-app-ios.yml) |

Both workflows run on GitHub's servers (free for this public repo) whenever
the app changes, and replace the "latest build" releases
when the build succeeds (the Android workflow runs the full test suite first).
The APK in the repo is refreshed whenever the app version in `app.json`
changes, or when you run the Android workflow by hand with **Commit the APK**
ticked. The release link always has the newest build.

If a **Publish GitHub Release** step fails with HTTP 403 ("Resource not
accessible by integration"), a newer commit changed a workflow file while that
run was building. GitHub doesn't let the workflow token tag a commit whose
workflow files differ from the default branch. The run for the newer commit
publishes instead, or you can re-run the workflow from the Actions tab.

---

## Android

### Install

1. On the phone, open the **Replay.apk** link above (or open the file in the
   repo and tap **Download raw file**).
2. When Android asks, allow your browser to **install unknown apps**
   (*Settings → Apps → Special app access → Install unknown apps*).
3. Open the downloaded file and tap **Install**. If Play Protect warns about
   an unknown developer, choose **More details → Install anyway**.

Requirements: Android 7.0 or newer on an ARM phone (arm64-v8a or
armeabi-v7a, which covers practically every phone; x86 emulators aren't
included).

**Updating:** install a newer `Replay.apk` over the old one. Your playlists
stay. Each CI build gets a higher build number (the workflow run number), so
Android treats it as an update. Android only accepts the update if it's signed
with the same key (see below).

### Signing (read before sharing the app widely)

Until you add your own key, the builds are signed with the **public React
Native debug key** (the Expo template default). That works fine, but anyone
can sign an APK with that key, so a malicious "update" signed with it would
be accepted over Replay if someone installed it. To sign with your own key:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore replay-release.keystore \
  -alias replay -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 replay-release.keystore > replay-release.keystore.b64   # macOS: base64 -i … -o …
```

Add four repository secrets (*GitHub → Settings → Secrets and variables →
Actions*):

| Secret | Value |
|---|---|
| `REPLAY_KEYSTORE_BASE64` | contents of `replay-release.keystore.b64` |
| `REPLAY_KEYSTORE_PASSWORD` | the keystore password |
| `REPLAY_KEY_ALIAS` | `replay` (or what you chose) |
| `REPLAY_KEY_PASSWORD` | the key password |

The next build is signed with your key (`plugins/with-release-signing.js`
wires this up). Because the key changes once, **uninstall the old Replay first**
(this clears its playlists). Keep the keystore safe: without it, future
updates can't be installed over existing installs.

### Build it yourself (optional)

- **GitHub:** *Actions → "Replay · Android APK" → Run workflow*.
- **Cloud (EAS):** `npx eas-cli@latest build -p android --profile preview` gives an APK link.
- **Locally:** with Android SDK 36, NDK 27.1.12297006 and JDK 17 installed:
  ```bash
  npm ci
  npx expo prebuild -p android
  cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
  # → android/app/build/outputs/apk/release/app-release.apk
  ```

---

## iOS

Apple only lets iPhones run apps signed for them, so there is no equivalent
of "download the APK and tap install". The realistic options:

| Route | Cost | Computer needed? | How long the install lasts | Notes |
|---|---|---|---|---|
| **SideStore / AltStore + unsigned IPA** | free Apple ID | once, for setup | 7 days; refreshes over Wi-Fi | Recommended free route. Max 3 sideloaded apps with a free ID |
| **Sideloadly + unsigned IPA** | free Apple ID | every 7 days | 7 days | Simple drag-and-drop from Mac/PC |
| **Xcode on a Mac** | free (or paid) | yes | 7 days free / 1 year paid | `npx expo run:ios --device --configuration Release` |
| **Apple Developer Program + EAS ad hoc** | $99/year | no (cloud build) | 1 year | Install from a link on registered iPhones (up to 100 per device type) |
| **TestFlight, internal testers** | $99/year | no | 90 days per build | Up to 100 people on your App Store Connect team; no review |
| App Store / public TestFlight | $99/year | — | — | **Would almost certainly be rejected**: App Review guideline 5.2.3 and YouTube's terms prohibit background/third-party playback of YouTube content |

Requirements: iOS 16.4 or newer, on an iPhone or iPad.

Sideloaded builds behave like any other build: background audio, lock-screen
controls and picture-in-picture only need the `audio` background mode in
`Info.plist`, which the IPA already contains. No special Apple entitlement is
required.

### Free route: SideStore or AltStore (recommended)

1. Install **[SideStore](https://sidestore.io)** (refreshes apps on its own
   after a one-time setup with a computer) or **[AltStore](https://altstore.io)**
   (needs AltServer running on a Mac/PC on the same Wi-Fi to refresh).
2. On the iPhone, download
   [`Replay-unsigned.ipa`](https://github.com/swissmarley/replay-app/releases/download/replay-ios-latest/Replay-unsigned.ipa).
3. Open it with SideStore/AltStore (*Share → SideStore*, or **+** inside the
   app). It signs the app with your Apple ID and installs it.
4. On iOS 16+, enable **Developer Mode** when asked
   (*Settings → Privacy & Security → Developer Mode*, then restart).
5. The app must be refreshed every 7 days; SideStore/AltStore do this
   automatically.

**Sideloadly** alternative: install [Sideloadly](https://sideloadly.io) on a
Mac/PC, connect the iPhone, drag in the IPA, and enter your Apple ID. Then
trust the profile under *Settings → General → VPN & Device Management*.
Repeat every 7 days.

**"No provisioning profile embedded"?** That message comes from link-based
installers (such as "IPA Installer" or Diawi). They only install IPAs that are
*already* signed for your device, and this one is unsigned on purpose. Use
SideStore, AltStore or Sideloadly instead; they sign it with your Apple ID
while installing. For a link install, sign it first with a paid developer
account (see the EAS ad hoc route below).

### Paid route: Apple Developer Program + EAS (no Mac needed)

```bash
npx eas-cli@latest login
npx eas-cli@latest device:create                      # register your iPhone(s) via a link
npx eas-cli@latest build -p ios --profile preview     # ad hoc build → install link / QR code
```

For more people, use **TestFlight internal testing**:
`npx eas-cli@latest build -p ios --profile production && npx eas-cli@latest submit -p ios`.
Then add testers in App Store Connect. Internal testing needs no App Review.

### What about the App Store?

Not realistic for this app. Apple's guideline 5.2.3 disallows apps that play or
save media from third-party services like YouTube without authorization, and
YouTube's terms forbid background playback outside its own apps. That's also
why Brave's Playlist lives inside a general-purpose browser. For personal use,
sideloading (free) or ad hoc / TestFlight-internal (paid) are the ways to go.
