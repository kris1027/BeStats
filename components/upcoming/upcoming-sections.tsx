import { type ReactNode, Suspense } from "react";

import { PosterGrid } from "@/components/poster-grid";
import { RetryLink } from "@/components/retry-link";
import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/user";
import { formatAirDate, formatShortDate } from "@/lib/format";
import { getMovieSummaries, getTvShowsByIds, TmdbError } from "@/lib/tmdb";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { logTrackingEvent, TRACKING_EVENT } from "@/lib/tracking/log";
import {
  COMING_SOON_MESSAGES,
  UP_NEXT_MESSAGES,
  UPCOMING_EMPTY_MESSAGES,
} from "@/lib/tracking/messages";
import { showIdsKey } from "@/lib/tracking/show-state";
import {
  comingSoonMovies,
  getUpcomingMovieCandidates,
  getUpNextShows,
  showsNothingUpcomingPanel,
  UPCOMING_MOVIE_CHECK_LIMIT,
} from "@/lib/tracking/up-next";

import type { ComingSoonItem } from "./coming-soon-card";
import { ComingSoonGrid } from "./coming-soon-grid";
import { COMING_SOON_HEADING_ID, UPCOMING_PATH } from "./ids";
import { UpNextCard, type UpNextItem } from "./up-next-card";

/** Posters that load eagerly: one full row at the widest grid. */
const EAGER_POSTERS = 6;

const UP_NEXT_HEADING_ID = "up-next-heading";

type UpNextSection = { kind: "ok"; items: UpNextItem[] } | { kind: "failed" };

type ComingSoonSection =
  | { kind: "ok"; items: ComingSoonItem[]; total: number }
  | { kind: "failed" };

/**
 * Everything on `/upcoming` below its heading (spec 0014, AC-2, AC-3, AC-11,
 * AC-13, AC-14). It streams behind the page's one Suspense boundary, because
 * it reads the session and the user's rows.
 *
 * `requireUser()` first, outside any `try`, so a request that got past the
 * proxy still reads nothing (AC-1). Then both sections' reads start at once,
 * but only Up Next is awaited: the Coming soon read (up to 200 movie
 * summaries, the slow part of a cold load) streams in its own boundary, so
 * it never holds back the Up Next cards. Only an empty Up Next waits for it,
 * because the one "Nothing upcoming yet" panel appears only when both reads
 * succeeded, both came back empty, and no planned movie went unchecked
 * (AC-13). Each read fails on its own (AC-14).
 */
async function UpcomingSections() {
  await requireUser();
  const today = requestTodayUtc();

  const comingSoon = loadComingSoon(today);
  // Handled by whichever branch awaits it; this only stops a rejection from
  // being reported as unhandled when the Up Next read throws first.
  comingSoon.catch(() => {});
  const upNext = await loadUpNext();

  let comingSoonBody: ReactNode = (
    <Suspense fallback={<SectionGridSkeleton />}>
      <StreamedComingSoon section={comingSoon} />
    </Suspense>
  );

  if (upNext.kind === "ok" && upNext.items.length === 0) {
    const settled = await comingSoon;
    if (
      showsNothingUpcomingPanel(
        0,
        settled.kind === "ok"
          ? { count: settled.items.length, total: settled.total }
          : null,
      )
    ) {
      return (
        <div className="py-12">
          <StatePanel
            variant="empty"
            title={UPCOMING_EMPTY_MESSAGES.title}
            description={UPCOMING_EMPTY_MESSAGES.description}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink size="touch" href="/shows">
                  {UP_NEXT_MESSAGES.browse}
                </ButtonLink>
                <ButtonLink size="touch" href="/movies">
                  {COMING_SOON_MESSAGES.browse}
                </ButtonLink>
              </div>
            }
          />
        </div>
      );
    }
    comingSoonBody = <ComingSoonBody section={settled} />;
  }

  return (
    <>
      <Section
        id={UP_NEXT_HEADING_ID}
        heading={UP_NEXT_MESSAGES.heading}
        focusable={false}
      >
        <UpNextBody section={upNext} />
      </Section>
      <Section
        id={COMING_SOON_HEADING_ID}
        heading={COMING_SOON_MESSAGES.heading}
        focusable
      >
        {comingSoonBody}
      </Section>
    </>
  );
}

/**
 * The Watching shows, in the view's order, with their TMDB names (AC-3).
 * A show TMDB no longer has stays as a missing title card (AC-7); a
 * systemic TMDB failure fails the section rather than showing every show as
 * missing (`AGENTS.md` section 12).
 */
async function loadUpNext(): Promise<UpNextSection> {
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
    return <SectionFailed message={UP_NEXT_MESSAGES.failed} />;
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

/** The Coming soon read already running, awaited inside its own boundary. */
async function StreamedComingSoon({
  section,
}: {
  section: Promise<ComingSoonSection>;
}) {
  return <ComingSoonBody section={await section} />;
}

function ComingSoonBody({ section }: { section: ComingSoonSection }) {
  if (section.kind === "failed") {
    return <SectionFailed message={COMING_SOON_MESSAGES.failed} />;
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
 * One section: an h2 in the page heading's style, a step smaller. The Coming
 * soon heading can take the focus, because removing its last card moves the
 * focus there (AC-12).
 */
function Section({
  id,
  heading,
  focusable,
  children,
}: {
  id: string;
  heading: string;
  focusable: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2
        id={id}
        tabIndex={focusable ? -1 : undefined}
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
function SectionFailed({ message }: { message: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary">{message}</p>
      <RetryLink href={UPCOMING_PATH} />
    </div>
  );
}

/** The static shell's stand in for both sections (AC-2). */
function UpcomingSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-5">
          <Skeleton shape="line" className="h-7 w-40" />
          <SectionGridSkeleton />
        </div>
      ))}
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
