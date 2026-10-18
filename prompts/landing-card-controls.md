# Landing card controls

Asked by the user on 2026-10-18: "I should be able, like before, to plan to watch or see if I planned on every card in the main page."

## Goal

Bring the card tracking controls back on every card of the parallax landing (`/shows`, `/movies`). Before the landing (spec 0021 carousel rows), each card had the bookmark (plan / track) and, on Upcoming titles, the date pill. The landing dropped them (prompts/home-parallax-landing.md, decision 5: "no inline controls on the landing"). This plan reverses that one decision; everything else in the landing stays.

## Inspected code

- `components/catalog/list-cards.tsx`: the old cards passed `MovieCardControls` / `ShowCardControls` into `PosterCard`'s `controls` slot, each in its own Suspense with a `null` fallback.
- `components/tracking/movie-card-slots.tsx`, `show-card-slots.tsx`: the controls. A visitor or a failed read renders nothing. Movies: the filled watched mark on a watched movie, otherwise the release pill on Upcoming and the plan bookmark (filled when planned). Shows: the date pill on Upcoming and the bookmark, filled when tracked. They share the grid read with the badge through the same ids array, so no extra request.
- `components/catalog/landing/landing-badge.tsx`, `landing-parts.tsx` (`LandingPoster`, used by Trending, Popular and Now playing), `upcoming-rows.tsx` (`WideCard`), `top-rated-list.tsx` (`TopRatedRow`).

## Skills used

None beyond the repo docs: no schema, cache or route change.

## Decisions

1. **One `LandingControls` component** beside `LandingBadge` in `landing-badge.tsx` (renamed nothing): a Suspense with a `null` fallback around `MovieCardControls` / `ShowCardControls`, with the section's `ids`, so the badge and controls still share one read.
2. **Return path** is the landing itself: `/movies` for a movie, `/shows` for a show, from `item.mediaType`.
3. **Placement per card type:**
   - Posters (Trending, Popular, Now playing): `PosterCard`'s existing `controls` slot, bottom of the poster, exactly as the old cards.
   - Wide cards (Upcoming / On the air): a control row at the top left of the card, opposite the badge (the bottom holds the title and date), using the same `plate-solid`, `z-20`, `pointer-events-none` / `*:pointer-events-auto` pattern so the rest of the card still opens the title.
   - Top rated rows: in the text column, on the same line as the badge, above the link overlay (`relative z-20`).
4. **No meta line** (`ShowCardMeta`): not asked for, and the landing cards have no caption row for it.
5. The hero keeps its existing tracking control; nothing changes there.

## Expected files

- `components/catalog/landing/landing-badge.tsx`: add `LandingControls`.
- `components/catalog/landing/landing-parts.tsx`: pass `controls` to `PosterCard`; update the decision 5 comment.
- `components/catalog/landing/upcoming-rows.tsx`, `top-rated-list.tsx`: render `LandingControls`.
- `components/catalog/landing/landing-sections.test.tsx`: assert the controls render on each card type (with the slots mocked, as the badge tests do).
- `prompts/home-parallax-landing.md`: mark decision 5's "no inline controls" as superseded by this plan.

## Requirements and acceptance criteria

- AC-1: Signed in, every card in Trending, Popular, Now playing, Upcoming and Top rated shows the bookmark; a planned movie or tracked show shows it filled.
- AC-2: Pressing it plans / tracks (or removes, with the existing Undo) and the card updates, as on the list pages.
- AC-3: Upcoming titles show their date pill; a watched movie shows the watched mark instead of the bookmark. (Amended by prompts/landing-review-fixes.md, decision 3: a wide Upcoming card prints the movie's date at its bottom already, so its controls leave the pill out.)
- AC-4: Signed out, no controls appear (unchanged behaviour of the slots); the cards still link to their pages.
- AC-5: Clicking anywhere on a card outside the controls still opens the title page.
- AC-6: The controls never delay the posters (own Suspense, `null` fallback), and the landing still prerenders its shell.

## Security considerations

No new data path. The controls call the existing Server Actions, which authenticate and validate on their own; the session read stays inside the per request Suspense slots, never in a cached scope.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, sign in, open `/movies`.
2. On a Popular card press the bookmark: it fills, a toast offers Undo. Reload: still filled.
3. Check a card in Trending, Now playing, Upcoming (top left) and Top rated (beside the rating) shows the bookmark too.
4. Open `/shows`, press a bookmark: the show is tracked and appears on `/watchlist?type=tv` or `/upcoming?type=tv`.
5. Click a card's poster away from the bookmark: the title page opens.
6. Sign out and reload `/movies`: no bookmarks, cards still open their pages.
7. At 375px wide, check the bookmark is tappable on the swipe rows and grids.
