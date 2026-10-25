import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

/**
 * Previous and next links under a paged grid (spec 0006, AC-2).
 *
 * Plain links to shareable URLs rather than a client pager, so a page number
 * survives a reload, a copied link and a visit with JavaScript off. Each link
 * is simply absent where there is nowhere to go, rather than rendered disabled:
 * a disabled link is still a tab stop that does nothing.
 *
 * `touch` sizing keeps the 44px target on mobile; from `md` the links drop to
 * the pointer sized 36px the rest of the desktop shell uses.
 *
 * @param href Builds the URL for a page number. Page 1 should map to the bare
 * path, so there is one URL per page.
 * @param lastPage The last page, or null when the list has no count (an IGDB
 * list without one, spec 0028, AC-10): the line then reads `Page N` and Next
 * shows only when `hasNextPage` says so.
 */
function PaginationLinks({
  page,
  lastPage,
  hasNextPage = false,
  href,
}: {
  page: number;
  lastPage: number | null;
  hasNextPage?: boolean;
  href: (page: number) => string;
}) {
  const hasNext = lastPage === null ? hasNextPage : page < lastPage;
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-3 md:gap-4"
    >
      {page > 1 ? (
        <ButtonLink
          href={href(page - 1)}
          size="touch"
          rel="prev"
          className="md:h-9 md:px-4 md:text-[13px]"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          Previous
        </ButtonLink>
      ) : null}

      <p className="text-sm text-muted-foreground tabular-nums">
        {lastPage === null ? `Page ${page}` : `Page ${page} of ${lastPage}`}
      </p>

      {hasNext ? (
        <ButtonLink
          href={href(page + 1)}
          size="touch"
          rel="next"
          className="md:h-9 md:px-4 md:text-[13px]"
        >
          Next
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </ButtonLink>
      ) : null}
    </nav>
  );
}

export { PaginationLinks };
