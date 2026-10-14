// NativeWind v4 setup: compile global.css through Tailwind at bundle time.
// The `@/*` path alias is read from tsconfig.json by Expo's Metro resolver.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
