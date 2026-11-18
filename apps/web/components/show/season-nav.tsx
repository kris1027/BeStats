import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

type SeasonLink = { seasonNumber: number; name: string };

/**
 * Previous and Next season links under the episode list (spec 0009, AC-12),
 * in the show page's order, so Specials come last. Each side is absent at its
 * end of the list. Plain links with no client code, at the 44px touch size on
 * mobile and 36px from `md`.
 */
function SeasonNav({
  showId,
  previous,
  next,
}: {
  showId: number;
  previous: SeasonLink | null;
  next: SeasonLink | null;
}) {
  if (previous === null && next === null) return null;

  return (
    <nav
      aria-label="Seasons"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {previous ? (
        <ButtonLink
          size="touch"
          className="md:h-9 md:px-4 md:text-[13px]"
          href={`/shows/${showId}/season/${previous.seasonNumber}`}
          rel="prev"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">Previous season: </span>
          {previous.name}
        </ButtonLink>
      ) : (
        <span />
      )}
      {next ? (
        <ButtonLink
          size="touch"
          className="md:h-9 md:px-4 md:text-[13px]"
          href={`/shows/${showId}/season/${next.seasonNumber}`}
          rel="next"
        >
          <span className="sr-only">Next season: </span>
          {next.name}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </ButtonLink>
      ) : null}
    </nav>
  );
}

export { SeasonNav };
