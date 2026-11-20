import type { V1Season } from "@bestats/core/api/v1/show";
import { formatAirDate, formatRuntime } from "@bestats/core/format";
import { SEASON_PAGE_COPY } from "@bestats/core/tracking/messages";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { sizedImageUri } from "@/lib/images";

import { communityRatingLabel, communityRatingText } from "./poster-card";

const STILL_WIDTH = 120;

/** One episode as the v1 season answer carries it. */
export type SeasonEpisodeDetail = V1Season["episodes"][number];

/**
 * One episode as the web's episode row reads (spec 0011, AC-1): the still,
 * or a plate with the number when TMDB has none, the number and name, the UTC
 * air date or "Air date not announced", runtime and TMDB's rating labelled
 * TMDB (AGENTS.md sections 3 and 9), then the row's controls. Only real
 * metadata shows: an unnamed episode is called by its number.
 */
export function EpisodeRow({
  episode,
  children,
}: {
  episode: SeasonEpisodeDetail;
  children?: ReactNode;
}) {
  const airDate = formatAirDate(episode.airDate);
  const label = SEASON_PAGE_COPY.episodeName(
    episode.name,
    episode.episodeNumber,
  );
  const rating = communityRatingText("tv", episode.tmdbRating);
  return (
    <View className="gap-3 rounded-2xl border border-border bg-glass-plate p-3">
      <View className="flex-row gap-3">
        {episode.stillUrl ? (
          <Image
            source={{ uri: sizedImageUri(episode.stillUrl, STILL_WIDTH) }}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            style={{ width: STILL_WIDTH, aspectRatio: 16 / 9, borderRadius: 8 }}
          />
        ) : (
          <View
            className="items-center justify-center rounded-lg border border-border bg-card"
            style={{ width: STILL_WIDTH, aspectRatio: 16 / 9 }}
          >
            <Text className="text-xs text-muted-foreground">
              E{episode.episodeNumber}
            </Text>
          </View>
        )}
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground">
            {episode.episodeNumber}. {label}
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
          {rating ? (
            <Text
              accessibilityLabel={
                communityRatingLabel("tv", episode.tmdbRating) ?? undefined
              }
              className="text-sm font-semibold text-rating-tmdb"
            >
              {rating}
            </Text>
          ) : null}
        </View>
      </View>
      {episode.overview ? (
        <Text numberOfLines={3} className="text-sm text-text-secondary">
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
      className="flex-1 gap-5 bg-background px-4 pt-4"
    >
      <View className="gap-2">
        <View className="h-4 w-32 rounded bg-card" />
        <View className="h-7 w-48 rounded bg-card" />
      </View>
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          className="flex-row gap-3 rounded-2xl border border-border bg-glass-plate p-3"
        >
          <View
            className="rounded-lg bg-card"
            style={{ width: STILL_WIDTH, aspectRatio: 16 / 9 }}
          />
          <View className="flex-1 gap-2">
            <View className="h-4 w-3/4 rounded bg-card" />
            <View className="h-3 w-1/2 rounded bg-card" />
          </View>
        </View>
      ))}
    </View>
  );
}
