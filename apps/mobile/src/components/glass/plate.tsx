import { GLASS, type TokenName } from "@bestats/core/tokens.generated";
import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import {
  fractionToken,
  lengthToken,
  tokenColor,
  tokenColorAlpha,
} from "@/theme/token-vars";

import { Rim } from "./rim";
import { SolidPlates, useFrosted } from "./use-frosted";

/**
 * The web's five plates (components/AGENTS.md, Tokens and utilities): each a
 * colour, the opacity it frosts at, and the blur that comes with it, all read
 * from the generated tokens so no number is restated here
 * (prompts/mobile-web-parity-foundation.md, requirement 3).
 */
export const PLATE_ROLES = {
  control: {
    color: "color-glass-plate",
    frost: "frost-control",
    blur: "blur-control",
  },
  panel: {
    color: "color-glass-plate-panel",
    frost: "frost-panel",
    blur: "blur-panel",
  },
  sheet: {
    color: "color-glass-plate-sheet",
    frost: "frost-sheet",
    blur: "blur-overlay",
  },
  float: {
    color: "color-glass-plate-sheet",
    frost: "frost-float",
    blur: "blur-overlay",
  },
  score: {
    color: "color-glass-plate-score",
    frost: "frost-score",
    blur: "blur-control",
  },
} as const satisfies Record<
  string,
  { color: TokenName; frost: TokenName; blur: TokenName }
>;

export type PlateRole = keyof typeof PLATE_ROLES;

/**
 * The plate and rim that travel together: a control's, and the personal
 * score's darker plate with the cyan rim, the only coloured rim, so a
 * personal score is never mistaken for a community rating (AGENTS.md
 * section 9). Spread one into `GlassPlate` rather than picking each prop.
 */
export const SURFACES = {
  neutral: { plate: "control", rim: "default" },
  score: { plate: "score", rim: "score" },
} as const satisfies Record<
  string,
  { plate: PlateRole; rim: "default" | "score" }
>;

/**
 * UIKit's blur intensity for a web blur radius. `expo-blur` takes 1 to 100
 * rather than pixels, so the web's 12, 20 and 24px map onto it by one factor,
 * tuned by eye in the simulator against the web at 375px.
 */
export const BLUR_INTENSITY_PER_PX = 4;

/**
 * A generated gradient back in CSS form, because React Native's
 * `backgroundImage` takes CSS gradients: the sheen keeps the web's exact
 * angle and stops with no second copy of them (components/AGENTS.md, Tokens
 * and utilities).
 */
export function gradientCss(gradient: {
  angle: number;
  stops: readonly { color: string; at: number }[];
}): string {
  const stops = gradient.stops
    .map((stop) => `${stop.color} ${stop.at * 100}%`)
    .join(", ");
  return `linear-gradient(${gradient.angle}deg, ${stops})`;
}

/** Each sheen's gradient in the generated copy of the web's utilities. */
const SHEENS = {
  glass: "glass",
  selected: "glass-selected",
  personal: "glass-selected-personal",
} as const;

type Props = ViewProps & {
  /** Which plate: controls and badges, panels, sheets, floating, score. */
  plate?: PlateRole;
  /**
   * The sheen over the plate: the glass gradient, the brighter selected one,
   * the personal cyan selected tab's, or none.
   */
  sheen?: "glass" | "selected" | "personal" | "none";
  /** The 1.5px gradient rim, the personal score's cyan rim, or none. */
  rim?: "default" | "score" | "none";
  /** The web's `glass-shadow`. */
  shadow?: boolean;
  /** Corner radius in points; defaults to the web's `--radius` (12pt). */
  radius?: number;
  className?: string;
  children?: ReactNode;
};

/**
 * The one owner of a glass surface in the app (prompts/mobile-web-parity-
 * foundation.md, requirement 2): plate, then glass, then rim, the web's
 * plate rule. On iOS the plate is a `BlurView` under the plate colour at its
 * frost opacity; on Android, under Reduce Transparency and inside a
 * `PlateSolid`, it is the opaque colour with no blur, the web's own fallback
 * (decision 3). The selected sheens always sit on the solid plate, as the
 * web's `glass-selected` and `glass-selected-personal` do, so their text
 * keeps 4.5:1.
 */
export function GlassPlate({
  plate: role = "control",
  sheen = "glass",
  rim = "default",
  shadow = false,
  radius = lengthToken("radius"),
  style,
  children,
  ...rest
}: Props) {
  const lit = sheen === "selected" || sheen === "personal";
  const frosted = useFrosted() && !lit;
  const plate = PLATE_ROLES[role];
  const fill = frosted
    ? tokenColorAlpha(plate.color, fractionToken(plate.frost))
    : tokenColor(plate.color);

  return (
    <View
      {...rest}
      style={[
        { borderRadius: radius, overflow: "hidden" },
        shadow ? { boxShadow: GLASS.shadow } : null,
        style,
      ]}
    >
      {frosted ? (
        <BlurView
          testID="glass-blur"
          tint="systemUltraThinMaterialDark"
          intensity={lengthToken(plate.blur) * BLUR_INTENSITY_PER_PX}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}
      />
      {sheen === "none" ? null : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundImage: gradientCss(GLASS.gradients[SHEENS[sheen]]),
            },
          ]}
        />
      )}
      {children}
      {rim === "none" ? null : <Rim radius={radius} tone={rim} />}
    </View>
  );
}

/**
 * Makes every plate inside opaque, for surfaces over artwork: a poster
 * card's badge slot, skeletons and the missing poster tile (the web's
 * `plate-solid`; components/AGENTS.md, the plate rule).
 */
export function PlateSolid({ children }: { children: ReactNode }) {
  return <SolidPlates.Provider value>{children}</SolidPlates.Provider>;
}
