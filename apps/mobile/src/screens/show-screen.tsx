import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { showIdParamSchema, type V1Show } from "@bestats/core/api/v1/show";
import type { V1ShowTitleState } from "@bestats/core/api/v1/titles";
import { orderSeasons } from "@bestats/core/catalog/seasons";
import {
  formatAirSpan,
  formatCalculatedRating,
  formatEpisodeCount,
  seasonMetaParts,
} from "@bestats/core/format";
import {
  LIBRARY_CARD_MESSAGES,
  NEXT_EPISODE_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_MESSAGES,
} from "@bestats/core/tracking/messages";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import { RatingLine, ratedCount } from "@/components/rating-line";
import { Text } from "@/components/text";
import { useToast } from "@/components/toast";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchShow } from "@/lib/catalog";
import { sizedImageUri } from "@/lib/images";
import { useSession } from "@/lib/session";
import { restoreShowTracking, trackShow, untrackShow } from "@/lib/shows";
import {
  fetchTitleState,
  trackingKeys,
  useTrackingWrite,
  useUndoToast,
} from "@/lib/tracking";

import { TitleReadError } from "./title-states";

const SEASON_POSTER_WIDTH = 56;

/**
 * A show's page (prompts/mobile-title-tracking.md, decision 6): the public
 * detail from `/api/v1/shows/{id}`, the Plan to watch / Tracking toggle, the
 * progress line and the user's show rating, then the seasons, each with its
 * calculated rating and a link to its season screen. TMDB's rating stays
 * labelled TMDB, apart from every personal one (AGENTS.md section 9). The v1
 * show answer has no cast, trailer or similar titles, so none is shown
 * rather than invented (AGENTS.md section 3).
 */
export function ShowScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = showIdParamSchema.safeParse(params.id);
  const id = parsed.success ? parsed.data : 0;
  const { session } = useSession();
  const show = useQuery({
    queryKey: catalogKeys.show(id),
    queryFn: () => fetchShow(id),
    enabled: parsed.success,
  });
  const state = useQuery({
    queryKey: trackingKeys.title("tv", id),
    queryFn: () => fetchTitleState("tv", id),
    enabled: parsed.success && session !== null,
  });

  if (!parsed.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (show.isPending) return <LoadingState label="Loading the show" />;
  if (show.isError) {
    return <TitleReadError error={show.error} retry={() => show.refetch()} />;
  }

  const detail = show.data;
  const regularSeasons = detail.seasons.filter((season) => !season.isSpecials);

  return (
    <ScrollView className="flex-1" contentContainerClassName="pb-24">
      <Stack.Screen options={{ title: detail.name }} />
      <DetailHeader
        title={detail.name}
        posterUrl={detail.posterUrl}
        backdropUrl={detail.backdropUrl}
        type="tv"
        communityRating={detail.tmdbRating}
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
        <TrackingGate signedIn={session !== null} state={state}>
          {(data) => <ShowTracking show={detail} state={data} />}
        </TrackingGate>
        <DetailSection heading="Overview" text={detail.overview} />
        <DetailSection
          heading="Created by"
          text={detail.createdBy.join(", ") || null}
        />
        <Seasons
          show={detail}
          state={session !== null ? (state.data ?? null) : null}
        />
      </View>
      <CatalogNotice type="tv" />
    </ScrollView>
  );
}

/**
 * The web's show tracking control and progress line (spec 0013): one toggle
 * between Plan to watch and Tracking. Stop tracking keeps every mark and
 * rating and offers Undo; a show another device already stopped is a quiet
 * success with no Undo (`lib/tracking/AGENTS.md`, Show tracking).
 */
function ShowTracking({
  show,
  state,
}: {
  show: V1Show;
  state: V1ShowTitleState;
}) {
  const key = trackingKeys.title("tv", show.id);
  const offerUndo = useUndoToast();
  const toast = useToast();

  const control = `show-${show.id}-tracking`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (current: V1ShowTitleState) => ({ ...current, tracked: true }),
    write: (undo: { trackedAt: string }) =>
      restoreShowTracking({ kind: "show_tracking", showId: show.id, undo }),
    failure: SHOW_TRACKING_MESSAGES.write_failed,
    expired: SHOW_TRACKING_COPY.undoExpired,
  });
  const toggle = useTrackingWrite({
    stateKey: key,
    control,
    apply: (current: V1ShowTitleState, tracked: boolean) => ({
      ...current,
      tracked,
    }),
    write: async (tracked: boolean) =>
      tracked
        ? { undo: null, ...(await trackShow(show.id)) }
        : untrackShow(show.id),
    failure: SHOW_TRACKING_MESSAGES.write_failed,
    onSuccess: (result, tracked) => {
      if (tracked) return;
      const message = SHOW_TRACKING_COPY.stopped(show.name);
      const undo = result.undo;
      if (undo === null) {
        toast.show({ id: control, message });
        return;
      }
      offerUndo(message, control, (done) =>
        restore.mutate(undo, { onSettled: done }),
      );
    },
  });

  return (
    <View className="gap-3">
      <View className="flex-row">
        <GlassButton
          label={
            state.tracked
              ? SHOW_TRACKING_COPY.tracking
              : SHOW_TRACKING_COPY.plan
          }
          accessibilityLabel={
            state.tracked
              ? SHOW_TRACKING_COPY.stopLabel(show.name)
              : `${SHOW_TRACKING_COPY.plan}: ${show.name}`
          }
          pressed={state.tracked}
          onPress={() => toggle.mutate(!state.tracked)}
        />
      </View>
      <Progress progress={state.progress} />
    </View>
  );
}

/**
 * The progress line: aired regular episodes only, from the server's
 * `showProgress` (AGENTS.md section 9). A null progress means the catalog was
 * down, so it says so rather than inventing a count.
 */
function Progress({ progress }: { progress: V1ShowTitleState["progress"] }) {
  if (progress === null) {
    return (
      <Text className="text-sm text-text-secondary">
        {SHOW_PROGRESS_MESSAGES.unavailable}
      </Text>
    );
  }
  if (progress.kind === "none_aired") {
    return (
      <Text className="text-sm text-text-secondary">
        {SHOW_PROGRESS_MESSAGES.noneAired}
      </Text>
    );
  }
  const { watched, total, next } = progress;
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityLabel={SHOW_PROGRESS_MESSAGES.barLabel}
        accessibilityValue={{ min: 0, max: total, now: watched }}
        className="h-1.5 overflow-hidden rounded-full bg-glass-plate"
      >
        <View
          className="h-full rounded-full bg-score-personal"
          style={{ width: `${(watched / total) * 100}%` }}
        />
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm text-text-secondary">
          {SHOW_PROGRESS_MESSAGES.counted(watched, total)}
        </Text>
        {next ? (
          <Text
            accessibilityLabel={NEXT_EPISODE_MESSAGES.accessible(
              next.seasonNumber,
              next.episodeNumber,
            )}
            className="text-sm font-semibold text-foreground"
          >
            Next{" "}
            {NEXT_EPISODE_MESSAGES.pill(next.seasonNumber, next.episodeNumber)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The Seasons list, ordered as the web orders it (regular seasons, then
 * Specials). Signed in, the heading carries the show rating and each row its
 * calculated season rating; Specials never feed the show rating (AGENTS.md
 * section 9).
 */
function Seasons({
  show,
  state,
}: {
  show: V1Show;
  state: V1ShowTitleState | null;
}) {
  const seasons = orderSeasons(show.seasons);
  const regularRated =
    state?.seasonRatings.filter((season) => season.seasonNumber > 0).length ??
    0;
  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
      >
        Seasons
      </Text>
      {state ? (
        <RatingLine
          label={LIBRARY_CARD_MESSAGES.yourShowRating}
          value={state.showRating}
          basis={
            state.showRating === null
              ? null
              : `from ${ratedCount(regularRated, "season")}`
          }
        />
      ) : null}
      {seasons.length === 0 ? (
        <Text className="text-muted-foreground">
          TMDB lists no seasons for this show yet.
        </Text>
      ) : (
        seasons.map((season) => {
          const rating = state?.seasonRatings.find(
            (row) => row.seasonNumber === season.seasonNumber,
          );
          const meta = seasonMetaParts(season.airDate, season.episodeCount);
          return (
            <Link
              key={season.seasonNumber}
              href={{
                pathname: "/shows/[id]/season/[number]",
                params: {
                  id: String(show.id),
                  number: String(season.seasonNumber),
                },
              }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={[
                  season.name,
                  meta.join(", "),
                  rating
                    ? `your season rating ${formatCalculatedRating(rating.mean)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-glass-plate p-2"
              >
                {season.posterUrl ? (
                  <Image
                    source={{
                      uri: sizedImageUri(season.posterUrl, SEASON_POSTER_WIDTH),
                    }}
                    contentFit="cover"
                    style={{
                      width: SEASON_POSTER_WIDTH,
                      aspectRatio: 2 / 3,
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <View
                    className="items-center justify-center rounded-lg border border-border bg-card"
                    style={{ width: SEASON_POSTER_WIDTH, aspectRatio: 2 / 3 }}
                  >
                    <Text className="text-xs text-muted-foreground">
                      {season.seasonNumber === 0
                        ? "SP"
                        : `S${season.seasonNumber}`}
                    </Text>
                  </View>
                )}
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-foreground">
                    {season.name}
                  </Text>
                  {meta.length > 0 ? (
                    <Text className="text-sm text-text-secondary">
                      {meta.join(" · ")}
                    </Text>
                  ) : null}
                </View>
                {rating ? (
                  <View className="flex-row items-center gap-1 pr-2">
                    <RatingStar tone="personal" />
                    <Text className="text-sm font-semibold text-score-personal">
                      {formatCalculatedRating(rating.mean)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </Link>
          );
        })
      )}
    </View>
  );
}
