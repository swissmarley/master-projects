// @ts-check
const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs Android release builds with your own keystore when these environment
 * variables are set at build time (CI reads them from GitHub secrets):
 *
 *   REPLAY_KEYSTORE_FILE      path to the .jks/.keystore file
 *   REPLAY_KEYSTORE_PASSWORD
 *   REPLAY_KEY_ALIAS
 *   REPLAY_KEY_PASSWORD
 *
 * Without them, release builds keep the Expo template's behaviour (signed
 * with the public React Native debug key), so every build still works.
 */
const MARKER = 'REPLAY_KEYSTORE_FILE';
const DEBUG_SIGNING = 'signingConfig signingConfigs.debug';

/** @param {string} src contents of android/app/build.gradle */
function addReleaseSigning(src) {
  if (src.includes(MARKER)) return src;

  const signingConfigs = /signingConfigs\s*\{/;
  if (!signingConfigs.test(src)) {
    throw new Error('with-release-signing: no signingConfigs block in app/build.gradle');
  }
  let out = src.replace(
    signingConfigs,
    (match) => `${match}
        release {
            def keystore = System.getenv('${MARKER}')
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv('REPLAY_KEYSTORE_PASSWORD')
                keyAlias System.getenv('REPLAY_KEY_ALIAS')
                keyPassword System.getenv('REPLAY_KEY_PASSWORD')
            }
        }`,
  );

  // Inside `buildTypes { ... release { ... } }`, swap the debug signing line.
  const buildTypes = out.indexOf('buildTypes {');
  const releaseType = buildTypes === -1 ? -1 : out.indexOf('release {', buildTypes);
  const debugLine = releaseType === -1 ? -1 : out.indexOf(DEBUG_SIGNING, releaseType);
  if (debugLine === -1) {
    throw new Error('with-release-signing: release build type signing line not found in app/build.gradle');
  }
  out =
    out.slice(0, debugLine) +
    `signingConfig System.getenv('${MARKER}') ? signingConfigs.release : signingConfigs.debug` +
    out.slice(debugLine + DEBUG_SIGNING.length);
  return out;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-release-signing: expected a Groovy app/build.gradle');
    }
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents);
    return mod;
  });

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
