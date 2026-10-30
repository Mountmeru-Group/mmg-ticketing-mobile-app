// Login "arc split" and the motion sequence (2026-10-30): docs/brand/UI-STANDARDS.md §10, docs/PERFORMANCE.md §12.
//
// What runs for real: src/config/env.ts (evaluated as each kind of build would), the start-up sequence's decisions
// (src/navigation/splashSequence.ts) and the theme. The two start-up images are decoded and measured.
// What is read as source: the components. There is no React Native renderer in this repo, so the rules every animation
// must keep (native driver; opacity and transforms only; "Remove animations" shows the end state) are checked in the
// code of every file that animates, the way tests/rbac checks gating.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loginLayout, splashArt } from '../../src/theme/brand.ts';
import { colors } from '../../src/theme/colors.ts';
import { motion } from '../../src/theme/motion.ts';
import { loginType } from '../../src/theme/typography.ts';
import { createSplashSequence } from '../../src/navigation/splashSequence.ts';
import { readPng } from '../support/png.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

// ── The environment chip ─────────────────────────────────────

describe('Login environment chip: never on a production build', () => {
  let copy = 0;
  /** A fresh src/config/env.ts, as a build with this __DEV__ and EXPO_PUBLIC_APP_ENV evaluates it. */
  async function loadEnv(dev, appEnv) {
    const saved = { dev: globalThis.__DEV__, appEnv: process.env.EXPO_PUBLIC_APP_ENV };
    globalThis.__DEV__ = dev;
    if (appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = appEnv;
    try {
      return await import(`../../src/config/env.ts?chip=${++copy}`);
    } finally {
      globalThis.__DEV__ = saved.dev;
      if (saved.appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = saved.appEnv;
    }
  }

  test('a release build of the production profile does not show it', async () => {
    const env = await loadEnv(false, 'PROD');
    assert.equal(env.APP_ENV, 'PROD');
    assert.equal(env.SHOW_ENVIRONMENT_CHIP, false);
  });

  test('every other build shows it: preview (UAT), nothing set, and development', async () => {
    for (const [dev, appEnv] of [[false, 'UAT'], [false, undefined], [true, 'UAT'], [true, undefined]]) {
      const env = await loadEnv(dev, appEnv);
      assert.equal(env.SHOW_ENVIRONMENT_CHIP, true, `dev=${dev} env=${appEnv}`);
    }
  });

  test('Login renders the chip, and its label, only inside the SHOW_ENVIRONMENT_CHIP branch', () => {
    const login = read('src/screens/auth/LoginScreen.tsx');
    const open = '{SHOW_ENVIRONMENT_CHIP ? (';
    const start = login.indexOf(open);
    assert.notEqual(start, -1, 'the chip must be gated');
    assert.equal(login.split(open).length - 1, 1);
    const end = login.indexOf(') : null}', start);
    const branch = login.slice(start, end);
    const rest = login.slice(0, start) + login.slice(end);
    assert.match(branch, /\{ENVIRONMENT_LABEL\}/);
    // Outside the branch the label is only imported, never rendered.
    assert.deepEqual(rest.match(/ENVIRONMENT_LABEL/g), ['ENVIRONMENT_LABEL']);
    assert.match(rest, /^import \{ ENVIRONMENT_LABEL, SHOW_ENVIRONMENT_CHIP \} from '@\/config\/env';$/m);
  });
});

// ── The start-up sequence ────────────────────────────────────

/** The sequence with a fake native splash and fake timers; `log` records what happened, in order. */
function harness() {
  const log = [];
  const timers = [];
  const sequence = createSplashSequence({
    hideNativeSplash: () => log.push('hide-native'),
    setTimer: (ms, run) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    paintWait: motion.intro.paintWait,
  });
  sequence.subscribe(() => log.push(sequence.phase()));
  const fireTimers = () => timers.filter((t) => !t.cancelled).forEach((t) => t.run());
  return { sequence, log, timers, fireTimers };
}

describe('start-up sequence (src/navigation/splashSequence.ts)', () => {
  test('plays: the native splash hides only once the intro can draw its first frame, then hands off to a ready screen', () => {
    const { sequence: s, log } = harness();
    s.motionSetting(false);
    assert.deepEqual(log, [], 'motion known, frame not painted: the native splash stays');
    s.introFramePainted();
    assert.deepEqual(log, ['hide-native', 'playing']);
    s.firstScreenReady();
    assert.equal(s.phase(), 'playing', 'the intro is not cut short by the first screen');
    s.timelineEnded();
    s.handOffEnded();
    assert.deepEqual(log, ['hide-native', 'playing', 'leaving', 'gone']);
  });

  test('never reveals an unready app: after the timeline it holds its end state until the first screen is ready', () => {
    const { sequence: s, log } = harness();
    s.introFramePainted();
    s.motionSetting(false);
    s.timelineEnded();
    assert.equal(s.phase(), 'holding');
    s.handOffEnded(); // a stray callback changes nothing
    assert.equal(s.phase(), 'holding');
    s.firstScreenReady();
    s.handOffEnded();
    assert.deepEqual(log, ['hide-native', 'playing', 'holding', 'leaving', 'gone']);
  });

  test('"Remove animations" skips it: no frame of it plays, and the first screen shows straight from the native splash', () => {
    for (const order of ['setting first', 'frame first']) {
      const { sequence: s, log } = harness();
      if (order === 'setting first') {
        s.motionSetting(true);
        s.introFramePainted();
      } else {
        s.introFramePainted();
        s.motionSetting(true);
      }
      assert.deepEqual(log, ['gone'], `${order}: removed before anything moved; the native splash still covers`);
      s.timelineEnded();
      s.touched();
      s.firstScreenReady();
      assert.deepEqual(log, ['gone', 'hide-native'], `${order}: hidden when the first screen is ready, as before`);
    }
  });

  test('a failed image skips it the same way', () => {
    const { sequence: s, log } = harness();
    s.motionSetting(false);
    s.introFailed();
    s.introFramePainted();
    assert.deepEqual(log, ['gone']);
    s.firstScreenReady();
    assert.deepEqual(log, ['gone', 'hide-native']);
  });

  test('a first screen that is ready first waits at most paintWait for the intro, then goes on without it', () => {
    const late = harness();
    late.sequence.motionSetting(false);
    late.sequence.firstScreenReady();
    assert.equal(late.timers.length, 1);
    assert.equal(late.timers[0].ms, motion.intro.paintWait);
    late.fireTimers();
    assert.deepEqual(late.log, ['gone', 'hide-native']);
    late.sequence.introFramePainted();
    assert.deepEqual(late.log, ['gone', 'hide-native'], 'a frame after the wait does not start it');

    const inTime = harness();
    inTime.sequence.motionSetting(false);
    inTime.sequence.firstScreenReady();
    inTime.sequence.introFramePainted();
    assert.deepEqual(inTime.log, ['hide-native', 'playing']);
    assert.equal(inTime.timers[0].cancelled, true);
    inTime.fireTimers();
    assert.equal(inTime.sequence.phase(), 'playing');
  });

  test('a touch skips the rest: straight to a ready first screen, or to the end state until it is ready', () => {
    const ready = harness();
    ready.sequence.motionSetting(false);
    ready.sequence.introFramePainted();
    ready.sequence.firstScreenReady();
    ready.sequence.touched();
    assert.deepEqual(ready.log, ['hide-native', 'playing', 'gone'], 'no fade: the press is answered at once');

    const notReady = harness();
    notReady.sequence.motionSetting(false);
    notReady.sequence.introFramePainted();
    notReady.sequence.touched();
    assert.equal(notReady.sequence.phase(), 'holding');
    notReady.sequence.firstScreenReady();
    assert.equal(notReady.sequence.phase(), 'leaving');
    notReady.sequence.touched();
    assert.equal(notReady.sequence.phase(), 'gone', 'a touch during the fade ends it');
  });

  test('a crash that replaces the intro still lets the crash screen hide the native splash', () => {
    const { sequence: s, log } = harness();
    s.introUnmounted();
    s.firstScreenReady(); // ErrorBoundary's CrashScreen calls hideSplash()
    assert.deepEqual(log, ['gone', 'hide-native']);
  });

  test('the native splash is hidden once however often the first screen reports ready', () => {
    const { sequence: s, log } = harness();
    s.motionSetting(true);
    s.firstScreenReady();
    s.firstScreenReady();
    assert.deepEqual(log.filter((e) => e === 'hide-native'), ['hide-native']);
  });

  test('the wiring: hideSplash() still means "first screen ready", and the intro asks for the setting before it plays', () => {
    const splash = read('src/navigation/splash.ts');
    assert.match(splash, /SplashScreen\.preventAutoHideAsync\(\)/, 'the existing wiring is kept');
    assert.match(splash, /SplashScreen\.setOptions\(\{ duration: motion\.intro\.nativeFade \}\)/);
    assert.match(splash, /export function hideSplash\(\): void \{\s*splashSequence\.firstScreenReady\(\);\s*\}/);
    assert.match(read('src/navigation/RootNavigator.tsx'), /onReady=\{hideSplash\}/);
    assert.match(read('src/components/ErrorBoundary.tsx'), /useEffect\(hideSplash, \[\]\)/);
    const intro = read('src/navigation/SplashIntro.tsx');
    assert.match(intro, /reduceMotionSettled\(\)\.then\(\(reduce\) => \{\s*if \(live\) splashSequence\.motionSetting\(reduce\);/);
    assert.match(read('App.tsx'), /<RootNavigator \/>[\s\S]*<SplashIntro \/>[\s\S]*<\/ErrorBoundary>/);
  });

  test('timeline: stage 1 in 0–400 ms, stage 2 in 400–900 ms, every stage inside the timeline', () => {
    const { intro } = motion;
    assert.ok(intro.drop[0] >= intro.nativeFade, 'the drop holds still while the native splash fades over it');
    assert.equal(intro.drop[1], 400);
    assert.equal(intro.logo[0], 400);
    assert.equal(intro.duration, 900);
    for (const key of ['drop', 'logo', 'rule', 'wordmark']) {
      const [from, to] = intro[key];
      assert.ok(from >= 0 && from < to && to <= intro.duration, key);
    }
  });
});

// ── The start-up images ──────────────────────────────────────

describe('start-up images match the geometry the intro draws them at', () => {
  const app = JSON.parse(read('app.json')).expo;
  const mark = readPng(path.join(REPO, 'assets/brand/meru-mark.png'));
  const drop = readPng(path.join(REPO, 'assets/brand/meru-drop.png'));
  const splash = readPng(path.join(REPO, 'assets/splash-icon.png'));
  /** Below this alpha a pixel is resampling noise, invisible on white. */
  const VISIBLE = 16;
  const isRed = ([r, g, , a]) => a >= VISIBLE && r > 150 && g < 100;
  const bbox = (img) => {
    let box = null;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (img.at(x, y)[3] < VISIBLE) continue;
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
      }
    }
    return box;
  };

  test('the native splash draws a white, imageDp-wide square image (app.json)', () => {
    const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    assert.deepEqual(plugin, { image: './assets/splash-icon.png', imageWidth: splashArt.imageDp, resizeMode: 'contain', backgroundColor: '#FFFFFF' });
    assert.deepEqual([splash.width, splash.height], [splashArt.imagePx, splashArt.imagePx]);
  });

  test('the drop layer is the mark, pixel for pixel, with only the drop left', () => {
    assert.deepEqual([drop.width, drop.height], [splashArt.markPx.width, splashArt.markPx.height]);
    assert.deepEqual([mark.width, mark.height], [splashArt.markPx.width, splashArt.markPx.height]);
    let visible = 0;
    for (let y = 0; y < drop.height; y++) {
      for (let x = 0; x < drop.width; x++) {
        const p = drop.at(x, y);
        if (p[3] === 0) continue;
        visible++;
        assert.deepEqual(p, mark.at(x, y), `(${x}, ${y})`);
        assert.ok(!isRed(p), `red at (${x}, ${y})`);
      }
    }
    assert.ok(visible > 20000, `the drop is drawn (${visible} px)`);
  });

  test('the native splash is only the drop, raised by the fall, where the intro draws its first frame', () => {
    const k = splashArt.logo.widthPx / splashArt.markPx.width; // splash px per mark px
    const rise = (motion.intro.dropDistance * splashArt.imagePx) / splashArt.imageDp;
    const [x0, y0, x1, y1] = bbox(drop);
    const expected = [
      splashArt.logo.leftPx + x0 * k,
      splashArt.logo.topPx - rise + y0 * k,
      splashArt.logo.leftPx + (x1 + 1) * k,
      splashArt.logo.topPx - rise + (y1 + 1) * k,
    ];
    const actual = bbox(splash);
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 3, `edge ${i}: ${v} vs ${expected[i].toFixed(1)}`));
    for (let y = 0; y < splash.height; y += 2) {
      for (let x = 0; x < splash.width; x += 2) assert.ok(!isRed(splash.at(x, y)), `red at (${x}, ${y})`);
    }
    // Android 12+ shows only the centred circle of the image (RELEASE.md §7): the drop must sit inside it.
    const c = splashArt.imagePx / 2;
    for (const [x, y] of [[actual[0], actual[1]], [actual[2], actual[1]], [actual[0], actual[3]], [actual[2], actual[3]]]) {
      assert.ok(Math.hypot(x - c, y - c) < c, `corner (${x}, ${y}) is inside the visible circle`);
    }
  });
});

// ── Login layout ─────────────────────────────────────────────

describe('Login, "arc split"', () => {
  const login = read('src/screens/auth/LoginScreen.tsx');
  const button = read('src/screens/auth/SignInButton.tsx');

  test('the design values: red card 63 % of the screen, 46 dp corners, the logo card, and the type', () => {
    assert.equal(loginLayout.cardHeight, 0.63);
    assert.equal(loginLayout.cardRadius, 46);
    assert.deepEqual(loginLayout.logoCard, { width: 124, height: 84, radius: 20, padX: 16, padY: 12 });
    assert.deepEqual(loginType.headline, { fontSize: 42, lineHeight: 44, letterSpacing: -1.3, fontWeight: '800' });
    assert.deepEqual(loginType.subline, { fontSize: 15, lineHeight: 22.5 });
    assert.equal(loginLayout.sublineMaxWidth, 270);
    assert.deepEqual(loginType.wordmark, { fontSize: 21, lineHeight: 28, fontWeight: '800' });
    assert.equal(loginType.prompt.fontSize, 13);
    assert.deepEqual(loginType.button, { fontSize: 15, lineHeight: 20, fontWeight: '600' });
    assert.equal(loginType.footer.fontSize, 12);
    assert.match(login, /minHeight: height \* loginLayout\.cardHeight/);
    assert.match(login, /\{'One portal\\nfor all your\\nIT needs\.'\}/);
    assert.match(login, />Raise, track and resolve issues across the whole of Mount Meru Group\.</);
    assert.match(login, />Setu</);
    assert.match(login, />Sign in with your work account</);
    assert.match(login, />Mount Meru Group IT</);
  });

  test('the button is an outlined pill as wide as its content and exactly 52 dp tall; it never scales', () => {
    assert.ok(loginLayout.button.height >= 52, 'touch target floor');
    assert.equal(loginLayout.button.radius, loginLayout.button.height / 2);
    assert.match(button, /pill: \{ height: H, minWidth: H, paddingHorizontal: padX, justifyContent: 'center' \}/);
    assert.match(button, /wrap: \{ alignItems: 'center' \}/, 'centred, not stretched to full width');
    assert.doesNotMatch(button, /<Animated\.View[^>]*style=\{\[?styles\.pill/, 'the pill (the touch target) is never animated');
    assert.match(button, /const LABEL = 'Sign in with Microsoft';/);
    assert.equal(colors.login.buttonFill, '#ffffff');
    assert.deepEqual(Object.keys(colors.microsoft), ['red', 'green', 'blue', 'yellow']);
  });

  test('no colour is written into the login or motion code: every one comes from src/theme/colors.ts', () => {
    for (const rel of ['src/screens/auth/LoginScreen.tsx', 'src/screens/auth/SignInButton.tsx', 'src/navigation/SplashIntro.tsx', 'src/components/Shimmer.tsx']) {
      assert.doesNotMatch(read(rel), /#[0-9a-f]{3,8}\b|rgba?\(/i, rel);
    }
  });
});

// ── Every animation in the app ───────────────────────────────

describe('motion rules hold in every animation in src/', () => {
  const files = sourceFiles('src');
  const animated = files.filter((rel) => /\bAnimated\.(timing|loop|spring|decay)\(/.test(read(rel)));
  const ALLOWED = new Set(['opacity', 'translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate']);

  test('the animating files are exactly these five', () => {
    assert.deepEqual(animated.sort(), [
      'src/components/ListEntry.tsx',
      'src/components/Shimmer.tsx',
      'src/components/StatusBadge.tsx',
      'src/navigation/SplashIntro.tsx',
      'src/screens/auth/SignInButton.tsx',
    ]);
  });

  test('native driver on every timing; no spring, decay, delay, sequence, LayoutAnimation or animation library', () => {
    for (const rel of files) {
      const src = read(rel);
      assert.doesNotMatch(src, /useNativeDriver:\s*false/, rel);
      assert.doesNotMatch(src, /\bLayoutAnimation\b|react-native-reanimated|Animated\.(spring|decay|sequence|parallel|stagger|delay)\(|\bdelay:/, rel);
    }
    for (const rel of animated) {
      const src = read(rel);
      const timings = src.split('Animated.timing(').slice(1);
      assert.ok(timings.length > 0, rel);
      for (const call of timings) assert.match(call.slice(0, call.indexOf('})') + 2), /useNativeDriver: true/, rel);
    }
  });

  test('only opacity and transforms are animated: every interpolation lands on one of them', () => {
    for (const rel of animated) {
      const lines = read(rel).split('\n');
      const intermediates = new Map();
      lines.forEach((line, i) => {
        if (/function segment\(/.test(line) || /return value\.interpolate\(/.test(line)) return; // the helper itself
        if (!/\.interpolate\(|\bsegment\(/.test(line)) return;
        const own = /(\w+)\s*[:=]\s*(?:[\w.]+\.interpolate|segment)\(/.exec(line);
        const key = own ? own[1] : /const (\w+) = useMemo\(/.exec(lines[i - 1] ?? '')?.[1];
        assert.ok(key, `${rel}:${i + 1} interpolation without a key`);
        if (!ALLOWED.has(key)) intermediates.set(key, i);
      });
      // An intermediate (a shared progress value) may only feed allowed keys, or further interpolations.
      for (const [name, defined] of intermediates) {
        lines.forEach((line, i) => {
          if (i === defined) return;
          for (const use of line.matchAll(new RegExp(`(\\w+)?\\s*:?\\s*\\b${name}\\b(\\.interpolate)?`, 'g'))) {
            if (use[2]) continue;
            assert.ok(ALLOWED.has(use[1]), `${rel}:${i + 1} '${name}' feeds '${use[1]}'`);
          }
        });
      }
    }
  });

  test('no layout property is ever bound to an animated value', () => {
    const LAYOUT = /\b(width|height|top|left|right|bottom|margin\w*|padding\w*|flex\w*|minWidth|minHeight|maxWidth|maxHeight|borderWidth)\s*:\s*[^,}\n]*\b(interpolate|segment\(|progress|collapse|turn|timeline|ground|fadeIn)\b/;
    for (const rel of animated) {
      read(rel).split('\n').forEach((line, i) => assert.doesNotMatch(line, LAYOUT, `${rel}:${i + 1}`));
    }
  });

  test('"Remove animations" shows each end state at once', () => {
    // Shimmer: no band; the static bars are the end state.
    assert.match(read('src/components/Shimmer.tsx'), /if \(reduceMotion\) return;[\s\S]*\{reduceMotion \? null : \(/);
    // List entry: no wrapper; the row renders in place at full opacity.
    assert.match(read('src/components/ListEntry.tsx'), /index >= maxRows \|\| reduceMotionEnabled\(\)\) return null;/);
    // Status badge: no change animation; the new pill shows at once.
    assert.match(read('src/components/StatusBadge.tsx'), /setChange\(sameRecord && !reduceMotionEnabled\(\) \?/);
    // Sign-in button: straight to the circle (or back to the pill), and the arc does not turn.
    const button = read('src/screens/auth/SignInButton.tsx');
    assert.match(button, /if \(reduceMotionEnabled\(\)\) \{\s*collapse\.setValue\(to\);\s*return;\s*\}/);
    assert.match(button, /if \(!busy \|\| reduceMotion\) return;\s*turn\.setValue\(0\);\s*const loop = Animated\.loop/);
    // Start-up intro: skipped (the behaviour is tested above); the first screen is its end state.
    assert.match(read('src/navigation/SplashIntro.tsx'), /reduceMotionSettled\(\)/);
    // Every file that starts an animation asks first.
    for (const rel of animated) assert.match(read(rel), /useReduceMotion\(\)|reduceMotionEnabled\(\)|reduceMotionSettled\(\)/, rel);
  });

  test('every animation is stopped when its component unmounts', () => {
    const cleanups = {
      'src/components/Shimmer.tsx': [/return \(\) => sweep\.stop\(\);/],
      'src/components/ListEntry.tsx': [/useEffect\(\(\) => \(\) => scope\.stopAll\(\), \[scope\]\);/],
      'src/components/StatusBadge.tsx': [/return \(\) => pulse\.stop\(\);/],
      'src/navigation/SplashIntro.tsx': [/return \(\) => play\.stop\(\);/, /return \(\) => fade\.stop\(\);/],
      'src/screens/auth/SignInButton.tsx': [/useEffect\(\(\) => \(\) => running\.current\?\.stop\(\), \[\]\);/, /return \(\) => loop\.stop\(\);/],
    };
    assert.deepEqual(Object.keys(cleanups).sort(), animated.sort());
    for (const [rel, patterns] of Object.entries(cleanups)) {
      for (const pattern of patterns) assert.match(read(rel), pattern, rel);
    }
  });

  test('one shared shimmer, swept in brand yellow', () => {
    assert.equal(colors.motion.accent, colors.secondary);
    assert.match(read('src/components/Shimmer.tsx'), /strip: \{ flex: 1, backgroundColor: colors\.motion\.accent \}/);
    const users = files.filter((rel) => /<Shimmer\b/.test(read(rel)));
    assert.deepEqual(users, ['src/components/LoadingSkeleton.tsx']);
    assert.ok(motion.shimmer.bandOpacities.every((o) => o > 0 && o <= 0.3));
  });
});
