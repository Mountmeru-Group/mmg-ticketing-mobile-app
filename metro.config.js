// NativeWind v4 setup: compile global.css through Tailwind at bundle time.
// The `@/*` path alias is read from tsconfig.json by Expo's Metro resolver.
// inlineRem 16: 1rem = 16 dp, as on the web (NativeWind's default is 14), so `text-sm` is 14 dp and `p-4` is 16 dp
// in both apps (docs/brand/UI-STANDARDS.md, S0).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Inline requires (Phase P2, docs/PERFORMANCE.md §5.1 and §9): a module runs on first use instead of all ~2,200 at
// launch, as in React Native's own template. Expo's defaults (`experimentalImportSupport: true, inlineRequires: false`)
// are kept except that one flag. NativeWind wraps this function and returns what it returns.
const expoGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = await expoGetTransformOptions(...args);
  return { ...options, transform: { ...options.transform, inlineRequires: true } };
};

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
