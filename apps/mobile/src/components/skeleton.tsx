import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Animated,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

import { lengthToken } from "@/theme/token-vars";

import { GlassPlate, PlateSolid } from "./glass/plate";

/** The web's skeleton shapes: a 2:3 poster, a pill and a text line. */
const SHAPES = {
  poster: { aspectRatio: 2 / 3, borderRadius: lengthToken("radius-lg") },
  pill: { height: 28, width: 64, borderRadius: 999 },
  line: { height: 16, borderRadius: lengthToken("radius-sm") },
} as const satisfies Record<string, ViewStyle>;

/** One pulse, as long as the web's `skeleton-pulse`. */
const PULSE_MS = 1000;

/**
 * A placeholder in the shape of what is loading: an opaque plate with the
 * rim and no gradient, the web's `plate-rim plate-solid`, so it reads as an
 * absence (components/AGENTS.md). It pulses unless the system asks for
 * reduced motion, and is hidden from screen readers: the screen around it
 * announces the wait once (prompts/mobile-web-parity-foundation.md,
 * requirement 11).
 */
export function Skeleton({
  shape,
  style,
}: {
  shape: keyof typeof SHAPES;
  style?: ViewStyle;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);
  const { borderRadius, ...size } = SHAPES[shape];

  return (
    <Animated.View
      testID="skeleton"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[size, style, { opacity }]}
    >
      <PlateSolid>
        <GlassPlate sheen="none" radius={borderRadius} style={{ flex: 1 }} />
      </PlateSolid>
    </Animated.View>
  );
}

/**
 * Whether the system asks for reduced motion, read once and then followed,
 * with one listener for the whole app rather than one per skeleton (a grid
 * draws a dozen). React Native's own `AccessibilityInfo`, not Reanimated's
 * hook, so the pulse is a plain `Animated` loop that every screen renders.
 */
let reduceMotion = false;
const motionListeners = new Set<() => void>();
let watchingMotion = false;

function setReduceMotion(value: boolean) {
  if (value === reduceMotion) return;
  reduceMotion = value;
  for (const listener of motionListeners) listener();
}

function subscribeMotion(listener: () => void) {
  if (!watchingMotion) {
    watchingMotion = true;
    Promise.resolve()
      .then(() => AccessibilityInfo.isReduceMotionEnabled())
      .then((value) => setReduceMotion(value === true))
      .catch(() => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
  }
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => reduceMotion,
    () => false,
  );
}

/** A poster card's footprint: the poster and its title line. */
export function PosterCardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width }} className="gap-2.5">
      <Skeleton shape="poster" style={{ width }} />
      <Skeleton shape="line" style={{ width: width * 0.66 }} />
    </View>
  );
}

/** Columns and spacing every poster grid shares, with `PosterGrid`. */
export const GRID = { columns: 3, gutter: 16, gap: 12 } as const;

/** A grid card's width at this window width. */
export function gridCardWidth(windowWidth: number): number {
  return Math.floor(
    (windowWidth - GRID.gutter * 2 - GRID.gap * (GRID.columns - 1)) /
      GRID.columns,
  );
}

/**
 * Fixed keys for a run of identical placeholders: they never reorder, so a
 * stable name per slot is all React needs.
 */
function slotKeys(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, slot) => `${name}-${slot}`);
}

/** Two rows of grid cards, for a list or a search while it loads. */
export function PosterGridSkeleton() {
  const { width } = useWindowDimensions();
  const card = gridCardWidth(width);
  return (
    <View
      className="flex-row flex-wrap pt-4"
      style={{ gap: GRID.gap, paddingHorizontal: GRID.gutter, rowGap: 20 }}
    >
      {slotKeys("grid", GRID.columns * 2).map((key) => (
        <PosterCardSkeleton key={key} width={card} />
      ))}
    </View>
  );
}

/** A row of poster cards, for a landing row while it loads. */
export function PosterRowSkeleton({ width }: { width: number }) {
  return (
    <View className="flex-row gap-3 overflow-hidden px-4">
      {slotKeys("row", 4).map((key) => (
        <PosterCardSkeleton key={key} width={width} />
      ))}
    </View>
  );
}

/**
 * A title or account screen's footprint while it loads: a heading, a few
 * lines, a row of pills and a poster row, so the wait has the page's shape.
 */
export function PageSkeleton() {
  return (
    <View className="gap-4 px-4 pt-6">
      <Skeleton shape="line" style={{ width: "60%", height: 28 }} />
      <Skeleton shape="line" style={{ width: "90%" }} />
      <Skeleton shape="line" style={{ width: "75%" }} />
      <View className="flex-row gap-2">
        <Skeleton shape="pill" />
        <Skeleton shape="pill" />
      </View>
      <View className="flex-row gap-3 pt-2">
        {slotKeys("page", 3).map((key) => (
          <PosterCardSkeleton key={key} width={100} />
        ))}
      </View>
    </View>
  );
}
