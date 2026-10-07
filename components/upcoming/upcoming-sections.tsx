import type { ReactNode } from "react";

import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import {
  type MediaType,
  parseMediaTypeParam,
  typedHref,
} from "@/lib/catalog/media-type";
import { formatAirDate, formatShortDate } from "@/lib/format";
import { getMovieSummaries, getTvShowsByIds, TmdbError } from "@/lib/tmdb";
import { reconcileUpNextShows } from "@/lib/tracking/auto-completion";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { logTrackingEvent, TRACKING_EVENT } from "@/lib/tracking/log";
import {
  COMING_SOON_MESSAGES,
  UP_NEXT_MESSAGES,
} from "@/lib/tracking/messages";
import { showIdsKey } from "@/lib/tracking/show-state";
import {
  comingSoonMovies,
  getUpcomingMovieCandidates,
  getUpNextShows,
  UPCOMING_MOVIE_CHECK_LIMIT,
} from "@/lib/tracking/up-next";

import type { ComingSoonItem } from "./coming-soon-card";
import { ComingSoonGrid } from "./coming-soon-grid";
import { COMING_SOON_HEADING_ID, UP_NEXT_HEADING_ID } from "./ids";
import { UpNextCard, type UpNextItem } from "./up-next-card";

/** Posters that load eagerly: one full row at the widest grid. */
const EAGER_POSTERS = 6;

type UpNextSection = { kind: "ok"; items: UpNextItem[] } | { kind: "failed" };

type ComingSoonSection =
  | { kind: "ok"; items: ComingSoonItem[]; total: number }
  | { kind: "failed" };

/**
 * Everything on `/upcoming` below its heading (spec 0014, AC-2, AC-3, AC-11,
 * AC-14). It streams behind the page's one Suspense boundary, because it
 * reads the session, the search params and the user's rows.
 *
 * `requireUser()` first, outside any `try`, so a request that got past the
 * proxy still reads nothing (AC-1). Then the navbar tab's `type` parameter
 * picks the one section shown (feature 22): Up Next on the shows tab, Coming
 * soon on the movies tab, each with its own empty state and its own Retry.
 * An invalid type shows a panel before any read, never a redirect. Only the
 * shows tab runs the automatic completion check, because it exists to keep
 * the Up Next list right (spec 0015, AC-11); the movies tab writes nothing.
 */
async function UpcomingSections({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const type = parseMediaTypeParam((await searchParams).type);
  if (type === null) return <NoSuchTab />;

  if (type === "tv") {
    return (
      <Section id={UP_NEXT_HEADING_ID} heading={UP_NEXT_MESSAGES.heading}>
        <UpNextBody section={await loadUpNext()} />
      </Section>
    );
  }

  return (
    <Section id={COMING_SOON_HEADING_ID} heading={COMING_SOON_MESSAGES.heading}>
      <ComingSoonBody section={await loadComingSoon(requestTodayUtc())} />
    </Section>
  );
}

/** Shown for a `type` that names neither catalog, before any read. */
function NoSuchTab() {
  return (
    <div className="py-12">
      <StatePanel
        variant="empty"
        title="That page doesn't exist"
        description="There is no Upcoming list at this address."
        action={
          <ButtonLink size="touch" href={typedHref("/upcoming", "tv")}>
            Back to Upcoming
          </ButtonLink>
        }
      />
    </div>
  );
}

/**
 * The Watching shows, in the view's order, with their TMDB names (AC-3),
 * after the automatic completion check has run (spec 0015, AC-11).
 * A show TMDB no longer has stays as a missing title card (AC-7); a
 * systemic TMDB failure fails the section rather than showing every show as
 * missing (`AGENTS.md` section 12).
 */
async function loadUpNext(): Promise<UpNextSection> {
  // The automatic completion check first, so the list below already holds
  // its result (spec 0015, AC-11). Only the shows tab gets here, so the
  // movies tab never writes (feature 22).
  await reconcileUpNextShows();
  const shows = await getUpNextShows();
  if (shows.kind !== "ok") return { kind: "failed" };
  if (shows.state.length === 0) return { kind: "ok", items: [] };

  let found: Awaited<ReturnType<typeof getTvShowsByIds>>["found"];
  try {
    found = (await getTvShowsByIds(shows.state)).found;
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.upNextRead, "tmdb_unavailable");
    return { kind: "failed" };
  }

  const byId = new Map(found.map((show) => [show.id, show]));
  return {
    kind: "ok",
    items: shows.state.map((showId) => {
      const show = byId.get(showId);
      return {
        showId,
        name: show?.name ?? null,
        posterUrl: show?.posterUrl ?? null,
      };
    }),
  };
}

/**
 * The planned movies not released yet, soonest first (AC-11). The dates are
 * formatted here, beside the `today` that decided them, so the client grid
 * never reads a clock.
 */
async function loadComingSoon(today: string): Promise<ComingSoonSection> {
  const candidates = await getUpcomingMovieCandidates();
  if (candidates.kind !== "ok") return { kind: "failed" };
  const { ids, total } = candidates.state;
  if (ids.length === 0) return { kind: "ok", items: [], total };

  let found: Awaited<ReturnType<typeof getMovieSummaries>>["found"];
  try {
    found = (await getMovieSummaries(ids)).found;
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.comingSoonRead, "tmdb_unavailable");
    return { kind: "failed" };
  }

  const items = comingSoonMovies(found, today).map((movie) => {
    const fullDate = formatAirDate(movie.releaseDate) ?? movie.releaseDate;
    return {
      movieId: movie.id,
      title: movie.title,
      posterUrl: movie.posterUrl,
      releaseDate: movie.releaseDate,
      shortDate: formatShortDate(movie.releaseDate, today) ?? fullDate,
      fullDate,
    };
  });
  return { kind: "ok", items, total };
}

function UpNextBody({ section }: { section: UpNextSection }) {
  if (section.kind === "failed") {
    return <SectionFailed message={UP_NEXT_MESSAGES.failed} type="tv" />;
  }
  if (section.items.length === 0) {
    return (
      <SectionEmpty
        message={UP_NEXT_MESSAGES.empty}
        browse={UP_NEXT_MESSAGES.browse}
        href="/shows"
      />
    );
  }

  // One key for the section, so every card shares one watched ids read
  // (AC-6).
  const watchedIdsKey = showIdsKey(section.items.map((item) => item.showId));
  return (
    <PosterGrid aria-label={UP_NEXT_MESSAGES.gridLabel}>
      {section.items.map((item, index) => (
        <li key={item.showId}>
          <UpNextCard
            item={item}
            watchedIdsKey={watchedIdsKey}
            priority={index < EAGER_POSTERS}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

function ComingSoonBody({ section }: { section: ComingSoonSection }) {
  if (section.kind === "failed") {
    return <SectionFailed message={COMING_SOON_MESSAGES.failed} type="movie" />;
  }

  // Only the ceiling is stated, never a count of upcoming movies beyond what
  // is shown (AC-11).
  const ceiling =
    section.total > UPCOMING_MOVIE_CHECK_LIMIT ? (
      <p className="text-sm text-text-secondary">
        {COMING_SOON_MESSAGES.checkedLimit(UPCOMING_MOVIE_CHECK_LIMIT)}
      </p>
    ) : null;

  if (section.items.length === 0) {
    return (
      <>
        {ceiling}
        <SectionEmpty
          message={COMING_SOON_MESSAGES.empty}
          browse={COMING_SOON_MESSAGES.browse}
          href="/movies"
        />
      </>
    );
  }

  return (
    <>
      {ceiling}
      <ComingSoonGrid items={section.items} />
    </>
  );
}

/**
 * One section: an h2 in the page heading's style, a step smaller. Either
 * heading can take the focus: removing the last Coming soon card moves it
 * there (AC-12), and so does a mark that completes the last Up Next show
 * (spec 0015, AC-7).
 */
function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2
        id={id}
        tabIndex={-1}
        className="text-2xl leading-tight font-bold tracking-[-0.02em] text-foreground"
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

function SectionEmpty({
  message,
  browse,
  href,
}: {
  message: string;
  browse: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary">{message}</p>
      <ButtonLink size="touch" href={href}>
        {browse}
      </ButtonLink>
    </div>
  );
}

/** A section whose read failed: its own message and a full page Retry. */
function SectionFailed({
  message,
  type,
}: {
  message: string;
  type: MediaType;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary">{message}</p>
      <RetryLink href={typedHref("/upcoming", type)} />
    </div>
  );
}

/** The static shell's stand in for the tab's one section (AC-2). */
function UpcomingSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <Skeleton shape="line" className="h-7 w-40" />
      <SectionGridSkeleton />
    </div>
  );
}

/** One row of poster placeholders, under a heading already on screen. */
function SectionGridSkeleton() {
  return (
    <PosterGrid aria-hidden="true">
      {Array.from({ length: EAGER_POSTERS }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index}>
          <PosterCardSkeleton />
        </li>
      ))}
    </PosterGrid>
  );
}

export { UpcomingSections, UpcomingSkeleton };
