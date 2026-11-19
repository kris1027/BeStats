import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { movieIdParamSchema } from "@bestats/core/api/v1/movie";
import {
  isMovieReleased,
  movieReleaseNote,
} from "@bestats/core/catalog/movie-page";
import { formatAirDate, formatRuntime } from "@bestats/core/format";
import { TMDB_ATTRIBUTION } from "@bestats/core/legal/attribution";
import { applyTrackingIntent } from "@bestats/core/tracking/intent";
import {
  MOVIE_CLEARED_MESSAGES,
  MOVIE_OVERVIEW_MISSING,
  TRACKING_MESSAGES,
  TRACKING_READ_FAILED,
} from "@bestats/core/tracking/messages";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { GlassButton } from "@/components/glass-button";
import { Notice } from "@/components/notice";
import { ApiError } from "@/lib/api";
import { DETAIL_POSTER_WIDTH, sizedImageUri } from "@/lib/images";
import {
  fetchMovie,
  fetchMovieState,
  putMovieWatched,
  queryKeys,
} from "@/lib/movies";
import { useSession } from "@/lib/session";

/**
 * The tracer's movie screen (spec 0033, first slice): the catalog detail from
 * `/api/v1/movies/{id}` and the Watched pill, in the look of the shipped movie
 * page.
 *
 * The pill starts from the user's real state (`/api/v1/me/titles`), never a
 * guess, and moves at once when tapped; a refusal puts it back and says why
 * (child 0036, Optimistic writes; AGENTS.md section 11). Before release day
 * the pill reads as unavailable, as on the web, but the server's release
 * gate is the authority (AC-6). TMDB's score is labelled TMDB, apart from any
 * personal score (AGENTS.md section 9).
 */
export default function MovieScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { width: screenWidth } = useWindowDimensions();
  const parsedId = movieIdParamSchema.safeParse(params.id);
  const id = parsedId.success ? parsedId.data : 0;
  const { session } = useSession();
  const queries = useQueryClient();
  const [message, setMessage] = useState<{
    text: string;
    tone: "info" | "error";
  } | null>(null);

  const movie = useQuery({
    queryKey: queryKeys.movie(id),
    queryFn: () => fetchMovie(id),
    enabled: parsedId.success,
  });
  const state = useQuery({
    queryKey: queryKeys.movieState(id),
    queryFn: () => fetchMovieState(id),
    enabled: parsedId.success && session !== null,
  });

  const watched = useMutation({
    mutationFn: (value: boolean) => putMovieWatched(id, value),
    onMutate: async (value) => {
      setMessage(null);
      const key = queryKeys.movieState(id);
      await queries.cancelQueries({ queryKey: key });
      const previous = queries.getQueryData<typeof state.data>(key);
      if (previous) {
        // The plan, mark and score rule is core's, never a copy here
        // (apps/mobile/AGENTS.md, BeStats rules); only the timestamp is ours.
        const next = applyTrackingIntent(
          {
            inWatchlist: previous.planned,
            watched: previous.watchedAt !== null,
            rating: previous.rating,
          },
          { kind: "watched", value },
        );
        queries.setQueryData(key, {
          planned: next.inWatchlist,
          watchedAt: next.watched
            ? (previous.watchedAt ?? new Date().toISOString())
            : null,
          rating: next.rating,
        });
      }
      return { previous };
    },
    onError: (error, _value, context) => {
      // An expired session has already wiped the private cache; putting the
      // old state back would bring private data back after sign out.
      const signedOut =
        error instanceof ApiError && error.code === "unauthenticated";
      if (context?.previous && !signedOut) {
        queries.setQueryData(queryKeys.movieState(id), context.previous);
      }
      setMessage({
        tone: "error",
        text:
          error instanceof ApiError
            ? error.message
            : TRACKING_MESSAGES.write_failed,
      });
    },
    onSuccess: (result) => {
      if (result.cleared && result.cleared.rating !== null) {
        setMessage({ tone: "info", text: MOVIE_CLEARED_MESSAGES.unwatched });
      }
    },
    onSettled: () =>
      queries.invalidateQueries({ queryKey: queryKeys.movieState(id) }),
  });

  if (!parsedId.success) {
    return <Centered text={V1_ERROR_MESSAGES.not_found} />;
  }
  if (movie.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading the movie" />
      </View>
    );
  }
  if (movie.isError) {
    const notFound =
      movie.error instanceof ApiError && movie.error.code === "not_found";
    return (
      <Centered
        text={
          movie.error instanceof ApiError
            ? movie.error.message
            : V1_ERROR_MESSAGES.internal
        }
        retry={notFound ? undefined : () => movie.refetch()}
      />
    );
  }

  const detail = movie.data;
  const released = isMovieReleased(detail.releaseDate, todayUtc(new Date()));
  const isWatched = state.data?.watchedAt != null;
  const canMark = released || isWatched;
  const meta = [
    formatAirDate(detail.releaseDate) ??
      (detail.releaseYear ? String(detail.releaseYear) : null),
    detail.runtimeMinutes ? formatRuntime(detail.runtimeMinutes) : null,
    detail.genres
      .map((genre) => genre.name)
      .slice(0, 3)
      .join(", ") || null,
  ].filter(Boolean);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-10"
    >
      <Stack.Screen options={{ title: detail.title }} />
      {detail.backdropUrl ? (
        <Image
          source={{ uri: sizedImageUri(detail.backdropUrl, screenWidth) }}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          style={{ width: "100%", aspectRatio: 16 / 9 }}
        />
      ) : null}
      <View className="gap-5 px-4 pt-5">
        <View className="flex-row gap-4">
          {detail.posterUrl ? (
            <Image
              source={{
                uri: sizedImageUri(detail.posterUrl, DETAIL_POSTER_WIDTH),
              }}
              accessibilityLabel={`${detail.title} poster`}
              contentFit="cover"
              style={{
                width: DETAIL_POSTER_WIDTH,
                aspectRatio: 2 / 3,
                borderRadius: 12,
              }}
            />
          ) : (
            <View
              accessibilityLabel="No poster"
              className="w-[110px] items-center justify-center rounded-xl border border-border bg-card"
              style={{ aspectRatio: 2 / 3 }}
            >
              <Text className="px-2 text-center text-xs text-muted-foreground">
                {detail.title}
              </Text>
            </View>
          )}
          <View className="flex-1 gap-2">
            <Text
              accessibilityRole="header"
              className="text-2xl font-bold text-foreground"
            >
              {detail.title}
            </Text>
            {meta.length > 0 ? (
              <Text className="text-text-secondary">{meta.join(" · ")}</Text>
            ) : null}
            {detail.tmdbRating !== null ? (
              <Text
                accessibilityLabel={`TMDB rating ${detail.tmdbRating.toFixed(1)}`}
                className="font-semibold text-rating-tmdb"
              >
                TMDB {detail.tmdbRating.toFixed(1)}
              </Text>
            ) : null}
          </View>
        </View>

        {session === null ? (
          <GlassButton
            variant="primary"
            label="Sign in to track"
            onPress={() => router.push("/sign-in")}
          />
        ) : state.isPending ? (
          <ActivityIndicator accessibilityLabel="Loading your tracking" />
        ) : state.isError ? (
          <View className="gap-3">
            <Notice tone="error" message={TRACKING_READ_FAILED} />
            <GlassButton label="Retry" onPress={() => state.refetch()} />
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            <GlassButton
              label={isWatched ? "Watched" : "Mark watched"}
              accessibilityLabel={`Mark ${detail.title} watched`}
              pressed={isWatched}
              disabled={!canMark}
              busy={watched.isPending}
              onPress={() => watched.mutate(!isWatched)}
            />
          </View>
        )}
        {!released ? (
          <Text className="text-sm text-text-secondary">
            {movieReleaseNote(detail.releaseDate)}
          </Text>
        ) : null}
        {message ? <Notice tone={message.tone} message={message.text} /> : null}

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
        <Text className="text-xs text-muted-foreground">
          {TMDB_ATTRIBUTION}
        </Text>
      </View>
    </ScrollView>
  );
}

function Centered({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text accessibilityRole="alert" className="text-center text-foreground">
        {text}
      </Text>
      {retry ? <GlassButton label="Retry" onPress={retry} /> : null}
    </View>
  );
}
