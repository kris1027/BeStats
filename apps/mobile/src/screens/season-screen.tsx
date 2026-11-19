import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import {
  seasonNumberParamSchema,
  showIdParamSchema,
  type V1Season,
} from "@bestats/core/api/v1/show";
import { adjacentSeasons, orderSeasons } from "@bestats/core/catalog/seasons";
import {
  formatAirDate,
  formatPersonalScore,
  formatRuntime,
  seasonMetaParts,
} from "@bestats/core/format";
import {
  applyEpisodeIntent,
  type EpisodeIntent,
} from "@bestats/core/tracking/episode-intent";
import {
  EPISODE_TRACKING_MESSAGES,
  SEASON_MESSAGES,
} from "@bestats/core/tracking/messages";
import { EMPTY_EPISODE_TRACKING } from "@bestats/core/tracking/types";
import { airStatus, todayUtc } from "@bestats/core/tv/air-status";
import { seasonRating } from "@bestats/core/tv/ratings";
import {
  airedEpisodesForMarking,
  seasonWatchSummary,
} from "@bestats/core/tv/season-watch";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { GlassButton } from "@/components/glass-button";
import { RatingLine, ratedCount } from "@/components/rating-line";
import { ScoreSheet } from "@/components/score-sheet";
import { useToast } from "@/components/toast";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchSeason, fetchShow } from "@/lib/catalog";
import { sizedImageUri } from "@/lib/images";
import { useSession } from "@/lib/session";
import {
  putEpisodeRating,
  putEpisodeWatched,
  putSeasonWatched,
  restoreSeason,
} from "@/lib/shows";
import {
  fetchSeasonState,
  type SeasonState,
  trackingKeys,
  useTrackingWrite,
  useUndoToast,
} from "@/lib/tracking";

import { TitleReadError } from "./title-states";

const STILL_WIDTH = 120;

type Episode = V1Season["episodes"][number];

/**
 * A season's page, the web's `/shows/{id}/season/{number}`
 * (prompts/mobile-title-tracking.md, decision 7): the header with Mark season
 * watched and the user's season rating, then every episode with its own
 * Watched toggle and score, and Previous and Next season.
 *
 * Every rule is core's or the server's: the aired set and the summary come
 * from `seasonWatchSummary` and `airedEpisodesForMarking` with today as a UTC
 * day, the optimistic rows from `applyEpisodeIntent`, and the season rating
 * from `seasonRating` over the rows shown (AGENTS.md sections 7 and 9).
 */
export function SeasonScreen() {
  const params = useLocalSearchParams<{ id: string; number: string }>();
  const parsedId = showIdParamSchema.safeParse(params.id);
  const parsedNumber = seasonNumberParamSchema.safeParse(params.number);
  const valid = parsedId.success && parsedNumber.success;
  const showId = parsedId.success ? parsedId.data : 0;
  const seasonNumber = parsedNumber.success ? parsedNumber.data : 0;
  const { session } = useSession();

  const season = useQuery({
    queryKey: catalogKeys.season(showId, seasonNumber),
    queryFn: () => fetchSeason(showId, seasonNumber),
    enabled: valid,
  });
  // The show read feeds Previous and Next; it is usually cached already.
  const show = useQuery({
    queryKey: catalogKeys.show(showId),
    queryFn: () => fetchShow(showId),
    enabled: valid,
  });
  const state = useQuery({
    queryKey: trackingKeys.season(showId, seasonNumber),
    queryFn: () => fetchSeasonState(showId, seasonNumber),
    enabled: valid && session !== null,
  });

  if (!valid) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (season.isPending) return <LoadingState label="Loading the season" />;
  if (season.isError) {
    return (
      <TitleReadError error={season.error} retry={() => season.refetch()} />
    );
  }

  const detail = season.data;
  const today = todayUtc(new Date());
  const meta = seasonMetaParts(detail.airDate, detail.episodes.length);
  const neighbours = show.data
    ? adjacentSeasons(orderSeasons(show.data.seasons), seasonNumber)
    : { previous: null, next: null };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pb-24 pt-4"
    >
      <Stack.Screen options={{ title: detail.name }} />
      <View className="gap-1">
        <Text className="text-sm text-text-secondary">{detail.show.name}</Text>
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-foreground"
        >
          {detail.name}
        </Text>
        {meta.length > 0 ? (
          <Text className="text-text-secondary">{meta.join(" · ")}</Text>
        ) : null}
      </View>
      {detail.overview ? (
        <Text className="text-base leading-6 text-text-secondary">
          {detail.overview}
        </Text>
      ) : null}

      {detail.episodes.length === 0 ? (
        <StatePanel
          title="No episodes yet"
          description="TMDB lists no episodes for this season yet."
        />
      ) : (
        <TrackingGate signedIn={session !== null} state={state}>
          {(data) => (
            <SeasonTracking season={detail} state={data} today={today} />
          )}
        </TrackingGate>
      )}

      {session === null || !state.isSuccess
        ? detail.episodes.map((episode) => (
            <EpisodeRow key={episode.id} episode={episode} />
          ))
        : null}

      <SeasonNav
        showId={showId}
        previous={neighbours.previous}
        next={neighbours.next}
      />
      <CatalogNotice type="tv" />
    </ScrollView>
  );
}

/**
 * The season's tracking: the season button and rating, then the episode rows
 * with their controls. One score sheet serves every row, so only one is ever
 * open.
 */
function SeasonTracking({
  season,
  state,
  today,
}: {
  season: V1Season;
  state: SeasonState;
  today: string;
}) {
  const showId = season.show.id;
  const seasonNumber = season.seasonNumber;
  const key = trackingKeys.season(showId, seasonNumber);
  const alsoInvalidate = [trackingKeys.title("tv", showId)];
  const offerUndo = useUndoToast();
  const toast = useToast();
  const [scoring, setScoring] = useState<Episode | null>(null);

  const apply = (current: SeasonState, intent: EpisodeIntent) => ({
    ...current,
    states: applyEpisodeIntent(current.states, intent),
  });

  const restore = useTrackingWrite({
    stateKey: key,
    alsoInvalidate,
    apply: (current: SeasonState, undo: SeasonUndo) =>
      apply(current, undoIntent(undo)),
    write: (undo: SeasonUndo) =>
      restoreSeason({ kind: "season", showId, seasonNumber, undo }),
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
    expired: EPISODE_TRACKING_MESSAGES.undo_expired,
  });

  const seasonWrite = useTrackingWrite({
    stateKey: key,
    alsoInvalidate,
    apply,
    write: (intent: EpisodeIntent) =>
      intent.kind === "season_unmark"
        ? putSeasonWatched(showId, seasonNumber, {
            watched: false,
            episodeIds: [...intent.episodeIds],
          })
        : putSeasonWatched(showId, seasonNumber, { watched: true }),
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
    onSuccess: (result, intent) => {
      const undo = result.undo;
      if (undo === null) {
        if (intent.kind === "season_mark") {
          toast.show({ message: SEASON_MESSAGES.nothingToMark });
        }
        return;
      }
      const count =
        undo.kind === "unmark" ? undo.episodeIds.length : undo.entries.length;
      const message =
        intent.kind === "season_mark"
          ? SEASON_MESSAGES.marked(count)
          : SEASON_MESSAGES.unmarked(count);
      offerUndo(message, (done) => restore.mutate(undo, { onSuccess: done }));
    },
  });

  const episodeWrite = useTrackingWrite({
    stateKey: key,
    alsoInvalidate,
    apply,
    write: (intent: EpisodeIntent) => {
      if (intent.kind === "watched") {
        return putEpisodeWatched(intent.episodeId, {
          showId,
          season: seasonNumber,
          watched: intent.value,
        });
      }
      const rated = intent as Extract<EpisodeIntent, { kind: "rating" }>;
      return putEpisodeRating(rated.episodeId, {
        showId,
        season: seasonNumber,
        rating: rated.value,
      });
    },
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
  });

  const summary = seasonWatchSummary(season.episodes, state.states, today);
  const ratings: number[] = [];
  const seen = new Set<number>();
  for (const { id } of season.episodes) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rating = state.states[id]?.rating;
    if (rating != null) ratings.push(rating);
  }
  const rating = seasonRating(ratings);
  const seasonWatched = summary.state === "season_watched";
  const scoringState = scoring
    ? (state.states[scoring.id] ?? EMPTY_EPISODE_TRACKING)
    : null;
  const scoringUpcoming =
    scoring !== null && airStatus(scoring.airDate, today) === "upcoming";

  return (
    <View className="gap-5">
      <View className="gap-3">
        <View className="flex-row flex-wrap items-center gap-3">
          {summary.state === "none_aired" ? (
            <GlassButton
              label="Nothing aired yet"
              accessibilityLabel={`Mark ${season.name} watched: nothing aired yet`}
              disabled
              onPress={() => {}}
            />
          ) : (
            <GlassButton
              label={seasonWatched ? "Season watched" : "Mark season watched"}
              accessibilityLabel={`Mark ${season.name} watched`}
              pressed={seasonWatched}
              onPress={() =>
                seasonWrite.mutate(
                  seasonWatched
                    ? {
                        kind: "season_unmark",
                        episodeIds: season.episodes.map(
                          (episode) => episode.id,
                        ),
                      }
                    : {
                        kind: "season_mark",
                        episodeIds: airedEpisodesForMarking(
                          season.episodes,
                          today,
                        ).ids,
                      },
                )
              }
            />
          )}
          {summary.state !== "none_aired" ? (
            <Text className="text-sm text-text-secondary">
              {summary.watchedAired} of {summary.aired} watched
            </Text>
          ) : null}
        </View>
        <RatingLine
          label="Your season rating"
          value={rating?.mean ?? null}
          basis={
            rating
              ? `from ${ratedCount(rating.ratedEpisodes, "episode")}`
              : null
          }
        />
      </View>

      {season.episodes.map((episode) => {
        const stored = state.states[episode.id];
        const hasState =
          stored !== undefined && (stored.watched || stored.rating !== null);
        const shown = stored ?? EMPTY_EPISODE_TRACKING;
        const upcoming = airStatus(episode.airDate, today) === "upcoming";
        const label = episode.name ?? `Episode ${episode.episodeNumber}`;
        return (
          <EpisodeRow key={episode.id} episode={episode}>
            {upcoming && !hasState ? (
              <Text className="text-sm text-text-secondary">Upcoming</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <GlassButton
                  label={shown.watched ? "Watched" : "Mark watched"}
                  accessibilityLabel={`Mark ${label} watched`}
                  pressed={shown.watched}
                  disabled={upcoming && !shown.watched}
                  onPress={() =>
                    episodeWrite.mutate({
                      kind: "watched",
                      episodeId: episode.id,
                      value: !shown.watched,
                    })
                  }
                />
                <GlassButton
                  label={`★ ${formatPersonalScore(shown.rating)}`}
                  accessibilityLabel={`Your score for ${label}: ${formatPersonalScore(shown.rating)}`}
                  onPress={() => setScoring(episode)}
                />
              </View>
            )}
          </EpisodeRow>
        );
      })}

      <ScoreSheet
        visible={scoring !== null}
        title={
          scoring ? (scoring.name ?? `Episode ${scoring.episodeNumber}`) : ""
        }
        rating={scoringState?.rating ?? null}
        unavailableNote={
          scoringUpcoming && scoring
            ? `Airs ${formatAirDate(scoring.airDate) ?? ""}`.trim()
            : null
        }
        onClose={() => setScoring(null)}
        onPick={(value) => {
          if (scoring) {
            episodeWrite.mutate({
              kind: "rating",
              episodeId: scoring.id,
              value,
            });
          }
          setScoring(null);
        }}
        onClear={() => {
          if (scoring) {
            episodeWrite.mutate({
              kind: "rating",
              episodeId: scoring.id,
              value: null,
            });
          }
          setScoring(null);
        }}
      />
    </View>
  );
}

type SeasonUndo =
  | { kind: "unmark"; episodeIds: number[] }
  | { kind: "restore"; entries: { episodeId: number; watchedAt: string }[] };

/** The optimistic guess for an Undo: the reverse of the write it takes back. */
function undoIntent(undo: SeasonUndo): EpisodeIntent {
  return undo.kind === "unmark"
    ? { kind: "season_unmark", episodeIds: undo.episodeIds }
    : {
        kind: "season_mark",
        episodeIds: undo.entries.map((entry) => entry.episodeId),
      };
}

/**
 * One episode as the web's episode row reads: the still (or a plate), the
 * number and name, the UTC air date or "Air date not announced", runtime and
 * TMDB's rating labelled TMDB, then the row's controls.
 */
function EpisodeRow({
  episode,
  children,
}: {
  episode: Episode;
  children?: React.ReactNode;
}) {
  const airDate = formatAirDate(episode.airDate);
  const label = episode.name ?? `Episode ${episode.episodeNumber}`;
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
              airDate ?? "Air date not announced",
              episode.runtimeMinutes !== null
                ? formatRuntime(episode.runtimeMinutes)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {episode.tmdbRating !== null ? (
            <Text
              accessibilityLabel={`TMDB rating ${episode.tmdbRating.toFixed(1)}`}
              className="text-sm font-semibold text-rating-tmdb"
            >
              TMDB {episode.tmdbRating.toFixed(1)}
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

/** Previous and Next season, as the web's season nav (spec 0009, AC-12). */
function SeasonNav({
  showId,
  previous,
  next,
}: {
  showId: number;
  previous: { seasonNumber: number; name: string } | null;
  next: { seasonNumber: number; name: string } | null;
}) {
  const router = useRouter();
  if (!previous && !next) return null;
  const go = (seasonNumber: number) =>
    router.replace({
      pathname: "/shows/[id]/season/[number]",
      params: { id: String(showId), number: String(seasonNumber) },
    });
  return (
    <View className="flex-row flex-wrap justify-between gap-2">
      {previous ? (
        <GlassButton
          label={`‹ ${previous.name}`}
          accessibilityLabel={`Previous season, ${previous.name}`}
          onPress={() => go(previous.seasonNumber)}
        />
      ) : (
        <View />
      )}
      {next ? (
        <GlassButton
          label={`${next.name} ›`}
          accessibilityLabel={`Next season, ${next.name}`}
          onPress={() => go(next.seasonNumber)}
        />
      ) : null}
    </View>
  );
}
