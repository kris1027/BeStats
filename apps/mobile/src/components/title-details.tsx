import type { V1Movie } from "@bestats/core/api/v1/movie";
import type { V1Show } from "@bestats/core/api/v1/show";
import {
  formatAirDate,
  formatUsdCompact,
  languageName,
} from "@bestats/core/format";
import { View } from "react-native";

import { GlassPlate } from "@/components/glass/plate";
import { Text } from "@/components/text";
import { lengthToken } from "@/theme/token-vars";

type CrewLine = { label: string; names: readonly string[] };

/**
 * The key crew under the overview, the web's `CrewLines` (spec 0022,
 * AC-15): each line only when it has a name, nothing when none does, since
 * the app shows only real metadata (AGENTS.md sections 3 and 14). A line
 * reads as one sentence to VoiceOver, "Directed by Denis Villeneuve".
 */
export function CrewLines({ lines }: { lines: readonly CrewLine[] }) {
  const shown = lines.filter((line) => line.names.length > 0);
  if (shown.length === 0) return null;
  return (
    <View className="gap-1">
      {shown.map((line) => (
        <Text key={line.label} className="text-[15px] text-muted-foreground">
          {line.label}{" "}
          <Text className="font-semibold text-foreground">
            {line.names.join(", ")}
          </Text>
        </Text>
      ))}
    </View>
  );
}

/**
 * A title's overview as body text under the actions, or the `missing` line
 * when the catalog has none and the screen names that, so no title shows an
 * empty block or invented text (AGENTS.md sections 3 and 14).
 */
export function Overview({
  text,
  missing,
}: {
  text: string | null;
  missing?: string;
}) {
  if (text) {
    return <Text className="text-base leading-6 text-foreground">{text}</Text>;
  }
  return missing ? (
    <Text className="text-text-secondary">{missing}</Text>
  ) : null;
}

export type Fact = { label: string; value: string };

/**
 * A fact with a text value, or null when there is none, so an empty catalog
 * value is left out rather than shown as blank (AGENTS.md section 14).
 */
export function textFact(label: string, value: string | null): Fact | null {
  return value === null || value === "" ? null : { label, value };
}

/** Company or network names joined, or null when TMDB lists none. */
function namesFact(
  label: string,
  companies: readonly { name: string }[],
): Fact | null {
  return companies.length === 0
    ? null
    : { label, value: companies.map((company) => company.name).join(", ") };
}

/**
 * The Facts panel at the end of a title screen, the web's `FactsPanel`
 * (spec 0022, AC-16) on one glass panel: labelled values, each only when
 * the catalog has one, never Unknown or 0, and no panel at all when none
 * has a value (AGENTS.md section 14).
 */
export function FactsPanel({ facts }: { facts: ReadonlyArray<Fact | null> }) {
  const shown = facts.filter((fact): fact is Fact => fact !== null);
  if (shown.length === 0) return null;
  return (
    <View className="gap-3 px-4">
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
      >
        Facts
      </Text>
      <GlassPlate
        plate="panel"
        radius={lengthToken("radius-panel")}
        className="gap-4 p-4"
      >
        {shown.map((fact) => (
          <View
            key={fact.label}
            accessible
            accessibilityLabel={`${fact.label}: ${fact.value}`}
            className="gap-1"
          >
            <Text className="text-sm text-muted-foreground">{fact.label}</Text>
            <Text className="text-[15px] text-foreground">{fact.value}</Text>
          </View>
        ))}
      </GlassPlate>
    </View>
  );
}

/**
 * A movie's facts, as the web's `MovieFacts`, from the v1 movie read, so both
 * apps list the same facts in the same order (AGENTS.md section 3); a value
 * the catalog lacks is dropped, never invented (section 14).
 */
export function movieFacts(movie: V1Movie): Array<Fact | null> {
  return [
    textFact("Status", movie.status),
    movie.originalTitle !== movie.title
      ? textFact("Original title", movie.originalTitle)
      : null,
    textFact("Original language", languageName(movie.originalLanguage)),
    movie.budget === null
      ? null
      : { label: "Budget", value: formatUsdCompact(movie.budget) },
    movie.revenue === null
      ? null
      : { label: "Revenue", value: formatUsdCompact(movie.revenue) },
    namesFact("Production companies", movie.productionCompanies),
  ];
}

/**
 * A show's facts, as the web's `ShowFacts`. Networks are names only: the
 * web's logo tiles are left out (prompts/mobile-look-title-pages.md,
 * decision 7). Same order as the web (AGENTS.md section 3); air dates are
 * UTC days (section 9).
 */
export function showFacts(show: V1Show): Array<Fact | null> {
  return [
    textFact("Status", show.status),
    textFact("Type", show.type),
    textFact("Original language", languageName(show.originalLanguage)),
    namesFact("Networks", show.networks),
    namesFact("Production companies", show.productionCompanies),
    textFact("First aired", formatAirDate(show.firstAirDate)),
    textFact("Last aired", formatAirDate(show.lastAirDate)),
  ];
}
