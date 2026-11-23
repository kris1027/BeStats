import { Modal, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { PILL_RADIUS } from "@/theme/pill";
import { lengthToken } from "@/theme/token-vars";
import { GlassPlate, PlateSolid } from "./glass/plate";
import { GlassButton } from "./glass-button";

/**
 * How far the backdrop dims the whole screen, the sheet's footprint too, so
 * bright artwork under the frosted sheet never costs its text 4.5:1, as the
 * web's dialog backdrop does (`src/theme/glass-contrast.test.ts`).
 */
export const SHEET_DIM = 0.6;

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
 * and Clear score, on the sheet plate with its controls opaque inside, since
 * only the outermost surface blurs (decision 4). The picked score is cyan on
 * the score plate and rim, the personal look. Every button is 44 points and names what it scores, so it
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
        style={[StyleSheet.absoluteFill, { opacity: SHEET_DIM }]}
        className="bg-background"
      />
      <View pointerEvents="box-none" className="flex-1" />
      <GlassPlate
        plate="sheet"
        shadow
        radius={lengthToken("radius-panel")}
        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
        className="gap-4 px-4 pb-10 pt-5"
      >
        <PlateSolid>
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
            <Text className="text-sm text-text-secondary">
              {unavailableNote}
            </Text>
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
                  style={{ opacity: locked ? 0.5 : 1 }}
                  className="w-[18%]"
                >
                  <GlassPlate
                    plate={pressed ? "score" : "control"}
                    rim={pressed ? "score" : "default"}
                    radius={PILL_RADIUS}
                    className="h-12 items-center justify-center"
                  >
                    <Text
                      className={`text-base font-semibold ${
                        pressed ? "text-score-personal" : "text-foreground"
                      }`}
                    >
                      {value}
                    </Text>
                  </GlassPlate>
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
        </PlateSolid>
      </GlassPlate>
    </Modal>
  );
}
