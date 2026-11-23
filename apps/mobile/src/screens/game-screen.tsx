import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import { gameIdParamSchema, type V1Game } from "@bestats/core/api/v1/game";
import type { V1GameTitleState } from "@bestats/core/api/v1/titles";
import {
  gameReleaseNote,
  isGameReleased,
} from "@bestats/core/catalog/game-page";
import {
  formatAirDate,
  formatGameReleaseDate,
  formatPersonalScore,
} from "@bestats/core/format";
import {
  applyGameIntent,
  canHoldScore,
  type GameIntent,
  isGameStatusHeldBack,
  opensScoreSheet,
} from "@bestats/core/tracking/game-intent";
import {
  GAME_STATUS_LABELS,
  GAME_TRACKING_MESSAGES,
  GAME_UNDO_MESSAGES,
} from "@bestats/core/tracking/messages";
import {
  GAME_STATUSES,
  type GameStatus,
  type GameUndo,
} from "@bestats/core/tracking/types";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { LoadingState, StatePanel } from "@/components/centered-state";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import {
  communityRatingLabel,
  communityRatingText,
} from "@/components/poster-card";
import { ScoreSheet } from "@/components/score-sheet";
import { ScreenshotRow } from "@/components/screenshot-row";
import { Text } from "@/components/text";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchGame } from "@/lib/catalog";
import { restoreGame, writeGameIntent } from "@/lib/games";
import { useSession } from "@/lib/session";
import {
  fetchTitleState,
  trackingKeys,
  useTrackingWrite,
  useUndoToast,
} from "@/lib/tracking";

import { TitleReadError } from "./title-states";

/**
 * A game's page (prompts/mobile-title-tracking.md, decision 8): the public
 * detail from `/api/v1/games/{id}`, the three status pills with the score,
 * IGDB's summary and story, screenshots and Facts. Every part IGDB has no
 * value for is left out rather than invented (spec 0031, AC-11), and IGDB's
 * community rating stays labelled IGDB, apart from the user's score
 * (AGENTS.md section 9). The trailer and More like this are not in this slice.
 */
export function GameScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const parsed = gameIdParamSchema.safeParse(params.id);
  const id = parsed.success ? parsed.data : 0;
  const { session } = useSession();
  const game = useQuery({
    queryKey: catalogKeys.game(id),
    queryFn: () => fetchGame(id),
    enabled: parsed.success,
  });
  const state = useQuery({
    queryKey: trackingKeys.title("game", id),
    queryFn: () => fetchTitleState("game", id),
    enabled: parsed.success && session !== null,
  });

  if (!parsed.success) {
    return <StatePanel tone="error" title={V1_ERROR_MESSAGES.not_found} />;
  }
  if (game.isPending) return <LoadingState label="Loading the game" />;
  if (game.isError) {
    return <TitleReadError error={game.error} retry={() => game.refetch()} />;
  }

  const detail = game.data;
  return (
    <ScrollView className="flex-1" contentContainerClassName="pb-24">
      <Stack.Screen options={{ title: detail.name }} />
      <DetailHeader
        title={detail.name}
        posterUrl={detail.coverUrl}
        backdropUrl={detail.artUrl}
        rating={communityRatingText("game", detail.communityRating)}
        ratingLabel={communityRatingLabel("game", detail.communityRating)}
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
        <TrackingGate signedIn={session !== null} state={state}>
          {(data) => <GameTracking game={detail} state={data} />}
        </TrackingGate>
        <DetailSection heading="Overview" text={detail.summary} />
        <DetailSection heading="Story" text={detail.storyline} />
        <DetailSection
          heading="Developers"
          text={detail.developers.join(", ") || null}
        />
        <DetailSection
          heading="Publishers"
          text={detail.publishers.join(", ") || null}
        />
      </View>
      <View className="pt-6">
        <ScreenshotRow name={detail.name} urls={detail.screenshotUrls} />
      </View>
      <GameFacts game={detail} />
      <CatalogNotice type="game" />
    </ScrollView>
  );
}

/**
 * The web's `GameStatusControl` (spec 0026, AC-2 to AC-8): three pills in one
 * group; tapping an unpressed pill sets that status and tapping the pressed
 * one removes the game, with Undo. The score shows only on Playing or
 * Finished; a move into Finished with no score opens the sheet, a move into
 * Playing never does. Before release, Playing and Finished are off unless
 * pressed (the pressed one can still remove), and the sheet can clear but
 * not score (`lib/tracking/AGENTS.md`, Games); the server checks it again.
 */
function GameTracking({
  game,
  state,
}: {
  game: V1Game;
  state: V1GameTitleState;
}) {
  const key = trackingKeys.title("game", game.id);
  const offerUndo = useUndoToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const released = isGameReleased(game.releaseDate, todayUtc(new Date()));
  const releaseNote = released ? null : gameReleaseNote(game.releaseDate);

  const control = `game-${game.id}`;

  const restore = useTrackingWrite({
    stateKey: key,
    control: `${control}-undo`,
    apply: (_current: V1GameTitleState, undo: GameUndo) => ({
      status: undo.previous.status,
      rating: undo.previous.rating,
    }),
    write: (undo: GameUndo) =>
      restoreGame(
        undo.kind === "removed"
          ? {
              kind: "game_removed",
              gameId: game.id,
              previous: undo.previous,
              removedAt: undo.removedAt,
            }
          : { kind: "game_status", gameId: game.id, previous: undo.previous },
      ),
    failure: GAME_TRACKING_MESSAGES.write_failed,
    expired: GAME_UNDO_MESSAGES.undoExpired,
  });

  const write = useTrackingWrite({
    stateKey: key,
    control: (intent: GameIntent) => `${control}-${intent.kind}`,
    apply: applyGameIntent,
    write: (intent: GameIntent) => writeGameIntent(game.id, intent),
    failure: GAME_TRACKING_MESSAGES.write_failed,
    onFailure: () => setSheetOpen(false),
    onSuccess: (result, intent) => {
      const undo = result.undo;
      if (!undo) return;
      offerUndo(
        undo.kind === "removed"
          ? GAME_UNDO_MESSAGES.removed
          : GAME_UNDO_MESSAGES.scoreCleared,
        `${control}-${intent.kind}`,
        (done) => restore.mutate(undo, { onSettled: done }),
      );
    },
  });

  const heldBack = (status: GameStatus) =>
    isGameStatusHeldBack(released, state.status, status);

  function choose(status: GameStatus) {
    if (heldBack(status)) return;
    if (state.status === status) {
      write.mutate({ kind: "status", value: null });
      return;
    }
    if (opensScoreSheet(state, status)) setSheetOpen(true);
    write.mutate({ kind: "status", value: status });
  }

  const canScore = canHoldScore(state.status);
  const scoreText = formatPersonalScore(state.rating);
  return (
    <View className="gap-3">
      <View
        accessibilityLabel={`Status for ${game.name}`}
        className="flex-row flex-wrap gap-2"
      >
        {GAME_STATUSES.map((status) => (
          <GlassButton
            key={status}
            label={GAME_STATUS_LABELS[status]}
            accessibilityLabel={`${GAME_STATUS_LABELS[status]}: ${game.name}`}
            pressed={state.status === status}
            disabled={heldBack(status)}
            onPress={() => choose(status)}
          />
        ))}
        {canScore ? (
          <GlassButton
            label={state.rating === null ? "Rate" : scoreText}
            icon={<RatingStar tone="personal" />}
            accessibilityLabel={`Your score for ${game.name}: ${scoreText}`}
            onPress={() => setSheetOpen(true)}
          />
        ) : null}
      </View>
      {releaseNote ? (
        <Text className="text-sm text-text-secondary">{releaseNote}</Text>
      ) : null}
      <ScoreSheet
        visible={sheetOpen && canScore}
        title={game.name}
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

type Ref = { name: string };

function names(refs: Ref[]): string | null {
  return refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");
}

/**
 * The web's game Facts (spec 0031, AC-9): each line only when IGDB has a
 * value, singular or plural as the web labels it, and no panel at all when
 * none has one (AC-11).
 */
function GameFacts({ game }: { game: V1Game }) {
  const facts = [
    ["Platforms", names(game.platforms)],
    ["Game modes", names(game.gameModes)],
    ["Player perspectives", names(game.playerPerspectives)],
    ["Themes", names(game.themes)],
    [
      game.franchises.length > 1 ? "Franchises" : "Franchise",
      names(game.franchises),
    ],
    ["Series", names(game.series)],
    [
      game.gameEngines.length > 1 ? "Game engines" : "Game engine",
      names(game.gameEngines),
    ],
    [
      "Release dates",
      game.platformReleases.length === 0
        ? null
        : game.platformReleases
            .map(
              ({ platform, release }) =>
                `${platform}: ${formatGameReleaseDate(release)}`,
            )
            .join("\n"),
    ],
  ].filter((fact): fact is [string, string] => fact[1] !== null);
  if (facts.length === 0) return null;
  return (
    <View className="gap-3 px-4 pt-6">
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
      >
        Facts
      </Text>
      {facts.map(([label, value]) => (
        <View key={label} className="gap-1">
          <Text className="text-sm text-text-secondary">{label}</Text>
          <Text className="text-base text-foreground">{value}</Text>
        </View>
      ))}
    </View>
  );
}
