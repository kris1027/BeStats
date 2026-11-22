import { Pressable, Text } from "react-native";

import type { CardActionLook } from "@/lib/library-actions";

/** Drawn size; `hitSlop` stretches the tap area to 44 points (section 3). */
export const CARD_ACTION_SIZE = 36;
const HIT_SLOP = (44 - CARD_ACTION_SIZE) / 2;

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
    glyph: "✓",
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
 * A library card's round quick action button (prompts/mobile-card-quick-actions.md,
 * decision 3), the app's `CardRoundButton`. It is its own pressable beside
 * the card's link, never inside it, so a screen reader reads the link and
 * then the button with the web's label.
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
      <Text className={`text-base font-bold ${style.text}`}>{style.glyph}</Text>
    </Pressable>
  );
}
