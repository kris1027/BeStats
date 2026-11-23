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
  seasonMetaParts,
} from "@bestats/core/format";
import {
  applyEpisodeIntent,
  type EpisodeIntent,
  episodeRowView,
} from "@bestats/core/tracking/episode-intent";
import {
  EPISODE_MARK_MESSAGES,
  EPISODE_TRACKING_MESSAGES,
  SEASON_MESSAGES,
  SEASON_PAGE_COPY,
} from "@bestats/core/tracking/messages";
import {
  EMPTY_EPISODE_TRACKING,
  type SeasonUndo,
} from "@bestats/core/tracking/types";
import { airStatus, todayUtc } from "@bestats/core/tv/air-status";
import {
  airedEpisodesForMarking,
  listedSeasonRating,
  seasonWatchSummary,
} from "@bestats/core/tv/season-watch";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { StatePanel } from "@/components/centered-state";
import {
  EpisodeRow,
  type SeasonEpisodeDetail,
  SeasonSkeleton,
} from "@/components/episode-row";
import { Rim } from "@/components/glass/rim";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import { WatchedIcon } from "@/components/icons";
import { RatingLine, ratedCount } from "@/components/rating-line";
import { ScoreSheet } from "@/components/score-sheet";
import { SeasonNav } from "@/components/season-nav";
import { SwipeRow } from "@/components/swipe-row";
import { Kicker, Text } from "@/components/text";
import { useToast } from "@/components/toast";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchSeason, fetchShow } from "@/lib/catalog";
import { SEASON_HEADER_POSTER_WIDTH, sizedImageUri } from "@/lib/images";
import { useSession } from "@/lib/session";
import {
  putEpisodeRating,
  putEpisodeWatched,
  putSeasonWatched,
  restoreEpisode,
  restoreSeason,
} from "@/lib/shows";
import {
  fetchSeasonState,
  type SeasonState,
  trackingKeys,
  useTrackingWrite,
  useUndoToast,
} from "@/lib/tracking";
import { lengthToken } from "@/theme/token-vars";

import { TitleReadError } from "./title-states";

/**
 * A season's page, the web's `/shows/{id}/season/{number}`
 * (prompts/mobile-title-tracking.md, decision 7): the header with Mark season
 * watched and the user's season rating, then every episode with its own
 * Watched toggle and score, and Previous and Next season.
 *
 * Every rule is core's or the server's: the aired set and the summary come
 * from `seasonWatchSummary` and `airedEpisodesForMarking` with today as a UTC
 * day, each row's gate from `episodeRowView`, the optimistic rows from
 * `applyEpisodeIntent`, and the season rating from `listedSeasonRating` over
 * the rows shown, the same call the web's season header makes (AGENTS.md
 * sections 7 and 9).
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
  if (season.isPending) return <SeasonSkeleton label="Loading the season" />;
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
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-24 pt-4"
    >
      <Stack.Screen options={{ title: detail.name }} />
      <SeasonHeader
        showName={detail.show.name}
        name={detail.name}
        posterUrl={detail.posterUrl}
        meta={meta}
      />
      {detail.overview ? (
        <Text className="text-base leading-6 text-text-secondary">
          {detail.overview}
        </Text>
      ) : null}

      {detail.episodes.length === 0 ? (
        <StatePanel
          title={SEASON_PAGE_COPY.noEpisodes}
          description={SEASON_PAGE_COPY.noEpisodesDescription}
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
 * open. A season write and a new single mark offer Undo; unmarking an
 * episode or changing a score does not, as nothing is lost (AGENTS.md
 * section 7: unmarking keeps the score).
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
  const control = `season-${showId}-${seasonNumber}`;
  const offerUndo = useUndoToast();
  const toast = useToast();
  const [scoring, setScoring] = useState<SeasonEpisodeDetail | null>(null);

  const apply = (current: SeasonState, intent: EpisodeIntent) => ({
    ...current,
    states: applyEpisodeIntent(current.states, intent),
  });

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
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
    control,
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
          toast.show({ id: control, message: SEASON_MESSAGES.nothingToMark });
        }
        return;
      }
      const count =
        undo.kind === "unmark" ? undo.episodeIds.length : undo.entries.length;
      const message =
        intent.kind === "season_mark"
          ? SEASON_MESSAGES.marked(count)
          : SEASON_MESSAGES.unmarked(count);
      offerUndo(message, control, (done) =>
        restore.mutate(undo, { onSettled: done }),
      );
    },
  });

  const unmarkEpisode = useTrackingWrite({
    stateKey: key,
    control: (mark: { episodeId: number }) =>
      `${control}-episode-${mark.episodeId}-undo`,
    alsoInvalidate,
    apply: (current: SeasonState, mark: { episodeId: number }) =>
      apply(current, {
        kind: "watched",
        episodeId: mark.episodeId,
        value: false,
      }),
    write: (mark: { episodeId: number; markedAt: string }) =>
      restoreEpisode({ kind: "episode", showId, ...mark }),
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
    expired: EPISODE_TRACKING_MESSAGES.undo_expired,
  });

  const markEpisode = useTrackingWrite({
    stateKey: key,
    control: (intent: WatchedIntent) =>
      `${control}-episode-${intent.episodeId}-watched`,
    alsoInvalidate,
    apply,
    write: (intent: WatchedIntent) =>
      putEpisodeWatched(intent.episodeId, {
        showId,
        season: seasonNumber,
        watched: intent.value,
      }),
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
    onSuccess: (result, intent) => {
      const markedAt = result.markedAt;
      if (!result.newlyMarked || markedAt === null) return;
      const episode = season.episodes.find(({ id }) => id === intent.episodeId);
      const name = episode
        ? SEASON_PAGE_COPY.episodeName(episode.name, episode.episodeNumber)
        : null;
      if (name === null) return;
      offerUndo(
        EPISODE_MARK_MESSAGES.marked(name),
        `${control}-episode-${intent.episodeId}-watched`,
        (done) =>
          unmarkEpisode.mutate(
            { episodeId: intent.episodeId, markedAt },
            { onSettled: done },
          ),
      );
    },
  });

  const rateEpisode = useTrackingWrite({
    stateKey: key,
    control: (intent: RatingIntent) =>
      `${control}-episode-${intent.episodeId}-rating`,
    alsoInvalidate,
    apply,
    write: (intent: RatingIntent) =>
      putEpisodeRating(intent.episodeId, {
        showId,
        season: seasonNumber,
        rating: intent.value,
      }),
    failure: EPISODE_TRACKING_MESSAGES.write_failed,
  });

  const summary = seasonWatchSummary(season.episodes, state.states, today);
  const rating = listedSeasonRating(season.episodes, state.states);
  const seasonWatched = summary.state === "season_watched";
  const scoringState = scoring
    ? (state.states[scoring.id] ?? EMPTY_EPISODE_TRACKING)
    : null;
  const scoringUpcoming =
    scoring !== null && airStatus(scoring.airDate, today) === "upcoming";
  const scoreEpisode = (value: number | null) => {
    if (scoring) {
      rateEpisode.mutate({ kind: "rating", episodeId: scoring.id, value });
    }
    setScoring(null);
  };

  return (
    <View className="gap-5">
      <View className="gap-3">
        <View className="flex-row flex-wrap items-center gap-3">
          {summary.state === "none_aired" ? (
            <GlassButton
              label={SEASON_PAGE_COPY.nothingAired}
              accessibilityLabel={`Mark ${season.name} watched: ${SEASON_PAGE_COPY.nothingAired.toLowerCase()}`}
              disabled
              onPress={() => {}}
            />
          ) : (
            <GlassButton
              label={
                seasonWatched
                  ? SEASON_PAGE_COPY.seasonWatched
                  : SEASON_PAGE_COPY.markSeason
              }
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
              {SEASON_PAGE_COPY.watchedCount(
                summary.watchedAired,
                summary.aired,
              )}
            </Text>
          ) : null}
        </View>
        <RatingLine
          label={SEASON_PAGE_COPY.ratingLabel}
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
        const shown = stored ?? EMPTY_EPISODE_TRACKING;
        const view = episodeRowView(
          airStatus(episode.airDate, today) === "upcoming",
          stored,
        );
        const label = SEASON_PAGE_COPY.episodeName(
          episode.name,
          episode.episodeNumber,
        );
        const toggleWatched = () =>
          markEpisode.mutate({
            kind: "watched",
            episodeId: episode.id,
            value: !shown.watched,
          });
        return (
          <SwipeRow
            key={episode.id}
            enabled={view.kind !== "upcoming" && view.canMark}
            label={
              shown.watched
                ? SEASON_PAGE_COPY.markUnwatched
                : SEASON_PAGE_COPY.markWatched
            }
            icon={<WatchedIcon filled={!shown.watched} size={20} />}
            onAction={toggleWatched}
          >
            <EpisodeRow episode={episode}>
              {view.kind === "upcoming" ? (
                <Text className="text-sm text-text-secondary">
                  {upcomingNote(episode)}
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  <GlassButton
                    label={
                      shown.watched
                        ? SEASON_PAGE_COPY.watched
                        : SEASON_PAGE_COPY.markWatched
                    }
                    accessibilityLabel={SEASON_PAGE_COPY.toggleWatchedLabel(
                      label,
                      shown.watched,
                    )}
                    pressed={shown.watched}
                    disabled={!view.canMark}
                    onPress={toggleWatched}
                  />
                  <GlassButton
                    label={formatPersonalScore(shown.rating)}
                    score
                    icon={<RatingStar tone="personal" />}
                    accessibilityLabel={`Your score for ${label}: ${formatPersonalScore(shown.rating)}`}
                    onPress={() => setScoring(episode)}
                  />
                </View>
              )}
            </EpisodeRow>
          </SwipeRow>
        );
      })}

      <ScoreSheet
        visible={scoring !== null}
        title={
          scoring
            ? SEASON_PAGE_COPY.episodeName(scoring.name, scoring.episodeNumber)
            : ""
        }
        rating={scoringState?.rating ?? null}
        unavailableNote={
          scoringUpcoming && scoring ? upcomingNote(scoring) : null
        }
        onClose={() => setScoring(null)}
        onPick={scoreEpisode}
        onClear={() => scoreEpisode(null)}
      />
    </View>
  );
}

type WatchedIntent = Extract<EpisodeIntent, { kind: "watched" }>;
type RatingIntent = Extract<EpisodeIntent, { kind: "rating" }>;

/**
 * What a future episode says in place of its controls: "Airs Mar 3, 2027",
 * or "Upcoming" should the date not format. The date is TMDB's UTC day, with
 * no local time implied (AGENTS.md section 9).
 */
function upcomingNote(episode: SeasonEpisodeDetail): string {
  const date = formatAirDate(episode.airDate);
  return date ? SEASON_PAGE_COPY.airs(date) : SEASON_PAGE_COPY.upcoming;
}

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
 * The season's header under the solid stack header (feature 29, slice 2,
 * decision 9): the season poster beside the show's name as a kicker, the
 * season name and its meta. TMDB seasons have no backdrop, so there is none.
 */
function SeasonHeader({
  showName,
  name,
  posterUrl,
  meta,
}: {
  showName: string;
  name: string;
  posterUrl: string | null;
  meta: string[];
}) {
  const radius = lengthToken("radius-lg");
  return (
    <View className="flex-row items-center gap-4">
      {posterUrl ? (
        <View style={{ width: SEASON_HEADER_POSTER_WIDTH, aspectRatio: 2 / 3 }}>
          <Image
            source={{
              uri: sizedImageUri(posterUrl, SEASON_HEADER_POSTER_WIDTH),
            }}
            accessibilityLabel={`${name} poster`}
            contentFit="cover"
            style={{ flex: 1, borderRadius: radius }}
          />
          <Rim radius={radius} />
        </View>
      ) : null}
      <View className="flex-1 gap-1">
        <Kicker>{showName}</Kicker>
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold leading-tight text-foreground"
        >
          {name}
        </Text>
        {meta.length > 0 ? (
          <Text className="text-text-secondary">{meta.join(" · ")}</Text>
        ) : null}
      </View>
    </View>
  );
}
