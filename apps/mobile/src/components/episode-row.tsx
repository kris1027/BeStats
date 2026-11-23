import type { V1Season } from "@bestats/core/api/v1/show";
import { formatAirDate, formatRuntime } from "@bestats/core/format";
import { SEASON_PAGE_COPY } from "@bestats/core/tracking/messages";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";

import { FilmIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { sizedImageUri } from "@/lib/images";
import { lengthToken, tokenColor } from "@/theme/token-vars";

import { GlassPlate, PlateSolid } from "./glass/plate";
import { Rim } from "./glass/rim";
import { CommunityRatingBadge } from "./glass-pill";
import { Skeleton } from "./skeleton";

/** The season poster's width in the season header and its skeleton. */
export const SEASON_POSTER_WIDTH = 96;

/** Stills are drawn full width, so they are requested at the window's width. */
const STILL_RATIO = 16 / 9;

/** One episode as the v1 season answer carries it. */
export type SeasonEpisodeDetail = V1Season["episodes"][number];

/**
 * One episode as the web's episode row reads (spec 0011, AC-1), in a phone
 * layout (feature 29, slice 2, decision 9): the still full width with the
 * image rim, or the film tile when TMDB has none; the `S1 · E3` kicker, the
 * bold name, the UTC air date or "Air date not announced" with the runtime,
 * TMDB's rating labelled TMDB (AGENTS.md sections 3 and 9), three lines of
 * overview, then the row's controls. No plate of its own: rows sit on the
 * page, as the web's do. An unnamed episode is called by its number.
 */
export function EpisodeRow({
  episode,
  children,
}: {
  episode: SeasonEpisodeDetail;
  children?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const airDate = formatAirDate(episode.airDate);
  const label = SEASON_PAGE_COPY.episodeName(
    episode.name,
    episode.episodeNumber,
  );
  const radius = lengthToken("radius-lg");
  return (
    <View className="gap-3 py-4">
      <View style={{ aspectRatio: STILL_RATIO, borderRadius: radius }}>
        {episode.stillUrl ? (
          <Image
            source={{ uri: sizedImageUri(episode.stillUrl, width) }}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            style={{ flex: 1, borderRadius: radius }}
          />
        ) : (
          <PlateSolid>
            <GlassPlate
              sheen="none"
              rim="none"
              radius={radius}
              className="flex-1 items-center justify-center"
            >
              <FilmIcon
                size={32}
                color={tokenColor("color-muted-foreground")}
              />
            </GlassPlate>
          </PlateSolid>
        )}
        <Rim radius={radius} />
      </View>
      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          S{episode.seasonNumber} · E{episode.episodeNumber}
        </Text>
        <Text
          accessibilityRole="header"
          className="text-lg font-bold leading-snug text-foreground"
        >
          {label}
        </Text>
        <Text className="text-sm text-text-secondary">
          {[
            airDate ?? SEASON_PAGE_COPY.airDateMissing,
            episode.runtimeMinutes !== null
              ? formatRuntime(episode.runtimeMinutes)
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <CommunityRatingBadge source="TMDB" value={episode.tmdbRating} />
      </View>
      {episode.overview ? (
        <Text
          numberOfLines={3}
          className="text-[15px] leading-6 text-text-secondary"
        >
          {episode.overview}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * The season screen while its read is in flight: the header and three rows
 * in the shape the page will take, so nothing jumps when it lands
 * (prompts/mobile-title-tracking.md, decision 7). Screen readers hear one
 * label for the whole wait, never silence (AGENTS.md section 3).
 */
export function SeasonSkeleton({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      className="flex-1 gap-5 px-4 pt-4"
    >
      <View className="flex-row gap-4">
        <Skeleton shape="poster" style={{ width: SEASON_POSTER_WIDTH }} />
        <View className="flex-1 gap-2 pt-1">
          <Skeleton shape="line" style={{ width: "50%" }} />
          <Skeleton shape="line" style={{ width: "70%", height: 24 }} />
        </View>
      </View>
      {[0, 1].map((row) => (
        <View key={row} className="gap-3">
          <Skeleton
            shape="line"
            style={{ aspectRatio: STILL_RATIO, height: undefined }}
          />
          <Skeleton shape="line" style={{ width: "60%" }} />
          <Skeleton shape="line" style={{ width: "40%" }} />
        </View>
      ))}
    </View>
  );
}
