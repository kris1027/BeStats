import {
  barGroupHeight,
  barGroupWidth,
  barLayout,
  finalLockupScale,
  LAUNCH_BARS,
  LAUNCH_TIMELINE,
  LAUNCH_WORDMARK,
} from "@bestats/core/brand/mark";
import * as SplashScreen from "expo-splash-screen";
import { type ReactNode, useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { tokenColor } from "@/theme/token-vars";

type Curve = readonly [number, number, number, number];

const {
  bars: BARS,
  lockup: LOCKUP,
  be: BE,
  stats: STATS,
  app: APP,
} = LAUNCH_TIMELINE;

/** The lockup holds, complete, until the design's app fade begins. */
const HOLD_UNTIL = APP.delay;
const BAR_GROUP_WIDTH = barGroupWidth(LAUNCH_BARS);
const BAR_GROUP_HEIGHT = barGroupHeight(LAUNCH_BARS);
/**
 * How long the native splash waits for the lockup's first layout. Layout
 * normally lands in the first frame; past this the animation is dropped, so
 * a lost layout event can never keep the app behind the splash.
 */
const LAYOUT_TIMEOUT_MS = 1000;

/**
 * Where one step of the timeline is, 0 to 1 (or past 1 for an overshooting
 * curve), from the one clock in milliseconds. One clock lets a tap or Reduce
 * Motion jump every step to its end at once.
 */
function stepProgress(
  clock: number,
  delay: number,
  duration: number,
  curve: Curve,
): number {
  "worklet";
  const linear = Math.min(1, Math.max(0, (clock - delay) / duration));
  return Easing.bezierFn(curve[0], curve[1], curve[2], curve[3])(linear);
}

type Phase = "measuring" | "playing" | "leaving" | "gone";

/** The wordmark's line: its height and its baseline's height above the bottom. */
interface WordLine {
  height: number;
  baseline: number;
}

/**
 * The launch animation over the app on cold start (design option 3a,
 * prompts/mobile-app-icon-launch.md, decisions 6 to 9).
 *
 * The native splash shows the bars at rest, centred; this overlay draws the
 * same frame, hides the native splash once it is measured, and then plays
 * the design's sequence: the bars breathe, the lockup grows, glides left and
 * "Be" and "Stats" wipe in. It leaves only when the sequence is done and
 * `ready` (the session has loaded), so the app never shows half loaded; a
 * tap jumps to the end, and Reduce Motion shows the final lockup and fades.
 * It mounts once in the root layout, so it plays on cold start only.
 */
export function LaunchOverlay({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("measuring");
  const [held, setHeld] = useState(false);
  const [measured, setMeasured] = useState(false);
  // The design sets the words' baseline on the bars' bottom edge, so each
  // word drops by how far its baseline sits above its line's bottom, read
  // from the laid out text rather than guessed, since SF Pro and Roboto differ.
  const [line, setLine] = useState<WordLine | null>(null);
  const laidOut = measured && line !== null;
  // The lockup's offsets live in shared values, set in the same layout pass
  // that shows it, so its first visible frame is already centred on the bars.
  const centreShift = useSharedValue(0);
  const endScale = useSharedValue(1);
  const clock = useSharedValue(0);
  const leave = useSharedValue(0);
  const beWidth = useSharedValue(0);
  const statsWidth = useSharedValue(0);

  // Hand over from the native splash once the first frame matches it.
  useEffect(() => {
    if (phase !== "measuring" || !laidOut) return;
    let live = true;
    // One frame for the measured lockup to be drawn before the native splash
    // over it goes.
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    nextFrame()
      .then(() => SplashScreen.hideAsync())
      .catch(() => {})
      .then(() => {
        if (!live) return;
        setPhase("playing");
        if (reduceMotion) {
          clock.value = HOLD_UNTIL;
          setHeld(true);
          return;
        }
        clock.value = withTiming(
          HOLD_UNTIL,
          { duration: HOLD_UNTIL, easing: Easing.linear },
          (finished) => {
            if (finished) scheduleOnRN(setHeld, true);
          },
        );
      });
    return () => {
      live = false;
    };
  }, [phase, laidOut, reduceMotion, clock]);

  // If layout never comes, the native splash goes anyway and the overlay
  // waits, blank, only for the session (the plan's "never waits longer"
  // requirement), so nothing can leave the app stuck behind the splash.
  useEffect(() => {
    if (phase !== "measuring" || laidOut) return;
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      clock.value = HOLD_UNTIL;
      setPhase("playing");
      setHeld(true);
    }, LAYOUT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, laidOut, clock]);

  // Leave once the sequence is done and the app is ready behind it.
  useEffect(() => {
    if (phase !== "playing" || !held || !ready) return;
    setPhase("leaving");
    leave.value = withTiming(
      1,
      {
        duration: APP.duration,
        easing: Easing.bezier(...APP.curve),
      },
      (finished) => {
        if (finished) scheduleOnRN(setPhase, "gone");
      },
    );
  }, [phase, held, ready, leave]);

  /** A tap anywhere jumps to the complete lockup. */
  const skip = () => {
    if (phase !== "playing" || held) return;
    cancelAnimation(clock);
    clock.value = HOLD_UNTIL;
    setHeld(true);
  };

  const lockupStyle = useAnimatedStyle(() => {
    const p = stepProgress(
      clock.value,
      LOCKUP.delay,
      LOCKUP.duration,
      LOCKUP.curve,
    );
    const at = [0, LOCKUP.peakAt, LOCKUP.holdUntil, 1];
    const peak = LOCKUP.peakScale;
    const dx = centreShift.value;
    return {
      opacity: laidOut ? 1 : 0,
      transform: [
        {
          translateX: interpolate(p, at, [dx, dx * peak, dx * peak, 0]),
        },
        { scale: interpolate(p, at, [1, peak, peak, endScale.value]) },
      ],
    };
  });

  const appStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: 1 }] };
    const scale = interpolate(leave.value, [0, 1], [APP.fromScale, 1]);
    return { transform: [{ scale }] };
  });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - leave.value,
  }));

  const onLockupLayout = (event: LayoutChangeEvent) => {
    if (measured) return;
    const { width } = event.nativeEvent.layout;
    centreShift.value = (width - BAR_GROUP_WIDTH) / 2;
    endScale.value = finalLockupScale(width, screenWidth);
    setMeasured(true);
  };

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.fill, phase !== "gone" && appStyle]}>
        {children}
      </Animated.View>
      {phase === "gone" ? null : (
        <Animated.View
          testID="launch-overlay"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents={phase === "leaving" ? "none" : "auto"}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tokenColor("color-background") },
            overlayStyle,
          ]}
        >
          <Pressable testID="launch-skip" onPress={skip} style={styles.centre}>
            <Animated.View
              onLayout={onLockupLayout}
              style={[styles.lockup, lockupStyle]}
            >
              <View style={styles.bars}>
                {barLayout(LAUNCH_BARS).map((bar, i) => (
                  <Bar
                    key={bar.x}
                    clock={clock}
                    delay={BARS.delay + i * BARS.stagger}
                    width={bar.width}
                    height={bar.height}
                    radius={bar.radius}
                  />
                ))}
              </View>
              <Word
                text="Be"
                clock={clock}
                step={BE}
                width={beWidth}
                inset={LAUNCH_WORDMARK.gap}
                line={line}
                onLine={setLine}
              />
              <Word
                text="Stats"
                clock={clock}
                step={STATS}
                width={statsWidth}
                line={line}
              />
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

/** One bar: it dips to 12% of its height and springs back, from its bottom. */
function Bar({
  clock,
  delay,
  width,
  height,
  radius,
}: {
  clock: SharedValue<number>;
  delay: number;
  width: number;
  height: number;
  radius: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = stepProgress(clock.value, delay, BARS.duration, BARS.curve);
    const scaleY = interpolate(
      p,
      [0, BARS.dipAt, 1],
      [1, BARS.dip, 1],
      Extrapolation.EXTEND,
    );
    return { transform: [{ scaleY }] };
  });
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tokenColor("color-brand-mark"),
          transformOrigin: "bottom",
        },
        style,
      ]}
    />
  );
}

/**
 * One word of the wordmark. React Native has no `clip-path`, so a cover in
 * the background colour slides right off the word as it fades in; on the
 * solid black ground that reads as the design's left to right wipe. A later
 * word draws above an earlier word's cover, so the covers never hide it.
 */
function Word({
  text,
  clock,
  step,
  width,
  inset = 0,
  line,
  onLine,
}: {
  text: string;
  clock: SharedValue<number>;
  step: { delay: number; duration: number; curve: Curve };
  width: SharedValue<number>;
  inset?: number;
  line: WordLine | null;
  onLine?: (line: WordLine) => void;
}) {
  const textStyle = useAnimatedStyle(() => ({
    opacity: stepProgress(clock.value, step.delay, step.duration, step.curve),
  }));
  const coverStyle = useAnimatedStyle(() => {
    const p = stepProgress(clock.value, step.delay, step.duration, step.curve);
    return { transform: [{ translateX: p * width.value }] };
  });
  return (
    <View
      // The row is only as tall as the bars, which would clamp the word's
      // height and push its glyphs down, so the word takes its measured line
      // height and drops below the row's edge by the baseline's offset: the
      // baseline then sits on the bars' bottom edge.
      style={{
        paddingLeft: inset,
        height: line?.height,
        marginBottom: -(line?.baseline ?? 0),
      }}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}
    >
      <Animated.Text
        allowFontScaling={false}
        onTextLayout={(event) => {
          const first = event.nativeEvent.lines[0];
          if (first && line === null)
            onLine?.({
              height: first.height,
              // The baseline sits `ascender` below the line's top.
              baseline: first.height - Math.abs(first.ascender),
            });
        }}
        style={[styles.wordText, textStyle]}
      >
        {text}
      </Animated.Text>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tokenColor("color-background") },
          coverStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  lockup: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: BAR_GROUP_HEIGHT,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: LAUNCH_BARS.gap,
    height: BAR_GROUP_HEIGHT,
  },
  wordText: {
    color: tokenColor("color-brand-mark"),
    fontSize: LAUNCH_WORDMARK.fontSize,
    fontWeight: "700",
    letterSpacing: LAUNCH_WORDMARK.letterSpacing,
    includeFontPadding: false,
  },
});
