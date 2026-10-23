import { Gamepad2Icon } from "lucide-react";
import type * as React from "react";

import { DetailHero, IgdbRatingBlock } from "@/components/catalog/detail-hero";
import { GenreChips, MetaLine } from "@/components/catalog/detail-hero-meta";
import { formatAirDate } from "@/lib/format";
import type { Game, GameType } from "@/lib/igdb";

type GameHeroProps = {
  /**
   * The status control G4 adds, under the rating block. Empty until then; a
   * slot already, so G4 drops it in without reshaping the hero (spec 0025).
   */
  tracking?: React.ReactNode;
} & Pick<
  Game,
  | "name"
  | "coverUrl"
  | "releaseDate"
  | "gameType"
  | "genres"
  | "platforms"
  | "communityRating"
  | "communityRatingCount"
>;

/**
 * The words for a release that is not a plain main game (spec 0025, AC-2). A
 * main game needs no label, and `other` only ever belongs to a hidden game,
 * which never reaches the hero (AC-7), so neither has an entry.
 */
const RELEASE_KIND_LABELS: Partial<Record<GameType, string>> = {
  remake: "Remake",
  remaster: "Remaster",
  expanded_game: "Expanded game",
  standalone_expansion: "Standalone expansion",
};

/**
 * The top of a game page (spec 0025, AC-1): the shared `DetailHero` in its no
 * backdrop layout, because G3 reads no IGDB artwork, and with no tagline,
 * because games have none.
 *
 * The meta row and the platforms line both go in the `meta` slot, so they sit
 * above the IGDB rating as the AC orders them. Every missing value is left
 * out rather than filled (AC-5): no `TBA`, no `0`, no today's date.
 */
function GameHero({
  name,
  coverUrl,
  releaseDate,
  gameType,
  genres,
  platforms,
  communityRating,
  communityRatingCount,
  tracking,
}: GameHeroProps) {
  const meta = [
    formatAirDate(releaseDate),
    gameType === null ? null : (RELEASE_KIND_LABELS[gameType] ?? null),
  ].filter((part): part is string => part !== null);

  return (
    <DetailHero
      title={name}
      tagline={null}
      posterUrl={coverUrl}
      backdropUrl={null}
      fallbackIcon={Gamepad2Icon}
      meta={<GameMeta meta={meta} genres={genres} platforms={platforms} />}
      rating={
        <IgdbRatingBlock value={communityRating} count={communityRatingCount} />
      }
      tracking={tracking}
    />
  );
}

/**
 * The date and release kind with the genre chips in one wrapping row, then
 * the platforms line, or nothing when the game has none of them.
 */
function GameMeta({
  meta,
  genres,
  platforms,
}: {
  meta: string[];
  genres: Game["genres"];
  platforms: Game["platforms"];
}) {
  const hasRow = meta.length > 0 || genres.length > 0;
  if (!hasRow && platforms.length === 0) return null;

  return (
    <>
      {hasRow ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {meta.length > 0 ? <MetaLine parts={meta} /> : null}
          {genres.length > 0 ? <GenreChips genres={genres} /> : null}
        </div>
      ) : null}
      {platforms.length > 0 ? <PlatformsLine platforms={platforms} /> : null}
    </>
  );
}

/**
 * Every platform as one muted, wrapping line (spec 0025, AC-3). Sorted by name
 * because IGDB promises no order, so the line reads the same on every visit.
 * Plain text, not chips: a game can list a dozen platforms, and there is no
 * platform page to open.
 */
function PlatformsLine({ platforms }: { platforms: Game["platforms"] }) {
  const names = platforms
    .map((platform) => platform.name)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  return (
    <p data-slot="game-platforms" className="text-sm text-muted-foreground">
      Platforms: {names.join(", ")}
    </p>
  );
}

export { GameHero };
