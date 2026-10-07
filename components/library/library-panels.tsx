import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import {
  CATALOG_PATHS,
  type MediaType,
  typedHref,
} from "@/lib/catalog/media-type";
import {
  LIBRARY_CLASSIFY_LIMIT,
  LIBRARY_PAGE_SIZE,
  type LibraryTab,
  libraryLastPage,
} from "@/lib/tracking/library-lists";
import { LIBRARY_COPY, LIBRARY_NOTES } from "@/lib/tracking/messages";

import type { LibraryList } from "./types";

/**
 * The parts every library tab shares (spec 0008; spec 0020, AC-16, AC-17):
 * page links, the read's settling, the notes, and the empty, failed and
 * loading states. Server Components, with no read of their own.
 */

/**
 * One URL per page and tab: `type` always, as every navbar link writes it,
 * and `page` from page 2, as on `/movies`.
 */
export function pageHref(
  list: LibraryList,
  type: MediaType,
  page: number,
): string {
  return typedHref(`/${list}`, type, { page });
}

/** The page names a bad `type` panel sends the user back to. */
const LIST_NAMES = {
  watchlist: "Watchlist",
  upcoming: "Upcoming",
  watched: "Watched",
} as const;

/** A classified tab that read, with its last page. */
type SettledTab<Card> = {
  kind: "ok";
  cards: Card[];
  total: number;
  lastPage: number;
  failedCount: number;
  capped: boolean;
};

/**
 * A classified tab's read, as the page uses it: its cards and last page, or
 * the panel that replaces them. A page past the end redirects to the last
 * page (AC-16); a systemic TMDB failure is the existing failed panel with
 * Retry (AC-17).
 */
export function settleTab<Card>(
  tab: LibraryTab<Card>,
  list: LibraryList,
  type: MediaType,
  page: number,
): SettledTab<Card> | { kind: "panel"; panel: ReactNode } {
  if (tab.kind === "failed") {
    return {
      kind: "panel",
      panel: <ListFailed list={list} type={type} page={page} />,
    };
  }
  if (tab.kind === "tmdb_failed") {
    return {
      kind: "panel",
      panel: <TmdbFailed href={pageHref(list, type, page)} />,
    };
  }
  const lastPage = libraryLastPage(tab.total);
  if (page > lastPage) redirect(pageHref(list, type, lastPage));
  return { ...tab, lastPage };
}

/**
 * The notes above a classified tab (AC-16, AC-17): the ceiling, when it left
 * older titles unchecked, and the titles whose own TMDB read failed, with a
 * Retry that reloads the route. Both show on every tab of the media type,
 * because each tab classifies the same titles.
 */
export function TabNotes({
  tab,
  type,
  list,
  page,
}: {
  tab: { capped: boolean; failedCount: number };
  type: MediaType;
  list: LibraryList;
  page: number;
}) {
  if (!tab.capped && tab.failedCount === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {tab.capped ? (
        <p className="text-sm text-text-secondary">
          {LIBRARY_NOTES.checked(LIBRARY_CLASSIFY_LIMIT, type)}
        </p>
      ) : null}
      {tab.failedCount > 0 ? (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-secondary">
            {LIBRARY_NOTES.failed(tab.failedCount, type)}
          </p>
          <RetryLink href={pageHref(list, type, page)} />
        </div>
      ) : null}
    </div>
  );
}

export function EmptyPanel({
  list,
  type,
}: {
  list: LibraryList;
  type: MediaType;
}) {
  const copy = LIBRARY_COPY[list][type];
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title={copy.empty.title}
        description={copy.empty.description}
        action={
          <ButtonLink size="touch" href={CATALOG_PATHS[type]}>
            {copy.browse}
          </ButtonLink>
        }
      />
    </div>
  );
}

/**
 * Shown for a malformed page number or media type, before any read (spec
 * 0008, AC-9; feature 22). Never a silent redirect: the link was wrong, and
 * the panel says which part. A bad page keeps its tab; a bad type leads to
 * the default one.
 *
 * @param type The parsed type, or null when the type itself is the problem.
 */
export function NoSuchPage({
  list,
  type,
}: {
  list: LibraryList;
  type: MediaType | null;
}) {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description={
          type === null
            ? `There is no ${LIST_NAMES[list]} list at this address.`
            : "There are no titles at this page number."
        }
        action={
          <ButtonLink size="touch" href={pageHref(list, type ?? "tv", 1)}>
            {type === null ? `Back to ${LIST_NAMES[list]}` : "Back to page 1"}
          </ButtonLink>
        }
      />
    </div>
  );
}

/** A failed read of the list itself, or of the ratings its cards show. */
export function ListFailed({
  list,
  type,
  page,
}: {
  list: LibraryList;
  type: MediaType;
  page: number;
}) {
  return (
    <LoadFailed
      title={LIBRARY_COPY[list].failed}
      description="Your list didn't load. Try again in a moment."
      href={pageHref(list, type, page)}
    />
  );
}

/** A systemic TMDB failure: a rejected credential or a rate limit (AC-17). */
export function TmdbFailed({ href }: { href: string }) {
  return (
    <LoadFailed
      title="Couldn't reach TMDB"
      description="TMDB didn't respond, so the titles couldn't load. Try again in a moment."
      href={href}
    />
  );
}

function LoadFailed({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="py-12">
      <StatePanel
        variant="error"
        title={title}
        description={description}
        action={<RetryLink href={href} />}
      />
    </div>
  );
}

/** The static shell's stand in for the list, at the same footprint. */
export function LibrarySkeleton() {
  return (
    <PosterGrid aria-hidden="true">
      {Array.from({ length: LIBRARY_PAGE_SIZE }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index}>
          <PosterCardSkeleton />
        </li>
      ))}
    </PosterGrid>
  );
}
