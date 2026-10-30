// The start-up intro (2026-10-30, docs/PERFORMANCE.md §12): on a white ground the yellow drop falls into place, the
// full Meru logo resolves around it, then "Setu" fades up over a short yellow rule, and the whole thing fades out over
// the first screen. It plays once per launch, over the app, while the first screen mounts underneath.
// - Its first frame is the native splash's picture (the raised drop, assets/splash-icon.png) at the same place
//   (theme/brand.ts `splashArt`), so the native splash hides with no visible change and nothing blank ever shows.
// - One native timeline drives every stage; each part is a native interpolation of it, with its curve sampled into
//   straight segments (the native driver cannot run an easing function inside an interpolation). No timers, no
//   JavaScript per frame. Only opacity and transforms move.
// - When it plays, when it hands off and when it is skipped are ./splashSequence.ts: "Remove animations" skips it, and
//   the first screen shows straight from the native splash, as before.
// - A touch skips the rest at once. Screen readers read the screen underneath: the intro is hidden from them.
import { Image } from 'expo-image';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { reduceMotionSettled } from '@/hooks';
import { colors, loginType, motion, splashArt, type MotionCurve } from '@/theme';
import { splashSequence } from './splash';

const DROP = require('../../assets/brand/meru-drop.png') as number;
const MARK = require('../../assets/brand/meru-mark.png') as number;

const intro = motion.intro;
/** dp per pixel of the splash image. */
const K = splashArt.imageDp / splashArt.imagePx;
/** The logo's box in the splash image, in dp. The drop layer has the mark's canvas, so it shares the box. */
const LOGO = {
  left: splashArt.logo.leftPx * K,
  top: splashArt.logo.topPx * K,
  width: splashArt.logo.widthPx * K,
  height: ((splashArt.logo.widthPx * splashArt.markPx.height) / splashArt.markPx.width) * K,
};
const WORDMARK_TOP = LOGO.top + LOGO.height + splashArt.wordmarkGap;
const RULE_TOP = WORDMARK_TOP + loginType.wordmark.lineHeight + splashArt.ruleGap;

/** `value` over [from, to] ms of the timeline, eased by `curve`, from `start` to `end`. Clamped outside the segment. */
function segment(value: Animated.Value, [from, to]: readonly [number, number], curve: MotionCurve, start: number, end: number) {
  const ease = Easing.bezier(...curve);
  const points = Array.from({ length: intro.curveSamples + 1 }, (_, i) => i / intro.curveSamples);
  return value.interpolate({
    inputRange: points.map((t) => from + t * (to - from)),
    outputRange: points.map((t) => start + ease(t) * (end - start)),
    extrapolate: 'clamp',
  });
}

function createIntro() {
  const timeline = new Animated.Value(0);
  const ground = new Animated.Value(1);
  return {
    timeline,
    ground,
    style: {
      drop: { transform: [{ translateY: segment(timeline, intro.drop, intro.dropCurve, -intro.dropDistance, 0) }] },
      logo: { opacity: segment(timeline, intro.logo, intro.logoCurve, 0, 1) },
      rule: { transform: [{ scaleX: segment(timeline, intro.rule, intro.ruleCurve, 0, 1) }] },
      wordmark: {
        opacity: segment(timeline, intro.wordmark, intro.wordmarkCurve, 0, 1),
        transform: [{ translateY: segment(timeline, intro.wordmark, intro.wordmarkCurve, intro.wordmarkRise, 0) }],
      },
      ground: { opacity: ground },
    },
  };
}

export function SplashIntro() {
  const phase = useSyncExternalStore(splashSequence.subscribe, splashSequence.phase);
  const [anim] = useState(createIntro);
  const shown = useRef({ drop: false, mark: false });

  // Ask the system once whether to play at all. Until it answers, the intro sits under the native splash.
  useEffect(() => {
    if (splashSequence.phase() !== 'waiting') return;
    let live = true;
    void reduceMotionSettled().then((reduce) => {
      if (live) splashSequence.motionSetting(reduce);
    });
    return () => {
      live = false;
      splashSequence.introUnmounted();
    };
  }, []);

  // Each phase's motion. Every timing is native and stopped when the phase moves on or the intro unmounts.
  useEffect(() => {
    if (phase === 'playing') {
      const play = Animated.timing(anim.timeline, {
        toValue: intro.duration, duration: intro.duration, easing: Easing.linear, useNativeDriver: true,
      });
      play.start(({ finished }) => {
        if (finished) splashSequence.timelineEnded();
      });
      return () => play.stop();
    }
    if (phase === 'holding' || phase === 'leaving') anim.timeline.setValue(intro.duration); // a touch skips to the end
    if (phase === 'leaving') {
      const fade = Animated.timing(anim.ground, {
        toValue: 0, duration: intro.handOff, easing: Easing.bezier(...intro.handOffCurve), useNativeDriver: true,
      });
      fade.start(({ finished }) => {
        if (finished) splashSequence.handOffEnded();
      });
      return () => fade.stop();
    }
    return undefined;
  }, [phase, anim]);

  if (phase === 'gone') return null;

  const onDisplay = (layer: 'drop' | 'mark') => () => {
    shown.current[layer] = true;
    if (shown.current.drop && shown.current.mark) splashSequence.introFramePainted();
  };

  return (
    <Animated.View
      style={[styles.ground, anim.style.ground]}
      // Fading out over the first screen, which is visible by then: touches go to it.
      pointerEvents={phase === 'leaving' ? 'none' : 'auto'}
      onStartShouldSetResponder={() => true}
      onResponderGrant={splashSequence.touched}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={styles.image}>
        <Animated.View style={[styles.logo, anim.style.drop]}>
          <Image source={DROP} contentFit="contain" priority="high" style={styles.fill} onDisplay={onDisplay('drop')} onError={splashSequence.introFailed} />
        </Animated.View>
        <Animated.View style={[styles.logo, anim.style.logo]}>
          <Image source={MARK} contentFit="contain" priority="high" style={styles.fill} onDisplay={onDisplay('mark')} onError={splashSequence.introFailed} />
        </Animated.View>
        <Animated.Text allowFontScaling={false} style={[styles.wordmark, anim.style.wordmark]}>
          Setu
        </Animated.Text>
        <Animated.View style={[styles.rule, anim.style.rule]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over the whole window, like the native splash: the image box is centred on the same point.
  ground: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.motion.ground },
  image: { width: splashArt.imageDp, height: splashArt.imageDp },
  logo: { position: 'absolute', ...LOGO },
  fill: { width: '100%', height: '100%' },
  wordmark: {
    position: 'absolute',
    top: WORDMARK_TOP,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.text.primary,
    ...loginType.wordmark,
  },
  rule: {
    position: 'absolute',
    top: RULE_TOP,
    left: (splashArt.imageDp - splashArt.rule.width) / 2,
    ...splashArt.rule,
    borderRadius: splashArt.rule.height / 2,
    backgroundColor: colors.motion.accent,
  },
});
