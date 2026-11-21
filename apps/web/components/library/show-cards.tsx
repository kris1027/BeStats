import { upcomingEpisodePill } from "@bestats/core/catalog/library-card";
import {
  LIBRARY_CARD_MESSAGES,
  WATCHED_SHOW_LABELS,
} from "@bestats/core/tracking/messages";
import type { EpisodePlace } from "@bestats/core/tv/library-page";
import { PosterCard } from "@/components/poster-card";
import { CalculatedRatingBadge } from "@/components/rating-badges";
import type { LibraryTitle } from "@/lib/tracking/library-lists";

import { DatedPill, DateTbaPill } from "./dated-pill";
import { showCardLink } from "./ids";

/**
 * One show on Upcoming (spec 0020, AC-11): the poster, the name, and either
 * the next episode with its short date, "S2E1 · Oct 20", or "Date TBA". It
 * has no button: there is nothing to mark until the episode airs. The dates
 * are formatted here, beside the `today` that decided them.
 *
 * @param today `requestTodayUtc()`, for `formatShortDate`'s year rule.
 */
function UpcomingShowCard({
  showId,
  title,
  airDate,
  next,
  today,
  priority,
}: {
  showId: number;
  title: LibraryTitle;
  airDate: string | null;
  next: EpisodePlace | null;
  today: string;
  priority: boolean;
}) {
  return (
    <PosterCard
      title={title.name}
      posterUrl={title.posterUrl}
      {...showCardLink(showId)}
      controls={
        <UpcomingShowPill airDate={airDate} next={next} today={today} />
      }
      priority={priority}
    />
  );
}

/**
 * The next episode and its short date, or Date TBA, on an Upcoming show card
 * and on a catalog card for a show on Upcoming (prompts/catalog-card-status.md).
 * The words are core's `upcomingEpisodePill`, which the app reads too.
 */
function UpcomingShowPill({
  airDate,
  next,
  today,
}: {
  airDate: string | null;
  next: EpisodePlace | null;
  today: string;
}) {
  const pill = upcomingEpisodePill(airDate, next, today);
  if (pill.kind === "tba") return <DateTbaPill label={pill.label} />;
  return (
    <DatedPill
      slot="upcoming-date"
      longText
      label={pill.label}
      text={pill.text}
    />
  );
}

/**
 * One show on Watched (spec 0020, AC-12): the spec 0019 card, with the
 * calculated show rating badge when a regular season is rated, no button and
 * no TMDB rating, and a label under the name, Finished for a show TMDB calls
 * ended or canceled, Caught up otherwise. Its history is edited on the show
 * page, never from this grid.
 *
 * @param showRating The calculated show rating, unrounded, or null.
 */
function WatchedShowCard({
  showId,
  title,
  label,
  showRating,
  priority,
}: {
  showId: number;
  title: LibraryTitle;
  label: keyof typeof WATCHED_SHOW_LABELS;
  showRating: number | null;
  priority: boolean;
}) {
  return (
    <PosterCard
      title={title.name}
      posterUrl={title.posterUrl}
      {...showCardLink(showId)}
      badge={
        showRating === null ? undefined : (
          <CalculatedRatingBadge
            value={showRating}
            label={LIBRARY_CARD_MESSAGES.yourShowRating}
          />
        )
      }
      meta={WATCHED_SHOW_LABELS[label]}
      priority={priority}
    />
  );
}

export { UpcomingShowCard, UpcomingShowPill, WatchedShowCard };
