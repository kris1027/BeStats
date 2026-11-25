import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, type ViewProps } from "react-native";

import { useReduceTransparency } from "@/lib/reduce-transparency";
import { PILL_RADIUS } from "@/theme/pill";

import { GlassPlate } from "./plate";

/**
 * Whether this phone draws Apple's Liquid Glass: iOS 26 or later with the
 * API present, and never under Reduce Transparency, which
 * `isLiquidGlassAvailable` does not check (prompts/mobile-media-switch-glass.md,
 * decision 7). Read once per render; the setting itself is followed live.
 */
export function useLiquidGlass(): boolean {
  const reduced = useReduceTransparency();
  return (
    Platform.OS === "ios" &&
    !reduced &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable()
  );
}

type Props = Pick<
  ViewProps,
  "accessibilityRole" | "onLayout" | "style" | "testID"
> & {
  children?: ReactNode;
};

/**
 * A fully rounded floating bar in the native tab bar's material: Liquid
 * Glass where the phone has it, interactive like the system bar, and the
 * app's `GlassPlate` with its rim and shadow everywhere else, so the layout
 * never changes, only the material (prompts/mobile-media-switch-glass.md,
 * decisions 2 and 7). The one importer of `expo-glass-effect`
 * (`ui-boundary.test.ts`); keep its parents at full opacity, since glass
 * under a translucent parent stops drawing.
 */
export function LiquidBar({ style, children, ...rest }: Props) {
  const liquid = useLiquidGlass();
  if (liquid) {
    return (
      <GlassView
        {...rest}
        testID={rest.testID ?? "liquid-glass"}
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive
        style={[{ borderRadius: PILL_RADIUS, overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <GlassPlate {...rest} shadow radius={PILL_RADIUS} style={style}>
      {children}
    </GlassPlate>
  );
}
