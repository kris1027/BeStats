import { ActivityIndicator, Pressable } from "react-native";
import { Text } from "@/components/text";

type Props = {
  label: string;
  onPress: () => void;
  /** The screen reader name when it differs from the visible label. */
  accessibilityLabel?: string;
  variant?: "primary" | "glass" | "destructive";
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
};

/** Plate and label classes per look, one table both halves of the pill read. */
const LOOK = {
  primary: { plate: "bg-primary", text: "text-primary-foreground" },
  destructive: {
    plate: "border border-destructive bg-glass-plate",
    text: "text-destructive",
  },
  pressed: {
    plate: "border border-score-personal bg-glass-plate-score",
    text: "text-foreground",
  },
  glass: {
    plate: "border border-border bg-glass-plate",
    text: "text-foreground",
  },
} as const;

/**
 * The pill button of the shipped web UI (glass plate, round, 44pt tall so it
 * meets the touch target rule in AGENTS.md section 3). `primary` is the light
 * filled call to action; `glass` the tracking pill; `destructive` the glass
 * pill in the destructive colour, for an action that cannot be undone.
 */
export function GlassButton({
  label,
  onPress,
  accessibilityLabel,
  variant = "glass",
  pressed,
  disabled,
  busy,
}: Props) {
  const look = LOOK[variant === "glass" && pressed ? "pressed" : variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, selected: pressed }}
      disabled={disabled || busy}
      onPress={onPress}
      className={`min-h-11 flex-row items-center justify-center gap-2 rounded-full px-5 ${
        look.plate
      } ${disabled ? "opacity-50" : ""}`}
    >
      {busy ? <ActivityIndicator size="small" /> : null}
      <Text className={`text-base font-semibold ${look.text}`}>{label}</Text>
    </Pressable>
  );
}
