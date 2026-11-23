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
import {
  applyTrackingIntent,
  movieTrackingAvailability,
  type TrackingIntent,
} from "@bestats/core/tracking/intent";
import {
  MOVIE_CLEARED_MESSAGES,
  MOVIE_OVERVIEW_MISSING,
  MOVIE_TRACKING_LABELS,
  TRACKING_MESSAGES,
} from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { CastRow } from "@/components/cast-row";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import { ScoreSheet } from "@/components/score-sheet";
import { Text } from "@/components/text";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys } from "@/lib/catalog";
import { fetchMovie, restoreMovie, writeMovieIntent } from "@/lib/movies";
import { useSession } from "@/lib/session";
import {
  fetchTitleState,
  trackingKeys,
  useTrackingWrite,
  useUndoToast,
} from "@/lib/tracking";

import { TitleReadError } from "./title-states";

/**
 * A movie's page (prompts/mobile-title-tracking.md, decision 5): the catalog
 * detail from `/api/v1/movies/{id}` in the look of the shipped movie page,
 * the three tracking pills, Directed by, and the cast row. TMDB's score is
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

  if (!parsedId.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (movie.isPending) return <LoadingState label="Loading the movie" />;
  if (movie.isError) {
    return <TitleReadError error={movie.error} retry={() => movie.refetch()} />;
  }

  const detail = movie.data;
  return (
    <ScrollView className="flex-1" contentContainerClassName="pb-24">
      <Stack.Screen options={{ title: detail.title }} />
      <DetailHeader
        title={detail.title}
        posterUrl={detail.posterUrl}
        backdropUrl={detail.backdropUrl}
        type="movie"
        communityRating={detail.tmdbRating}
        meta={[
          formatAirDate(detail.releaseDate) ??
            (detail.releaseYear ? String(detail.releaseYear) : null),
          detail.runtimeMinutes ? formatRuntime(detail.runtimeMinutes) : null,
          detail.genres
            .map((genre) => genre.name)
            .slice(0, 3)
            .join(", ") || null,
        ]}
      />
      <View className="gap-5 px-4 pt-5">
        <TrackingGate signedIn={session !== null} state={state}>
          {(data) => <MovieTracking movie={detail} state={data} />}
        </TrackingGate>
        {detail.tagline ? (
          <Text className="italic text-text-secondary">{detail.tagline}</Text>
        ) : null}
        {detail.overview ? (
          <Text className="text-base leading-6 text-foreground">
            {detail.overview}
          </Text>
        ) : (
          <Text className="text-text-secondary">{MOVIE_OVERVIEW_MISSING}</Text>
        )}
        <DetailSection
          heading="Directed by"
          text={detail.directors.join(", ") || null}
        />
      </View>
      <View className="pt-6">
        <CastRow
          cast={detail.cast}
          emptyMessage="TMDB lists no cast for this movie."
        />
      </View>
      <CatalogNotice type="movie" />
    </ScrollView>
  );
}

/** What a write that removed a watch mark returned, for its Undo. */
type MovieCleared = { watchedAt: string; rating: number | null };

/** Movie writes carry their intent, so the optimistic state is core's. */
type MovieWrite = TrackingIntent & { clears?: "planned" | "unwatched" };

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
  const key = trackingKeys.title("movie", id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const offerUndo = useUndoToast();

  const released = isMovieReleased(movie.releaseDate, todayUtc(new Date()));
  const releaseNote = released ? null : movieReleaseNote(movie.releaseDate);
  const watched = state.watchedAt !== null;

  const control = `movie-${id}`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (current: V1MovieTitleState, cleared: MovieCleared) =>
      applyMovieIntents(current, [
        { kind: "watched", value: true },
        { kind: "rating", value: cleared.rating },
      ]),
    write: (cleared: MovieCleared) =>
      restoreMovie({ kind: "movie_watched", movieId: id, ...cleared }),
    failure: TRACKING_MESSAGES.write_failed,
    expired: MOVIE_CLEARED_MESSAGES.undoExpired,
  });

  const write = useTrackingWrite({
    stateKey: key,
    control: (intent: MovieWrite) => `${control}-${intent.kind}`,
    apply: (current: V1MovieTitleState, intent: MovieWrite) =>
      applyMovieIntents(current, [intent]),
    write: (intent: MovieWrite) => writeMovieIntent(id, intent),
    failure: TRACKING_MESSAGES.write_failed,
    onFailure: () => setSheetOpen(false),
    onSuccess: (result, intent) => {
      const cleared = result.cleared;
      if (!cleared || !intent.clears) return;
      const message =
        intent.clears === "planned"
          ? MOVIE_CLEARED_MESSAGES.planned(cleared.rating !== null)
          : cleared.rating === null
            ? null
            : MOVIE_CLEARED_MESSAGES.unwatched;
      if (message === null) return;
      offerUndo(message, `${control}-${intent.kind}`, (done) =>
        restore.mutate(cleared, { onSettled: done }),
      );
    },
  });

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

/**
 * Core's plan, mark and score rule over the v1 movie state. Only the
 * timestamp is the app's own: a new mark shows now until the server's answer
 * replaces it (apps/mobile/AGENTS.md, BeStats rules).
 */
function applyMovieIntents(
  current: V1MovieTitleState,
  intents: readonly TrackingIntent[],
): V1MovieTitleState {
  const next = intents.reduce(applyTrackingIntent, {
    inWatchlist: current.planned,
    watched: current.watchedAt !== null,
    rating: current.rating,
  });
  return {
    planned: next.inWatchlist,
    watchedAt: next.watched
      ? (current.watchedAt ?? new Date().toISOString())
      : null,
    rating: next.rating,
  };
}
