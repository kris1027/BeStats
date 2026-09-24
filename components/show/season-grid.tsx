import { PosterCard } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";
import { seasonMetaParts } from "@/lib/format";
import type { SeasonSummary } from "@/lib/tmdb";

/**
 * The show page's season cards (spec 0009, AC-7), in the order the caller
 * passes, which is `orderSeasons`: regular seasons ascending, Specials last.
 *
 * Every season is shown, including one TMDB lists with no episodes yet,
 * because hiding it would make the show look shorter than TMDB says it is.
 * A season with no poster of its own borrows the show's, which is TMDB's own
 * artwork for the same title, and only then falls back to the tile.
 */
function SeasonGrid({
  showId,
  showName,
  showPosterUrl,
  seasons,
}: {
  showId: number;
  showName: string;
  showPosterUrl: string | null;
  seasons: SeasonSummary[];
}) {
  if (seasons.length === 0) {
    return (
      <p className="text-[15px] text-muted-foreground">
        TMDB lists no seasons for this show yet.
      </p>
    );
  }

  return (
    <PosterGrid aria-label={`Seasons of ${showName}`}>
      {seasons.map((season) => (
        <li key={season.seasonNumber}>
          <PosterCard
            title={season.name}
            posterUrl={season.posterUrl ?? showPosterUrl}
            href={`/shows/${showId}/season/${season.seasonNumber}`}
            meta={seasonMetaParts(season.airDate, season.episodeCount).join(
              " · ",
            )}
          />
        </li>
      ))}
    </PosterGrid>
  );
}

export { SeasonGrid };
