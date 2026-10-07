import { PosterCard } from "@/components/poster-card";
import { CalculatedRatingBadge } from "@/components/rating-badges";
import { formatAirDate, formatShortDate } from "@/lib/format";
import type { LibraryTitle } from "@/lib/tracking/library-lists";
import {
  UPCOMING_MESSAGES,
  WATCHED_SHOW_LABELS,
} from "@/lib/tracking/messages";
import type { EpisodePlace } from "@/lib/tv/library-page";

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

function UpcomingShowPill({
  airDate,
  next,
  today,
}: {
  airDate: string | null;
  next: EpisodePlace | null;
  today: string;
}) {
  if (airDate !== null && next !== null) {
    const fullDate = formatAirDate(airDate) ?? airDate;
    const shortDate = formatShortDate(airDate, today) ?? fullDate;
    return (
      <DatedPill
        slot="upcoming-date"
        label={UPCOMING_MESSAGES.episodeAirs(
          next.season,
          next.episode,
          fullDate,
        )}
        text={UPCOMING_MESSAGES.datedPill(next.season, next.episode, shortDate)}
      />
    );
  }
  return (
    <DateTbaPill
      label={
        next === null
          ? UPCOMING_MESSAGES.showDateTba
          : UPCOMING_MESSAGES.episodeDateTba(next.season, next.episode)
      }
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
          <CalculatedRatingBadge value={showRating} label="Your show rating" />
        )
      }
      meta={WATCHED_SHOW_LABELS[label]}
      priority={priority}
    />
  );
}

export { UpcomingShowCard, WatchedShowCard };
