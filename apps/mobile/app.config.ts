import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const build = process.env.BLOXPLOX_BUILD_NUMBER;
  if (build && (!/^\d+$/.test(build) || Number(build) < 1 || Number(build) > 2100000000)) throw new Error('Invalid native build number');
  return {
    ...config, name: 'BloxPlox', slug: 'bloxplox',
    ios: { ...config.ios, ...(build ? { buildNumber: build } : {}) },
    android: { ...config.android, ...(build ? { versionCode: Number(build) } : {}) },
  };
};
