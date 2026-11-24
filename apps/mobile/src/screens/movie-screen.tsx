import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { movieIdParamSchema, type V1Movie } from "@bestats/core/api/v1/movie";
import type { V1MovieTitleState } from "@bestats/core/api/v1/titles";
import {
  isMovieReleased,
  movieReleaseNote,
} from "@bestats/core/catalog/movie-page";
import {
  formatAirDate,
  formatPersonalScore,
  formatRuntime,
} from "@bestats/core/format";
import { movieTrackingAvailability } from "@bestats/core/tracking/intent";
import {
  MOVIE_OVERVIEW_MISSING,
  MOVIE_TRACKING_LABELS,
} from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CastRow } from "@/components/cast-row";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader } from "@/components/detail-header";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import { ScoreSheet } from "@/components/score-sheet";
import { Text } from "@/components/text";
import {
  CrewLines,
  FactsPanel,
  movieFacts,
  Overview,
} from "@/components/title-details";
import {
  ageRatingOf,
  MoreLikeThisSlot,
  TrailerButton,
  WhereToWatch,
} from "@/components/title-extras";
import { TitleScroll } from "@/components/title-header";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchTitleExtras } from "@/lib/catalog";
import { fetchMovie } from "@/lib/movies";
import { useSession } from "@/lib/session";
import { useMovieWrite } from "@/lib/title-writes";
import { fetchTitleState, trackingKeys } from "@/lib/tracking";

import { TitleReadError } from "./title-states";

/**
 * A movie's page (prompts/mobile-title-tracking.md, decision 5): the catalog
 * detail from `/api/v1/movies/{id}` in the look of the shipped movie page,
 * the three tracking pills, the crew lines, the cast row and Facts, under
 * the stretchy backdrop header (prompts/mobile-look-title-pages.md). The trailer, age pill,
 * Where to watch and More like this come from the extras read
 * (prompts/mobile-look-title-extras.md). TMDB's score is
 * labelled TMDB, apart from the user's own score (AGENTS.md section 9).
 */
export function MovieScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsedId = movieIdParamSchema.safeParse(params.id);
  const id = parsedId.success ? parsedId.data : 0;
  const { session } = useSession();

  const movie = useQuery({
    queryKey: catalogKeys.movie(id),
    queryFn: () => fetchMovie(id),
    enabled: parsedId.success,
  });
  const state = useQuery({
    queryKey: trackingKeys.title("movie", id),
    queryFn: () => fetchTitleState("movie", id),
    enabled: parsedId.success && session !== null,
  });
  // Its own query, so slow or failed extras never hold up the movie
  // (prompts/mobile-look-title-extras.md, decision 5).
  const extras = useQuery({
    queryKey: catalogKeys.extras("movie", id),
    queryFn: () => fetchTitleExtras("movie", id),
    enabled: parsedId.success,
  });

  if (!parsedId.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (movie.isPending) {
    return <LoadingState label="Loading the movie" layout="title" />;
  }
  if (movie.isError) {
    return <TitleReadError error={movie.error} retry={() => movie.refetch()} />;
  }

  const detail = movie.data;
  return (
    <TitleScroll title={detail.title} backdropUrl={detail.backdropUrl}>
      <DetailHeader
        title={detail.title}
        posterUrl={detail.posterUrl}
        type="movie"
        communityRating={detail.tmdbRating}
        voteCount={detail.tmdbVoteCount}
        genres={detail.genres}
        status={detail.status}
        ageRating={ageRatingOf(extras.data)}
        meta={[
          formatAirDate(detail.releaseDate) ??
            (detail.releaseYear ? String(detail.releaseYear) : null),
          detail.runtimeMinutes ? formatRuntime(detail.runtimeMinutes) : null,
        ]}
      />
      <View className="gap-5 px-4 pt-5">
        <TrailerButton trailer={extras.data?.trailer} title={detail.title} />
        <TrackingGate signedIn={session !== null} state={state}>
          {(data) => <MovieTracking movie={detail} state={data} />}
        </TrackingGate>
        {detail.tagline ? (
          <Text className="italic text-text-secondary">{detail.tagline}</Text>
        ) : null}
        <Overview text={detail.overview} missing={MOVIE_OVERVIEW_MISSING} />
        <CrewLines
          lines={[
            { label: "Directed by", names: detail.directors },
            { label: "Written by", names: detail.writers },
          ]}
        />
      </View>
      <View className="pt-6">
        <WhereToWatch read={extras} />
      </View>
      <View className="pt-6">
        <CastRow
          cast={detail.cast}
          emptyMessage="TMDB lists no cast for this movie."
        />
      </View>
      <MoreLikeThisSlot read={extras} type="movie" />
      <View className="pt-6">
        <FactsPanel facts={movieFacts(detail)} />
      </View>
      <CatalogNotice type="movie" />
    </TitleScroll>
  );
}

/**
 * Plan, Mark watched and Your score, as the web's `MovieTrackingControls`
 * (spec 0007, AC-1): a movie is planned or watched, never both, and a score
 * needs a watch mark, so the score pill shows only on a watched movie and
 * Mark watched opens its sheet at once. A write that removed a watch mark
 * offers Undo, which brings the mark back with its score
 * (prompts/movie-plan-watched-exclusive.md).
 *
 * Before release only Plan works unless a mark or score is stored, which can
 * then be removed but not added (prompts/movie-release-gate.md); the server's
 * gate stays the authority (spec 0033, AC-6). Every toggle reads its target
 * from the cached state, which already holds any pending tap, so a double tap
 * sends true then false.
 */
function MovieTracking({
  movie,
  state,
}: {
  movie: V1Movie;
  state: V1MovieTitleState;
}) {
  const id = movie.id;
  const [sheetOpen, setSheetOpen] = useState(false);
  const write = useMovieWrite(id, () => setSheetOpen(false));

  const released = isMovieReleased(movie.releaseDate, todayUtc(new Date()));
  const releaseNote = released ? null : movieReleaseNote(movie.releaseDate);
  const watched = state.watchedAt !== null;

  const { canMark, planOnly } = movieTrackingAvailability(released, {
    watched,
    rating: state.rating,
  });

  const planPill = (
    <GlassButton
      label={
        state.planned
          ? MOVIE_TRACKING_LABELS.planned
          : MOVIE_TRACKING_LABELS.plan
      }
      accessibilityLabel={`Plan ${movie.title}`}
      pressed={state.planned}
      onPress={() =>
        write.mutate({
          kind: "watchlist",
          value: !state.planned,
          clears: "planned",
        })
      }
    />
  );

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        {planPill}
        {planOnly ? null : (
          <GlassButton
            label={
              watched
                ? MOVIE_TRACKING_LABELS.watched
                : MOVIE_TRACKING_LABELS.markWatched
            }
            accessibilityLabel={`Mark ${movie.title} watched`}
            pressed={watched}
            disabled={!canMark}
            onPress={() => {
              const value = !watched;
              if (value) setSheetOpen(true);
              write.mutate({
                kind: "watched",
                value,
                clears: value ? undefined : "unwatched",
              });
            }}
          />
        )}
        {watched ? (
          <GlassButton
            label={formatPersonalScore(state.rating)}
            score
            icon={<RatingStar tone="personal" />}
            accessibilityLabel={`Your score for ${movie.title}: ${formatPersonalScore(state.rating)}`}
            onPress={() => setSheetOpen(true)}
          />
        ) : null}
      </View>
      {releaseNote ? (
        <Text className="text-sm text-text-secondary">{releaseNote}</Text>
      ) : null}
      <ScoreSheet
        visible={sheetOpen && watched}
        title={movie.title}
        rating={state.rating}
        unavailableNote={releaseNote}
        onClose={() => setSheetOpen(false)}
        onPick={(value) => {
          setSheetOpen(false);
          write.mutate({ kind: "rating", value });
        }}
        onClear={() => {
          setSheetOpen(false);
          write.mutate({ kind: "rating", value: null });
        }}
      />
    </View>
  );
}
