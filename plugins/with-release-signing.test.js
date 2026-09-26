const { addReleaseSigning } = require('./with-release-signing');

// The relevant part of the Expo SDK 57 template's android/app/build.gradle.
const TEMPLATE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('addReleaseSigning', () => {
  const out = addReleaseSigning(TEMPLATE);

  it('adds an env-driven release signing config', () => {
    expect(out).toContain("def keystore = System.getenv('REPLAY_KEYSTORE_FILE')");
    expect(out).toContain("keyAlias System.getenv('REPLAY_KEY_ALIAS')");
  });

  it('uses it for release builds only, falling back to the debug key', () => {
    const debugType = out.slice(out.indexOf('buildTypes {'), out.indexOf('release {', out.indexOf('buildTypes {')));
    expect(debugType).toContain('signingConfig signingConfigs.debug');
    expect(out).toContain(
      "signingConfig System.getenv('REPLAY_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
  });

  it('is idempotent', () => {
    expect(addReleaseSigning(out)).toBe(out);
  });

  it('fails loudly if the template changes shape', () => {
    expect(() => addReleaseSigning('android { buildTypes { release { } } }')).toThrow(/signingConfigs/);
    expect(() => addReleaseSigning('android { signingConfigs { } }')).toThrow(/release build type/);
  });
});
