import { formatCalculatedRating } from "@bestats/core/format";
import { Text, View } from "react-native";

/** "1 rated episode", "5 rated seasons", as the web words it. */
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
      <Text
        className={`text-sm font-semibold ${
          value === null ? "text-text-secondary" : "text-score-personal"
        }`}
      >
        {value === null ? shown : `★ ${shown}`}
      </Text>
      {basis ? (
        <Text className="text-sm text-text-secondary">{basis}</Text>
      ) : null}
    </View>
  );
}
