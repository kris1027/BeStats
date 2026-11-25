import type { LibraryType } from "@bestats/core/catalog/media-type";
import { useEffect, useState } from "react";
import { type LayoutRectangle, Pressable, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { MediaSymbol } from "@/components/icons";
import { Text } from "@/components/text";
import { useMediaType } from "@/lib/media-type";
import { useReduceMotion } from "@/lib/reduce-motion";
import { PILL_FONT_SCALE_CAP } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

import { LiquidBar, LiquidCapsule } from "./glass/liquid-bar";

/** The web's media tabs, in their order and with their names. */
const OPTIONS: readonly { type: LibraryType; label: string }[] = [
  { type: "tv", label: "Shows" },
  { type: "movie", label: "Movies" },
  { type: "game", label: "Games" },
];

/**
 * A segment's least height, the native tab bar's selected capsule as
 * measured in the iOS 26 simulator, so the two bars stand the same height
 * (60pt with the bar's 4pt padding). Above the 44pt touch rule.
 */
const SEGMENT_MIN_HEIGHT = 52;

/** The bar's inner padding, the room around the capsule. */
const BAR_PADDING = 4;

/**
 * The capsule's spring, the native tab bar's selection as watched in the
 * iOS 26 simulator: a quick move that settles with a slight give
 * (prompts/mobile-media-switch-glass.md, transition follow up). A finger
 * starts it, so it is a spring, which keeps its speed when a second tap
 * interrupts it.
 */
const CAPSULE_SPRING = { duration: 450, dampingRatio: 0.75 } as const;

/**
 * How far a finger travels sideways before the capsule follows it rather
 * than the touch staying a tap; a mostly vertical move fails the drag, so
 * the screen under the switch still scrolls.
 */
const DRAG_START = 8;
const DRAG_FAIL_Y = 12;

/** How far the capsule swells under a finger, the tab bar's glass lens. */
const PRESSED_SCALE = 1.08;

/**
 * The Shows, Movies, Games switch Home and Search share
 * (prompts/mobile-app-shell-catalog.md, decision 3), reading their shared
 * choice from `useMediaType()`.
 */
export function MediaSwitch() {
  const { mediaType, setMediaType } = useMediaType();
  return <MediaSwitchView value={mediaType} onChange={setMediaType} />;
}

/**
 * The switch itself, the bottom tab bar's twin at the top of the screen
 * (prompts/mobile-media-switch-glass.md, decisions 1 to 4): a Liquid Glass
 * bar, or the app's glass plate where the phone has none, with each type's
 * system symbol over its label, and a darker capsule under the selected one.
 * Each segment is at least 44pt tall for the touch rule (AGENTS.md section
 * 3) and announced as a tab with its selected state. The Library tab drives
 * it with its own type, which is not Home's
 * (prompts/mobile-library-tabs.md, decision 3).
 */
export function MediaSwitchView({
  value,
  onChange,
}: {
  value: LibraryType;
  onChange: (next: LibraryType) => void;
}) {
  const foreground = tokenColor("color-foreground");
  const reduceMotion = useReduceMotion();
  const [layouts, setLayouts] = useState<
    Partial<Record<LibraryType, LayoutRectangle>>
  >({});
  // The segment under the finger: the capsule goes there on touch, as the
  // tab bar's does, and back to the chosen one if the touch is cancelled.
  const [pressing, setPressing] = useState<LibraryType | null>(null);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const scale = useSharedValue(1);
  const placed = useSharedValue(false);
  // The segments' frames in order, for the drag's worklets, and whether a
  // drag holds the capsule, so a cancelled press does not pull it back.
  const segments = useSharedValue<{ x: number; width: number }[]>([]);
  const dragging = useSharedValue(false);

  useEffect(() => {
    const frames = OPTIONS.map((option) => layouts[option.type]);
    if (frames.every((frame) => frame !== undefined)) {
      segments.set(frames.map(({ x, width }) => ({ x, width })));
    }
  }, [layouts, segments]);

  const target = layouts[pressing ?? value];
  useEffect(() => {
    if (!target || dragging.get()) return;
    // The first placement, and every move under Reduce Motion, jumps.
    if (!placed.get() || reduceMotion) {
      placed.set(true);
      x.set(target.x);
      width.set(target.width);
      scale.set(1);
      return;
    }
    x.set(withSpring(target.x, CAPSULE_SPRING));
    width.set(withSpring(target.width, CAPSULE_SPRING));
    scale.set(withSpring(pressing ? PRESSED_SCALE : 1, CAPSULE_SPRING));
  }, [target, pressing, reduceMotion, x, width, scale, placed, dragging]);

  // Drag between tabs, as on the iOS 26 tab bar: the capsule follows the
  // finger along the bar, swollen, and on release springs to the nearest
  // segment, which becomes the choice (prompts/mobile-media-switch-glass.md,
  // drag follow up). A tap stays the segment's own `Pressable`.
  function choose(index: number) {
    const option = OPTIONS[index];
    if (option && option.type !== value) onChange(option.type);
  }
  const drag = usePanGesture({
    activeOffsetX: [-DRAG_START, DRAG_START],
    failOffsetY: [-DRAG_FAIL_Y, DRAG_FAIL_Y],
    onActivate: () => {
      "worklet";
      if (segments.get().length === 0) return;
      dragging.set(true);
      scale.set(withSpring(PRESSED_SCALE, CAPSULE_SPRING));
    },
    onUpdate: (event) => {
      "worklet";
      const frames = segments.get();
      const first = frames[0];
      const last = frames[frames.length - 1];
      if (!dragging.get() || !first || !last) return;
      const w = width.get();
      const left = event.x - w / 2;
      x.set(Math.min(Math.max(left, first.x), last.x + last.width - w));
    },
    onDeactivate: (event) => {
      "worklet";
      const frames = segments.get();
      if (!dragging.get() || frames.length === 0) return;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      frames.forEach((frame, index) => {
        const distance = Math.abs(frame.x + frame.width / 2 - event.x);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      const landing = frames[nearest];
      if (landing) {
        x.set(withSpring(landing.x, CAPSULE_SPRING));
        width.set(withSpring(landing.width, CAPSULE_SPRING));
      }
      scale.set(withSpring(1, CAPSULE_SPRING));
      dragging.set(false);
      scheduleOnRN(choose, nearest);
    },
  });

  // An absolute holder whose only child fills it, so moving it and setting
  // its width re-lays out nothing else, and its round ends keep their shape.
  const capsuleStyle = useAnimatedStyle(() => ({
    width: width.get(),
    transform: [{ translateX: x.get() }, { scale: scale.get() }],
  }));
  const measured = target !== undefined;

  return (
    <GestureDetector gesture={drag}>
      <View>
        <LiquidBar
          accessibilityRole="tablist"
          style={{ flexDirection: "row", padding: BAR_PADDING }}
        >
          {measured ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: BAR_PADDING,
                  bottom: BAR_PADDING,
                  left: 0,
                },
                capsuleStyle,
              ]}
            >
              <LiquidCapsule />
            </Animated.View>
          ) : null}
          {OPTIONS.map((option) => {
            const selected = option.type === value;
            return (
              <Pressable
                key={option.type}
                accessibilityRole="tab"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                onLayout={(event) => {
                  const layout = event.nativeEvent.layout;
                  setLayouts((current) => ({
                    ...current,
                    [option.type]: layout,
                  }));
                }}
                onPressIn={() => setPressing(option.type)}
                onPressOut={() => setPressing(null)}
                onPress={() => onChange(option.type)}
                pressRetentionOffset={16}
                style={{ flex: 1, minHeight: SEGMENT_MIN_HEIGHT }}
              >
                {/* Until the segments are measured, the chosen one carries
                    the capsule itself, so the first frame is never bare. */}
                {selected && !measured ? <LiquidCapsule /> : null}
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <MediaSymbol type={option.type} color={foreground} />
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
                    className="text-xs font-semibold text-foreground"
                  >
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </LiquidBar>
      </View>
    </GestureDetector>
  );
}
