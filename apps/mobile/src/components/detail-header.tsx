import {
  CATALOG_SOURCES,
  type LibraryType,
} from "@bestats/core/catalog/media-type";
import { ageRatingLabel } from "@bestats/core/catalog/where-to-watch";
import { formatVoteCount } from "@bestats/core/format";
import { Image } from "expo-image";
import { use } from "react";
import { useWindowDimensions, View } from "react-native";

import { GlassPlate, PlateSolid } from "@/components/glass/plate";
import { CommunityRatingBadge, GlassPill } from "@/components/glass-pill";
import { Text } from "@/components/text";
import { OverBackdrop, POSTER_OVERLAP } from "@/components/title-header";
import { DETAIL_POSTER_WIDTH, sizedImageUri } from "@/lib/images";
import { isAccessibilityTextSize } from "@/theme/font-scale";
import { lengthToken } from "@/theme/token-vars";

type Props = {
  title: string;
  posterUrl: string | null;
  /** The meta line parts (dates, runtime, seasons); empty parts are left out. */
  meta: (string | null)[];
  /** Every genre, drawn as labels (not controls), as the web's `GenreChips`. */
  genres: readonly { name: string }[];
  /** The catalog's status word as is; empty or null shows no pill. */
  status: string | null;
  /** Which catalog the community rating comes from (TMDB or IGDB). */
  type: LibraryType;
  /** The catalog's community rating, or null when it has none. */
  communityRating: number | null;
  /** How many votes the community rating rests on, or null when unknown. */
  voteCount: number | null;
  /**
   * The age rating for the connection's country, from the extras read; null
   * or absent while it loads, after it failed and when the country has none
   * (prompts/mobile-look-title-extras.md, decision 8).
   */
  ageRating?: { rating: string; regionName: string } | null;
};

/**
 * The hero under a title screen's backdrop (feature 29, slice 2, decisions
 * 5 and 6): the poster hangs over the backdrop's lower edge while the title,
 * meta line, genre and status pills and the community rating with its vote
 * count sit below the artwork, on the page, so no text is drawn over
 * artwork (components/AGENTS.md, the plate rule). Kept short so the tracking
 * actions under it stay within thumb reach. The community rating is the
 * amber `GlassPill` named by its catalog, never read as a personal score
 * (AGENTS.md section 9).
 */
export function DetailHeader({
  title,
  posterUrl,
  meta,
  genres,
  status,
  type,
  communityRating,
  voteCount,
  ageRating = null,
}: Props) {
  const line = meta.filter(Boolean).join(" · ");
  // `TitleScroll` says whether it drew a backdrop the poster should overlap.
  const overBackdrop = use(OverBackdrop);
  const pills = [
    ...genres.map((genre) => genre.name),
    ...(status ? [status] : []),
  ];
  // The age pill leads and shows the rating alone; VoiceOver hears which
  // country it is for, as the web's `AgeRatingChip` says it.
  const spoken = [
    ...(ageRating
      ? [`${ageRatingLabel(ageRating.regionName)}: ${ageRating.rating}`]
      : []),
    ...pills,
  ];
  // At the accessibility text sizes the text goes under the poster: beside
  // it, a column narrower than a word breaks the title mid word
  // (prompts/mobile-large-text-titles.md, decision 1, applied to the hero).
  const stacked = isAccessibilityTextSize(useWindowDimensions().fontScale);

  return (
    <View className={stacked ? "gap-4 px-4 pt-4" : "flex-row gap-4 px-4 pt-4"}>
      <View style={overBackdrop ? { marginTop: -POSTER_OVERLAP } : null}>
        {posterUrl ? (
          <Image
            source={{ uri: sizedImageUri(posterUrl, DETAIL_POSTER_WIDTH) }}
            accessibilityLabel={`${title} poster`}
            contentFit="cover"
            style={{
              width: DETAIL_POSTER_WIDTH,
              aspectRatio: 2 / 3,
              borderRadius: lengthToken("radius-lg"),
            }}
          />
        ) : (
          <PlateSolid>
            <GlassPlate
              sheen="none"
              radius={lengthToken("radius-lg")}
              accessibilityLabel="No poster"
              className="items-center justify-center"
              style={{ width: DETAIL_POSTER_WIDTH, aspectRatio: 2 / 3 }}
            >
              <Text className="px-2 text-center text-xs text-muted-foreground">
                {title}
              </Text>
            </GlassPlate>
          </PlateSolid>
        )}
      </View>
      <View className={stacked ? "gap-2" : "flex-1 gap-2"}>
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold leading-tight text-foreground"
        >
          {title}
        </Text>
        {line ? <Text className="text-text-secondary">{line}</Text> : null}
        {spoken.length > 0 ? (
          <View
            accessible
            accessibilityLabel={spoken.join(", ")}
            className="flex-row flex-wrap gap-1.5"
          >
            {ageRating ? <GlassPill>{ageRating.rating}</GlassPill> : null}
            {pills.map((pill) => (
              <GlassPill key={pill}>{pill}</GlassPill>
            ))}
          </View>
        ) : null}
        {communityRating === null ? null : (
          <View className="flex-row flex-wrap items-center gap-2">
            <CommunityRatingBadge
              source={CATALOG_SOURCES[type]}
              value={communityRating}
            />
            {voteCount ? (
              <Text className="text-sm text-muted-foreground">
                {formatVoteCount(voteCount)}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * A titled block of body text. It renders nothing when there is no text
 * rather than an empty heading, since only real metadata shows (AGENTS.md
 * section 3).
 */
export function DetailSection({
  heading,
  text,
}: {
  heading: string;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
      >
        {heading}
      </Text>
      <Text className="text-base leading-6 text-text-secondary">{text}</Text>
    </View>
  );
}
