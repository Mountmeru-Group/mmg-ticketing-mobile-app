// NativeWind's own runtime, run on one element in Node: the props a native component receives once NativeWind has
// processed them. Every JSX element in the app goes through it (babel.config.js, `jsxImportSource: 'nativewind'`):
// react-native-css-interop wraps Pressable, View, Text … as cssInterop(Component, { className: 'style' })
// (node_modules/react-native-css-interop/dist/runtime/components.js), then renders the native component with the props
// it computed (dist/runtime/native/render-component.js).
//
// How it runs without a phone. Nothing in NativeWind is faked:
// - `react-native` resolves to ./stubs/react-native.cjs, in this test process only (a module hook, as loader.mjs is).
// - interop() is the body of a React function component: it calls useContext, useState, useReducer, useMemo and
//   useEffect. The repo has no React renderer, so a minimal dispatcher answers those five hooks for ONE render, the
//   first: the render that puts a component on screen.
// The element interop() returns is what React would mount; its `props` are what the native view gets.
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STUB = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stubs', 'react-native.cjs')).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'react-native' ? { url: STUB, format: 'commonjs', shortCircuit: true } : next(specifier, context);
  },
});

const require = createRequire(import.meta.url);
const React = require('react');
const rn = require('react-native');
const { interop } = require('react-native-css-interop/dist/runtime/native/native-interop.js');
const { getNormalizeConfig } = require('react-native-css-interop/dist/runtime/config.js');

/** components.js registers Pressable, View and Text with exactly this mapping. */
const CLASS_NAME_TO_STYLE = getNormalizeConfig({ className: 'style' });

const firstRender = {
  useContext: (context) => context._currentValue,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useReducer: (reducer, arg, init) => [init ? init(arg) : arg, () => {}],
  useMemo: (create) => create(),
  useEffect: () => {},
};

/** The props the native `Pressable`, `View` or `Text` receives on its first render, after NativeWind. */
export function throughNativeWind(component, props) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = firstRender;
  try {
    return interop(rn[component], CLASS_NAME_TO_STYLE, props, null).props;
  } finally {
    internals.H = previous;
  }
}
