# Top rated: staggered parallax columns

## Goal

Rework the landing's Top rated section (`/shows`, `/movies`) to match the
Claude Design file `Top Rated Parallax.dc.html` (project
`b7c5f806-958b-447b-8758-95fab5630359`): the eight titles become tall poster
cards in staggered columns that drift at different speeds, each with a large
faint rank behind its top left corner, and the rating, title and bookmark
under the poster. Today it is a two column list of small posters beside text.

## Inspected

- The design file (read through DesignSync `get_file`). `support.js` is the
  design tool's runtime, nothing to port.
- `components/catalog/landing/top-rated-list.tsx` (the section today),
  `landing-skeletons.tsx` (`TOP_LIST_CLASS`, `TOP_POSTER_CLASS`,
  `TopRatedSkeleton`), `landing-parts.tsx`, `landing-badge.tsx`,
  `now-playing-columns.tsx` (the per column `data-speed` pattern),
  `popular-grid.tsx`, `landing-parallax.tsx` (the motion loop),
  `components/poster-card.tsx`, `components/tracking/card-round-button.tsx`,
  `app/globals.css` (`poster-drift`, `rank-outline`, `glass-shadow`),
  `app/showcase/page.tsx` (shows `TopRatedSkeleton`),
  `landing-sections.test.tsx`, `landing-parallax.test.tsx`.
- `prompts/home-parallax-landing.md` (decisions 6, 8, 16 still hold: eight
  titles from page 1, motion only from `md`, reduced motion is static, each
  section streams on its own).

## Skills

None of the installed skills applies (no caching, Supabase or data change).
`next-dev-loop` style runtime check by driving the dev server.

## Decisions

1. **Columns.** Two columns below `lg`, four from `lg` (the design switches at
   1000px). The grid is centred and capped (672px from `md`, 70rem from
   `lg`), so a poster stays near 240px wide rather than filling a wide
   screen (amended after review: the posters were too large). Still one `<ol>` in rank order laid out as a CSS grid, so reading
   and tab order stay 1 to 8, the way Now playing keeps its columns.
2. **Stagger.** Every odd index sits in an odd column in both layouts, so the
   offset is a per index class: odd cards are moved down 48px on a phone,
   80px from `md` and 140px from `lg` (the design's 80 and 140). It is a
   `translate` on the `<li>`, so the grid rows stay tight; the list gets the
   same bottom padding so the last row never overlaps what follows.
3. **Column drift.** Each card's inner wrapper carries its column's
   `data-speed`, measured from the grid (`data-speed-root`), so a column moves
   as one. Speeds are the design's: `[0, 0.12]` for two columns and
   `[0, 0.14, 0.04, 0.18]` for four. The loop learns one attribute,
   `data-speed-lg`, used instead of `data-speed` while `(min-width: 64rem)`
   matches. Below `md` nothing moves, as today.
4. **Rank.** The number sits behind the poster's top left, partly above it
   (the card has top padding for it), in a new `rank-ghost` utility in
   `globals.css`: a faint fill plus a thin outline, both mixed from
   `--foreground` (no new colour value). It drifts against its own card at
   `-0.1`: the `<article>` is its `data-speed-root`. Decorative and
   `aria-hidden`, as now; the `<ol>` announces the rank.
5. **Poster.** Full column width, 2:3, `rounded-xl`, a deeper shadow from a
   new `poster-lift` utility in `globals.css`, and a 6px lift on hover
   (`motion-safe` only). The artwork keeps the existing `poster-drift`.
   Missing artwork keeps `ArtFallback`. A bottom scrim from the design is
   left out: nothing sits on the artwork any more.
6. **Under the poster.** Left: `LandingBadge` (the TMDB rating, swapped for
   the personal state once the session read arrives) above the title, 19px
   from `md`. Right: `LandingControls`, the existing bookmark (the design's
   Save button). The whole card stays one link through the title's overlay,
   with the badge and controls above it, as now.
7. **Skeleton.** `TopRatedSkeleton` uses the same grid, offsets and card
   shape (poster, pill, line) for four placeholders, so arrival shifts
   nothing. `/showcase` already renders it and needs no change.
8. **Out of scope.** The design's intensity and stagger knobs, its "Scroll to
   preview" spacer and background gradient (the landing has its own).

## Files

- `components/catalog/landing/top-rated-list.tsx`
- `components/catalog/landing/landing-skeletons.tsx`
- `components/catalog/landing/landing-parallax.tsx` (`data-speed-lg`)
- `app/globals.css` (`rank-ghost`, `poster-lift`)
- `components/catalog/landing/landing-parallax.test.tsx`,
  `landing-sections.test.tsx`

## Requirements and acceptance criteria

1. Top rated shows the first eight titles of page 1 in an ordered list, rank
   order in the markup, each card a single link to its title page.
2. Two columns below `lg`, four from `lg`; odd columns sit lower.
3. From `md`, columns drift at their speeds and ranks drift against their
   card; below `md` and under reduced motion nothing moves.
4. Each card shows its badge, title and bookmark; a visitor sees no
   bookmark; missing artwork shows the fallback tile.
5. Loading, failed and empty states are unchanged in behaviour, and the
   skeleton matches the new layout.

## Security

No data, action or auth change. Badge and controls keep their one shared
session read per section.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (new cases: `data-speed-lg` is used
from `lg` and ignored below it; odd cards carry the offset; the rank sits in
the card and is hidden). `pnpm build`.

## Manual test

1. `pnpm dev`, open `/movies`, scroll to Top rated at 1440px wide: four
   columns, the second and fourth lower, ranks 1 to 8 reading across.
2. Scroll slowly: columns move at different speeds, the faint numbers drift
   behind the posters, the artwork drifts inside its frame.
3. Hover a poster: it lifts; click it: the title page opens.
4. Resize to 900px: two columns, the second lower, still drifting.
5. Resize to 375px: two staggered columns, no motion, nothing overlaps the
   footer.
6. Turn on reduced motion: static layout.
7. Sign in, bookmark a card, reload: the bookmark holds. `/shows` behaves the
   same.
8. Tab through the section: focus goes 1 to 8 and stays visible.
