import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Patch generated code only. Never put credentials into Gradle source or the
// exported Expo config; Gradle reads them from the signing step's environment.
for (const key of ['BLOXPLOX_KEYSTORE', 'BLOXPLOX_STORE_PASSWORD', 'BLOXPLOX_KEY_ALIAS', 'BLOXPLOX_KEY_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
if (!existsSync(process.env.BLOXPLOX_KEYSTORE)) throw new Error('Signing keystore is missing');
const path = 'apps/mobile/android/app/build.gradle';
let gradle = readFileSync(path, 'utf8');
if (!gradle.includes('signingConfigs {') || !gradle.includes('signingConfig signingConfigs.debug')) throw new Error('Android signing template changed; review before releasing.');
gradle = gradle.replace('signingConfigs {', `signingConfigs {
        release {
            storeFile file(System.getenv("BLOXPLOX_KEYSTORE"))
            storePassword System.getenv("BLOXPLOX_STORE_PASSWORD")
            keyAlias System.getenv("BLOXPLOX_KEY_ALIAS")
            keyPassword System.getenv("BLOXPLOX_KEY_PASSWORD")
        }`);
// Keep debug's normal key. Only the release build uses the private signing key.
const release = gradle.indexOf('release {', gradle.indexOf('buildTypes {'));
if (release < 0) throw new Error('Android release build type is missing');
gradle = gradle.slice(0, release) + gradle.slice(release).replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
writeFileSync(path, gradle);
