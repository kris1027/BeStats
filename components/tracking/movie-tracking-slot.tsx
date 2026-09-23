import { RetryLink } from "@/components/retry-link";
import { TRACKING_READ_FAILED } from "@/lib/tracking/messages";
import { getMovieTracking } from "@/lib/tracking/movie-state";

import { MovieTrackingControls } from "./movie-tracking-controls";

/**
 * The movie page's tracking slot: nothing for a visitor, the retry line when
 * the read fails, otherwise the controls with the stored state (spec 0007,
 * AC-1, AC-2, AC-17).
 *
 * It reads the session, so the page renders it inside its own Suspense
 * boundary with a `null` fallback. A visitor therefore never sees a skeleton
 * for controls they will not get, and a signed in user never sees a default
 * state that then corrects itself: the row appears once, already right.
 *
 * @param movieId The movie, already confirmed by `loadMovie`.
 * @param title The TMDB title, for every accessible name.
 */
async function MovieTrackingSlot({
  movieId,
  title,
}: {
  movieId: number;
  title: string;
}) {
  const result = await getMovieTracking(movieId);
  const returnPath = `/movies/${movieId}`;

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="movie-tracking-failed"
        className="flex flex-wrap items-center gap-3"
      >
        <p className="text-sm text-muted-foreground">{TRACKING_READ_FAILED}</p>
        <RetryLink href={returnPath} className="md:h-9" />
      </div>
    );
  }

  return (
    <MovieTrackingControls
      movieId={movieId}
      title={title}
      state={result.state}
      returnPath={returnPath}
    />
  );
}

export { MovieTrackingSlot };
