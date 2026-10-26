import {
  type Fact,
  FactsPanel,
  textFact,
} from "@/components/catalog/title-details";
import { formatGameReleaseDate } from "@/lib/format";
import type { Game, GameRef } from "@/lib/igdb";

/** Names joined in IGDB's order, or null with none (spec 0031, AC-9). */
function names(refs: GameRef[]): string | null {
  return refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");
}

/** `singular` for one entry, `plural` for more (AC-9). */
function label(refs: GameRef[], singular: string, plural: string): string {
  return refs.length > 1 ? plural : singular;
}

/**
 * One line per platform, `{platform}: {date}`, already sorted by the module
 * with TBA last (AC-10). No cap: a game lists a handful of platforms.
 */
function releaseDatesFact(game: Pick<Game, "platformReleases">): Fact | null {
  if (game.platformReleases.length === 0) return null;
  return {
    label: "Release dates",
    value: (
      <ul className="flex flex-col gap-1">
        {game.platformReleases.map(({ platform, release }) => (
          <li key={platform}>
            {platform}: {formatGameReleaseDate(release)}
          </li>
        ))}
      </ul>
    ),
  };
}

/**
 * A game's Facts (spec 0031, AC-9), all from `getGame`, through the shared
 * `FactsPanel`. Each entry only when IGDB has a value, and the panel is left
 * out with none (AC-11).
 */
function GameFacts({
  game,
}: {
  game: Pick<
    Game,
    | "gameModes"
    | "playerPerspectives"
    | "themes"
    | "franchises"
    | "series"
    | "gameEngines"
    | "platformReleases"
  >;
}) {
  return (
    <FactsPanel
      facts={[
        textFact("Game modes", names(game.gameModes)),
        textFact("Player perspectives", names(game.playerPerspectives)),
        textFact("Themes", names(game.themes)),
        textFact(
          label(game.franchises, "Franchise", "Franchises"),
          names(game.franchises),
        ),
        textFact("Series", names(game.series)),
        textFact(
          label(game.gameEngines, "Game engine", "Game engines"),
          names(game.gameEngines),
        ),
        releaseDatesFact(game),
      ]}
    />
  );
}

export { GameFacts };
