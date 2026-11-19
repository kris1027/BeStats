import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { gameIdParamSchema } from "@bestats/core/api/v1/game";
import { formatAirDate } from "@bestats/core/format";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";

import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { communityRatingText } from "@/components/poster-card";
import { catalogKeys, fetchGame } from "@/lib/catalog";

import { TitleReadError } from "./title-states";

/**
 * A game's page, read only in slice 5a (prompts/mobile-app-shell-catalog.md,
 * decision 8): the public detail from `/api/v1/games/{id}`. IGDB's summary
 * and storyline are left out when IGDB has none, as on the web (spec 0031,
 * AC-11). Status, score, media and the rest arrive with slice 5b.
 */
export function GameScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = gameIdParamSchema.safeParse(params.id);
  const id = parsed.success ? parsed.data : 0;
  const game = useQuery({
    queryKey: catalogKeys.game(id),
    queryFn: () => fetchGame(id),
    enabled: parsed.success,
  });

  if (!parsed.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (game.isPending) return <LoadingState label="Loading the game" />;
  if (game.isError) {
    return <TitleReadError error={game.error} retry={() => game.refetch()} />;
  }

  const detail = game.data;
  const rating = communityRatingText("game", detail.communityRating);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-6"
    >
      <Stack.Screen options={{ title: detail.name }} />
      <DetailHeader
        title={detail.name}
        posterUrl={detail.coverUrl}
        backdropUrl={detail.artUrl}
        rating={rating}
        ratingLabel={
          detail.communityRating === null
            ? null
            : `IGDB community rating ${detail.communityRating.toFixed(1)}`
        }
        meta={[
          formatAirDate(detail.releaseDate) ??
            (detail.releaseYear ? String(detail.releaseYear) : null),
          detail.genres
            .slice(0, 3)
            .map((genre) => genre.name)
            .join(", ") || null,
        ]}
      />
      <View className="gap-5 px-4 pt-5">
        <DetailSection heading="Overview" text={detail.summary} />
        <DetailSection heading="Story" text={detail.storyline} />
        <DetailSection
          heading="Platforms"
          text={
            detail.platforms.map((platform) => platform.name).join(", ") || null
          }
        />
        <DetailSection
          heading="Developers"
          text={detail.developers.join(", ") || null}
        />
        <DetailSection
          heading="Publishers"
          text={detail.publishers.join(", ") || null}
        />
      </View>
      <CatalogNotice type="game" />
    </ScrollView>
  );
}
