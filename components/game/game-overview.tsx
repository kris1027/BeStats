import { CrewLines } from "@/components/catalog/title-details";
import { SECTION_HEADING_CLASS } from "@/components/catalog/title-section";
import type { Game } from "@/lib/igdb";

/** The movie overview's paragraph look, keeping IGDB's line breaks (AC-5). */
const PARAGRAPH_CLASS =
  "text-base leading-relaxed whitespace-pre-line text-text-secondary";

/**
 * A game's Overview (spec 0031, AC-5): the summary, then IGDB's storyline
 * under its own `Story` heading, then who made and published it, in the
 * movie page's crew line look. Each part is left out when IGDB has nothing,
 * with no "No overview available" line, and the whole section only when
 * every part is missing (AC-11).
 */
function GameOverview({
  summary,
  storyline,
  developers,
  publishers,
}: Pick<Game, "summary" | "storyline" | "developers" | "publishers">) {
  if (
    summary === null &&
    storyline === null &&
    developers.length === 0 &&
    publishers.length === 0
  ) {
    return null;
  }

  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
      <h2 id="overview-heading" className={SECTION_HEADING_CLASS}>
        Overview
      </h2>
      {summary === null ? null : (
        <p className={`max-w-[65ch] ${PARAGRAPH_CLASS}`}>{summary}</p>
      )}
      {storyline === null ? null : (
        <div className="flex max-w-[65ch] flex-col gap-2">
          <h3 className="text-base font-semibold text-foreground">Story</h3>
          <p className={PARAGRAPH_CLASS}>{storyline}</p>
        </div>
      )}
      <CrewLines
        lines={[
          { label: "Developed by", names: developers },
          { label: "Published by", names: publishers },
        ]}
      />
    </section>
  );
}

export { GameOverview };
