import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { PlannedIcon, WatchedIcon, XIcon } from "@/components/icons";
import type { CardActionLook } from "@/lib/library-actions";
import { PILL_RADIUS } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";

/** The smallest tap area a control gets (AGENTS.md section 3). */
const MIN_TOUCH_TARGET = 44;

/** Drawn size; `hitSlop` stretches the tap area to 44 points (section 3). */
export const CARD_ACTION_SIZE = 36;
const HIT_SLOP = (MIN_TOUCH_TARGET - CARD_ACTION_SIZE) / 2;

/** Icon sizes that keep the web's icon to plate ratio on each size. */
const ACTION_ICON_SIZE = 18;
const MARK_ICON_SIZE = 16;

/**
 * Icon and sheen per look, the web's tracking marks in place of text glyphs
 * (prompts/mobile-web-parity-foundation.md, decision 9). The green is only
 * ever the Planned bookmark (components/AGENTS.md, three colours carry
 * meaning); the others stay neutral, never the personal cyan or the
 * community amber. Watched takes the brighter selected glass, as the web's
 * pressed toggle does.
 */
const LOOKS: Record<
  CardActionLook,
  { icon: (size: number) => ReactNode; sheen: "glass" | "selected" }
> = {
  planned: { icon: (size) => <PlannedIcon size={size} />, sheen: "glass" },
  watched: {
    icon: (size) => <WatchedIcon filled size={size} />,
    sheen: "selected",
  },
  remove: {
    icon: (size) => (
      <XIcon
        size={size}
        color={tokenColor("color-foreground")}
        strokeWidth={2.5}
      />
    ),
    sheen: "glass",
  },
  mark: {
    icon: (size) => <WatchedIcon filled={false} size={size} />,
    sheen: "glass",
  },
};

/**
 * A library card's round quick action button, the app's `CardRoundButton`
 * (prompts/mobile-card-quick-actions.md, decision 3). It is its own pressable
 * beside the card's link, never inside it, so a screen reader reads the link
 * and then the button with the web's label, and its tap area is never under
 * 44 points (AGENTS.md section 3).
 */
export function CardActionButton({
  look,
  label,
  disabled,
  onPress,
}: {
  look: CardActionLook;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const style = LOOKS[look];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={{
        width: CARD_ACTION_SIZE,
        height: CARD_ACTION_SIZE,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <GlassPlate
        sheen={style.sheen}
        shadow
        radius={PILL_RADIUS}
        className="flex-1 items-center justify-center"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {style.icon(ACTION_ICON_SIZE)}
        </View>
      </GlassPlate>
    </Pressable>
  );
}

/** A card mark's drawn size: smaller than a button, since it is not one. */
export const CARD_MARK_SIZE = 28;

/**
 * A catalog card's own state drawn as the library button's look, but not
 * pressable (prompts/mobile-look-card-actions.md, decision 9): the card's
 * actions live in its long press menu, so the card keeps one tap target of
 * 44 points or more rather than small buttons to miss (AGENTS.md section 3).
 * It is hidden from screen readers, which hear the state in the card's label.
 */
export function CardMark({ look }: { look: CardActionLook }) {
  const style = LOOKS[look];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: CARD_MARK_SIZE, height: CARD_MARK_SIZE }}
    >
      <GlassPlate
        sheen={style.sheen}
        shadow
        radius={PILL_RADIUS}
        className="flex-1 items-center justify-center"
      >
        {style.icon(MARK_ICON_SIZE)}
      </GlassPlate>
    </View>
  );
}
