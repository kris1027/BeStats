import { EpisodeRow } from "@/components/show/episode-row";
import type { Episode } from "@/lib/tmdb";

/**
 * Stills that load eagerly: the first two rows, which is what fits above the
 * fold on a desktop season page. The counterpart of the landing's
 * `EAGER_POSTERS` (spec 0009, AC-10); every later still loads lazily, so a
 * season of hundreds of episodes stays usable.
 */
const EAGER_STILLS = 2;

/**
 * Every episode of one season, in episode number order, with no pagination
 * (spec 0009, AC-10). The input is copied before sorting because it is a
 * cached value.
 */
function EpisodeList({
  seasonName,
  episodes,
}: {
  seasonName: string;
  episodes: Episode[];
}) {
  const ordered = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber,
  );

  return (
    <ol
      aria-label={`Episodes of ${seasonName}`}
      className="flex flex-col divide-y divide-border border-y border-border"
    >
      {ordered.map((episode, index) => (
        <li key={episode.id}>
          <EpisodeRow episode={episode} eager={index < EAGER_STILLS} />
        </li>
      ))}
    </ol>
  );
}

export { EAGER_STILLS, EpisodeList };
