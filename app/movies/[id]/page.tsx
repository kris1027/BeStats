import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CastRow } from "@/components/movie/cast-row";
import { MovieDetailSkeleton } from "@/components/movie/movie-detail-skeleton";
import { MovieHero } from "@/components/movie/movie-hero";
import { MovieOverview } from "@/components/movie/movie-overview";
import { RetryLink } from "@/components/retry-link";
import { StatePanel } from "@/components/state-panel";
import { parseMovieId } from "@/lib/catalog/ids";
import { truncateAtWord } from "@/lib/format";

import { loadMovie } from "./load-movie";

/** Longest meta description the page emits (spec 0006, AC-12). */
const DESCRIPTION_LIMIT = 160;

/**
 * The tab title and description, from the same `loadMovie` the body uses
 * (spec 0006, AC-12).
 *
 * The not found branch also sets `noindex` itself rather than relying only on
 * the tag Next injects for `notFound()`, because the status is already 200 by
 * the time the body decides (a soft 404, AC-9) and the tag is what keeps the
 * page out of search results.
 */
export async function generateMetadata({
  params,
}: PageProps<"/movies/[id]">): Promise<Metadata> {
  const id = parseMovieId((await params).id);
  if (id === null)
    return { title: "Movie not found", robots: { index: false } };

  const result = await loadMovie(id);
  if (result.kind === "not_found") {
    return { title: "Movie not found", robots: { index: false } };
  }
  if (result.kind === "failed") return { title: "Movie" };

  const { title, releaseYear, overview } = result.movie;
  return {
    title: releaseYear === null ? title : `${title} (${releaseYear})`,
    description:
      overview === null
        ? undefined
        : truncateAtWord(overview, DESCRIPTION_LIMIT),
  };
}

/**
 * A public movie page (spec 0006).
 *
 * The page itself is a static shell: only the Suspense boundary and its
 * skeleton, so navigation commits instantly and `pnpm build` prerenders it
 * without calling TMDB (AC-11). Everything that needs the id streams inside
 * the boundary.
 *
 * Nothing here reads a cookie, a header or a session (AC-13). Tracking controls
 * are feature 8's, and this page leaves them their place in `MovieHero`.
 */
export default function MoviePage({ params }: PageProps<"/movies/[id]">) {
  return (
    <Suspense fallback={<MovieDetailSkeleton />}>
      <MovieDetail params={params} />
    </Suspense>
  );
}

async function MovieDetail({
  params,
}: {
  params: PageProps<"/movies/[id]">["params"];
}) {
  // `proxy.ts` already answered a malformed id with a real 404; this is the
  // same rule again for any request that did not pass through it.
  const id = parseMovieId((await params).id);
  if (id === null) notFound();

  const result = await loadMovie(id);
  if (result.kind === "not_found") notFound();

  if (result.kind === "failed") {
    return (
      <div className="flex flex-1 flex-col justify-center py-12">
        <StatePanel
          variant="error"
          title="Couldn't reach TMDB"
          description="TMDB didn't respond. Try again in a moment."
          action={<RetryLink href={`/movies/${id}`} />}
        />
      </div>
    );
  }

  const { movie } = result;

  return (
    <article className="flex flex-col gap-10 md:gap-14">
      <MovieHero
        title={movie.title}
        tagline={movie.tagline}
        posterUrl={movie.posterUrl}
        backdropUrl={movie.backdropUrl}
        releaseYear={movie.releaseYear}
        runtimeMinutes={movie.runtimeMinutes}
        genres={movie.genres}
        tmdbRating={movie.tmdbRating}
        tmdbVoteCount={movie.tmdbVoteCount}
      />

      <section
        aria-labelledby="overview-heading"
        className="flex flex-col gap-3"
      >
        <h2
          id="overview-heading"
          className="text-xl leading-tight font-bold text-foreground md:text-2xl"
        >
          Overview
        </h2>
        <MovieOverview
          overview={movie.overview}
          language={movie.overviewLanguage}
        />
      </section>

      <section aria-labelledby="cast-heading" className="flex flex-col gap-4">
        <h2
          id="cast-heading"
          className="text-xl leading-tight font-bold text-foreground md:text-2xl"
        >
          Cast
        </h2>
        <CastRow cast={movie.cast} />
      </section>
    </article>
  );
}
