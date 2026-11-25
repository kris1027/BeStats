import { useEffect, useRef } from "react";
import {
  Animated,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

import { artworkHeight, DETAIL_POSTER_WIDTH } from "@/lib/images";
import { useReduceMotion } from "@/lib/reduce-motion";
import { PILL_RADIUS } from "@/theme/pill";
import { lengthToken } from "@/theme/token-vars";

import { GlassPlate, PlateSolid } from "./glass/plate";
import { GlassPanel } from "./glass-panel";
import { GRID, gridCardWidth } from "./grid-layout";

/** The web's skeleton shapes: a 2:3 poster, a pill and a text line. */
const SHAPES = {
  poster: { aspectRatio: 2 / 3, borderRadius: lengthToken("radius-lg") },
  pill: { height: 28, width: 64, borderRadius: PILL_RADIUS },
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

/** A poster card's footprint: the poster and its title line. */
export function PosterCardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width }} className="gap-2.5">
      <Skeleton shape="poster" style={{ width }} />
      <Skeleton shape="line" style={{ width: width * 0.66 }} />
    </View>
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

/**
 * A title screen's footprint while it loads (feature 29, slice 2,
 * decision 12): the backdrop, the poster beside two lines, and the action
 * row, so the hero does not jump when the detail arrives, as the web's
 * detail skeletons do (AGENTS.md section 3, every view has a loading state).
 */
export function TitleSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <View className="gap-4">
      <Skeleton shape="line" style={{ width, height: artworkHeight(width) }} />
      <View className="flex-row gap-4 px-4">
        <Skeleton shape="poster" style={{ width: DETAIL_POSTER_WIDTH }} />
        <View className="flex-1 gap-3 pt-2">
          <Skeleton shape="line" style={{ width: "80%", height: 24 }} />
          <Skeleton shape="line" style={{ width: "60%" }} />
          <View className="flex-row gap-2">
            <Skeleton shape="pill" />
            <Skeleton shape="pill" />
          </View>
        </View>
      </View>
      <View className="flex-row gap-2 px-4">
        <Skeleton shape="pill" style={{ width: 110, height: 44 }} />
        <Skeleton shape="pill" style={{ width: 140, height: 44 }} />
      </View>
    </View>
  );
}

/**
 * Account's footprint while the session or profile loads
 * (prompts/mobile-look-verify-extras.md, decision 5): the header panel (your
 * name, your email and Sign out) and the three rows under it, in the same
 * padding, gaps and radius as `AccountScreen`, so nothing jumps when they
 * arrive. No posters: Account has none (AC-5, skeletons in the shape of
 * what is coming). The username panel shows only for some accounts, so it
 * is left out rather than guessed.
 */
export function AccountSkeleton() {
  return (
    <View className="gap-4 px-4 py-6">
      <GlassPanel>
        <View className="gap-2">
          <Skeleton shape="line" style={{ width: "50%", height: 22 }} />
          <Skeleton shape="line" style={{ width: "70%" }} />
        </View>
        <Skeleton shape="pill" style={{ width: 110, height: 44 }} />
      </GlassPanel>
      {slotKeys("account-row", 3).map((key) => (
        <Skeleton
          key={key}
          shape="line"
          style={{ height: 56, borderRadius: lengthToken("radius-panel") }}
        />
      ))}
    </View>
  );
}
