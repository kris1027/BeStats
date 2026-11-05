# Date pill and corner bookmark review fixes

## Goal

Act on the two axis code review of `feat/upcoming-date-pill-wrap` (PR #72) before it merges, with no visible change on a shipped card.

## Inspected

- `components/glass-pill.tsx`, `poster-card.tsx`, `catalog/landing/wide-card.tsx`
- `components/library/dated-pill.tsx`, `show-cards.tsx`, `watchlist-show-controls.tsx`, `library-card.tsx`, `missing-show-card.tsx`, `game-library-card.tsx`
- `components/tracking/card-round-button.tsx` and every caller passing `top`
- `app/showcase/page.tsx`, `card-round-button-demo.tsx`, `game-card-demo.tsx`
- `components/AGENTS.md` (plate rule, Backdrop blur, Layout), `app/globals.css` (`plate-solid`)
- `prompts/upcoming-date-pill-wrap.md`

## Decisions

1. **No blur on `CARD_PILL`.** The pills sit in `PosterCard`'s `plate-solid` control slot, whose plates are opaque, so the 16px blur paints nothing and breaks the Backdrop blur rule (`components/AGENTS.md`). It now also stops reaching the game status chip.
2. **The button owns its corner offset.** `CardRoundButton`'s `top` becomes `corner` (attribute `data-card-corner`) and pulls its 44px box 4px out below `md` itself, so the 36px circle meets the badge's 10px inset. `PosterCard` and `WideCardView` place the corner child at the 10px inset and no longer repeat the offset, and a chip on a wide card would no longer land 4px off.
3. **Showcase uses the real button.** The "With controls" card draws `CardRoundButton corner` through a client demo instead of a shadcn `Button` with a hand written attribute, so it shows the 44px target and the 10px inset the shipped cards have.
4. **One round button box.** `CARD_ROUND_BOX` in `card-round-button.tsx` is the 44px / 36px box both the button and the Mark next watched placeholder use.
5. **`phoneGlyphless` becomes `longText`**, named for why the show pill drops its glyph on phones; the `DatedPill` comment no longer claims the glyph shows at every width.
6. **JSDoc citations.** The new blocks cite the governing AGENTS.md section (root section 3, `components/AGENTS.md`) beside the prompt.
7. **`components/AGENTS.md`** records the corner bookmark contract and `CARD_PILL`.

Out of scope: `upcoming-rows.tsx` (its corner comment names no side, so nothing there is stale); `longText` keeps its single caller (owner decision, 2026-11-05).

## Security

Presentation only. No read, write, cache or auth change.

## Acceptance criteria

- Every card looks as before at 375px and 1280px: badge top left at 10px, bookmark circle top right at 10px, 44px touch target below `md`.
- The `/showcase` "With controls" bookmark matches a shipped card at both widths.
- The Mark next watched placeholder circle does not move when the button arrives.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test

1. `pnpm dev`, open `/showcase` at 375px and 1280px: the "With controls" bookmark circle sits 10px from the top and right edges.
2. Signed in, open `/movies`, a planned movie on the library page and `/upcoming`: the bookmark sits top right, the date pill alone at the bottom, unchanged from before.
