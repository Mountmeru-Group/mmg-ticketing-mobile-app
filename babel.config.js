// NativeWind v4 setup (nativewind.dev → Installation → Expo).
// babel-preset-expo adds the react-native-worklets plugin for Reanimated 4 automatically.
//
// babel-preset-expo ships inside the `expo` package and npm does not hoist it here, so it is resolved through
// expo rather than by bare name. (Alternative: `npx expo install babel-preset-expo -- --save-dev`, which adds a
// direct devDependency — not done, Phase 1 adds no packages beyond the approved list.)
const path = require('path');

const babelPresetExpo = require.resolve('babel-preset-expo', {
  paths: [path.dirname(require.resolve('expo/package.json'))],
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [[babelPresetExpo, { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
