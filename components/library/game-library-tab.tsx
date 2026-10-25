import { redirect } from "next/navigation";

import { PaginationLinks } from "@/components/pagination-links";
import { isGameReleased } from "@/lib/catalog/game-page";
import { formatMonthYear, formatReleaseDate } from "@/lib/format";
import type { GameSummary } from "@/lib/igdb";
import {
  type GameLibraryRow,
  getGameLibraryPage,
  getLibraryGames,
} from "@/lib/tracking/game-library";
import { libraryLastPage } from "@/lib/tracking/library-lists";
import { GAME_DATE_LINES, LIBRARY_COPY } from "@/lib/tracking/messages";

import { GameLibraryGrid } from "./game-library-grid";
import {
  CatalogFailed,
  EmptyPanel,
  ListFailed,
  pageHref,
} from "./library-panels";
import type { LibraryGameItem, LibraryList } from "./types";

/**
 * A games tab: Want to play on `/watchlist`, Playing on `/upcoming`,
 * Finished on `/watched` (spec 0027, AC-6 to AC-14).
 *
 * One counted Postgres page, a redirect when the page is past the end, then
 * one IGDB batch for that page's games. A failed Postgres read is the list's
 * own failed panel, a systemic IGDB failure "Couldn't reach IGDB"; neither
 * is ever the empty state. `requireUser()` already ran in `LibrarySection`,
 * and nothing here writes (spec 0020, AC-21).
 *
 * @param query.today `requestTodayUtc()`, read once per request, which
 * decides whether a Want to play game is out yet (AC-8).
 */
export async function gameLibraryTab({
  tab: list,
  userId,
  page,
  today,
}: {
  tab: LibraryList;
  userId: string;
  page: number;
  today: string;
}) {
  const result = await getGameLibraryPage({ userId, tab: list, page });
  if (result.kind === "failed") {
    return <ListFailed list={list} type="game" page={page} />;
  }
  const lastPage = libraryLastPage(result.total);
  if (page > lastPage) redirect(pageHref(list, "game", lastPage));

  if (result.rows.length === 0) {
    return <EmptyPanel list={list} type="game" />;
  }

  const games = await getLibraryGames(result.rows.map((row) => row.gameId));
  if (games.kind === "failed") {
    return <CatalogFailed source="IGDB" href={pageHref(list, "game", page)} />;
  }

  const items = result.rows.map((row) =>
    gameItem(list, row, games.games.get(row.gameId), today),
  );

  return (
    <div className="flex flex-col gap-10">
      <GameLibraryGrid
        items={items}
        label={`${LIBRARY_COPY[list].game.grid}, page ${page}`}
        page={page}
        returnPath={pageHref(list, "game", page)}
      />

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, "game", target)}
        />
      ) : null}
    </div>
  );
}

/**
 * What each games tab's card carries (spec 0027, AC-8, AC-9), the one place
 * a tab decides it, so `GameLibraryCard` only renders its item. Want to play
 * shows the release pill and never a score, which its rows cannot hold
 * (spec 0024, AC-2); Playing and Finished show the score and the month of
 * the date their tab orders by.
 */
const GAME_CARDS: Record<
  LibraryList,
  {
    scored: boolean;
    releasePill: boolean;
    dateLine: (row: GameLibraryRow) => string | null;
  }
> = {
  watchlist: { scored: false, releasePill: true, dateLine: () => null },
  upcoming: {
    scored: true,
    releasePill: false,
    dateLine: (row) => monthLine(row.startedAt, GAME_DATE_LINES.started),
  },
  watched: {
    scored: true,
    releasePill: false,
    dateLine: (row) => monthLine(row.finishedAt, GAME_DATE_LINES.finished),
  },
};

/**
 * A game card's plain data, with its release pill and date line formatted
 * here, beside the `today` that decided them. A game IGDB did not return is
 * a missing card at its place in the order (AC-11): no name, cover, badge
 * or date is invented for it.
 */
function gameItem(
  list: LibraryList,
  row: GameLibraryRow,
  game: GameSummary | undefined,
  today: string,
): LibraryGameItem {
  if (game === undefined) {
    return {
      gameId: row.gameId,
      name: null,
      coverUrl: null,
      communityRating: null,
      rating: null,
      hidden: false,
      release: { state: "released" },
      dateLine: null,
    };
  }

  const card = GAME_CARDS[list];
  return {
    gameId: row.gameId,
    name: game.name,
    coverUrl: game.coverUrl,
    communityRating: game.communityRating,
    rating: card.scored ? row.rating : null,
    hidden: game.hidden,
    release:
      card.releasePill && !isGameReleased(game.releaseDate, today)
        ? {
            state: "unreleased",
            date: formatReleaseDate(game.releaseDate, today),
          }
        : { state: "released" },
    dateLine: card.dateLine(row),
  };
}

/** `Started Oct 2026` or `Finished Oct 2026`, or none without the date. */
function monthLine(
  iso: string | null,
  line: (month: string) => string,
): string | null {
  const month = iso === null ? null : formatMonthYear(iso);
  return month === null ? null : line(month);
}
