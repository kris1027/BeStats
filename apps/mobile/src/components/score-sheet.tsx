import { Modal, Pressable, Text, View } from "react-native";

import { GlassButton } from "./glass-button";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Props = {
  visible: boolean;
  /** What is scored, for the screen reader names ("The Matrix"). */
  title: string;
  rating: number | null;
  onPick: (value: number) => void;
  onClear: () => void;
  onClose: () => void;
  /**
   * Before release (or air), the line the web's picker shows; scoring is off
   * and only Clear works, so a stored score stays removable
   * (`lib/tracking/AGENTS.md`, release gate).
   */
  unavailableNote?: string | null;
};

/**
 * The web's score popover as a bottom sheet (prompts/mobile-title-tracking.md,
 * decision 4): "Your score", the 1 to 10 grid with the current score pressed,
 * and Clear score. Every button is 44 points and names what it scores, so it
 * is never read as TMDB's or IGDB's rating (AGENTS.md sections 3 and 9).
 */
export function ScoreSheet({
  visible,
  title,
  rating,
  onPick,
  onClear,
  onClose,
  unavailableNote,
}: Props) {
  const locked = Boolean(unavailableNote);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close score"
        onPress={onClose}
        className="flex-1 bg-background opacity-60"
      />
      <View className="gap-4 rounded-t-3xl border border-border bg-glass-plate-panel px-4 pb-10 pt-5">
        <View className="flex-row items-center justify-between">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-foreground"
          >
            Your score
          </Text>
          <GlassButton label="Done" onPress={onClose} />
        </View>
        {unavailableNote ? (
          <Text className="text-sm text-text-secondary">{unavailableNote}</Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {SCORES.map((value) => {
            const pressed = rating === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Score ${title} ${value}`}
                accessibilityState={{ selected: pressed, disabled: locked }}
                disabled={locked}
                onPress={() => onPick(value)}
                className={`h-12 w-[18%] items-center justify-center rounded-full border ${
                  pressed
                    ? "border-score-personal bg-glass-plate-score"
                    : "border-border bg-glass-plate"
                } ${locked ? "opacity-50" : ""}`}
              >
                <Text className="text-base font-semibold text-foreground">
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {rating !== null ? (
          <GlassButton
            label="Clear score"
            accessibilityLabel={`Clear your score for ${title}`}
            onPress={onClear}
          />
        ) : null}
      </View>
    </Modal>
  );
}
