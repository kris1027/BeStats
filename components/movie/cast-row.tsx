import { UserRoundIcon } from "lucide-react";
import Image from "next/image";

import type { CastMember } from "@/lib/tmdb";

/** How many billed cast members a movie page shows (spec 0006, AC-6). */
const CAST_LIMIT = 12;

/**
 * The top billed cast as one horizontal row (spec 0006, AC-6).
 *
 * The scroll container is a focusable, labelled region, so a keyboard user can
 * tab to it and scroll it with the arrow keys; touch and trackpad scroll it
 * natively. The row scrolls inside itself and never widens the page (AC-14).
 *
 * Cards are not links: there is no person page to go to, and a link that
 * leads nowhere useful is worse than none. The photo is decorative (`alt=""`)
 * because the name sits right under it.
 *
 * `cast` arrives already in TMDB billing order from the module.
 */
function CastRow({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) {
    return (
      <p className="text-[15px] text-muted-foreground">
        TMDB lists no cast for this movie.
      </p>
    );
  }

  return (
    <section
      aria-label="Cast"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable so keyboard users can scroll it (WCAG 2.1.1).
      tabIndex={0}
      className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-3"
    >
      <ul className="flex w-max gap-3 md:gap-4">
        {cast.slice(0, CAST_LIMIT).map((member) => (
          <li
            key={member.creditId}
            className="flex w-[120px] shrink-0 flex-col gap-2 md:w-[140px]"
          >
            <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg">
              {member.profileUrl ? (
                <Image
                  src={member.profileUrl}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 140px, 120px"
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
            <div className="flex flex-col gap-0.5">
              <p className="text-sm leading-snug font-semibold text-foreground">
                {member.name}
              </p>
              {member.character ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  {member.character}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { CAST_LIMIT, CastRow };
