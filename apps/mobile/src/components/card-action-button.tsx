import { Pressable, Text, View } from "react-native";

import type { CardActionLook } from "@/lib/library-actions";

/** The smallest tap area a control gets (AGENTS.md section 3). */
const MIN_TOUCH_TARGET = 44;

/** Drawn size; `hitSlop` stretches the tap area to 44 points (section 3). */
export const CARD_ACTION_SIZE = 36;
const HIT_SLOP = (MIN_TOUCH_TARGET - CARD_ACTION_SIZE) / 2;

/**
 * Plate, rim and glyph per look. The green is only ever the Planned
 * bookmark (components/AGENTS.md, three colours carry meaning); the others
 * stay neutral, never the personal cyan or the community amber.
 */
const LOOKS: Record<
  CardActionLook,
  { glyph: string; box: string; text: string }
> = {
  planned: {
    glyph: "bookmark",
    box: "border-status-planned bg-glass-plate-panel",
    text: "text-status-planned",
  },
  watched: {
    glyph: "✓",
    box: "border-primary bg-primary",
    text: "text-primary-foreground",
  },
  remove: {
    glyph: "×",
    box: "border-border bg-glass-plate-panel",
    text: "text-foreground",
  },
  mark: {
    glyph: "✓",
    box: "border-border bg-glass-plate-panel",
    text: "text-foreground",
  },
};

/**
 * The web's Planned mark (components/tracking/tracking-icons.tsx): a green
 * bookmark with a dark check, drawn from views since the app adds no icon
 * dependency (prompts/mobile-card-quick-actions.md, decision 3). The notch is
 * a square turned 45 degrees in the plate's own solid colour.
 */
function PlannedBookmark() {
  return (
    <View className="h-4 w-3 items-center overflow-hidden rounded-t-sm bg-status-planned">
      <Text className="text-[9px] font-bold leading-3 text-status-planned-mark">
        ✓
      </Text>
      <View className="absolute -bottom-1 h-2 w-2 rotate-45 bg-glass-plate-panel" />
    </View>
  );
}

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
      style={{ width: CARD_ACTION_SIZE, height: CARD_ACTION_SIZE }}
      className={`items-center justify-center rounded-full border ${style.box} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      {style.glyph === "bookmark" ? (
        <PlannedBookmark />
      ) : (
        <Text className={`text-base font-bold ${style.text}`}>
          {style.glyph}
        </Text>
      )}
    </Pressable>
  );
}
