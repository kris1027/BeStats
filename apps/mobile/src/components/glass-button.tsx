import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Text } from "@/components/text";
import { PILL_FONT_SCALE_CAP, PILL_RADIUS } from "@/theme/pill";
import { tokenColor } from "@/theme/token-vars";

import { GlassPlate, SURFACES } from "./glass/plate";

type Props = {
  label: string;
  onPress: () => void;
  /** The screen reader name when it differs from the visible label. */
  accessibilityLabel?: string;
  variant?: "primary" | "glass" | "destructive";
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** A decorative icon beside the label, before it unless `iconAfter`. */
  icon?: ReactNode;
  iconAfter?: boolean;
  /**
   * The personal score's trigger: the score plate and its cyan rim, as the
   * web's `glassPillClassName("score")`, so the user's own score never looks
   * like a plain control or a community rating (AGENTS.md section 9).
   */
  score?: boolean;
};

/**
 * The web's button variants (`components/ui/button.tsx`): `glass` the
 * default control, `selected` the committed one (the primary call to action
 * and a pressed toggle), `destructive` the glass pill in the destructive
 * colour with no shadow. Every one is plate, glass and rim
 * (prompts/mobile-web-parity-foundation.md, decision 12).
 */
const LOOK = {
  glass: { sheen: "glass", shadow: true, text: "text-foreground" },
  selected: { sheen: "selected", shadow: true, text: "text-foreground" },
  destructive: { sheen: "glass", shadow: false, text: "text-destructive" },
} as const;

/**
 * Which look each variant draws at rest. `primary` is the web's committed
 * call to action, so it takes the selected glass, the same as a pressed
 * toggle, never a solid white fill (decision 12).
 */
const LOOK_OF = {
  primary: "selected",
  glass: "glass",
  destructive: "destructive",
} as const satisfies Record<NonNullable<Props["variant"]>, keyof typeof LOOK>;

/**
 * The pill button of the shipped web UI, round and at least 44pt tall so it
 * meets the touch target rule (AGENTS.md section 3). `primary` and a pressed
 * `glass` toggle take the brighter selected glass, never a solid white fill,
 * as the web does; a press dims it the way a native control answers a touch.
 */
export function GlassButton({
  label,
  onPress,
  accessibilityLabel,
  variant = "glass",
  pressed,
  disabled,
  busy,
  icon,
  iconAfter,
  score,
}: Props) {
  const look =
    LOOK[variant === "glass" && pressed ? "selected" : LOOK_OF[variant]];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, selected: pressed }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed: touching }) => ({
        opacity: disabled ? 0.5 : touching ? 0.8 : 1,
      })}
    >
      <GlassPlate
        {...SURFACES[score ? "score" : "neutral"]}
        sheen={look.sheen}
        shadow={look.shadow}
        radius={PILL_RADIUS}
        className="min-h-11 flex-row items-center justify-center gap-2 px-5"
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={tokenColor("color-foreground")}
          />
        ) : null}
        {icon && !iconAfter ? <Decorative>{icon}</Decorative> : null}
        {/* Capped like a pill: past it the fully rounded ends would cut into
            a wrapped label (requirement 8). */}
        <Text
          maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
          className={`text-base font-semibold ${look.text}`}
        >
          {label}
        </Text>
        {icon && iconAfter ? <Decorative>{icon}</Decorative> : null}
      </GlassPlate>
    </Pressable>
  );
}

/** An icon the label already names, hidden from screen readers. */
function Decorative({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}
