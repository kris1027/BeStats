import { ChevronDownIcon } from "lucide-react";

import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { typedHref } from "@/lib/catalog/media-type";
import { getTvShowsSettled, TmdbError, type TvShow } from "@/lib/tmdb";
import {
  getHeldShows,
  LIBRARY_CLASSIFY_LIMIT,
} from "@/lib/tracking/library-lists";
import { HELD_SHOWS_COPY, LIBRARY_COPY } from "@/lib/tracking/messages";

import { type CardTitle, HeldShowCard } from "./held-show-card";
import { HELD_SHOWS_SUMMARY_ID } from "./ids";

/**
 * The Paused & dropped section under the Watchlist shows grid, on page 1
 * only (spec 0020, AC-10). A collapsed disclosure titled with the exact
 * number of held shows, and nothing at all when there are none.
 *
 * Membership is the hold alone, so a held show is listed whatever TMDB says.
 * The poster and name come from the cached `getTvShow`: a title TMDB no
 * longer has shows "No longer on TMDB", and a failed read (one show's, or a
 * systemic failure for all of them) shows "Show unavailable", each keeping
 * Resume and Stop tracking. At most the 500 most recently changed are
 * listed, with a note when there are more.
 *
 * @param userId The verified session's user.
 */
async function HeldShowsSection({ userId }: { userId: string }) {
  const held = await getHeldShows(userId);
  if (held.kind === "failed") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-text-secondary">
          {LIBRARY_COPY.watchlist.failed}
        </p>
        <RetryLink href={typedHref("/watchlist", "tv")} />
      </div>
    );
  }
  if (held.total === 0) return null;

  const titles = await heldTitles(held.rows.map((row) => row.showId));

  return (
    <details className="group">
      <summary
        id={HELD_SHOWS_SUMMARY_ID}
        className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-xl leading-tight font-bold text-foreground md:text-2xl [&::-webkit-details-marker]:hidden"
      >
        {HELD_SHOWS_COPY.summary(held.total)}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-5 text-text-secondary transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-5 flex flex-col gap-5">
        {held.total > LIBRARY_CLASSIFY_LIMIT ? (
          <p className="text-sm text-text-secondary">
            {HELD_SHOWS_COPY.more(LIBRARY_CLASSIFY_LIMIT)}
          </p>
        ) : null}
        <PosterGrid aria-label={HELD_SHOWS_COPY.gridLabel}>
          {held.rows.map((row) => {
            const itemId = `held-show-item-${row.showId}`;
            return (
              <li key={row.showId} id={itemId}>
                <HeldShowCard
                  showId={row.showId}
                  hold={row.hold}
                  title={titles(row.showId)}
                  itemId={itemId}
                />
              </li>
            );
          })}
        </PosterGrid>
      </div>
    </details>
  );
}

/**
 * Each held show's card title, from one settled read for the section. A
 * systemic TMDB failure makes every card unavailable rather than failing the
 * section: membership never depended on TMDB.
 */
async function heldTitles(
  ids: readonly number[],
): Promise<(showId: number) => CardTitle> {
  let found: Map<number, TvShow>;
  let missing: ReadonlySet<number>;
  try {
    const read = await getTvShowsSettled(ids);
    found = read.found;
    missing = new Set(read.missingIds);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return () => ({ kind: "unavailable" });
  }
  return (showId) => {
    const show = found.get(showId);
    if (show) {
      return { kind: "found", name: show.name, posterUrl: show.posterUrl };
    }
    return { kind: missing.has(showId) ? "missing" : "unavailable" };
  };
}

export { HeldShowsSection };
