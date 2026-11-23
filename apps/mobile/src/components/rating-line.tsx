import { formatCalculatedRating } from "@bestats/core/format";
import { View } from "react-native";
import { Text } from "@/components/text";

import { RatingStar } from "./glass-pill";

/**
 * "1 rated episode", "5 rated seasons", as the web words it: the basis a
 * calculated rating rests on, so a mean is never read as a single score
 * (AGENTS.md section 9).
 */
export function ratedCount(count: number, noun: "episode" | "season"): string {
  return `${count} rated ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * A calculated season or show rating with its visible label and what it
 * rests on, as the web's `CalculatedRatingLine` reads: "Your season rating
 * 7.4 from 5 rated episodes". One decimal for display only, "Not rated" when
 * nothing is rated, never 0, and the personal colour, so it is never taken
 * for TMDB's rating (AGENTS.md section 9).
 */
export function RatingLine({
  label,
  value,
  basis,
}: {
  label: string;
  value: number | null;
  basis: string | null;
}) {
  const shown = formatCalculatedRating(value);
  return (
    <View
      accessible
      accessibilityLabel={[label, shown, basis].filter(Boolean).join(" ")}
      className="flex-row flex-wrap items-center gap-2"
    >
      <Text className="text-sm text-text-secondary">{label}</Text>
      {value === null ? (
        <Text className="text-sm font-semibold text-text-secondary">
          {shown}
        </Text>
      ) : (
        <View className="flex-row items-center gap-1">
          <RatingStar tone="personal" />
          <Text className="text-sm font-semibold text-score-personal">
            {shown}
          </Text>
        </View>
      )}
      {basis ? (
        <Text className="text-sm text-text-secondary">{basis}</Text>
      ) : null}
    </View>
  );
}
