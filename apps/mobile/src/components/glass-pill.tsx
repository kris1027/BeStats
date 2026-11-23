import {
  formatCalculatedRating,
  formatPersonalScore,
} from "@bestats/core/format";
import { StarIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { tokenColor } from "@/theme/token-vars";

import { GlassPlate } from "./glass/plate";
import { Text } from "./text";

/**
 * Pill labels sit in a fixed 28pt shell, so Dynamic Type may grow them only
 * this far before they would clip (prompts/mobile-web-parity-foundation.md,
 * requirement 8).
 */
export const PILL_FONT_SCALE_CAP = 1.4;

type PillProps = {
  icon?: ReactNode;
  /**
   * `score` is the personal rating look: its own darker plate and the cyan
   * rim, the only coloured rim, so a personal score is never mistaken for a
   * community rating (AGENTS.md section 9).
   */
  tone?: "neutral" | "score";
  /** What a screen reader hears for the whole pill. */
  accessibilityLabel?: string;
  children: ReactNode;
};

/**
 * The web's `GlassPill`: plate, glass and rim, fully rounded, bold 13pt text,
 * 28pt tall, with the web's shadow. One component, so the badges on every
 * screen keep the same shape (components/AGENTS.md, a new badge reuses
 * `GlassPill`).
 */
export function GlassPill({
  icon,
  tone = "neutral",
  accessibilityLabel,
  children,
}: PillProps) {
  return (
    <GlassPlate
      plate={tone === "score" ? "score" : "control"}
      rim={tone === "score" ? "score" : "default"}
      shadow
      radius={999}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      className="h-7 max-w-full flex-row items-center gap-1.5 self-start px-2.5"
    >
      {icon ? <View className="shrink-0">{icon}</View> : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={PILL_FONT_SCALE_CAP}
        className="text-[13px] leading-none font-bold text-foreground"
      >
        {children}
      </Text>
    </GlassPlate>
  );
}

/** The filled star a rating pill leads with, amber or cyan by whose it is. */
export function RatingStar({ tone }: { tone: "community" | "personal" }) {
  const color = tokenColor(
    tone === "community" ? "color-rating-tmdb" : "color-score-personal",
  );
  return <StarIcon size={14} color={color} fill={color} />;
}

/**
 * A community rating in amber, named by its catalog for screen readers
 * ("TMDB rating 7.4", "IGDB community rating 81.0"), as the web's
 * `TmdbRatingBadge` and `IgdbRatingBadge`. Renders nothing with no rating:
 * absent is not zero (AGENTS.md section 3).
 */
export function CommunityRatingBadge({
  source,
  value,
}: {
  source: "TMDB" | "IGDB";
  value: number | null;
}) {
  if (value === null) return null;
  const noun = source === "IGDB" ? "community rating" : "rating";
  return (
    <GlassPill
      icon={<RatingStar tone="community" />}
      accessibilityLabel={`${source} ${noun} ${value.toFixed(1)}`}
    >
      {value.toFixed(1)}
    </GlassPill>
  );
}

/**
 * The user's own score in cyan on the score plate. It still renders with no
 * score, as "Not rated", since that is a state the user can act on.
 */
export function PersonalScoreBadge({ value }: { value: number | null }) {
  const text = formatPersonalScore(value);
  return (
    <GlassPill
      tone="score"
      icon={<RatingStar tone="personal" />}
      accessibilityLabel={`Your score ${text}`}
    >
      {text}
    </GlassPill>
  );
}

/**
 * A calculated season or show rating, cyan because it is still the user's,
 * always to one decimal (AGENTS.md section 9). `label` names it for screen
 * readers where no visible label does.
 */
export function CalculatedRatingBadge({
  value,
  label,
}: {
  value: number | null;
  label?: string;
}) {
  const text = formatCalculatedRating(value);
  return (
    <GlassPill
      tone="score"
      icon={<RatingStar tone="personal" />}
      accessibilityLabel={label ? `${label} ${text}` : text}
    >
      {text}
    </GlassPill>
  );
}
