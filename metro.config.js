// NativeWind v4 setup: compile global.css through Tailwind at bundle time.
// The `@/*` path alias is read from tsconfig.json by Expo's Metro resolver.
// inlineRem 16: 1rem = 16 dp, as on the web (NativeWind's default is 14), so `text-sm` is 14 dp and `p-4` is 16 dp
// in both apps (docs/brand/UI-STANDARDS.md, S0).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
