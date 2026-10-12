import { UserRoundIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import {
  ROW_ITEM_CLASS,
  ROW_POSTER_SIZES,
} from "@/components/catalog/carousel-row-states";
import { CarouselScroller } from "@/components/catalog/carousel-scroller";
import { SECTION_HEADING_CLASS } from "@/components/catalog/title-section";
import type { CastMember } from "@/lib/tmdb";

/**
 * How many billed cast members a movie page shows (spec 0006, AC-6). A show's
 * cast arrives already cut to `SHOW_CAST_LIMIT` in the TMDB module, the same
 * number, so this is a no op there; change the two together.
 */
const CAST_LIMIT = 12;

/**
 * The Cast section as a carousel row, the same frame as a landing row and
 * More like this: the heading with the arrow buttons from `md`, then a
 * focusable, labelled scroll region that touch, trackpad and the arrow keys
 * scroll natively. It never widens the page (spec 0006, AC-14).
 *
 * The cards stream in as `children`, so the show page can keep its cast in
 * its own Suspense boundary under a prerendered heading.
 */
function CastSection({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="cast-heading" className="flex flex-col gap-4">
      <CarouselScroller
        label="Cast"
        heading={
          <h2 id="cast-heading" className={SECTION_HEADING_CLASS}>
            Cast
          </h2>
        }
        seeAll={null}
      >
        {children}
      </CarouselScroller>
    </section>
  );
}

/**
 * The top billed cast as row cards (spec 0006, AC-6), drawn like the media
 * cards beside them: the 2:3 frame and rim at a row card's width, the name as
 * the caption and the character on the line under it.
 *
 * Cards are not links: there is no person page to go to, and a link that
 * leads nowhere useful is worse than none. The photo is decorative (`alt=""`)
 * because the name sits right under it.
 *
 * `cast` arrives already in order from the module: billing order for a movie,
 * most episodes first for a show (spec 0009, AC-8).
 */
function CastRow({
  cast,
  emptyMessage = "TMDB lists no cast for this movie.",
}: {
  cast: CastMember[];
  /** What an empty cast says; the show page names a show (spec 0009, AC-8). */
  emptyMessage?: string;
}) {
  if (cast.length === 0) {
    return <p className="text-[15px] text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex gap-3 md:gap-4">
      {cast.slice(0, CAST_LIMIT).map((member) => (
        <li
          key={member.creditId}
          className={`${ROW_ITEM_CLASS} flex flex-col gap-2.5`}
        >
          <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg">
            {member.profileUrl ? (
              <Image
                src={member.profileUrl}
                alt=""
                fill
                sizes={ROW_POSTER_SIZES}
                className="object-cover"
              />
            ) : (
              <div
                data-slot="profile-fallback"
                className="absolute inset-0 flex items-center justify-center rounded-lg bg-glass-plate"
              >
                <UserRoundIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            )}
            <span
              aria-hidden="true"
              className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
            />
          </div>
          <h3 className="text-sm leading-snug text-foreground">
            {member.name}
          </h3>
          {member.character ? (
            <p
              title={member.character}
              className="-mt-1.5 truncate text-xs text-muted-foreground"
            >
              {member.character}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export { CAST_LIMIT, CastRow, CastSection };
