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
  canHoldScore,
  isGameStatusHeldBack,
  opensScoreSheet,
} from "@bestats/core/tracking/game-intent";
import { GAME_STATUS_LABELS } from "@bestats/core/tracking/messages";
import { GAME_STATUSES, type GameStatus } from "@bestats/core/tracking/types";
import { todayUtc } from "@bestats/core/tv/air-status";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CatalogNotice } from "@/components/catalog-notice";
import { DetailHeader, DetailSection } from "@/components/detail-header";
import { GlassButton } from "@/components/glass-button";
import { RatingStar } from "@/components/glass-pill";
import { ScoreSheet } from "@/components/score-sheet";
import { ScreenshotRow } from "@/components/screenshot-row";
import { Text } from "@/components/text";
import {
  CrewLines,
  FactsPanel,
  Overview,
  textFact,
} from "@/components/title-details";
import { MoreLikeThis, TrailerButton } from "@/components/title-extras";
import { TitleScroll } from "@/components/title-header";
import { TrackingGate } from "@/components/tracking-gate";
import { catalogKeys, fetchGame, fetchSimilarGames } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { useGameWrite } from "@/lib/title-writes";
import { fetchTitleState, trackingKeys } from "@/lib/tracking";

import { TitleRead } from "./title-states";

/**
 * A game's page (prompts/mobile-title-tracking.md, decision 8): the public
 * detail from `/api/v1/games/{id}`, the three status pills with the score,
 * IGDB's summary and story, screenshots and Facts. Every part IGDB has no
 * value for is left out rather than invented (spec 0031, AC-11), and IGDB's
 * community rating stays labelled IGDB, apart from the user's score
 * (AGENTS.md section 9). The trailer opens YouTube and More like this reads
 * `/api/v1/games/{id}/similar` (prompts/mobile-look-title-extras.md).
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
  // Its own query, so slow or failed cards never hold up the game
  // (prompts/mobile-look-title-extras.md, decisions 3 and 5).
  const similar = useQuery({
    queryKey: catalogKeys.similarGames(id),
    queryFn: () => fetchSimilarGames(id),
    // A game with no similar ids makes no request at all, as the web's.
    enabled: parsed.success && (game.data?.similarGameIds.length ?? 0) > 0,
  });

  return (
    <TitleRead
      valid={parsed.success}
      read={game}
      loadingLabel="Loading the game"
    >
      {(detail) => (
        <TitleScroll title={detail.name} backdropUrl={detail.artUrl}>
          <DetailHeader
            title={detail.name}
            posterUrl={detail.coverUrl}
            type="game"
            communityRating={detail.communityRating}
            voteCount={detail.communityRatingCount}
            genres={detail.genres}
            status={null}
            meta={[
              formatAirDate(detail.releaseDate) ??
                (detail.releaseYear ? String(detail.releaseYear) : null),
            ]}
          />
          <View className="gap-5 px-4 pt-5">
            <TrailerButton trailer={detail.trailer} title={detail.name} />
            <TrackingGate signedIn={session !== null} state={state}>
              {(data) => <GameTracking game={detail} state={data} />}
            </TrackingGate>
            <Overview text={detail.summary} />
            <CrewLines
              lines={[
                { label: "Developed by", names: detail.developers },
                { label: "Published by", names: detail.publishers },
              ]}
            />
            <DetailSection heading="Story" text={detail.storyline} />
          </View>
          <View className="pt-6">
            <ScreenshotRow name={detail.name} urls={detail.screenshotUrls} />
          </View>
          {detail.similarGameIds.length > 0 &&
          similar.data?.results.length !== 0 ? (
            <View className="pt-6">
              <MoreLikeThis
                type="game"
                read={{
                  isPending: similar.isPending,
                  isError: similar.isError,
                  data: similar.data?.results,
                  refetch: similar.refetch,
                }}
              />
            </View>
          ) : null}
          <View className="pt-6">
            <FactsPanel facts={gameFacts(detail)} />
          </View>
          <CatalogNotice type="game" />
        </TitleScroll>
      )}
    </TitleRead>
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const write = useGameWrite(game.id, () => setSheetOpen(false));
  const released = isGameReleased(game.releaseDate, todayUtc(new Date()));
  const releaseNote = released ? null : gameReleaseNote(game.releaseDate);

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
            score
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
 * value, singular or plural as the web labels it; `FactsPanel` leaves the
 * panel out when none has one (AC-11).
 */
function gameFacts(game: V1Game) {
  return [
    textFact("Platforms", names(game.platforms)),
    textFact("Game modes", names(game.gameModes)),
    textFact("Player perspectives", names(game.playerPerspectives)),
    textFact("Themes", names(game.themes)),
    textFact(
      game.franchises.length > 1 ? "Franchises" : "Franchise",
      names(game.franchises),
    ),
    textFact("Series", names(game.series)),
    textFact(
      game.gameEngines.length > 1 ? "Game engines" : "Game engine",
      names(game.gameEngines),
    ),
    textFact(
      "Release dates",
      game.platformReleases.length === 0
        ? null
        : game.platformReleases
            .map(
              ({ platform, release }) =>
                `${platform}: ${formatGameReleaseDate(release)}`,
            )
            .join("\n"),
    ),
  ];
}
