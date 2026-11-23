import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { tokenColor } from "@/theme/token-vars";

/**
 * The web's tracking marks (`apps/web/components/tracking/tracking-icons.tsx`),
 * path for path in their own `viewBox`, so a bookmark or check reads the same
 * on both (prompts/mobile-web-parity-foundation.md, decision 9). Colours come
 * from the tokens. All are decorative: the control around each carries the
 * name, so each is hidden from screen readers.
 */

type IconProps = { size?: number };

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** Plan: the outline bookmark. */
export function PlanIcon({ size = 14 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="865.5 52.5 21 27"
      fill="none"
      {...HIDDEN}
    >
      <Path
        d="M869 54H883A2 2 0 0 1 885 56V77A1 1 0 0 1 883.5 77.8L876 73.5L868.5 77.8A1 1 0 0 1 867 77V56A2 2 0 0 1 869 54Z"
        stroke={tokenColor("color-foreground")}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Planned: the green filled bookmark with its dark check. */
export function PlannedIcon({ size = 14 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="643.5 52.5 21 27"
      fill="none"
      {...HIDDEN}
    >
      <Path
        d="M647 54H661A2 2 0 0 1 663 56V79L654 73L645 79V56A2 2 0 0 1 647 54Z"
        fill={tokenColor("color-status-planned")}
      />
      <Path
        d="m649.5 63.5 3 3 5-5"
        stroke={tokenColor("color-status-planned-mark")}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Watched and not watched: a circle check, outlined or filled near white. It
 * uses none of the three meaning colours, as on the web.
 */
export function WatchedIcon({
  filled,
  size = 14,
}: IconProps & { filled: boolean }) {
  const foreground = tokenColor("color-foreground");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...HIDDEN}>
      <Circle
        cx={12}
        cy={12}
        r={10}
        strokeWidth={2.5}
        stroke={foreground}
        fill={filled ? foreground : "none"}
      />
      <Path
        d="m8 12 3 3 5-5"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke={filled ? tokenColor("color-background") : foreground}
      />
    </Svg>
  );
}

/** Next episode: a television, in the legend grey. */
export function NextEpisodeIcon({ size = 14 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="-11 -12 22 22"
      fill="none"
      {...HIDDEN}
    >
      <G
        stroke={tokenColor("color-muted-foreground")}
        strokeWidth={1.8}
        strokeLinecap="round"
      >
        <Rect x={-9} y={-6} width={18} height={14} rx={2} />
        <Path d="m-4-11 4 5 4-5" />
      </G>
    </Svg>
  );
}

/** Release date: a calendar, in the same grey. */
export function CalendarIcon({ size = 14 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="-11 -12 22 23"
      fill="none"
      {...HIDDEN}
    >
      <G
        stroke={tokenColor("color-muted-foreground")}
        strokeWidth={1.8}
        strokeLinecap="round"
      >
        <Rect x={-9} y={-8} width={18} height={18} rx={2} />
        <Path d="M-9-2H9M-4-11V-5M4-11V-5" />
        <Path
          d="M-4 2h.1M1 2h.1M5 2h.1M-4 6h.1M1 6h.1M5 6h.1"
          strokeWidth={2.5}
        />
      </G>
    </Svg>
  );
}
