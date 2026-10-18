import { Suspense } from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import {
  MovieCardBadge,
  MovieCardControls,
} from "@/components/tracking/movie-card-slots";
import {
  ShowCardBadge,
  ShowCardControls,
} from "@/components/tracking/show-card-slots";

import type { LandingItem } from "./landing-items";

/**
 * A landing card's badge (prompts/home-parallax-landing.md, decision 5): the
 * TMDB rating at once, swapped for the personal state the title's library
 * page gives it once the session read arrives, as on every catalog card
 * (prompts/catalog-card-status.md). `ids` is the whole section, so its badges
 * share one read.
 */
function LandingBadge({
  item,
  ids,
}: {
  item: LandingItem;
  ids: readonly number[];
}) {
  return (
    <Suspense fallback={<TmdbRatingBadge value={item.tmdbRating} />}>
      {item.mediaType === "tv" ? (
        <ShowCardBadge
          showId={item.id}
          tmdbRating={item.tmdbRating}
          gridShowIds={ids}
        />
      ) : (
        <MovieCardBadge
          movieId={item.id}
          releaseDate={item.releaseDate}
          tmdbRating={item.tmdbRating}
          gridMovieIds={ids}
        />
      )}
    </Suspense>
  );
}

/**
 * A landing card's bottom row (prompts/landing-card-controls.md): the plan or
 * track bookmark and, on an Upcoming title, its date pill, as the catalog
 * cards have. Its own Suspense with no fallback, so the artwork never waits
 * on the session, and the same `ids` as the badge, so both share one read.
 * A visitor gets nothing, as everywhere else. The return path is the landing
 * the card sits on.
 */
function LandingControls({
  item,
  ids,
}: {
  item: LandingItem;
  ids: readonly number[];
}) {
  return (
    <Suspense fallback={null}>
      {item.mediaType === "tv" ? (
        <ShowCardControls
          showId={item.id}
          name={item.title}
          gridShowIds={ids}
          returnPath="/shows"
        />
      ) : (
        <MovieCardControls
          movieId={item.id}
          title={item.title}
          releaseDate={item.releaseDate}
          gridMovieIds={ids}
          returnPath="/movies"
        />
      )}
    </Suspense>
  );
}

export { LandingBadge, LandingControls };
