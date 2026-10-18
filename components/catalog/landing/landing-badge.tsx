import { Suspense } from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import { MovieCardBadge } from "@/components/tracking/movie-card-slots";
import { ShowCardBadge } from "@/components/tracking/show-card-slots";

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

export { LandingBadge };
