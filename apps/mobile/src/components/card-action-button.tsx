import { XIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import type { CardActionLook } from "@/lib/library-actions";
import { tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";
import { PlannedIcon, WatchedIcon } from "./icons/tracking-icons";

/** The smallest tap area a control gets (AGENTS.md section 3). */
const MIN_TOUCH_TARGET = 44;

/** Drawn size; `hitSlop` stretches the tap area to 44 points (section 3). */
export const CARD_ACTION_SIZE = 36;
const HIT_SLOP = (MIN_TOUCH_TARGET - CARD_ACTION_SIZE) / 2;

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
  { icon: () => ReactNode; sheen: "glass" | "selected" }
> = {
  planned: { icon: () => <PlannedIcon size={18} />, sheen: "glass" },
  watched: { icon: () => <WatchedIcon filled size={18} />, sheen: "selected" },
  remove: {
    icon: () => (
      <XIcon
        size={18}
        color={tokenColor("color-foreground")}
        strokeWidth={2.5}
      />
    ),
    sheen: "glass",
  },
  mark: {
    icon: () => <WatchedIcon filled={false} size={18} />,
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
        radius={999}
        className="flex-1 items-center justify-center"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {style.icon()}
        </View>
      </GlassPlate>
    </Pressable>
  );
}
