import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailHero } from "@/components/catalog/detail-hero";
import { CastRowSkeleton } from "@/components/catalog/detail-skeletons";
import { CastRow } from "@/components/movie/cast-row";
import { MovieOverview } from "@/components/movie/movie-overview";
import { RetryLink } from "@/components/retry-link";
import { SeasonGrid } from "@/components/show/season-grid";
import { ShowDetailSkeleton } from "@/components/show/show-detail-skeleton";
import { ShowMeta } from "@/components/show/show-meta";
import { StatePanel } from "@/components/state-panel";
import { ShowRatingSlot } from "@/components/tracking/show-rating-slot";
import { parseTmdbId } from "@/lib/catalog/ids";
import { orderSeasons } from "@/lib/catalog/seasons";
import { formatAirSpan, truncateAtWord } from "@/lib/format";
import {
  getShowCast,
  isTmdbNotFound,
  TmdbError,
  type TmdbErrorKind,
} from "@/lib/tmdb";

import { loadShow } from "./load-show";

/** Longest meta description the page emits (spec 0009, AC-16). */
const DESCRIPTION_LIMIT = 160;

/**
 * The tab title and description, from the same `loadShow` the body uses
 * (spec 0009, AC-16). The not found branch sets `noindex` itself, because the
 * status is already 200 by the time the body decides (a soft 404, AC-14).
 */
export async function generateMetadata({
  params,
}: PageProps<"/shows/[id]">): Promise<Metadata> {
  const id = parseTmdbId((await params).id);
  if (id === null) return { title: "Show not found", robots: { index: false } };

  const result = await loadShow(id);
  if (result.kind === "not_found") {
    return { title: "Show not found", robots: { index: false } };
  }
  if (result.kind === "failed") return { title: "Show" };

  const { name, firstAirYear, overview } = result.show;
  return {
    title: firstAirYear === null ? name : `${name} (${firstAirYear})`,
    description:
      overview === null
        ? undefined
        : truncateAtWord(overview, DESCRIPTION_LIMIT),
  };
}

/**
 * A public TV show page (spec 0009).
 *
 * The page itself is a static shell, only the Suspense boundary and its
 * skeleton, so navigation commits instantly and `pnpm build` prerenders it
 * without calling TMDB (AC-17). Everything that needs the id streams inside.
 *
 * Nothing here reads a cookie, a header or a session (AC-18). The signed in
 * user's calculated ratings (spec 0012) stream from `components/tracking/`
 * beside the Seasons heading and on each season card. The hero's tracking
 * slot is left empty until feature 14 adds the status control.
 */
export default function ShowPage({ params }: PageProps<"/shows/[id]">) {
  return (
    <Suspense fallback={<ShowDetailSkeleton />}>
      <ShowDetail params={params} />
    </Suspense>
  );
}

/**
 * The show body, everything that needs the id and the TMDB response.
 *
 * The show rating sits in its own Suspense boundary with no fallback, so the
 * one read that touches the session (spec 0012) never holds back the public
 * catalog content around it, and a signed out visitor sees nothing in its
 * place rather than a placeholder for a value they cannot have.
 */
async function ShowDetail({
  params,
}: {
  params: PageProps<"/shows/[id]">["params"];
}) {
  // `proxy.ts` already answered a malformed id with a real 404; this is the
  // same rule again for any request that did not pass through it.
  const id = parseTmdbId((await params).id);
  if (id === null) notFound();

  const result = await loadShow(id);
  if (result.kind === "not_found") notFound();

  if (result.kind === "failed") {
    return <TmdbFailure href={`/shows/${id}`} />;
  }

  const { show } = result;

  return (
    <article className="flex flex-col gap-10 md:gap-14">
      <DetailHero
        title={show.name}
        tagline={show.tagline}
        posterUrl={show.posterUrl}
        backdropUrl={show.backdropUrl}
        meta={
          <ShowMeta
            airSpan={formatAirSpan(show)}
            status={show.status}
            genres={show.genres}
          />
        }
        tmdbRating={show.tmdbRating}
        tmdbVoteCount={show.tmdbVoteCount}
      />

      <section
        aria-labelledby="overview-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="overview-heading" className={SECTION_HEADING}>
          Overview
        </h2>
        <MovieOverview
          overview={show.overview}
          language={show.overviewLanguage}
        />
      </section>

      <section
        aria-labelledby="seasons-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="seasons-heading" className={SECTION_HEADING}>
            Seasons
          </h2>
          <Suspense fallback={null}>
            <ShowRatingSlot showId={id} />
          </Suspense>
        </div>
        <SeasonGrid
          showId={id}
          showName={show.name}
          showPosterUrl={show.posterUrl}
          seasons={orderSeasons(show.seasons)}
        />
      </section>

      <section aria-labelledby="cast-heading" className="flex flex-col gap-4">
        <h2 id="cast-heading" className={SECTION_HEADING}>
          Cast
        </h2>
        <Suspense fallback={<CastRowSkeleton />}>
          <ShowCast id={id} />
        </Suspense>
      </section>
    </article>
  );
}

const SECTION_HEADING =
  "text-xl leading-tight font-bold text-foreground md:text-2xl";

const NO_CAST_MESSAGE = "TMDB lists no cast for this show.";

/** Failures a retry can fix; the rest are cached as settled answers. */
const TRANSIENT_KINDS: ReadonlySet<TmdbErrorKind> = new Set([
  "timeout",
  "rate_limited",
  "upstream",
]);

/**
 * The series cast, streamed on its own so a slow or failed aggregate credits
 * read never holds back or takes down the rest of the page (spec 0009, AC-8).
 * Only a transient failure offers Retry: a missing or unreadable credits
 * response is cached for minutes, so retrying it would just repeat the failure.
 */
async function ShowCast({ id }: { id: number }) {
  try {
    const cast = await getShowCast(id);
    return <CastRow cast={cast} emptyMessage={NO_CAST_MESSAGE} />;
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    if (isTmdbNotFound(error)) {
      return <CastRow cast={[]} emptyMessage={NO_CAST_MESSAGE} />;
    }
    if (!TRANSIENT_KINDS.has(error.kind)) {
      return (
        <StatePanel
          variant="empty"
          title="Cast unavailable"
          description="TMDB's cast listing for this show couldn't be read."
        />
      );
    }
    return (
      <StatePanel
        variant="error"
        title="Couldn't reach TMDB"
        description="TMDB didn't respond. Try again in a moment."
        action={<RetryLink href={`/shows/${id}`} />}
      />
    );
  }
}

/** TMDB timed out, rate limited or failed upstream (spec 0009, AC-15). */
function TmdbFailure({ href }: { href: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="error"
        title="Couldn't reach TMDB"
        description="TMDB didn't respond. Try again in a moment."
        action={<RetryLink href={href} />}
      />
    </div>
  );
}
