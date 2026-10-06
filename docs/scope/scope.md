# Scope: BeStats

A movie and TV tracking web app powered by TMDB. Anyone can browse and search the catalog; signed in users keep a private watchlist, watch history, statuses and ratings.

**Build approach:** Tracer Bullet (prove the whole pipe works with one thin real thread, then thicken one strand at a time, always end to end).
**Workflow:** Beta (after develop, run `/check verify` then `/test`). Features that hold private data or enforce the rating and status rules carry a `· GA` tag, which adds a fresh model review and `/document`. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

_The stack, tooling and product rules (ratings, progress, statuses, security) live only in `AGENTS.md`; this file does not repeat them. Specs below only record the decisions `AGENTS.md` leaves open. The UI reference is the shipped interface plus `/showcase`._

_2026-10-06: the `design/` artboards were removed. The UI built from them carries their decisions forward; a screen with no precedent is described and approved in its plan. Same day: the navbar became transparent and non sticky with 40px controls, the footer lost its border, and the operator is named by handle (`kris1027`, linked to GitHub) instead of a legal name._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack and scaffold | Foundation | done |
| 2 | Coding standards and tooling | Foundation | done |
| 3 | Data model and security policies | Foundation | done |
| 4 | TMDB integration module | Foundation | done |
| 5 | Design system and UI foundation | Foundation | done |
| 6 | Authentication | Slice 1 | done |
| 7 | Movie page | Slice 1 | done |
| 8 | Movie tracking | Slice 1 | done |
| 9 | Watchlist and movie history | Slice 1 | done |
| 10 | TV show page | Slice 2 | done |
| 11 | Search and filters | Slice 3 | done |
| 12 | Episode and season tracking | Slice 4 | done |
| 13 | Calculated season and show ratings | Slice 5 | done |
| 14 | TV status and progress | Slice 6 | done |
| 15 | Up Next | Slice 7 | done |
| 16 | Automatic completion | Slice 7 | done |
| 17 | SEO metadata and sitemap | Slice 8 | done |
| 18 | Legal pages and TMDB attribution | Slice 8 | done |
| 19 | Security and acceptance verification | Slice 8 | done |
| 20 | Deploy and provider setup | Slice 8 | done |
| 21 | TV history on /watched | Slice 9 | in-progress |

## Foundations

### 1. Stack and scaffold · done
Set up the stack defined in `AGENTS.md` section 6. Today only a bare Next.js app with Tailwind exists; Supabase clients, shadcn/ui, Zod and `.env.example` are missing.
**Done when:** TypeScript stays in strict mode (already on in `tsconfig.json`), and the app boots and builds with Supabase client setup, shadcn/ui, Zod and a committed `.env.example` with placeholders, and no secret can reach the browser bundle.
- [x] Finish the scaffold: `/develop stack and scaffold`
Code in `app/`, `lib/env.ts`, `lib/supabase/`, `proxy.ts`

### 2. Coding standards and tooling · done
Capture conventions from the real project, then install the checks every later slice relies on (type check, lint and format, test runner). The tool choices (Biome replacing ESLint) are in `AGENTS.md` section 6.
**Done when:** `AGENTS.md` matches the installed tooling, ESLint is removed, and type check, Biome and a test runner run clean.
- [x] Capture conventions and tooling choices: `/audit`
- [x] Design it (spec): `/architect coding standards and tooling`
- [x] Install the tooling: `/develop tooling`
- [x] Check it runs clean: `/test`
Code in `biome.json`, `vitest.config.ts`, `vitest.setup.ts`, `.github/workflows/checks.yml`, `supabase/tests/`
spec [0003](../specs/0003-lint-format-and-test-tooling.md)

### 3. Data model and security policies · done · GA
The costliest thing to redo. Movie state, TV tracking state, episode state and catalog identity (media type plus TMDB ID), with constraints and row level security from the first migration.
**Done when:** migrations create every table with ownership, uniqueness and rating bounds; RLS blocks any cross user read or write; repeated writes never duplicate rows.
- [x] Design it (spec): `/architect data model and security policies`
- [x] Build it: `/develop data model and security policies`
  - [x] Local Supabase stack running, declarative schema workflow configured — AC-1
  - [x] Two enums, three tables, constraints, episode index and both triggers authored — AC-1, AC-7, AC-8, AC-9, AC-12
  - [x] RLS enabled and forced, twelve policies, grants to authenticated and revokes from anon — AC-2, AC-4, AC-5
  - [x] Migration generated and reviewed, advisors clean, reset reproducible twice — AC-1, AC-2
  - [x] Seed fixture, pgTAP suite, generated types with a drift check, service role absence confirmed — AC-3 to AC-6, AC-10 to AC-15
- [x] Verify it: `/check verify data model and security policies`
- [x] Test it: `/test data model and security policies`
- [x] Review it (fresh model): `/check review data model and security policies`
- [x] Document it: `/document data model and security policies`
Code in `supabase/schemas/`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`, `lib/supabase/database.types.ts`, `scripts/db-types-check.sh`
spec [0001](../specs/0001-user-tracking-schema-and-rls/index.md)

### 4. TMDB integration module · done
A server only module for authenticated TMDB requests: normalized responses, caching with a refresh policy, rate limit and failure handling, English first metadata.
**Done when:** movie, TV, season and episode data load through one server module, the token never reaches the browser, and a TMDB failure returns a handled error, not a crash.
- [x] Design it (spec): `/architect TMDB integration module`
- [x] Build it: `/develop TMDB integration module`
  - [x] Packages, `.env.example`, the `cacheComponents` flag and the module skeleton with `server-only` — AC-1, AC-2, AC-4, AC-20, AC-22
  - [x] Request client: Bearer auth, timeout, typed errors, bounded retry, structured logging, image URLs — AC-3, AC-10 to AC-12, AC-20, AC-21, AC-26, AC-27
  - [x] The movie thread end to end, verified in the running app, with its fixture tests and the secret boundary proven — AC-5 to AC-9, AC-13, AC-23, AC-2
  - [x] TV, seasons and specials, the bounded batch helpers, and `getShowEpisodes` with its completeness flag — AC-14, AC-15, AC-19, AC-25
  - [x] Search, discover, genres, the barrel, the full fixture suite, the opt in live check and the final build — AC-7, AC-16 to AC-18, AC-23, AC-24
- [x] Verify it: `/check verify TMDB integration module`
- [x] Test it: `/test TMDB integration module`
Code in `lib/tmdb/`, `next.config.ts`, `vitest.live.mts`, `security-boundary.test.ts`
spec [0002](../specs/0002-tmdb-integration-module/index.md)

### 5. Design system and UI foundation · done
Base components adapted from the reference designs, plus loading, empty, error and missing image patterns. The sixteen references lived in `design/` until it was removed on 2026-10-06.
**Done when:** base components matched those references (their decisions now live in the shipped UI and `/showcase`), work by keyboard with visible focus, and cover the shared loading, empty and error states on desktop and mobile.
- [x] Design it (spec): `/architect design system and UI foundation`
- [x] Build it: `/develop design system and UI foundation`
  - [x] Theme foundation: one black palette, Inter, the shadcn remap, product tokens, glass utilities with the rounded rim technique, focus ring — AC-1 to AC-4, AC-6
  - [x] The thin thread end to end: root layout, sticky blurred navbar, the `/` redirect, placeholder `/shows` and `/movies`, verified in the running app — AC-13, AC-16, AC-17, AC-18
  - [x] Shell thickened and primitives adapted: mobile navbar, tab links, the menu dialog sheet, the generated shadcn components — AC-14, AC-15
  - [x] Content pieces: the glass pill and its two badges, poster card with the missing image fallback, the grid, the state panel, the skeletons — AC-5, AC-8 to AC-12
  - [x] Proof: contrast audit recorded, showcase route with its production guard, accessibility tests, full checks — AC-7, AC-19 to AC-21
- [x] Verify it: `/check verify design system and UI foundation`
- [x] Test it: `/test design system and UI foundation`
Code in `app/globals.css`, `app/layout.tsx`, `app/{shows,movies,showcase}/`, `components/`, `next.config.ts`
spec [0004](../specs/0004-design-system-and-ui-foundation/index.md)

## Slice 1: Core movie loop

The thin real thread: browse a movie, sign in, track it, see it in your list. Every layer is real, breadth is deferred.

### 6. Authentication · done · GA
Email and password sign in, email verification, sign out, password recovery, and session handling that private routes can trust. Google sign in moved to feature 20 with the rest of the provider setup, because it cannot be verified without a Google OAuth client.
**Done when:** a visitor can sign up, verify their address, sign in, sign out and recover a password; private routes reject signed out visitors at both the redirect and the server; a new password can be set without the current one only from a recovery link; and the forms never reveal whether an address has an account.
- [x] Design it (spec): `/architect authentication`
- [x] Build it: `/develop authentication`
  - [x] Configuration and shared rules: the site URL variable, the `[auth]` block, and the shared schemas, action state, path guard, message and log modules — AC-9, AC-11, AC-18, AC-23
  - [x] The thin thread end to end: sign in, sign out, the private account page, the proxy guard and `requireUser`, verified in the running app — AC-4, AC-5, AC-10, AC-12, AC-15
  - [x] The navbar account slot inside its Suspense boundary, passed into both navbar forms, with the layout purity test — AC-13, AC-14
  - [x] The sign up strand: sign up, check email with resend, the callback, and the neutral existing address branch — AC-1, AC-2, AC-3, AC-6
  - [x] The recovery strand and change password, then hardening and proof: expired sessions, noindex, logging, the test suite, accessibility and the bundle check — AC-7, AC-8, AC-16, AC-17, AC-19 to AC-22
  - [x] Corrections from the verify run: gate `resetPasswordAction` on a recovery session, spend that session on one reset by signing out globally, and carry `next` through the two cross links between sign in and sign up — AC-24, AC-8, AC-10
  - [x] The revocation window from verify run 2: `jwt_expiry = 600` on the local stack, confirmed on a restarted stack, so a revoked session stops working within ten minutes — AC-8
  - [x] The mapping tests from verify run 3, plus classifying a breach by `reasons` not message text: a 429 and an `over_email_send_rate_limit` error classify as rate limited, a breach refusal as breached, a length refusal as too short. The five steps the local stack cannot run move to feature 20 — AC-9, AC-18
  - [x] Corrections from the fresh model review: the session cookies become `HttpOnly` (and `Secure` on an `https` site URL) through one shared options function, guarded by a boundary test; the control character fix to `next` already landed through /debug — AC-25, AC-11
- [x] Verify it: `/check verify authentication`
- [x] Test it: `/test authentication`
- [x] Review it (fresh model): `/check review authentication`
- [x] Document it: `/document authentication`
code in [lib/auth/](../../lib/auth/), [app/(auth)/](<../../app/(auth)/>), [app/account/](../../app/account/), [app/auth/callback/](../../app/auth/callback/), [components/auth/](../../components/auth/)
spec [0005](../specs/0005-authentication/index.md)

### 7. Movie page · done
Public movie detail page with poster, overview, cast, genres and the TMDB community rating, clearly labeled as TMDB. Also the first landing view to reach a movie.
**Done when:** a signed out visitor can open a movie, see cast and metadata, and missing images or fields render a sensible fallback without invented content.
- [x] Design it (spec): `/architect movie page`
- [x] Build it: `/develop movie page`
  - [x] The thin thread end to end: a streamed `/movies/[id]` and page 1 of the popular grid linking to it, verified in the running app and as prerendered shells in the build — AC-1, AC-3, AC-11
  - [x] The TMDB module strand: `adult`, the original language overview from translations, and the failure lifetime split, with fixtures and tests — AC-5, AC-9, AC-10
  - [x] The detail page thickened: backdrop hero, meta line, genre chips, rating block, cast row, skeletons, every missing data fallback, mobile layout and metadata — AC-3 to AC-7, AC-12, AC-14
  - [x] Not found, failure and pagination: the id parser, the proxy 404, the soft 404 via `loadMovie`, retry panels, and the previous and next links with the page checks — AC-2, AC-8 to AC-10, AC-12
  - [x] Proof: component tests, the request scoped API guard, typecheck, lint, test and build — AC-11, AC-13, AC-14
- [x] Verify it: `/check verify movie page`
  - [x] Follow-up: the cold cache spot check (one TMDB request for body plus metadata) and the reproducible transient failure retry in [verify.md](../specs/0006-movie-page/verify.md), both verified 2026-09-23
- [x] Test it: `/test movie page`
- [x] Document it: `/document movie page`
code in [app/movies/](../../app/movies/), [components/movie/](../../components/movie/), [lib/catalog/](../../lib/catalog/), [lib/format.ts](../../lib/format.ts), [lib/tmdb/](../../lib/tmdb/), [proxy.ts](../../proxy.ts)
spec [0006](../specs/0006-movie-page/index.md)

### 8. Movie tracking · done · GA
On the movie page, a signed in user can add to the watchlist, mark watched and rate from 1 to 10. Watched and rating stay separate. The `/movies` grid cards also get the Plan bookmark (spec 0007).
**Done when:** watchlist, watched and rating survive reload and a second session; removing watched keeps the rating; failed writes show an error, not a false success.
- [x] Design it (spec): `/architect movie tracking`
- [x] Build it: `/develop movie tracking`
  - [x] The thin thread: the watchlist pill on the movie page end to end (Sonner, `lib/tracking`, `setMovieWatchlist`, the Suspense slot, optimistic rollback and toasts, the amended request scope test), verified with two browsers — AC-1 to AC-3, AC-11 to AC-14, AC-19, AC-21
  - [x] The migration: `mark_movie_watched` and `rate_movie` as invoker functions with grants, types and pgTAP — AC-4, AC-8, AC-15, AC-18
  - [x] Watched pill, score pill and the hand built 1 to 10 picker — AC-1, AC-4 to AC-10
  - [x] The card bookmark on the `/movies` grid with one batched read — AC-2, AC-6, AC-16
  - [x] Failure and edge states plus proof: read failure, rapid clicks, Back after `refresh()`, mobile, tests and checks — AC-15, AC-17, AC-20 to AC-22
- [x] Verify it: `/check verify movie tracking`
- [x] Test it: `/test movie tracking`
- [x] Review it (fresh model): `/check review movie tracking`
- [x] Document it: `/document movie tracking`
Code in `app/movies/actions.ts`, `lib/tracking/`, `components/tracking/`, `supabase/schemas/05-functions.sql`
spec [0007](../specs/0007-movie-tracking/index.md)

### 9. Watchlist and movie history · done
Private view of the watchlist and watched movies, with empty and signed out states. TV entries join it in feature 14. This feature also inherits the mobile menu sheet from feature 6: `MobileMenuSheet` exists but is wired only into `/showcase`, and the menu sheet holds the Watchlist, Upcoming and Watched links that arrive here, so the menu button and the sheet belong with them (spec [0005](../specs/0005-authentication/index.md), Consequences).
**Done when:** a signed in user sees their own watchlist and watched movies with personal ratings labeled apart from TMDB ratings; a signed out visitor is sent to sign in; and, signed in at mobile width, the menu button opens a sheet holding those links plus the account block and Sign out.
- [x] Design it (spec): `/architect watchlist and movie history`
- [x] Build it: `/develop watchlist and movie history`
  - [x] The thin thread: the `watchlisted_at` column, trigger, backfill and indexes with pgTAP, and a read only `/watchlist` page with the desktop link, verified with two users — AC-1, AC-3, AC-4, AC-8, AC-12, AC-14, AC-17
  - [x] The watched page, pagination with the past the end redirect, empty states, legends, and the missing title and failure states — AC-2, AC-9 to AC-11, AC-13, AC-19
  - [x] Removal and Undo: the two restore functions, the restore actions, `CardRoundButton`, `LibraryGrid` with toasts, rollback and focus — AC-4 to AC-7, AC-9, AC-16, AC-18
  - [x] Navigation: desktop links with the active pill, and the mobile avatar, menu button and sheet with Sign out — AC-14 to AC-16
  - [x] Proof: tests, the widened request scope test, `pnpm test:db`, checks, and `verify.md` run at 375px and desktop — AC-3, AC-4, AC-17 to AC-19
- [x] Verify it: `/check verify watchlist and movie history`
- [x] Test it: `/test watchlist and movie history`
Code in `app/watchlist/`, `app/watched/`, `components/library/`, `components/layout/`, `lib/tracking/movie-lists.ts`, `app/movies/actions.ts`, `supabase/schemas/`
spec [0008](../specs/0008-watchlist-and-movie-history/index.md)

## Slice 2: TV show page

### 10. TV show page · done
Public TV detail page with cast, seasons and episode lists (including season 0 specials), air dates and show status as reported by TMDB. Also the `/shows` popular grid and one page per season (spec 0009).
**Done when:** a visitor can open a show, browse seasons and episodes, and incomplete episode data or missing air dates display honestly.
- [x] Design it (spec): `/architect TV show page`
- [x] Build it: `/develop TV show page`
  - [x] The thin thread: `/shows` grid to a show page to a season page, verified in the running app and as prerendered shells in the build — AC-1, AC-17
  - [x] The module strand: the new `TvShow` fields, the translations append, `getShowCast` from aggregate credits, and the show read moved to `hours` — AC-6, AC-8, AC-20
  - [x] The show page thickened: `DetailHero`, air span and status, overview, season cards, the cast section, fallbacks and mobile — AC-3 to AC-8, AC-19
  - [x] The season page thickened: header, episode rows, empty season, previous and next links, mobile — AC-9 to AC-12, AC-19
  - [x] Not found, failure, metadata and pagination, then proof: `parseTmdbId`, the proxy patterns, soft 404s, retry panels, `/shows` pages, tests and checks — AC-2, AC-13 to AC-18
- [x] Verify it: `/check verify TV show page`
- [x] Test it: `/test TV show page`
- [x] Document it: `/document TV show page`
spec [0009](../specs/0009-tv-show-page/index.md) · code in [app/shows/](../../app/shows/), [components/show/](../../components/show/), [components/catalog/](../../components/catalog/), [lib/catalog/](../../lib/catalog/), [lib/format.ts](../../lib/format.ts), [lib/tmdb/](../../lib/tmdb/), [proxy.ts](../../proxy.ts)

## Slice 3: Search

### 11. Search and filters · done
Results page for movies or TV with a title query, genre, year and minimum TMDB rating filters, shareable URL parameters and pagination. Search and discovery endpoints differ, so the approach must be verified against TMDB.
**Done when:** every displayed result meets the selected filters, counts are never falsely unfiltered totals, filters survive opening a title and returning, and failures offer a retry.
- [x] Design it (spec): `/architect search and filters`
- [x] Build it: `/develop search and filters`
  - [x] The thin thread: summary `genreIds`, the pure `lib/search/` helpers, `GET /api/search` with the proxy exclusion, a bare navbar field and plain search on `/search` — AC-1, AC-7, AC-10, AC-12, AC-18, AC-20, AC-23
  - [x] Quick search to the design: rows, counts, states, keyboard combobox, and the mobile overlay — AC-1 to AC-6
  - [x] The results page: filter bar as a GET form, type switch, browse and discover modes, keyed skeletons — AC-8, AC-9, AC-11, AC-12, AC-21, AC-24
  - [x] Filtered search: the page scan, partial count, `More results` cursor, cards with the movie bookmark, invalid and failure states — AC-13 to AC-16, AC-18, AC-19
  - [x] Proof: metadata and `noindex`, purity and request scope tests, prerendered build, Back navigation, 375px and keyboard passes — AC-6, AC-17, AC-21, AC-22
- [x] Verify it: `/check verify search and filters`
- [x] Test it: `/test search and filters`
spec [0010](../specs/0010-search-and-filters/index.md) · code in [app/search/](../../app/search/), [app/api/search/](../../app/api/search/), [components/search/](../../components/search/), [lib/search/](../../lib/search/), [lib/tmdb/](../../lib/tmdb/), [proxy.ts](../../proxy.ts)

## Slice 4: Episode tracking

### 12. Episode and season tracking · done · GA
Mark episodes watched and rate them from 1 to 10; mark a season watched, which covers only aired episodes and never overwrites ratings.
**Done when:** marking a season watched is idempotent, skips future and unknown date episodes, keeps existing ratings, and specials can be tracked and rated.
- [x] Design it (spec): `/architect episode and season tracking`
- [x] Build it: `/develop episode and season tracking`
  - [x] The thin thread: the UTC air status rule, `mark_episode_watched`, the season read, `setEpisodeWatched`, the season store and the watched pill on each row, verified with two browsers — AC-1, AC-3 to AC-5, AC-7, AC-14, AC-15, AC-19 to AC-22, AC-24
  - [x] The rating strand: `rate_episode`, `setEpisodeRating`, the score pill and picker, and the episode intent mirror — AC-1, AC-6, AC-13, AC-16
  - [x] The upcoming strand: the "Upcoming" label and removals only controls for future rows that already have state — AC-2, AC-3
  - [x] The season strand: the three season functions, `setSeasonWatched` and `undoSeasonWatched`, the header button, count and Undo toasts, rows and count moving together — AC-8 to AC-13, AC-16, AC-19
  - [x] Failure, edge states and proof: read failure, the one read check, orphaned rows, Specials, 375px and keyboard, tests, checks and `verify.md` — AC-12, AC-17, AC-18, AC-23, AC-25
- [x] Verify it: `/check verify episode and season tracking`
- [x] Test it: `/test episode and season tracking`
- [x] Review it (fresh model): `/check review episode and season tracking`
- [x] Document it: `/document episode and season tracking`
spec [0011](../specs/0011-episode-and-season-tracking/index.md) · code in [components/tracking/](../../components/tracking/), [app/shows/actions.ts](../../app/shows/actions.ts), [lib/tv/](../../lib/tv/)

## Slice 5: Calculated ratings

### 13. Calculated season and show ratings · done · GA
Domain functions for season rating (mean of rated episodes) and show rating (equal weight mean of rated regular seasons), shown as personal ratings to one decimal, or Not rated.
**Done when:** unrated episodes and seasons are excluded, season 0 is excluded, unequal season lengths do not change season weight, and no ratings shows Not rated, never zero.
- [x] Design it (spec): `/architect calculated season and show ratings`
- [x] Build it: `/develop calculated season and show ratings`
  - [x] The thin thread: `lib/tv/ratings.ts`, `formatCalculatedRating`, `CalculatedRatingBadge` and the season header rating from confirmed state — AC-1 to AC-5, AC-14, AC-15, AC-17
  - [x] The optimistic strand: the season rating moving and rolling back with the score pill — AC-6
  - [x] The show strand: `getShowEpisodeRatings`, the show rating in the Seasons heading row, its Not rated, Specials note and retry states — AC-7, AC-9 to AC-13
  - [x] The card strand and proof: season card badges from the shared read, 375px, two browsers, the read count, checks and `verify.md` — AC-8 to AC-10, AC-13, AC-16, AC-17
- [x] Verify it: `/check verify calculated season and show ratings`
- [x] Test it: `/test calculated season and show ratings`
- [x] Review it (fresh model): `/check review calculated season and show ratings`
- [x] Document it: `/document calculated season and show ratings`
spec [0012](../specs/0012-calculated-season-show-ratings/index.md) · code in [lib/tv/](../../lib/tv/), [lib/tracking/](../../lib/tracking/), [components/tracking/](../../components/tracking/), [components/show/](../../components/show/)

## Slice 6: TV status and progress

### 14. TV status and progress · done · GA
Five statuses with manual choices kept apart from automatic ones, overall progress from aired regular episodes, and TV entries joining the private watchlist.
**Done when:** status changes preserve episode history and ratings; progress excludes specials and unaired episodes; a zero eligible total shows an empty state; the chosen air date boundary is documented.
- [x] Design it (spec): `/architect TV status and progress`
- [x] Build it: `/develop TV status and progress`
  - [x] The thin thread: `listed_at`, the set, remove and restore status functions, `setShowStatus` and `restoreShowStatus`, and the hero status pill with its menu, Undo, visitor and read failure states, verified with two browsers — AC-1 to AC-5, AC-19 to AC-21
  - [x] The automatic strand: `start_watching_show`, the three episode functions returning `show_started`, and the "moved to Watching" toast — AC-6 to AC-8
  - [x] The progress strand: `lib/tv/progress.ts`, `getWatchedEpisodeIds` and the hero progress line with its counted, none aired and unavailable states — AC-9 to AC-12
  - [x] The watchlist and grid strands: the `user_watchlist_entries` view, TV cards with the streamed Next episode pill, Planned and Stop watching with Undo, the legend, and the TV bookmark on `/shows` and `/search` — AC-13 to AC-18
  - [x] Proof: 375px and keyboard passes, request scope tests, the view's query plan, checks and `verify.md` — AC-12, AC-20, AC-22
- [x] Verify it: `/check verify TV status and progress`
- [x] Test it: `/test TV status and progress`
- [x] Review it (fresh model): `/check review TV status and progress`
- [x] Document it: `/document TV status and progress`
spec [0013](../specs/0013-tv-status-and-progress/index.md) · code in [lib/tracking/show-state.ts](../../lib/tracking/show-state.ts), [lib/tv/progress.ts](../../lib/tv/progress.ts), [components/tracking/](../../components/tracking/), [components/library/](../../components/library/), [app/shows/actions.ts](../../app/shows/actions.ts), `supabase/migrations/20260926*`

## Slice 7: Up Next and completion

### 15. Up Next · done
The private `/upcoming` page (the navbar's Upcoming link): an Up Next section showing the first unwatched aired regular episode for each Watching show, or "You're up to date", with Mark watched on each card; and a Coming soon section of planned movies not released yet.
**Done when:** it picks the correct episode in season and episode order, ongoing shows caught up show "You're up to date", and On Hold and Dropped shows are excluded.
- [x] Design it (spec): `/architect Up Next`
- [x] Build it: `/develop Up Next`
  - [x] The thin thread: the `user_up_next_shows` view, `lib/tv/up-next.ts`, `/upcoming` with the Up Next section and the Upcoming nav link — AC-1 to AC-4, AC-15
  - [x] The pill strand: every pill state, the caught up caption, the unavailable slot with Retry — AC-5 to AC-7
  - [x] The mark strand: `newly_marked`, Mark watched with pending, refresh, focus and Undo — AC-8 to AC-10
  - [x] The movie and states strands: Coming soon with its 200 ceiling and Planned bookmark, empty and failure states — AC-11 to AC-14
  - [x] Proof: 375px and keyboard passes, query plan and cold load timings, checks and `verify.md` — AC-15, AC-16
- [x] Verify it: `/check verify Up Next`
- [x] Test it: `/test Up Next`
spec [0014](../specs/0014-up-next/index.md) · code in [app/upcoming/](../../app/upcoming/), [components/upcoming/](../../components/upcoming/), [lib/tracking/up-next.ts](../../lib/tracking/up-next.ts), [lib/tv/up-next.ts](../../lib/tv/up-next.ts), `supabase/migrations/20260928*`

### 16. Automatic completion · done · GA
Move a show to Completed only when TMDB says ended or canceled and every aired regular episode is watched, using complete metadata only, and reversible when the condition changes.
**Done when:** a partial fetch never completes a show, manual On Hold, Dropped and chosen statuses are never overwritten, and auto completion reverts when new episodes appear.
- [x] Design it (spec): `/architect automatic completion`
- [x] Build it: `/develop automatic completion`
  - [x] The thin thread: `showStatus` on `ShowEpisodes`, `completionVerdict`, `complete_show_automatically` and `rate_episode` migration, the gated write check in `setEpisodeWatched`, the Up Next toast — AC-1 to AC-5, AC-15, AC-16
  - [x] The write strand: rating, season mark and season Undo checks, toasts, logging, Up Next focus move — AC-4 to AC-7
  - [x] The reopen strand: the `reopen_completed_show` triggers and their pgTAP — AC-8, AC-9, AC-15
  - [x] The visit and pin strands: show page and `/upcoming` checks, `set_show_status` pin, status matrix and cross user tests — AC-10 to AC-14, AC-16, AC-17, AC-19
  - [x] Proof: 375px and keyboard, two browser step, checks, `/upcoming` timings, `verify.md` — AC-16, AC-18
- [x] Verify it: `/check verify automatic completion`
- [x] Test it: `/test automatic completion`
- [x] Review it (fresh model): `/check review automatic completion`
- [x] Document it: `/document automatic completion`
spec [0015](../specs/0015-automatic-completion/index.md) · code in [lib/tv/auto-completion.ts](../../lib/tv/auto-completion.ts), [lib/tracking/auto-completion.ts](../../lib/tracking/auto-completion.ts), [app/shows/actions.ts](../../app/shows/actions.ts), [components/upcoming/](../../components/upcoming/), `supabase/migrations/20260930*`

## Slice 8: Launch readiness

### 17. SEO metadata and sitemap · done
Titles, descriptions, social cards and a sitemap for the public catalog pages.
**Done when:** public movie, TV and search pages carry accurate metadata and a sitemap lists reachable public pages; private pages are not indexed.
- [x] Design it (spec): `/architect SEO metadata and sitemap`
- [x] Build it: `/develop SEO metadata and sitemap`
  - [x] The crawler pipe: `lib/seo/site.ts`, `robots.txt`, a landings only sitemap, the proxy matcher exclusion — AC-1, AC-2, AC-4, AC-5, AC-9, AC-25
  - [x] Shared metadata and the site card: `catalogMetadata()`, `metadataBase`, root defaults, `app/opengraph-image.tsx` — AC-3, AC-10, AC-11, AC-19, AC-20
  - [x] Title pages: movie, show and season canonicals, share images, failed branch `noindex`, Movie and TVSeries JSON-LD — AC-12 to AC-16, AC-21 to AC-23
  - [x] Popular titles sitemap, landings and search: 20 discover reads with independent failure, per page canonicals, descriptions — AC-6 to AC-8, AC-17, AC-18
  - [x] Proof: tests, build route table, heads checked signed out and signed in and with no site URL — AC-24, AC-25
- [x] Verify it: `/check verify SEO metadata and sitemap`
- [x] Test it: `/test SEO metadata and sitemap`
- [x] Review it (fresh model): `/check review SEO metadata and sitemap`
spec [0016](../specs/0016-seo-metadata-and-sitemap/index.md) · code in `lib/seo/`, `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, the public page `generateMetadata` functions

### 18. Legal pages and TMDB attribution · done
Privacy policy, terms, and the TMDB attribution and branding required by its current terms.
**Done when:** attribution meets TMDB's current requirements and privacy and terms pages are linked from the site footer and sign up.
- [x] Design it (spec): `/architect legal pages and TMDB attribution`
- [x] Build it: `/develop legal pages and TMDB attribution`
  - [x] The thin thread: `lib/legal/operator.ts`, a minimal `/privacy`, `SiteFooter` in the root layout and the purity test — AC-1, AC-4, AC-6, AC-10
  - [x] Attribution done right: the new `TMDB_ATTRIBUTION`, the unmodified TMDB logo in `public/` and its hash test — AC-2, AC-3
  - [x] The full Privacy Policy and Terms of Service from the facts tables — AC-7 to AC-11
  - [x] Metadata, sitemap entries, proxy cases and the sign up line — AC-6, AC-12 to AC-14
  - [x] Footer layout at both widths and the proof: checks and browser pass — AC-5, AC-15
- [x] Verify it: `/check verify legal pages and TMDB attribution`
- [x] Test it: `/test legal pages and TMDB attribution`
- [x] Review it (fresh model): `/check review legal pages and TMDB attribution`
spec [0017](../specs/0017-legal-pages-tmdb-attribution/index.md) · code in `components/layout/site-footer.tsx`, `components/legal/`, `lib/legal/`, `app/privacy/`, `app/terms/`, `public/tmdb-logo.svg`

### 19. Security and acceptance verification · done
Run the full `AGENTS.md` section 13 checklist with two test users, including direct data requests, shared cache checks and secrets absent from bundles.
**Done when:** all 15 acceptance items are verified or reported blocked with the reason, and no cross user read or write succeeds.
- [x] Verify it: `/check verify security and acceptance verification`
- [x] Test it: `/test security and acceptance verification`

### 20. Deploy and provider setup · done · GA
Vercel deployment on the free `vercel.app` address, the existing Supabase Free project configured from the repo (`db push` and `config push` through a runbook), branch protection, and the hosted security checks spec 0005 left here. Production sends no email: sign up needs no confirmation, recovery shows a contact notice, and Google sign in stays absent (both deferred together). Remote migrations and deployment need your explicit approval in the plan.
**Done when:** the deployed app signs users up and in with email and password against the cloud project with every migration applied, hosted auth settings match `supabase/config.toml`, environment variables target the intended projects, and no screen promises an email production can't send.
spec [0018](../specs/0018-deploy-and-provider-setup/index.md) · code in [docs/deploy.md](../deploy.md), [vercel.json](../../vercel.json), [supabase/config.toml](../../supabase/config.toml), [lib/env.ts](../../lib/env.ts), [app/(auth)/](../../app/(auth)/)
- [x] Design it (spec): `/architect deploy and provider setup`
- [x] Build it: `/develop deploy and provider setup`
  - [x] Thin thread to production: Vercel project, branch protection, EU region and JWT key checks, `db push` and `config push`, a real signed in write (AC-1 to AC-9)
  - [x] The no email strand: the flag, sign up without confirmation, recovery notice, server side refusals (AC-10 to AC-15)
  - [x] Previews: the unavailable notice on `/sign-in` and `/sign-up`, the proxy fallback, Preview variables and a bypass token check (AC-6, AC-21)
  - [x] Legal, SEO and runbook: region in the privacy policy, `docs/deploy.md`, sitemap checks and Search Console (AC-22 to AC-24)
  - [x] Hosted security proof: cookies, token lifetime, isolation, bundle secrets, `/api/search` firewall rule, then the rate limit finding (AC-5, AC-16 to AC-20)
- [x] Verify it: `/check verify deploy and provider setup`
- [x] Test it: `/test deploy and provider setup`
- [x] Review it (fresh model): `/check review deploy and provider setup`
- [x] Document it: `/document deploy and provider setup`

Still open, both yours and outside the repo: the Google Search Console sitemap step in [verify.md](../specs/0018-deploy-and-provider-setup/verify.md) (AC-22), and the launch gate in [docs/deploy.md](../deploy.md) (read `/privacy` and `/terms` in full on production, run `pnpm tmdb:live` once).

## Slice 9: TV history

### 21. TV history on /watched · in-progress
The watched page shows movies only. Add the shows and episodes you watched, so `/watched` is your whole history (from spec [0013](../specs/0013-tv-status-and-progress/index.md), Follow-up). The shipped `/watched` page covers movies only and `/showcase` has no history layout, so the layout for shows is the open decision, to be described and approved in its plan.
**Done when:** a signed in user sees the shows they watched episodes of on `/watched`, ordered and labeled consistently with the movies there, with personal ratings kept apart from TMDB ratings, specials not counted toward progress, and the empty, signed out and failure states still working.
- [x] Design it (spec): `/architect TV history on /watched`
- [x] Build it: `/develop TV history on /watched`
  - [x] The thin thread: the `user_watched_entries` view with grants, types and pgTAP, `getWatchedPage` over it, and Completed show cards with no button on `/watched` — AC-1, AC-2, AC-4, AC-6, AC-11, AC-12
  - [x] The rating strand: `getShowRatings` and the calculated show rating badge, with its failure routed to the list panel — AC-5, AC-10
  - [x] The page strand: merged pagination, the new copy, the missing title show card, and movie unmark, Undo and focus with shows present — AC-3, AC-7 to AC-10
  - [x] Proof: 375 px and keyboard passes, purity tests, all checks, and the `explain analyze` timing — AC-13 to AC-15
- [x] Verify it: `/check verify TV history on /watched`
- [x] Test it: `/test TV history on /watched`
- [x] Review it (fresh model): `/check review TV history on /watched`
- [x] Document it: `/document TV history on /watched`
spec [0019](../specs/0019-tv-history-on-watched/index.md) · code in `supabase/schemas/06-views.sql`, `lib/tracking/library-lists.ts`, `lib/tracking/show-ratings.ts`, `components/library/`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Public profiles and social features**: ruled out of the MVP by `AGENTS.md`
- **Error monitoring and product analytics**: not selected for this pass
- **Self serve account deletion and data export** (from specs 0005 and 0017): GDPR requests are handled by email for now. Undesigned; a `/account` flow needs the Supabase admin API or a security definer function, an elevated call nothing else in the app uses, so it deserves its own decision, including what happens to the cascading tracking data
- **Rate limit on sign in and sign up** (from spec 0018): Supabase counts Vercel's addresses, so its auth limit is shared by every visitor ([docs/deploy.md](../deploy.md) section 6). If it bites, add a second Vercel Firewall rule on sign in and sign up posts per IP. (The `/api/search` limit from spec 0010 shipped as a firewall rule in feature 20.)
- **Scheduled automatic completion** (from spec 0015): completion runs only when you open a show or `/upcoming`. If "a change you never visit waits" becomes a real complaint, a scheduled job is next; it needs an elevated server role and its own spec
- **A paid Supabase plan** (from spec 0018): the Free project pauses after about a week idle and has no automatic backups; revisit if that bites, or before inviting more than a handful of users
- **Email delivery and Google sign in** (from spec 0018): an SMTP provider (your own domain, or Gmail SMTP), `enable_confirmations = true` and `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=on`, password recovery back, a browser pass of spec 0005's email steps, the Google button restored, a pre account takeover guard for accounts created while confirmation was off, `secure_password_change = true`, Google and the email provider added to `PROCESSORS`, and leaked password protection if you move to Pro

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` with 2 to 5 milestones; the tier's closing boxes; any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` and milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is; `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; for Beta and GA the suggested point is after `/test` |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards and tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (before the workflow) and `dropped` (de scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· GA`) sets that one feature's rigor above the project default; no tag inherits Beta.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
