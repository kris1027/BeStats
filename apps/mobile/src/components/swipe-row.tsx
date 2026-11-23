import type { ReactNode } from "react";
import { useRef } from "react";
import { Pressable } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { GlassPlate } from "@/components/glass/plate";
import { Text } from "@/components/text";
import { PILL_FONT_SCALE_CAP } from "@/theme/pill";

/** How wide the revealed action is, and how far a swipe must go to fire it. */
const ACTION_WIDTH = 132;

type Props = {
  /** The action's words, from core's copy. */
  label: string;
  icon: ReactNode;
  /** False for an episode that cannot be marked: nothing reveals. */
  enabled: boolean;
  onAction: () => void;
  children: ReactNode;
};

/**
 * A row with one trailing swipe action, the app's native shortcut for an
 * episode's Watched toggle (feature 29, slice 2, decision 10). Swiping past
 * the action fires it and the row springs back; the action can also be
 * tapped once revealed. It only calls `onAction`, the same function the
 * row's visible button calls, so the request, toast, Undo and haptic are the
 * button's own (apps/mobile/AGENTS.md, every write goes through
 * `useTrackingWrite`). The revealed action is hidden from screen readers,
 * which reach the same action through that button.
 *
 * The one importer of the swipe API, so its gesture setup lives in one
 * place.
 */
export function SwipeRow({ label, icon, enabled, onAction, children }: Props) {
  const swipeable = useRef<SwipeableMethods>(null);
  if (!enabled) return <>{children}</>;

  const fire = () => {
    swipeable.current?.close();
    onAction();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.5}
      rightThreshold={ACTION_WIDTH * 0.6}
      overshootRight={false}
      onSwipeableWillOpen={fire}
      renderRightActions={(progress) => (
        <SwipeAction
          progress={progress}
          label={label}
          icon={icon}
          onPress={fire}
        />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/**
 * The revealed action, faded in with the swipe so it never shows through a
 * row at rest (the rows are transparent over the page background).
 */
function SwipeAction({
  progress,
  label,
  icon,
  onPress,
}: {
  progress: SharedValue<number>;
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  const fade = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(progress.value, 0), 1),
  }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: ACTION_WIDTH, justifyContent: "center", paddingLeft: 12 },
        fade,
      ]}
    >
      <Pressable testID="swipe-action" onPress={onPress} style={{ flex: 1 }}>
        <GlassPlate
          sheen="selected"
          className="flex-1 items-center justify-center gap-2 px-2"
        >
          {icon}
          <Text
            maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
            className="text-center text-sm font-semibold text-foreground"
          >
            {label}
          </Text>
        </GlassPlate>
      </Pressable>
    </Animated.View>
  );
}
