const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Shared workspace components must use the native app's React/renderer pair.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Cognito's legacy native RNG expects the old RN bridge and falls back to
  // Math.random in new-architecture development builds. Use Expo's native CSPRNG.
  if (moduleName === './getRandomValues' && context.originModulePath.includes('amazon-cognito-identity-js')) return { type: 'sourceFile', filePath: path.resolve(__dirname, 'src/secure-random.ts') };
  if (moduleName === 'react' || moduleName.startsWith('react/') || moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    return context.resolveRequest(context, require.resolve(moduleName, { paths: [__dirname] }), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
