# AGENTS.md — the UI foundation

Every shared piece of interface lives here. The theme it reads from lives in [`app/globals.css`](../app/globals.css), which is the only file allowed to hold a colour value. Governed by spec [0004](../docs/specs/0004-design-system-and-ui-foundation/index.md), whose `rationale.md` holds the original token inventory and the contrast audit.

**The UI reference is the shipped interface plus `/showcase`.** The `design/` folder of reference artboards was removed on 2026-10-06. Reuse existing components and patterns; a screen with no precedent gets its layout described in its plan and approved before it is built (root AGENTS.md section 3).

## The plate rule

A glass surface on its own is close to invisible over artwork. Near white text on the bare glass gradient over a light poster measures 1.59:1.

So: **plate first, then glass, then rim.** Every glass surface that can land on artwork paints an opaque plate underneath it.

The rule is enforced by the components that own a glass surface (`GlassPill`, `PosterCard`'s badge and control slots, `MobileMenuSheet`, `StatePanel`), never by the `glass` utility itself. That is deliberate: `/showcase` renders the plate-less case beside the correct one, so the rule stays visible rather than becoming folklore. If you write `glass` without a `glass-plate-*` alongside it, you are opting out of legibility on purpose.

## Tokens and utilities

All values live in `app/globals.css`, split across four blocks: `@theme inline` (the shadcn semantic remap and the radius scale), `@theme` (product tokens, which become real utilities such as `text-rating-tmdb` and `rounded-panel`), `:root` (the semantic values themselves), and the `@utility` definitions.

- **Three colours carry meaning and nothing else may borrow them**: `--color-rating-tmdb` amber is always a TMDB community rating, `--color-score-personal` cyan is always the user's own score, `--color-status-planned` green is always Planned. The focus ring deliberately uses none of them.
- **Four plates**: `glass-plate` for controls and badges, `glass-plate-panel` for panels, `glass-plate-sheet` for the menu sheet and overlays, `glass-plate-score` for the personal score badge.
- **Surface utilities**: `glass` (plate plus gradient plus rim), `glass-selected` (the brighter active variant), `plate-rim` (plate and rim, no gradient, for surfaces that should read as an absence: the missing poster tile and the skeletons), `rim` (the bare gradient stroke over artwork). Pick the rim colour with `glass-rim` or `glass-rim-score`.
- `rim` masks its own padding box out, so it clips everything the element paints. It belongs on an empty decorative overlay, never on an element with content or a background of its own.
- The rim uses the two layer background technique: plate gradient on `padding-box`, rim gradient on `border-box`, over a transparent 1.5px border. Not `border-image`, which ignores `border-radius`.
- **No component writes a colour literal.** [`design-tokens-boundary.test.ts`](../design-tokens-boundary.test.ts) walks the repository and fails the suite if a token hex, a Geist reference, or a dark variant appears outside `globals.css`, in the shape [`security-boundary.test.ts`](../security-boundary.test.ts) already established for the service role key.

## Conventions

- **Server Components by default.** The only client boundaries are `layout/media-type-tabs.tsx`, `layout/mobile-menu-sheet.tsx`, `layout/library-nav.tsx` (rendered only inside the request scoped `AccountSlot`, spec 0008), and the three shadcn primitives that need state (`ui/dialog.tsx`, `ui/toggle.tsx`, `ui/toggle-group.tsx`). None reads a server dynamic API, so routes still prerender under `cacheComponents`. Adding a client boundary in the shell is a decision, not a convenience.
- **Selection comes from the URL**, not client state. `MediaTypeTabs` reads `usePathname`: the catalog and title pages light their own tab, and pages about neither catalog light nothing. On `/watchlist`, `/upcoming`, `/watched` and `/search` it also reads `?type=` through `useSearchParams`, and each tab links to the same page with the other type (feature 22). That read happens only on those paths and in its own Suspense boundary, inside `layout/page-media-type.tsx` (`WithPageMediaType`), which `LibraryNav` and `NavbarSearch` use too. It carries no `"use client"` of its own, so it adds no boundary to the list above. Never call `useSearchParams` unconditionally in the shell, or every route loses its prerendered shell. On a route with a dynamic param `usePathname` suspends at prerender time, so `Navbar` wraps the tabs in Suspense with `MediaTypeTabsView selected={null}` (same control, nothing lit) as the fallback. Keep that boundary, or `/movies/[id]` loses its static shell (spec 0006). The Library links carry the current page's type, so a tab chosen on `/movies` is still selected on `/watchlist`.
- **A retry is a full page load.** `RetryLink` is a plain `<a>`, not `next/link`, so the client router cache cannot replay the failure the visitor is retrying past (spec 0006, AC-10).
- **Focus** is a 2px `#F6F7F8` outline at 2px offset on `:focus-visible` only, driven by `--ring` in the base layer. Do not restate it per component.
- **Backdrop blur** (`--blur-glass`, 16px, no saturation) goes only on surfaces that overlap content: the menu sheet, the quick search dropdown, and badges over posters. Glass over flat black carries no blur.
- **The navbar is transparent and not sticky.** It has no background, border or blur and scrolls away with the page: pinned over scrolling content, a transparent bar is unreadable. Do not make it sticky again without giving it a background. Every control in it is 40px tall at every width: the `bar` and `icon-bar` button sizes, `h-7` tabs inside a pill padded so tab, padding and the 1.5px rim add up to 40px, and an `h-10` search field. The `hit-area` utility (and `hit-area-tab` for a tab) stretches each tap area back to 44px, so the touch rule still holds.
- **A dead end is a bug.** `StatePanel`'s `error` and `signed-out` variants cannot render without an action. The discriminated union makes it a type error and the component throws if the type is bypassed.
- **Touch targets** are 44px on mobile and 36px on desktop, the `touch` and `sm` sizes in `buttonVariants`. A control drawn smaller than 44px on mobile carries `hit-area` instead (root AGENTS.md section 3). One accepted exception: the footer's `kris1027` credit link has a 36px tap area, because 44px would mean taking taps from the legal links above it or widening the gap and moving the line.
- Posters render through `next/image` with `fill` inside `aspect-[2/3]`, using the `POSTER_SIZES` string exported by `poster-card.tsx` so it stays matched to the grid's column counts (2 / 3 / 4 / 5 / 6 from base to `xl`).
- A missing poster renders the fallback tile at an identical footprint, so the grid never shifts. Never invent a placeholder image or placeholder metadata.

## Layout

- `components/ui/` holds the shadcn primitives, generated by the CLI then restyled to the glass system. Regenerating one overwrites the restyle, so diff before you accept it.
- `components/layout/` holds the app shell pieces. The navbar ships only its signed out form; the signed in variant arrives with feature 6 and must not be built by reading a client supplied identity.
- Everything else at the top level is a content piece: `glass-pill`, `rating-badges`, `poster-card`, `poster-grid`, `state-panel`, `skeleton`, `pagination-links`, `retry-link`.
- `components/movie/` holds the movie page pieces (`MovieHero`, `MovieOverview`, `CastRow`, `MovieDetailSkeleton`), all Server Components. Feature 10 should reuse their structure for TV rather than design a second page (spec 0006).
- `components/library/` holds the three private library pages, `/watchlist`, `/upcoming` and `/watched` (spec 0020). `LibrarySection` reads one tab per request; show cards are Server Components (`watchlist-show-card.tsx` streams its season read per card, `show-cards.tsx` holds the Upcoming and Watched cards), and the client pieces, `library-grid.tsx` (movies), `mark-next-watched-button.tsx` and `missing-show-card.tsx`, sit outside the shell, so the shell's client boundary list above is unchanged. `ids.ts` is the one home of the focus ids the server cards and those client controls share. Show tracking writes from any surface go through `components/tracking/use-show-tracking.ts`, which owns the Stop tracking Undo.
- `components/layout/site-footer.tsx` renders under every route from the root layout and must read no request state (`app/layout-purity.test.ts`). It is flat (no glass, no border) and carries no email address. Its credit line links `OPERATOR_HANDLE` to `OPERATOR_GITHUB_URL`, both from `lib/legal/operator.ts`. `components/legal/` holds the reading column and helpers `/privacy` and `/terms` share; use `LEGAL_LINK_CLASS` for any link in legal text (spec 0017).
- The six badges in the badge legend (Planned, Plan, Stop watching, Watch again, Next episode, Release date) are built by features 8, 12, 14 and 15. A new badge must reuse `GlassPill` rather than re-derive it.

## Checking your work

`/showcase` renders every token, primitive, badge and state in one place, including the plate rule demonstration. It calls `notFound()` under `NODE_ENV === "production"`, so it is a static 404 in a production build while still rendering under `next dev` and Vitest. It only earns its keep if you update it alongside what you change; a stale showcase is worse than none.

Tests here cover keyboard operation, visible focus, roles, and the dialog's focus trap and focus return. `pnpm test` runs them.

_Drafted by /sync from the introducing change, worth a quick human pass._
