import { redirect } from "next/navigation";

import { PaginationLinks } from "@/components/pagination-links";
import { isGameReleased } from "@/lib/catalog/game-page";
import type { LibraryPageKey } from "@/lib/catalog/library-list";
import { formatMonthYear, formatReleaseDate } from "@/lib/format";
import type { GameSummary } from "@/lib/igdb";
import {
  type GameLibraryRow,
  getGameLibraryPage,
  getLibraryGames,
  getWantToPlayTab,
  type WantToPlayPage,
} from "@/lib/tracking/game-library";
import { libraryLastPage } from "@/lib/tracking/library-lists";
import { GAME_DATE_LINES, libraryCopy } from "@/lib/tracking/messages";

import { GameLibraryGrid } from "./game-library-grid";
import {
  CatalogFailed,
  EmptyPanel,
  ListFailed,
  pageHref,
  TabNotes,
} from "./library-panels";
import type { LibraryGameItem } from "./types";

/**
 * A games tab: Coming soon on `/coming-soon`, Want to play on `/want-to-play`,
 * Playing on `/playing`, Finished on `/finished` (spec 0027, AC-6 to AC-14;
 * prompts/game-coming-soon.md).
 *
 * Playing and Finished are one counted Postgres page, a redirect when the
 * page is past the end, then one IGDB batch for that page's games. Want to
 * play and Coming soon split the Want to play games by release date, so
 * they read them all, up to the ceiling, with one IGDB batch
 * (`splitWantToPlayTab`, through `getWantToPlayTab`). A failed Postgres read
 * is the list's own failed panel, a systemic IGDB failure "Couldn't reach
 * IGDB"; neither is ever the empty state. `requireUser()` already ran in `LibrarySection`, and nothing
 * here writes (spec 0020, AC-21).
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
  tab: LibraryPageKey;
  userId: string;
  page: number;
  today: string;
}) {
  if (list === "watchlist" || list === "coming-soon") {
    return splitWantToPlayTab({ tab: list, userId, page, today });
  }

  const result = await getGameLibraryPage({ userId, tab: list, page });
  if (result.kind === "failed") {
    return <ListFailed list={list} type="game" page={page} />;
  }
  const lastPage = lastPageOrRedirect(list, result.total, page);

  if (result.rows.length === 0) {
    return <EmptyPanel list={list} type="game" />;
  }

  const games = await getLibraryGames(result.rows.map((row) => row.gameId));
  if (games.kind === "failed") return <IgdbFailed list={list} page={page} />;

  return (
    <GamePageGrid
      list={list}
      items={result.rows.map((row) =>
        gameItem(list, row, games.games.get(row.gameId), today),
      )}
      page={page}
      lastPage={lastPage}
    />
  );
}

/**
 * Want to play or Coming soon: the Want to play games on that side of their
 * release date (prompts/game-coming-soon.md), with the ceiling's note when
 * it left older games unchecked.
 */
async function splitWantToPlayTab({
  tab: list,
  userId,
  page,
  today,
}: {
  tab: WantToPlayPage;
  userId: string;
  page: number;
  today: string;
}) {
  const result = await getWantToPlayTab({ userId, tab: list, page, today });
  if (result.kind === "failed") {
    return <ListFailed list={list} type="game" page={page} />;
  }
  if (result.kind === "igdb_failed")
    return <IgdbFailed list={list} page={page} />;
  const lastPage = lastPageOrRedirect(list, result.total, page);

  const notes = (
    <TabNotes
      tab={{ capped: result.capped, failedCount: 0 }}
      type="game"
      list={list}
      page={page}
    />
  );

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {notes}
        <EmptyPanel list={list} type="game" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notes}
      <GamePageGrid
        list={list}
        items={result.rows.map((row) =>
          gameItem(list, row, result.games.get(row.gameId), today),
        )}
        page={page}
        lastPage={lastPage}
      />
    </div>
  );
}

/**
 * A tab's last page, after sending a page past it there: a stale link, or
 * the last card of a later page just removed (spec 0027, AC-6).
 */
function lastPageOrRedirect(
  list: LibraryPageKey,
  total: number,
  page: number,
): number {
  const lastPage = libraryLastPage(total);
  if (page > lastPage) redirect(pageHref(list, "game", lastPage));
  return lastPage;
}

/** A systemic IGDB failure, never the empty state, with a retry (AC-7). */
function IgdbFailed({ list, page }: { list: LibraryPageKey; page: number }) {
  return <CatalogFailed source="IGDB" href={pageHref(list, "game", page)} />;
}

/** A games tab's grid and its page links. */
function GamePageGrid({
  list,
  items,
  page,
  lastPage,
}: {
  list: LibraryPageKey;
  items: LibraryGameItem[];
  page: number;
  lastPage: number;
}) {
  return (
    <div className="flex flex-col gap-10">
      <GameLibraryGrid
        items={items}
        list={list}
        label={`${libraryCopy(list, "game").grid}, page ${page}`}
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
 * a tab decides it, so `GameLibraryCard` only renders its item. Coming soon
 * shows the release pill, Want to play none, since every game there is out
 * (prompts/game-coming-soon.md), and neither a score, which their rows
 * cannot hold (spec 0024, AC-2); Playing and Finished show the score and the month of
 * the date their tab orders by.
 */
const GAME_CARDS: Record<
  LibraryPageKey,
  {
    scored: boolean;
    releasePill: boolean;
    dateLine: (row: GameLibraryRow) => string | null;
  }
> = {
  "coming-soon": { scored: false, releasePill: true, dateLine: () => null },
  watchlist: { scored: false, releasePill: false, dateLine: () => null },
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
  list: LibraryPageKey,
  row: GameLibraryRow,
  game: GameSummary | undefined,
  today: string,
): LibraryGameItem {
  const { status } = row;
  if (game === undefined) {
    return {
      gameId: row.gameId,
      name: null,
      status,
      coverUrl: null,
      communityRating: null,
      rating: null,
      hidden: false,
      unreleased: null,
      dateLine: null,
    };
  }

  const card = GAME_CARDS[list];
  return {
    gameId: row.gameId,
    name: game.name,
    status,
    coverUrl: game.coverUrl,
    communityRating: game.communityRating,
    rating: card.scored ? row.rating : null,
    hidden: game.hidden,
    unreleased:
      card.releasePill && !isGameReleased(game.releaseDate, today)
        ? { date: formatReleaseDate(game.releaseDate, today) }
        : null,
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
