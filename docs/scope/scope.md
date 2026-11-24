# Scope: BeStats

A movie and TV tracking web app powered by TMDB. Anyone can browse and search the catalog; signed in users keep a private watchlist, watch history, statuses and ratings.

**Build approach:** Tracer Bullet (prove the whole pipe works with one thin real thread, then thicken one strand at a time, always end to end).
**Workflow:** Beta (after develop, run `/check verify` then `/test`). Features that hold private data or enforce the rating and status rules carry a `· GA` tag, which adds a fresh model review and `/document`. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

_The stack, tooling and product rules (ratings, progress, statuses, security) live only in `AGENTS.md`; this file does not repeat them. Specs below only record the decisions `AGENTS.md` leaves open. The UI reference is the shipped interface plus `/showcase`._

_2026-10-17: a second scope, [games.md](games.md), plans Games as a third media type (features G1 to G10, IGDB as its catalog). This file stays the movie and TV scope._

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
| 21 | TV history on /watched | Slice 9 | done |
| 22 | Media tabs on every page | Slice 9 | done |
| 23 | Progress based library pages | Slice 10 | done |
| 24 | Home carousels | Slice 11 | done |
| 25 | Consistent card size and richer title pages | Slice 12 | done |
| 26 | Library page names per media type | Slice 13 | done |
| 27 | Library page URLs follow their names | Slice 13 | done |
| 28 | Mobile app (iOS and Android) | Slice 14 | done |
| 29 | Mobile look: the web's visual language, a native feel | Slice 15 | in-progress |

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
code in [lib/auth/](../../apps/web/lib/auth/), [app/(auth)/](<../../apps/web/app/(auth)/>), [app/account/](../../apps/web/app/account/), [app/auth/callback/](../../apps/web/app/auth/callback/), [components/auth/](../../apps/web/components/auth/)
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
code in [app/movies/](../../apps/web/app/movies/), [components/movie/](../../apps/web/components/movie/), [lib/catalog/](../../apps/web/lib/catalog/), [lib/format.ts](../../apps/web/lib/format.ts), [lib/tmdb/](../../apps/web/lib/tmdb/), [proxy.ts](../../apps/web/proxy.ts)
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
spec [0009](../specs/0009-tv-show-page/index.md) · code in [app/shows/](../../apps/web/app/shows/), [components/show/](../../apps/web/components/show/), [components/catalog/](../../apps/web/components/catalog/), [lib/catalog/](../../apps/web/lib/catalog/), [lib/format.ts](../../apps/web/lib/format.ts), [lib/tmdb/](../../apps/web/lib/tmdb/), [proxy.ts](../../apps/web/proxy.ts)

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
spec [0010](../specs/0010-search-and-filters/index.md) · code in [app/search/](../../apps/web/app/search/), [app/api/search/](../../apps/web/app/api/search/), [components/search/](../../apps/web/components/search/), [lib/search/](../../apps/web/lib/search/), [lib/tmdb/](../../apps/web/lib/tmdb/), [proxy.ts](../../apps/web/proxy.ts)

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
spec [0011](../specs/0011-episode-and-season-tracking/index.md) · code in [components/tracking/](../../apps/web/components/tracking/), [app/shows/actions.ts](../../apps/web/app/shows/actions.ts), [lib/tv/](../../apps/web/lib/tv/)

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
spec [0012](../specs/0012-calculated-season-show-ratings/index.md) · code in [lib/tv/](../../apps/web/lib/tv/), [lib/tracking/](../../apps/web/lib/tracking/), [components/tracking/](../../apps/web/components/tracking/), [components/show/](../../apps/web/components/show/)

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
spec [0013](../specs/0013-tv-status-and-progress/index.md) · code in [lib/tracking/show-state.ts](../../apps/web/lib/tracking/show-state.ts), [lib/tv/progress.ts](../../apps/web/lib/tv/progress.ts), [components/tracking/](../../apps/web/components/tracking/), [components/library/](../../apps/web/components/library/), [app/shows/actions.ts](../../apps/web/app/shows/actions.ts), `supabase/migrations/20260926*`

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
spec [0014](../specs/0014-up-next/index.md) · code in [app/upcoming/](../../apps/web/app/upcoming/), `components/upcoming/`, `lib/tracking/up-next.ts`, `lib/tv/up-next.ts`, `supabase/migrations/20260928*`

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
spec [0015](../specs/0015-automatic-completion/index.md) · code in `lib/tv/auto-completion.ts`, `lib/tracking/auto-completion.ts`, [app/shows/actions.ts](../../apps/web/app/shows/actions.ts), `components/upcoming/`, `supabase/migrations/20260930*`

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
spec [0018](../specs/0018-deploy-and-provider-setup/index.md) · code in [docs/deploy.md](../deploy.md), [vercel.json](../../apps/web/vercel.json), [supabase/config.toml](../../supabase/config.toml), [lib/env.ts](../../apps/web/lib/env.ts), [app/(auth)/](<../../apps/web/app/(auth)/>)
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

### 21. TV history on /watched · done
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

### 22. Media tabs on every page · done
The navbar's SHOWS | MOVIES tabs filter every page, not just the catalog. On `/watchlist`, `/upcoming`, `/watched` and `/search` the active tab is the page's `?type=tv|movie` (`tv` when absent), and `/search` loses its own type control. The decisions were settled in a grilling session and recorded in the plan, not a spec; specs 0004, 0008, 0010, 0014 and 0019 carry an amendment note.
**Done when:** every list page shows only the active tab's media type, with its own count, pages, empty and error states; the Library links and navbar search carry the current type; `/shows` and `/movies` behave as before and keep their prerendered shells.
- [x] Plan it: [prompts/media-tabs-everywhere.md](../../prompts/media-tabs-everywhere.md)
- [x] Build it: `/develop media tabs on every page`
- [x] Verify it: `/check verify media tabs on every page`
- [x] Review it (fresh model): `/check review media tabs on every page`
Code in `lib/catalog/media-type.ts`, `components/layout/`, `components/library/`, `components/upcoming/`, `components/search/filter-bar.tsx`, `lib/tracking/library-lists.ts`

## Slice 10: Progress based pages

### 23. Progress based library pages · done · GA
Statuses are replaced by tracked or not; Stop tracking (with Undo) is the only way off the pages. Every title sits on exactly one page, worked out from what you watched and what TMDB has aired or dated: Watchlist (something aired to watch), Upcoming (a future or unknown date), Watched (caught up, nothing dated). Movies follow the same rule. Settled in a grilling session on 2026-10-07 (supersedes 0015 and parts of 0013, 0014 and 0019). Pause and Drop were removed in a second grilling session on 2026-10-10, and existing holds are cleared (0020 amended in place). A third amendment the same day offers the episode after the furthest watched one, not the first unwatched one.
**Done when:** every tracked show and planned movie is on the one page its progress and air dates give, the show page offers a Plan to watch / Tracking toggle with no Pause or Drop, no page writes on load, the rollout keeps the old app working until the contract migration, and `AGENTS.md` describes the new model.
- [x] Design it (spec): `/architect progress based library pages`
- [x] Build it: `/develop progress based library pages`
  - [x] The thin thread: expand migration with the legacy mirror, pgTAP, `classifyShow`, and `/watchlist?type=tv` with Mark watched cards — AC-1, AC-4, AC-5, AC-7 to AC-9, AC-14, AC-16, AC-19, AC-20, AC-22
  - [x] The show strands: Upcoming and Watched show tabs, the tracking control and card bookmark, Paused & dropped — AC-2, AC-3, AC-6, AC-10 to AC-12, AC-15, AC-21
  - [x] The movie and state strands: `classifyMovie`, movie tabs, failure notes, missing titles, empty copy — AC-13, AC-14, AC-16 to AC-18
  - [x] Docs and proof: `AGENTS.md`, checks, 375px and keyboard, timing, `verify.md`, expand push and deploy — AC-23, AC-24 (production check folded into the contract strand)
  - [x] Contract migration and hold removal, one PR pushed then merged at once, production verified after deploy: [prompts/remove-show-holds.md](../../prompts/remove-show-holds.md) — AC-1 to AC-4, AC-10, AC-21
  - [x] Amendment 2026-10-10, next episode after the furthest watched: [prompts/next-after-furthest-watched.md](../../prompts/next-after-furthest-watched.md) — AC-7, AC-8
  - [x] Verify the amendment in the running app (the plan's manual steps) — AC-7
- [x] Verify it: `/check verify progress based library pages`
- [x] Test it: `/test progress based library pages`
- [x] Review it (fresh model): `/check review progress based library pages`
- [x] Document it: `/document progress based library pages`
spec [0020](../specs/0020-progress-based-library-pages/index.md) · code in `lib/tv/library-page.ts`, `lib/catalog/movie-page.ts`, `lib/tracking/library-lists.ts`, `components/library/`, `components/tracking/`, `supabase/migrations/20261007120000_show_tracking_expand.sql`, `supabase/migrations/20261010120000_show_tracking_contract.sql`

## Slice 11: Discovery

### 24. Home carousels · done
`/shows` and `/movies` become rows of sideways scrolling carousels instead of one paged grid of 20. TV rows: Trending this week, Popular, Airing today, On the air, Top rated. Movie rows: Trending this week, Popular, Now playing, Upcoming, Top rated (region `PL`). Each row has a See all link to its own paged list page at `/shows/{slug}` or `/movies/{slug}`. Settled in a grilling session on 2026-10-12.
**Done when:** both landings show their five rows with the full card (badge, meta, controls), each row streams on its own and fails on its own with Retry; every See all page pages like today's grid with a back link; the proxy accepts the known slugs and still 404s anything else; old `?page=N` links redirect (308) to `/…/popular?page=N`; the sitemap lists page 1 of each list.
- [x] Design it (spec): `/architect home carousels`
- [x] Build it: `/develop home carousels`
  - [x] TMDB list reads, the list registry and the slug dispatcher (AC-2, AC-3, AC-8, AC-17)
  - [x] Tracer bullet: proxy slugs, the shared list page and one `/shows` row end to end, built with no TMDB token (AC-1, AC-4, AC-5, AC-7, AC-9 to AC-13, AC-15)
  - [x] All ten lists on both landings, the `?page=N` 308 redirects, and the arrow scroller (AC-1, AC-2, AC-6, AC-14)
  - [x] Sitemap list paths, request scope tests and the running app pass at 375px and 1280px (AC-16, AC-17)
- [x] Verify it: `/check verify home carousels`
- [x] Test it: `/test home carousels`
spec [0021](../specs/0021-home-carousels/index.md) · code in `lib/catalog/lists.ts`, `lib/catalog-list-read.ts`, `lib/tmdb/lists.ts`, `components/catalog/`, `app/shows/{slug}/`, `app/movies/{slug}/`, `proxy.ts`, `next.config.ts`

## Slice 12: Title pages

### 25. Consistent card size and richer title pages · done
Two strands, one feature (merged on 2026-10-12). **Cards:** grid cards match the home row card (about 180px) everywhere: `PosterGrid` steps 2 / 3 (`sm`) / 4 (`md`) / 5 (`lg`) / 6 (`xl`) columns and its `sizes` follows, on the list pages, `/search` and the three library pages; the season grid keeps its 2 and 4 columns. A 20 title page leaves a short last row, accepted. **Title pages:** movie and show pages gain a Trailer (hero button, modal with a click to load `youtube-nocookie` embed; YouTube joins `PROCESSORS` and the privacy text), Where to watch (TMDB watch providers grouped Stream, Free, Rent, Buy, region from `x-vercel-ip-country` with a `US` fallback, named in the heading, JustWatch attribution, an honest "Not streaming in {country}" line), More like this (TMDB recommendations in the home row card, hidden when empty), key crew (Director and Writers, or Created by), an age rating chip for the same region, and a Facts panel (status, original title and language, budget and revenue when known, companies, networks, type, air dates). Order: hero, overview, crew, the show's rating and seasons, where to watch, cast, more like this, facts. Settled in a grilling session on 2026-10-12.
**Done when:** every changed grid renders cards close to the home row width with matching image `sizes` and the season grid unchanged; both title pages show each new section from cached TMDB data with missing values omitted, never invented; YouTube loads only after a click; the region is named wherever it applies; the shells stay prerendered; and `/privacy` lists YouTube with `LEGAL_LAST_UPDATED` bumped.
- [x] Design it (spec): `/architect consistent card size and richer title pages`
- [x] Build it: `/develop consistent card size and richer title pages`
  - [x] Card strand: the `columns` preset with `catalog` and `wide`, the sizes and eager maps, the season grid on `wide`, the library skeleton and `/showcase`, checked at five widths — AC-1 to AC-7
  - [x] Tracer bullet: the movie extras read, `lib/region.ts` and Where to watch on the movie page end to end against live TMDB — AC-8 to AC-10, AC-12, AC-18
  - [x] Movie page thickened: Trailer dialog, age chip, the legal change, More like this, crew and facts in order — AC-11, AC-13 to AC-17, AC-19
  - [x] Show page parity and proof: the TV extras read, the new show fields, every section, tests, 375px and keyboard passes, checks and spec amendments — AC-7, AC-8, AC-10 to AC-17, AC-20 (built and checked; the spec 0004, 0006, 0009 and grid prompt amendment notes are spec content, handed to `/sync`)
- [x] Verify it: `/check verify consistent card size and richer title pages`
- [x] Test it: `/test consistent card size and richer title pages`
spec [0022](../specs/0022-card-size-title-pages/index.md) · code in `components/poster-grid.tsx`, `lib/tmdb/extras.ts`, `lib/tmdb/normalize-extras.ts`, `lib/region.ts`, `lib/catalog/region.ts`, `components/catalog/title-extras.tsx`, `components/catalog/title-details.tsx`, `components/catalog/where-to-watch.tsx`, `components/catalog/trailer-button.tsx`, `app/movies/[id]/`, `app/shows/[id]/`

## Slice 13: Library page names

### 26. Library page names per media type · done
The three library routes stay shared, but each media type names them for what they hold: shows Up next, Upcoming and Watched; movies Watchlist, Coming soon and Watched; games Want to play, Playing and Finished, plus Coming soon, the games tab's fourth page for Want to play games not out yet ([prompts/game-coming-soon.md](../../prompts/game-coming-soon.md)). One pure `libraryPageName` feeds the nav, the page heading and title, the bad `type` panel and the movie card labels and toasts; routes, `?type=` and code identifiers are unchanged. Settled in a grilling session on 2026-10-30.
**Done when:** on every tab the nav, `<h1>` and `<title>` show that tab's names; the three pages keep their prerendered shell; no component writes a page name as a literal; the living docs use the new names.
- [x] Design it (plan): [prompts/library-page-names.md](../../prompts/library-page-names.md)
- [x] Build it: `libraryPageName`, the nav, the streamed heading, `generateMetadata` titles, the panels, card labels and toasts, `/showcase` and the docs, checked on all nine tabs in the running app — AC-1 to AC-6
plan [prompts/library-page-names.md](../../prompts/library-page-names.md) · code in `lib/catalog/library-list.ts`, `components/layout/library-nav.tsx`, `components/library/library-heading.tsx`, `lib/catalog/library-metadata.ts`, `app/watchlist/`, `app/upcoming/`, `app/watched/`

### 27. Library page URLs follow their names · done
Each library page's URL says its name: shows `/up-next`, `/upcoming`, `/watched`; movies `/watchlist`, `/coming-soon`, `/watched`; games `/coming-soon`, `/want-to-play`, `/playing`, `/finished`. Tabs that name a page alike share its route, and `?type` stays. Switching tabs keeps the matching page, a bare URL opens the route's first tab, and the five old URLs whose page moved redirect temporarily. Settled in a grilling session on 2026-10-30.
**Done when:** every page opens at its own route with the right heading, title and nav; tab switches keep the matching page; the old URLs answer 307 to the new ones; all eight routes are private and keep their prerendered shell.
- [x] Design it (plan): [prompts/library-page-urls.md](../../prompts/library-page-urls.md)
- [x] Build it: `LIBRARY_PAGE_PATHS`, `libraryHref`, the four new routes, the tab switch, the private paths and the redirects, checked in the running app — AC-1 to AC-7
plan [prompts/library-page-urls.md](../../prompts/library-page-urls.md) · code in `lib/catalog/library-list.ts`, `lib/catalog/media-type.ts`, `next.config.ts`, `app/up-next/`, `app/want-to-play/`, `app/playing/`, `app/finished/`

## Slice 14: Mobile

### 28. Mobile app (iOS and Android) · done · GA
A native app for iOS and Android beside the web app, sharing its rules with it. v1 covers sign in and account (email and password, self serve deletion on both apps), browse and search, all tracking with Undo, and every library page, with a read only offline cache. The phone never holds a catalog key, so the release gate and every rule stay on the server. Designed on 2026-11-18.
**Done when:** both store builds sign in, browse, search, track and show every library page with the same rules and names as the web; the web still deploys unchanged from `apps/web`; no TMDB or IGDB secret or service role key is reachable from the app or the repo; account deletion works on both apps; and the attribution, privacy text and store privacy labels are in place.
- [x] Design it (spec): `/architect mobile app`
- [x] Build it: `/develop mobile app` (done 2026-11-22; the store release and change password on the phone moved to Deferred by your call)
  - [x] Monorepo move and shared core (spec 0033 Build plan steps 1 and 2): AC-1, AC-2, AC-3 (step 1 in PR #74; step 2 in [prompts/shared-core.md](../../prompts/shared-core.md))
  - [x] Tracer: sign in, open a movie, mark it watched (step 3): AC-4, AC-5, AC-6, AC-11 (PR #79, plan in [prompts/mobile-tracer.md](../../prompts/mobile-tracer.md); checked in the iOS Simulator from an EAS development build; real iPhone and Android builds wait for the Apple developer account and an Android SDK)
  - [x] Settle the image contract before step 4: full CDN URLs at the ceiling size, stepped down by `imageUrlForWidth` in core, shared with the web loaders (spec 0035, Images, settled 2026-11-19)
  - [x] API thickened (step 4): AC-5 to AC-10, plan in [prompts/mobile-api-v1.md](../../prompts/mobile-api-v1.md), built in four slices over two PRs (the firewall rule change itself is a deploy step, recorded in `docs/deploy.md`)
    - [x] 4a movies and images, 4b shows (first PR, branch `feat/mobile-api`)
    - [x] 4c games and profile (branch `feat/mobile-api-games-browse`, second PR)
    - [x] 4d browse and library: `/genres`, `/search`, `/lists`, `/me/library`, the per route cache test, the cross user check (`pnpm api:local`), the firewall note (branch `feat/mobile-api-games-browse`, second PR); next `/develop mobile app` starts at step 5
  - [x] App thickened (step 5): AC-10, AC-12, AC-13, AC-14, AC-16, built in five slices (agreed 2026-11-19)
    - [x] 5a shell, home, list screens and search, signed out browsing, read only show and game pages, plan in [prompts/mobile-app-shell-catalog.md](../../prompts/mobile-app-shell-catalog.md) (branch `feat/mobile-app-shell`; checked in the iOS Simulator)
    - [x] 5b title pages and tracking (full movie, show, season and episodes, game, Undo toasts), plan in [prompts/mobile-title-tracking.md](../../prompts/mobile-title-tracking.md) (branch `feat/mobile-title-tracking`; checked signed out and signed in in the iOS Simulator; the failure toast and VoiceOver checks are still owed)
    - [x] 5c library tabs (every page from core) and card badges, plan in [prompts/mobile-library-tabs.md](../../prompts/mobile-library-tabs.md) (branch `feat/mobile-library`, stacked on 5b; checked signed in and signed out in the iOS Simulator; card quick actions left for a follow up)
    - [x] 5d account, built in two slices (agreed 2026-11-21)
      - [x] 5d1 sign up, account screen, deletion on web and mobile with its migration (`delete_own_account()`), the self serve deletion text on `/privacy` and `/terms`, plan in [prompts/mobile-account-deletion.md](../../prompts/mobile-account-deletion.md) (branch `feat/mobile-account`; checked in the iOS Simulator and on the local web; the migration is on production (checked 2026-11-21); Expo joins `PROCESSORS` in step 6; change password on the phone left for a follow up)
      - [x] 5d2 offline cache and its wipe, the offline banner, Retry on an offline write, About and attribution, plan in [prompts/mobile-offline-about.md](../../prompts/mobile-offline-about.md) (branch `feat/mobile-offline-about`; About and the persisted cache checked in the iOS Simulator; the offline banner and Retry checked by Jest only, the airplane mode run is still owed)
    - [x] 5e deep links and in app password reset, plan in [prompts/mobile-deep-links.md](../../prompts/mobile-deep-links.md) (branch `feat/mobile-deep-links`; `bestats://` title links, the Home fallback and the full reset with email on checked in the iOS Simulator on the local stack; the two well known files are built by `pnpm app-links` and wait for the IDs in step 6)
    - [x] 5f card quick actions on library cards (the 5c follow up): the web's unplan, unmark, remove, Mark next watched and missing show Stop tracking, each with Undo, plan in [prompts/mobile-card-quick-actions.md](../../prompts/mobile-card-quick-actions.md) (branch `feat/mobile-card-actions`; Mark next, unplan, unmark and game removal with their Undo checked in the iOS Simulator on the local stack; Stop tracking, the offline Retry and VoiceOver checked by Jest only)
  - [x] 6a release prep with no store account: EAS Update (`expo-updates`, a channel per build profile, a `preview` profile, off in the personal variant), Expo in `PROCESSORS` with `/privacy`, `/terms` and `LEGAL_LAST_UPDATED` 2026-11-22, the store label answers in [docs/store-privacy-labels.md](../store-privacy-labels.md), the runbook in `docs/deploy.md` section 12, plan in [prompts/mobile-release-prep.md](../../prompts/mobile-release-prep.md) (branch `feat/mobile-release-prep`; nothing published or built on EAS)
- [x] Fix the verify findings (from `/check verify mobile app` on 2026-11-23), one `/debug` run each (branch `feat/mobile-verify-fixes`; Jest only, not checked in the simulator):
  - [x] Repeated titles on See all lists: the app joined its infinite scroll pages with a plain `flatMap`, so a title two grid pages share (TMDB's own repeats, and the filler spec 0022 AC-22 takes from the next page when a page comes back short) showed twice under one key. `joinPageResults` (`apps/mobile/src/lib/page-results.ts`) keeps the first copy, on list pages and Search, and Search's filtered count counts that same list. The web's numbered pages keep the repeat, as AC-22 accepts (kept as is on 2026-11-23).
  - [x] No timeout on app requests: `apiRequest` now aborts after `API_TIMEOUT_MS` (15 seconds, headers and body together) and fails as `network`, which shows the error with Retry; an unreachable API took about two minutes before (iOS's own timeout, twice with the query retry).
- [x] Fix the second verify findings (from `/check verify mobile app` on 2026-11-23, run 2: FAIL), one `/debug` run each:
  - [x] Silent sign out when the background refresh is refused (AC-11, AGENTS.md section 11), fixed on 2026-11-23 (checked in the iOS Simulator in verify run 3): supabase-js 2.116 removes the session and sends `SIGNED_OUT` when a refresh is refused after the access token expired, and the listener in `session.tsx` never set the notice. It now sets it for any `SIGNED_OUT` the app did not start itself (`signOutQuietly` marks a chosen sign out, the 401 path and account deletion). Finding: after the account was deleted on the web's `/account`, supabase-js's own refresh got `refresh_token_not_found` three times (auth log, 08:41:46 to 08:44:46 UTC) and signed the app out; Library flipped to "Sign in to see your library" and the Sign in screen showed no notice. The API never answered 401, so the second 401 path never ran. Likely cause: the `onAuthStateChange` listener in `apps/mobile/src/lib/session.tsx` clears the session and cache but never calls `setNotice`; only the 401 handler does. A password reset or a global sign out on the web probably ends the same way. Repro: sign in on the app and the web as the same local user, delete the account on the web, wait past `jwt_expiry` (600 seconds locally), open Library.
  - [x] Flaky web test, fixed on 2026-11-23: the test ran on the real clock, so when typing ended more than 400 ms (`FILTER_DEBOUNCE_MS`) before the platform toggle, the text pause fired on its own (`q=zelda`, then `q=zelda&platform=130`), two real changes. The component was right. Both AC-9 cases now run on fake timers with `fireEvent` (user-event's wrapper waits on a timer Testing Library only advances under Jest), passed 10 of 10 under CPU load, and still fail if the text pause always applies. Finding: `components/search/filter-bar.test.tsx` "makes one navigation when the text pause fires first (AC-9)" called `replace` twice during the full `pnpm test` run (dev server, Metro and Docker running), then passed 3 of 3 on its own. A timing test, not mobile code.
- [x] Verify it: `/check verify mobile app` (run 3 on 2026-11-23: PASS. In the iOS Simulator on the local stack: after the account was deleted on the web's `/account`, supabase-js's refresh was refused three times (09:10:16 to 09:12:16 UTC) and the app moved from Library to Sign in with "Your session expired, sign in again."; a chosen Sign out showed no notice. VoiceOver on every screen and the airplane mode banner passed, run by you on a real phone. The second 401 notice and Retry on an offline write are covered by Jest only, accepted by your call. Run 2 passed the rest: library pages match the web for the same user, a page past 24 titles loads page 2, a game moved from Playing to Finished, deletion by cascade, the 15 second timeout with Retry, See all paging with no duplicate key warning; `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test:db` (464) pass. Run it with `apps/mobile/.env.development.local` moved aside, since its LAN address overrides `localhost`.)
- [x] Test it: `/test mobile app`
  - [x] Stored session lost when it held an emoji, found by the test pass and fixed on 2026-11-23 (Jest only, not checked in the simulator): aes-js's `utf8.fromBytes` stops at 3 byte characters, so an emoji in a Google display name came back as broken JSON and the next launch read no session. `session-storage.ts` now decodes with its own `utf8FromBytes`, the exact inverse of aes-js's encoder, and a key that no longer matches its ciphertext reads as no session (`session-storage.test.ts`).
- [x] Review it (fresh model): `/check review mobile app`
- [x] Document it: `/document mobile app`
spec [0033](../specs/0033-mobile-app-expo/index.md) · code in `apps/mobile/`, `packages/core/`, `apps/web/app/api/v1/`, `apps/web/lib/tracking/commands/`, `apps/web/lib/supabase/bearer.ts`, `supabase/schemas/` (`delete_own_account`)

## Slice 15: Mobile look

### 29. Mobile look: the web's visual language, a native feel · in-progress
The app takes the web's visual language (warm still page background, frosted glass with gradient rims and sheen, Inter, lucide and the tracking icons, `GlassPill` badges, skeletons, glass state panels) while layout and interaction follow iOS and Android conventions. It is not a 1:1 copy of the web. Home keeps its layout and loses the parallax for good; the web is not changed. Decided with you in a design interview on 2026-11-23; every decision is in the plan.
**Done when:** every app screen reads as the web's brand beside the web at 375px (materials, colours, radii, type; not layout), the missing web features are in the app, and each slice below is merged with its screenshot check.
- [x] Design it (spec): the 2026-11-23 design interview, captured in [prompts/mobile-web-parity-foundation.md](../../prompts/mobile-web-parity-foundation.md) (decisions, requirements, acceptance criteria and the slice roadmap)
- [ ] Build it: `/develop mobile look` (one plan and PR per slice, each plan approved before it is built; next run starts at slice 6, Library)
  - [x] 1 Foundation: `/develop mobile look foundation`, plan in [prompts/mobile-web-parity-foundation.md](../../prompts/mobile-web-parity-foundation.md) (branch `feat/mobile-web-parity-foundation`, [PR #99](https://github.com/kris1027/BeStats/pull/99), merged 2026-11-23; runtime pass finished 2026-11-24 on a real iPhone and Android phone)
    - [x] oklch tokens as sRGB, and the glass gradients and shadow copied from `globals.css` by `pnpm tokens` (`TOKENS_SRGB`, `GLASS`)
    - [x] Native dependencies: `react-native-svg`, `lucide-react-native`, `expo-haptics`; Inter's five weights embedded by the `expo-font` plugin (`assets/fonts/`, OFL); `version` 1.1.0, so a new development build is needed
    - [x] Theme: page colours, the web's radius scale and Inter in `global.css` and `token-vars.ts`
    - [x] `GlassPlate` (blur on iOS only; opaque on Android, under Reduce Transparency and inside `PlateSolid`), the SVG `Rim`, the still `PageBackground` with the `pnpm grain` tile, drawn under every stack screen by `screenLayout`; screen roots no longer paint black
    - [x] Every text in Inter through `components/text.tsx`; `ui-boundary.test.ts` guards it and the `expo-blur` import
    - [x] Icons, `GlassPill` badges, skeletons and the glass `StatePanel` (the `wip/mobile-parity-components` commit folded into the foundation branch; the skeleton pulse is React Native `Animated`, with one app wide Reduce Motion listener)
    - [x] Restyle the existing components in place (`GlassButton` with `glass-selected`, `Notice`, `PosterCard` and the library card on a shared `PosterFrame` with rating pills and the image rim, toast, score and filters sheets, `ChevronRow`, `FormField`, the cyan `MediaSwitch` from `glass-selected-personal`, which `pnpm tokens` now resolves from its `color-mix`, card action button, rating line); every text glyph is now an icon. `FormField` keeps its height until slice 7
    - [x] Haptics through `src/lib/haptics.ts`, fired only from `useTrackingWrite` after the server answers (an Undo's restore is one of those writes, so `useUndoToast` needs none); none after a 401
    - [x] The contrast test over the background's brightest still pixel (requirement 5, `src/theme/glass-contrast.test.ts`); it caught the frosted score sheet over bright artwork, so its backdrop now dims the whole screen (`SHEET_DIM`)
    - [x] Checks and the runtime pass: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `npx expo-doctor` pass (2026-11-23). Simulator pass on 2026-11-23 (iPhone 18 Pro, new development build, local stack, beside the web at 375px) found and fixed: pill rims drawn as ellipses (`rimRadius`), rims drawn solid because react-native-svg drops the `/ alpha` of the generated stops (`svgStop`), the header brighter than the page under it (now `color-page-top` under the wash, `tokenColorOver`), the title header and episode rows still showing the rating as text (now `CommunityRatingBadge`, AC-4), and the media switch and `GlassButton` labels breaking at the largest text size (capped at `PILL_FONT_SCALE_CAP`). Blur tuned to `systemUltraThinMaterialDark` at 4 per px. Second simulator pass on 2026-11-23, after the code review fixes (local stack, signed in as a fresh local account): the glass Library page tabs, Go back on a warm deep link to a missing title, the personal score set and shown in cyan apart from the amber TMDB pill, and Reduce Transparency turned on and off while the app was open (plates go opaque with no restart, text stays readable). It found the movie, game and episode score buttons on the plain grey rim, now drawn with the score plate and cyan rim like the web's score pill. Not seen on screen: the tracking skeletons (the state loads too fast locally) and Go to Home (a development build cannot cold open a route link); Jest covers both. Real iPhone on 2026-11-24: the error buzz is felt, the light tap was not, so the confirmed write now takes a medium impact, felt on the iPhone the same day; haptics also checked by you on a real Android phone, all good (2026-11-24). Not recorded: manual step 10 (Android plates opaque, nothing blurs, Library scrolls smoothly), whether the Android check ran after the medium change, and an Undo's tap felt on a device
  - [x] 2 Title pages: `/develop mobile look title pages`: stretchy backdrop that collapses into the native header (no scroll parallax), actions in thumb reach, genre and status pills, vote counts, Facts, show cast, season and episode layout, swipe to toggle watched (button kept), "Clear rating" from core. Plan in [prompts/mobile-look-title-pages.md](../../prompts/mobile-look-title-pages.md) (approved 2026-11-23; branch `feat/mobile-look-title-pages`, [PR #100](https://github.com/kris1027/BeStats/pull/100); ticked before merge by your call). The age pill moved to slice 3 (your call, 2026-11-23)
    - [x] API: the v1 movie and show reads carry the Facts and crew fields, and the show read its cast (`null` when only the cast read fails); committed
    - [x] `CLEAR_RATING_LABEL` in core, read by the web's score picker and the app's score sheet; committed
    - [x] Mobile build: `TitleScroll` (stretchy backdrop, header fade), the new hero, `CrewLines` and `FactsPanel`, show cast, the season header and episode rows, `SwipeRow`, `TitleSkeleton`, `GestureHandlerRootView`; committed (2026-11-23)
    - [x] Tests and checks: screen test data carries the new v1 fields; new tests for `TitleScroll`, `TitleSkeleton`, the crew lines and Facts, the show cast and its failure line, and the swipe. `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` (core 922, web 3311, mobile 367), `pnpm build` and `npx expo-doctor` pass (2026-11-23)
    - [x] Simulator pass (manual steps in the plan): the header fade and stretch, Reduce Motion, the swipe's feel and haptic, thumb reach at 375 by 812; checked by you in the iOS Simulator on the local stack, all good (2026-11-23)
    - [x] VoiceOver reaches the swipe's action through the row's Watched button; the swipe itself stays hidden from screen readers, with no custom row action (your call, 2026-11-23)
  - [x] 3 Title extras: `/develop mobile look title extras`: trailer, Where to watch, More like this and the age rating pill (moved from slice 2), through new `/api/v1` reads, with one region rule for Where to watch and the age pill
    - [x] API: `GET /api/v1/movies/{id}/extras` and `/shows/{id}/extras` (`private, max-age=300`, the country from `x-vercel-ip-country` through `regionFromHeaders` in `lib/region.ts`, the web's rule) and `GET /api/v1/games/{id}/similar` (public); contracts in core's `api/v1/extras.ts`; the trailer key rule (`catalog/trailer.ts`) and the Where to watch copy (`catalog/where-to-watch.ts`) moved to core and the web reads them. Plan in [prompts/mobile-look-title-extras.md](../../prompts/mobile-look-title-extras.md) (approved 2026-11-24; branch `feat/mobile-look-title-extras`)
    - [x] App: `components/title-extras.tsx` (Trailer opening YouTube, Where to watch, More like this), the age pill in `DetailHeader`, each extras read its own query beside the title's; movie, show and game screens wired in the web's order
    - [x] Tests and checks: route tests (`app/api/v1/extras.test.ts`), core schema and copy tests, `__tests__/title-extras.test.tsx`; `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` (core 932, web 3321, mobile 376), `pnpm build` and `npx expo-doctor` pass, and the three routes answered against live TMDB and IGDB on `pnpm dev` (2026-11-24)
    - [x] Simulator pass (manual steps in the plan): checked by you in the iOS Simulator (iPhone 17e, 390 by 844) on the local stack, all good (2026-11-24)
  - [x] 4 Catalog card actions: `/develop mobile look card actions`: a long press `Link.Menu` with `Link.Preview` on every catalog card (See all, Search, Home rows, More like this), the web's actions per type with Undo, and the user's own marks on the card; kept as its own slice (your call, 2026-11-24; 3 columns on phones was already in place). Plan in [prompts/mobile-look-card-actions.md](../../prompts/mobile-look-card-actions.md) (approved 2026-11-24; branch `feat/mobile-look-card-actions`)
    - [x] Core: `CATALOG_CARD_ACTION_LABELS`, read by the web's card buttons (no visible change) and the app's menu
    - [x] App: the title screens' writes and Undo moved to `lib/title-writes.ts` and shared with the cards; `lib/card-states.ts` (one `/me/titles` read per loaded page of cards, seeded into each title's key); `lib/catalog-card-actions.ts` (menus and marks from core's rules); `PosterCard` with the marks, the iOS menu and preview, the Android alert and screen reader actions; the title header sets no options inside a preview
    - [x] Tests and checks: `catalog-card-actions.test.ts`, `__tests__/poster-card-actions.test.tsx`, the core label test; `pnpm typecheck`, `pnpm lint`, `pnpm test` (core 939, web 3325, mobile 394), `pnpm build` and `npx expo-doctor` pass (2026-11-24)
    - [x] Simulator pass (manual steps in the plan): signed out checked in the iOS Simulator on the local stack (a long press shows the title's preview, now on the header's page colour, and a tap opens the title; 2026-11-24). The signed in pass, after the code review fixes (marks from core's card status, one state read per page), checked by you, all good (2026-11-24)
  - [x] 5 Search: `/develop mobile look search`: large title header, the new cards, the games Platforms filter. Plan in [prompts/mobile-look-search.md](../../prompts/mobile-look-search.md) (approved 2026-11-24; branch `feat/mobile-look-search`; the native header search bar was your call)
    - [x] API: `GET /api/v1/platforms` (public, a day's CDN cache, IGDB's list through `getGamePlatforms`), `v1PlatformsSchema` in core
    - [x] App: the iOS large title with the native search bar (translucent header, Search bare over the tab stack's background), the Platforms view in the filters sheet (`platform-picker.tsx`), platforms in the filter count and both Clear filters; long card titles kept inside their column
    - [x] Tests and checks: `platform-picker.test.tsx`, `filters-sheet.test.tsx`, `search-header.test.tsx` (AC-2), the games platform flow in `catalog-screens.test.tsx`, core's `search/picker.test.ts`, the route and schema tests; `pnpm typecheck`, `pnpm lint`, `pnpm test` (core 946, web 3327, mobile 418), `pnpm build` and `npx expo-doctor` pass (2026-11-24)
    - [x] Simulator pass (iPhone 18 Pro, local stack, signed out, 2026-11-24): the title collapses and returns, typing searches, Games with Nintendo Switch ticked gives 8 "zelda" games and `Filters (1)`, Back keeps the query. Largest text size checked after the review fixes (the sheet title now leaves Done on screen). Not checked: VoiceOver on the picker and Android (left open by your call, 2026-11-24), the signed in card menu on Search
  - [ ] 6 Library: `/develop mobile look library`: the new cards, the visible quick action kept
  - [ ] 7 Account, auth and About: `/develop mobile look account`: the auth panel content in the existing modals, Change password (brings back the deferred item), the Delete account screen restyled, the icon key and credit on About
- [ ] Verify it: `/check verify mobile look`
- [ ] Test it: `/test mobile look`
- [ ] Review it (fresh model): `/check review mobile look`
- [ ] Document it: `/document mobile look`
spec: none (decisions in [prompts/mobile-web-parity-foundation.md](../../prompts/mobile-web-parity-foundation.md)) · code in `apps/mobile/src/components/glass/`, `apps/mobile/src/components/page-background.tsx`, `apps/mobile/src/components/text.tsx`, `apps/mobile/src/theme/`, `packages/core/scripts/tokens.ts`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Public profiles and social features**: ruled out of the MVP by `AGENTS.md`
- **Per visitor region and timezone on the home rows** (from spec 0021): Now playing, Upcoming, Airing today and On the air use the fixed `PL` region and `Europe/Warsaw`. Following the visitor needs its own decision (a request header or an account setting).
- **More title page sections** (from the 2026-10-12 grilling): external links (IMDb, homepage, socials) and the movie collection row are a later batch; keywords, image gallery, TMDB reviews and the aggregate show cast were skipped
- **Error monitoring and product analytics**: not selected for this pass
- **Self serve account deletion and data export** (from specs 0005 and 0017): GDPR requests are handled by email for now. Undesigned; a `/account` flow needs the Supabase admin API or a security definer function, an elevated call nothing else in the app uses, so it deserves its own decision, including what happens to the cascading tracking data. _2026-11-18: deletion is now designed in spec 0036 (`delete_own_account()`) and ships with feature 28; data export stays deferred._
- **Push notifications** (from spec 0033): a new episode aired for a tracked show. Needs a device token table, a scheduled air date check and Expo Push as a new processor, so it gets its own spec after the mobile app ships
- **Mobile store release** (feature 28, step 6b; deferred 2026-11-22 by your call): AC-15 and AC-17: TestFlight and Play internal testing once the Apple and Google developer accounts exist, the EAS env values, the privacy labels typed in, `pnpm app-links` with the Apple Team ID and Android signing fingerprint, the firewall allowing `/.well-known/` and `/reset-password/app` (`docs/deploy.md` section 5), and an https link opening a signed build (AC-16) with the AC-16 and AC-17 checks. The runbook is `docs/deploy.md` section 12; 6a (release prep) shipped.
- **Change password on the phone** (feature 28, from 5d1; deferred 2026-11-22 by your call): the web's change password flow in the app's Account screen. _2026-11-23: pulled into feature 29, slice 7._
- **Sign in with Apple** (from spec 0033): required on iOS once Google sign in ships there, so it comes with the Google item below
- **Rate limit on sign in and sign up** (from spec 0018): Supabase counts Vercel's addresses, so its auth limit is shared by every visitor ([docs/deploy.md](../deploy.md) section 6). If it bites, add a second Vercel Firewall rule on sign in and sign up posts per IP. (The `/api/search` limit from spec 0010 shipped as a firewall rule in feature 20.)
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
