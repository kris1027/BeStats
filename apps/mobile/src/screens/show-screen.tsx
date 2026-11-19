import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { showIdParamSchema } from "@bestats/core/api/v1/show";
import { formatAirSpan, formatEpisodeCount } from "@bestats/core/format";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { communityRatingText } from "@/components/poster-card";
import { catalogKeys, fetchShow } from "@/lib/catalog";

import { TitleReadError } from "./title-states";

/**
 * A show's page, read only in slice 5a (prompts/mobile-app-shell-catalog.md,
 * decision 8): the public detail from `/api/v1/shows/{id}`, with every
 * missing field left out rather than invented (AGENTS.md section 3). Seasons,
 * episodes, cast and tracking arrive with slice 5b.
 */
export function ShowScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = showIdParamSchema.safeParse(params.id);
  const id = parsed.success ? parsed.data : 0;
  const show = useQuery({
    queryKey: catalogKeys.show(id),
    queryFn: () => fetchShow(id),
    enabled: parsed.success,
  });

  if (!parsed.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (show.isPending) return <LoadingState label="Loading the show" />;
  if (show.isError) {
    return <TitleReadError error={show.error} retry={() => show.refetch()} />;
  }

  const detail = show.data;
  const rating = communityRatingText("tv", detail.tmdbRating);
  const regularSeasons = detail.seasons.filter((season) => !season.isSpecials);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-6"
    >
      <Stack.Screen options={{ title: detail.name }} />
      <DetailHeader
        title={detail.name}
        posterUrl={detail.posterUrl}
        backdropUrl={detail.backdropUrl}
        rating={rating}
        ratingLabel={
          detail.tmdbRating === null
            ? null
            : `TMDB rating ${detail.tmdbRating.toFixed(1)}`
        }
        meta={[
          formatAirSpan({
            firstAirYear: detail.firstAirYear,
            lastAirYear: detail.lastAirDate
              ? Number(detail.lastAirDate.slice(0, 4))
              : null,
            status: detail.status,
          }),
          detail.status || null,
          regularSeasons.length > 0
            ? `${regularSeasons.length} ${regularSeasons.length === 1 ? "season" : "seasons"}`
            : null,
          detail.numberOfEpisodes > 0
            ? formatEpisodeCount(detail.numberOfEpisodes)
            : null,
          detail.genres
            .slice(0, 3)
            .map((genre) => genre.name)
            .join(", ") || null,
        ]}
      />
      <View className="gap-5 px-4 pt-5">
        <DetailSection heading="Overview" text={detail.overview} />
        <DetailSection
          heading="Created by"
          text={detail.createdBy.join(", ") || null}
        />
      </View>
      <CatalogNotice type="tv" />
    </ScrollView>
  );
}
