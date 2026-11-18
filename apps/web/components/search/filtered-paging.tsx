import { ChevronRightIcon } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

/**
 * Paging for filtered search, which has a cursor instead of page numbers
 * (spec 0010, AC-14).
 *
 * `More results` continues from the TMDB page after the last one this page
 * read, and is absent when there is none. `Back to first page` appears once
 * you have moved on. There is no `Previous`: a cursor page does not know where
 * the page before it started, and the browser's Back button does.
 *
 * @param moreHref The next cursor page, or null at the end.
 * @param firstHref Page 1 of the same search, or null when already on it.
 */
function FilteredPaging({
  moreHref,
  firstHref,
}: {
  moreHref: string | null;
  firstHref: string | null;
}) {
  if (!moreHref && !firstHref) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-3 md:gap-4"
    >
      {firstHref ? (
        <ButtonLink
          href={firstHref}
          size="touch"
          variant="ghost"
          className="md:h-9 md:px-4 md:text-[13px]"
        >
          Back to first page
        </ButtonLink>
      ) : null}
      {moreHref ? (
        <ButtonLink
          href={moreHref}
          size="touch"
          rel="next"
          className="md:h-9 md:px-4 md:text-[13px]"
        >
          More results
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </ButtonLink>
      ) : null}
    </nav>
  );
}

export { FilteredPaging };
