# Home parallax landing

Settled with the user on 2026-10-18 in a grilling session (Q1 to Q19). Source design: claude.ai/design project `14e58cb9-d0fc-4943-a8d2-59c5ad7d226c`, file `Home Page Parallax.dc.html`. `support.js` is the generic design canvas runtime and carries nothing page specific.

## Goal

Replace the carousel rows on `/movies` and `/shows` with the design's long-scroll parallax landing. It has a full-bleed hero and five sections, each with its own layout and motion, built from real TMDB data. `/` keeps redirecting to `/shows`.

This supersedes the landing half of spec 0021 (`docs/specs/0021-home-carousels`): AC-1, AC-5, AC-6 and AC-7 as they apply to the landing rows. The list pages (`/movies/{slug}`, `/shows/{slug}`), the registry, the dispatcher, metadata (AC-15) and the sitemap stay as they are.

## Inspected code

- `app/movies/page.tsx`, `app/shows/page.tsx`: both render `CatalogLanding` with `catalogListsFor(mediaType)`.
- `components/catalog/catalog-landing.tsx`, `carousel-row.tsx`, `carousel-row-states.tsx`, `carousel-scroller.tsx`: the current rows. Each row streams its cards behind skeletons, with an error state (Try again) and an empty state.
- `components/catalog/list-cards.tsx`, `catalog-list-cards.tsx`: `ShowListCard` / `MovieListCard` around `PosterCard`. The badge, meta and controls each sit in their own Suspense, and `grid*Ids` share one status read per grid (prompts/catalog-card-status.md).
- `components/rating-badges.tsx`: `TmdbRatingBadge` is an amber star on a glass pill with a screen-reader-only "TMDB rating" prefix. The amber is the existing `rating-tmdb` token.
- `components/catalog/trailer-button.tsx`: the Trailer dialog (spec 0022). `components/tracking/movie-tracking-slot.tsx` / `show-tracking-slot.tsx`: the title page's plan / track control.
- `components/catalog/detail-hero.tsx` and `prompts/title-backdrop-under-navbar.md`: the existing pattern for pulling a backdrop up behind the transparent navbar. It uses a `--navbar-height` margin, a mask fade into the film strip background, `backdrop-scrim`, and a navbar that is `relative z-20`.
- `lib/catalog/lists.ts` (registry, `listPath`), `lib/catalog-list-read.ts` (`readTaggedCatalogList`, one cached page 1 per list).
- `lib/tmdb/types.ts`, `normalize.ts`: `MovieSummary` / `TvShowSummary` have no `backdropUrl`; only the details do.
- `app/layout.tsx`: `<main>` is `max-w-[1600px] px-4 py-8 md:py-12`.
- `app/globals.css`: the only place colours live. It defines the reduced-motion handling and the glass utilities.

## Skills used

- `next-cache-components-optimizer` / `vercel:next-cache-components`: keep the landing shell prerendered while each section streams.
- `next-dev-loop`: verify the scroll effects in the running app.
- No Supabase skill. The landing only reuses the existing card and tracking slots, with no schema or RLS change.

## Decisions (from the session)

1. **Pages (Q1).** One component serves both `/movies` and `/shows`. The slot mapping:

   | Slot | Movies | Shows |
   |---|---|---|
   | Hero + pinned row | Trending | Trending |
   | Staggered grid | Popular | Popular |
   | Sticky sidebar + 3 columns | Now playing, label "IN CINEMAS" | Airing today, label "ON TV TODAY" |
   | Two counter-moving rows | Upcoming | On the air |
   | Numbered list | Top rated | Top rated |

2. **Header (Q2).** The app navbar stays and the design's own fixed header is dropped. The h1 is `sr-only` "Movies" / "Shows". The hero title is an h2, with each section's heading below it.
3. **Popular stays (Q3).** It sits between Trending and Now playing as in the updated design. It is a 14-card auto-fill grid (cards at least 180px wide) with per-card top offsets `[0, 60, 20, 80, 40]` and drift speeds `[0.06, -0.08, 0.14, -0.04, 0.1]`, cycled.
4. **Hero (Q4, Q12).** Shows TMDB's #1 trending title. Its data comes from:
   - the trending page-1 read the Trending section already makes;
   - one cached detail read (`getMovie` / `getTvShow`) for its backdrop and genre names;
   - the existing extras read for the trailer.

   It shows the chip "#1 Trending", the TMDB rating, its genres, the title linked to the detail page, `TrailerButton` (only when a trailer exists), and `MovieTrackingSlot` / `ShowTrackingSlot` (which handle signed-out visitors and the release gate). Each read streams in its own Suspense. If a read fails, its part is left out. If trending fails, the hero is the plain heading with the section's error state. (As built after prompts/landing-review-fixes.md: the hero renders nothing and the Trending row right below carries that heading and the one error state.)
5. **Cards (Q5).** Each card has a poster, `TmdbRatingBadge` as the badge, the title, and a link to the title page. The personal status badge is kept by reusing `MovieCardBadge` / `ShowCardBadge` with a shared `grid*Ids` read per section. There are no inline controls on the landing. Superseded on 2026-10-18 by prompts/landing-card-controls.md: every card has the catalog card controls again.
6. **Mobile and touch (Q6).** Below `md`:
   - Trending is a native swipe row using `CarouselScroller`.
   - Popular is a plain 2-column grid with no offsets.
   - Now playing is a 2-column grid with no column drift.
   - Upcoming rows scroll natively.
   - The blobs move at half depth.

   Mouse parallax runs only under `(pointer: fine)`.
7. **Colours and fonts (Q7).**
   - Existing tokens and Inter only; no JetBrains Mono. Labels use the existing small uppercase label style.
   - The design's `#071116` becomes the existing page background (film strips).
   - The blob tints become new tokens in `globals.css` only.
   - The star uses `rating-tmdb`.
8. **Counts (Q8).** Trending 9, Popular 14, Now playing 12, Upcoming 20 (two rows of 10), Top rated 8. All come from page 1 of each list.
9. **Motion (Q9).** Intensity 1, with mouse parallax and poster parallax on. There is no user setting. `prefers-reduced-motion: reduce` sets every transform to identity, makes Trending a native swipe row, and removes the hero fade.
10. **Backdrops for wide cards (Q11).** `normalizeMovieSummary` / `normalizeTvSummary` gain `backdropUrl` from the `backdrop_path` TMDB already returns, so there are no new requests. Without a backdrop, the card uses the poster cropped to fill (`object-cover`). With neither, it shows the existing missing-image state.
11. **Full bleed (Q13).**
    - The hero breaks out of `<main>`'s gutters and top padding, the way `detail-hero.tsx` does: a negative margin plus `--navbar-height`, `backdrop-scrim` under the bar, and the mask fade into the page.
    - The hero is `100svh` tall with a 620px minimum. Superseded on 2026-10-18 by prompts/home-hero-backdrop-quality.md: from `lg` only, with the backdrop in a 16:9 box; below `lg` the backdrop is a band with the title under it.
    - The Upcoming rows are full viewport width. Every other section keeps the 1600px column.
    - The blob layer is `fixed inset-0 -z-0 pointer-events-none`, behind content and inside the landing only.
12. **TV wording (Q14).**
    - Upcoming cards show the release date ("Nov 6", formatted in UTC) for movies and the first-air year for shows.
    - The sidebar blurb uses the real rendered count: "{n} films in cinemas this week." / "{n} shows airing today."
    - The "See all" links go to the list pages.
13. **Upcoming rows (Q15).** Row 1 shows items 1 to 10 and row 2 shows 11 to 20, so no title appears twice. With 10 results or fewer there is one row. Rows move in opposite directions as you scroll (`translateX = base ± offset × 0.6`).
14. **Keyboard in the pinned track (Q16).**
    - Every card is a normal link in DOM order.
    - On `focusin` inside the pinned track, the window scrolls to the progress that brings the focused card into view: `scrollTo` with `behavior: "instant"` under reduced motion.
    - The progress bar is `aria-hidden`.
15. **Retire old code (Q17).**
    - Delete `carousel-row.tsx`, `carousel-row-states.tsx` and `carousel-row.test.tsx` if nothing else imports them. `title-extras.tsx`, `cast-row.tsx`, `detail-skeletons.tsx` and `/showcase` reference them, so their shared pieces (skeleton, error, empty, sizes) move or stay as needed.
    - Keep `CarouselScroller`.
    - Rewrite `catalog-landing.test.tsx`.
    - Mark spec 0021 `index.md` with a pointer to this plan.
16. **Shell (Q18).**
    - Section headings, labels and "See all" links are prerendered.
    - Each section's items stream in their own Suspense boundary (`connection()` before the read, as today) with a skeleton matching the final layout.
    - A `TmdbError` keeps the section's compact error with Try again; an empty list keeps one line.
    - One client component, `LandingParallax`, wraps the landing. It runs a single `requestAnimationFrame` loop that writes transforms to `data-*` marked nodes. All data and markup stay in Server Components.
17. **Rating label (Q19).** Use the existing `TmdbRatingBadge` unchanged (amber star, screen-reader-only "TMDB rating"), the same treatment the current cards use. This keeps the landing consistent with every other card. It is a small deviation from the "visible TMDB text" wording in the session. If a visible "TMDB" label is wanted, it should change on every card, in a separate change.

## Date boundary

Upcoming dates print TMDB's `release_date` / `first_air_date` as a UTC calendar day, with no time, as everywhere else (AGENTS.md section 9).

## Expected files

- `components/catalog/catalog-landing.tsx` (rewritten), plus new `components/catalog/landing/` holding:
  - `landing-hero.tsx`
  - `trending-pin.tsx`
  - `popular-grid.tsx`
  - `now-playing-columns.tsx`
  - `upcoming-rows.tsx`
  - `top-rated-list.tsx`
  - `landing-skeletons.tsx`
  - `landing-parallax.tsx` (the client component)
  - `landing-slots.ts` (the slot mapping per media type)
- `lib/catalog/lists.ts`: the slot mapping or the sidebar label and blurb text, if it fits better there.
- `lib/tmdb/types.ts`, `normalize.ts`, `normalize.test.ts`: `backdropUrl` on summaries.
- `app/globals.css`: blob tokens, plus any `@utility` the stagger and outline numbers need.
- `components/navbar` and `layout`: no change expected; `relative z-20` already exists.
- Tests:
  - `catalog-landing.test.tsx`
  - new tests per section
  - `landing-parallax.test.tsx` (reduced motion means identity, cleanup on unmount)
  - `app/movies/request-scope.test.ts` update
- Removed: `carousel-row.tsx`, `carousel-row-states.tsx`, `carousel-row.test.tsx` (or partly kept, see 15).
- `app/showcase/page.tsx`: replace the carousel row demos with the landing's section states.
- `docs/specs/0021-home-carousels/index.md`: a pointer to this plan.

## Requirements

1. `/movies` and `/shows` render, in order: the hero, Trending (pinned), Popular, Now playing / Airing today, Upcoming / On the air, Top rated.
2. Every card links to its title page and shows the TMDB rating labelled for screen readers. Tracked or planned titles show the same status badge as their library page.
3. The hero offers Trailer only when one exists, and the plan / track control with its existing signed-out and release-gate behaviour.
4. No section waits on another. A failing section shows Try again, and the rest render.
5. Reduced motion produces a static, fully usable page with no transforms.
6. Phones get swipe rows and simple grids, with no horizontal page scroll.
7. The landing does no writes and reads no session outside the existing card and tracking slots (spec 0006, AC-13; spec 0020, AC-21).

## Security considerations

There are no new data paths, Server Actions or user data. The TMDB reads go through the existing server-only module and cache. The client component receives no data, only DOM nodes. Nothing private enters a cached scope: the status badges keep their per-request Suspense slots.

## Acceptance criteria

- AC-1: Section order and the slot mapping per media type follow the table above.
- AC-2: Counts are 9 / 14 / 12 / 20 / 8, fewer when TMDB returns fewer, never padded.
- AC-3: The hero shows trending #1 with its backdrop, genres, the TMDB rating, Trailer when available, and the tracking control.
- AC-4: Upcoming shows no duplicate titles. Movie cards show a UTC date and TV cards a year.
- AC-5: A missing backdrop falls back to the poster, then to the missing-image state.
- AC-6: Each section fails and empties on its own.
- AC-7: With reduced motion there are no transforms or pinning; the page is a static layout.
- AC-8: Below `md`, layouts follow decision 6 with no horizontal page overflow at 360px.
- AC-9: Tab moves through every card in order, and a focused card in the pinned track is scrolled into view.
- AC-10: The shell (headings, labels, links) prerenders; `pnpm build` reports `/movies` and `/shows` as partially prerendered with no blocking route errors.
- AC-11: No colour literal exists outside `globals.css` (`design-tokens-boundary.test.ts` passes).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Run `pnpm db:types:check` only if types are touched (they are not expected to be).

## Manual test steps

1. Run `pnpm dev`, open `/movies` at 1440×900, and scroll slowly:
   - The hero backdrop drifts (no zoom since prompts/home-hero-backdrop-quality.md), and the title fades.
   - Trending pins, its posters slide left, and the bar fills.
   - The Popular cards drift at staggered offsets.
   - The Now playing sidebar sticks while the 3 columns move at different speeds.
   - The Upcoming rows move in opposite directions.
   - The Top rated numbers drift.
2. Move the mouse and check that the blobs and the hero backdrop follow gently.
3. Open `/shows` and check the TV labels: "ON TV TODAY", "Airing today", "On the air" with years.
4. Click each "See all" and check it lands on the matching list page.
5. Signed out, press the hero's tracking control and check it sends you to sign in. Signed in, plan the hero movie and check the card in Upcoming or Now playing shows the badge after reload.
6. Press Trailer in the hero and check the dialog plays, then closes with Escape.
7. Turn on Reduce motion in macOS and reload. Check nothing moves and Trending is a swipe row.
8. Resize to 375px wide and check for swipe rows, 2-column grids and no horizontal page scroll.
9. Tab from the top through the Trending cards and check each focused card is visible.
10. With the TMDB token broken, check every section shows Try again and the navbar and footer still render.

## As built

Where the build differs from the decisions above, and why:

- **Hero genres come from the cached genre list**, not a detail read. With `backdropUrl` on the summary, the genre ids on the trending item plus `getMovieGenres` / `getTvGenres` give the names, so the hero needs no `getMovie` / `getTvShow` call.
- **Signed-out visitors see no tracking control in the hero.** `MovieTrackingSlot` and `ShowTrackingSlot` render nothing for a visitor, as they do on the title pages. The hero reuses them as they are.
- **The Trailer button keeps its existing label**, "Trailer", rather than the design's "Watch trailer".
- **Trending on a phone is a native scroll frame** with snap points, not `CarouselScroller`. One set of markup serves both the pinned and the swipe layouts, so no card is rendered twice.
- **Full bleed is the column's bleed** (`-mx-4`), as on the title page backdrop. Beyond 1600px the hero and the Upcoming rows fade at the column's edge rather than reaching the window's edge, so nothing can cause a horizontal scrollbar.
- **The blobs use the background's bokeh tokens** through the `landing-blob` and `landing-orb` utilities, so there is no new colour.
- **Poster drift writes custom properties on the card wrapper** (the `poster-drift` utility). Every node the loop writes to carries `suppressHydrationWarning`, because a streamed section can be moved before React hydrates it.
- **The skeletons and shared layout classes live in `landing-skeletons.tsx`**, so `/showcase` can render them without importing the server-only TMDB reads.
- **`carousel-row-states.tsx` and `CarouselScroller` stay.** The title pages' Cast and More like this rows use them, and the landing sections reuse the row's error and empty lines.
