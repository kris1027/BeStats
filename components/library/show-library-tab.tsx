import { Suspense } from "react";

import { PaginationLinks } from "@/components/pagination-links";
import { PosterGrid } from "@/components/poster-grid";
import {
  getShowLibraryTab,
  type LibraryTabQuery,
  type ShowTabCard,
} from "@/lib/tracking/library-lists";
import { LIBRARY_COPY } from "@/lib/tracking/messages";
import { getShowRatings } from "@/lib/tracking/show-ratings";

import { BadgeLegend } from "./badge-legend";
import { MissingShowCard } from "./held-show-card";
import { HeldShowsSection } from "./held-shows";
import { LIBRARY_HEADING_ID } from "./ids";
import {
  EmptyPanel,
  ListFailed,
  pageHref,
  settleTab,
  TabNotes,
} from "./library-panels";
import { UpcomingShowCard, WatchedShowCard } from "./show-cards";
import type { LibraryList } from "./types";
import { WatchlistShowCard } from "./watchlist-show-card";

/** Posters that load eagerly: one full row at the widest grid. */
const EAGER_POSTERS = 6;

/**
 * A show tab (AC-9 to AC-12, AC-15 to AC-18): Watchlist with Mark watched
 * cards and, on page 1, the Paused & dropped section; Upcoming with dated and
 * Date TBA cards; Watched with the calculated rating and its label.
 */
export async function showLibraryTab(query: LibraryTabQuery<LibraryList>) {
  const { tab: list, userId, page, today } = query;
  const tab = await getShowLibraryTab(query);
  const settled = settleTab(tab, list, "tv", page);
  if (settled.kind !== "ok") return settled.panel;
  const { cards, total, lastPage } = settled;

  // Below the grid on page 1 only, and its own boundary, so the grid never
  // waits on the held shows' titles (AC-10).
  const held =
    list === "watchlist" && page === 1 ? (
      <Suspense fallback={null}>
        <HeldShowsSection userId={userId} />
      </Suspense>
    ) : null;

  if (total === 0) {
    return (
      <div className="flex flex-col gap-10">
        <TabNotes tab={settled} type="tv" list={list} page={page} />
        <EmptyPanel list={list} type="tv" />
        {held}
      </div>
    );
  }

  // A watched show's badge comes from its episode ratings. A failed read
  // shows the list panel rather than cards that look unrated (spec 0019,
  // AC-10).
  let ratings = new Map<number, number | null>();
  if (list === "watched") {
    const ids = cards.flatMap((card) =>
      card.page === "watched" ? [card.showId] : [],
    );
    const read = await getShowRatings(userId, ids);
    if (read.kind === "failed") {
      return <ListFailed list={list} type="tv" page={page} />;
    }
    ratings = read.ratings;
  }

  return (
    <div className="flex flex-col gap-10">
      <TabNotes tab={settled} type="tv" list={list} page={page} />
      <PosterGrid aria-label={`${LIBRARY_COPY[list].tv.grid}, page ${page}`}>
        {cards.map((card, index) => {
          const itemId = `library-show-item-${card.showId}`;
          return (
            <li key={card.showId} id={itemId}>
              <ShowTabCardView
                card={card}
                itemId={itemId}
                today={today}
                rating={ratings.get(card.showId) ?? null}
                priority={index < EAGER_POSTERS}
              />
            </li>
          );
        })}
      </PosterGrid>

      {lastPage > 1 ? (
        <PaginationLinks
          page={page}
          lastPage={lastPage}
          href={(target) => pageHref(list, "tv", target)}
        />
      ) : null}

      {held}

      <BadgeLegend list={list} type="tv" />
    </div>
  );
}

function ShowTabCardView({
  card,
  itemId,
  today,
  rating,
  priority,
}: {
  card: ShowTabCard;
  itemId: string;
  today: string;
  rating: number | null;
  priority: boolean;
}) {
  switch (card.page) {
    case "watchlist":
      return (
        <WatchlistShowCard
          showId={card.showId}
          title={card.title}
          next={card.next}
          priority={priority}
        />
      );
    case "upcoming":
      return (
        <UpcomingShowCard
          showId={card.showId}
          title={card.title}
          airDate={card.airDate}
          next={card.next}
          today={today}
          priority={priority}
        />
      );
    case "watched":
      return (
        <WatchedShowCard
          showId={card.showId}
          title={card.title}
          label={card.label}
          showRating={rating}
          priority={priority}
        />
      );
    case "missing":
      return (
        <MissingShowCard
          showId={card.showId}
          itemId={itemId}
          fallbackId={LIBRARY_HEADING_ID}
        />
      );
  }
}
