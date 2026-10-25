# 0027. Games tab and library pages: Want to play, Playing and Finished on the three library routes

**Date**: 2026-10-24
**Status**: Accepted

Scope feature: [G5. Games tab and library pages](../../scope/games.md) · GA tier

Builds on: [0020](../0020-progress-based-library-pages/index.md) (the library pages, `LibrarySection`, the panels and the page rules), [0024](../0024-game-data-model-security/index.md) (`user_game_state`, its dates and its RLS), [0025](../0025-game-page/index.md) (the game page and its soft 404 for a hidden game) and [0026](../0026-game-status-rating/index.md) (`removeGame`, `restoreRemovedGame`, `useGameUndo`, `isGameReleased`). Settled in an `/architect` session on 2026-10-24.

## Summary

This adds a GAMES tab to `/watchlist`, `/upcoming` and `/watched`. On it, those pages list your Want to play, Playing and Finished games, each with a cover, a rating badge, a date line and a remove button with Undo. A game's status is stored, not worked out, so each tab is one plain Postgres page (24 rows with an exact count) plus one IGDB read for just those 24 games. Until a games browse page or game search exists, nothing in production leads to a game, so a new on/off value (`NEXT_PUBLIC_GAMES_LIBRARY`) keeps the tab off in production and on locally and in previews. No database change.

## Requirements

**User stories**:
- As a signed in user, I want to see the games I want to play, am playing and have finished, each on its own page, so that my games list lives next to my shows and movies.
- As a signed in user, I want each card to show my score or the community rating and when I started or finished, so that the list tells me something at a glance.
- As a signed in user, I want to remove a game from its card with Undo, so that cleaning up the list is quick and a slip costs nothing.
- As the operator, I want the games tab hidden in production until people have a way to find games, so that production never shows half a feature.

**Acceptance criteria**:
- **AC-1**: `NEXT_PUBLIC_GAMES_LIBRARY` holds `on` or `off`. Unset or empty means `off`. It is read only in `lib/env.ts`, which writes `process.env.NEXT_PUBLIC_GAMES_LIBRARY` literally so the value is inlined into the client bundle, in two functions written the way `getAuthEmailDelivery()` is (separate from `getPublicEnv()`, so a build with no Supabase values still works). `getGamesLibrary()` throws on any other value, with an error that names the variable and never its value; only `LibrarySection` calls it. `gamesLibraryEnabled()` returns a boolean and treats an invalid value as off without throwing; the navbar's client components call it at render (no prop drilling), so a bad value never takes down a page outside the library, the same split as `publicEnvProblems()` and `getPublicEnv()`. Tests set it with `vi.stubEnv`. `.env.example` lists it with a description. It is `on` in `.env.local` and in Vercel Preview, and unset in Vercel Production; `docs/deploy.md` records both. Because it is a `NEXT_PUBLIC_` value, a change takes a redeploy.
- **AC-2**: `lib/catalog/media-type.ts` adds `LibraryType = MediaType | "game"` and `parseLibraryTypeParam(value, gamesEnabled)`. With the flag on, this parser accepts `tv`, `movie` and `game`; with it off, only `tv` and `movie`. Absent still means `tv`, and an empty, repeated or unknown value is null, as in `parseMediaTypeParam`. `MediaType` stays `"tv" | "movie"`, so `/search`, `/shows`, `/movies`, the title pages, the proxy and `CATALOG_PATHS` can never receive `game`. A new `LibraryPath = "/watchlist" | "/upcoming" | "/watched"` (a subtype of `TypedPath`) carries the rule: `typedHref` accepts `game` only with a `LibraryPath`. A `game` for `/search` is a type error, proven by a `@ts-expect-error` line in its test. `pageHref`, `NoSuchPage`, `ListFailed`, `EmptyPanel` and `LibraryNavView` take `LibraryType`. `LIBRARY_NOTES` and `TabNotes` stay `MediaType` only, because only the classified show and movie tabs use them.
- **AC-3**: With the flag on, the navbar's media tabs (in the bar at every width; the mobile menu sheet holds no tabs) read SHOWS | MOVIES | GAMES on `/watchlist`, `/upcoming` and `/watched` only. GAMES links to the same page with `?type=game` and is lit (`aria-current="page"`) when the page's `type` is `game`. `MediaTypeTabs`' own fallback on those paths (before `?type` is known) renders the same three tabs with none lit, at the same footprint. The outer `Navbar` fallback, used only on dynamic routes, stays two tabs, since no library path is dynamic. On every other page the tabs stay SHOWS | MOVIES, and with the flag off GAMES never renders. `MediaTypeTabsView` takes its tab list and `hrefs` keyed by `LibraryType`. Every tab stays 40px tall with its 44px `hit-area-tab` target.
- **AC-4**: `PageMediaType` (`components/layout/page-media-type.tsx`) keeps `type: MediaType | null` for `NavbarSearch` and `BrandLink`, and gains `libraryType: LibraryType | null` (from `libraryTypeForLocation`) for `MediaTypeTabs` and `LibraryNav`. On a games tab `type` is null for search and the logo, and `libraryType` is `game`. The Library links (Watchlist, Upcoming, Watched), in the bar and in the mobile sheet, carry `type=game`, so moving between the three pages keeps you on games. The page heading stays Watchlist, Upcoming or Watched (it stays in the prerendered shell). The navbar search does not render (neither the desktop field nor the mobile search icon in the bar), because there is no game search until G7. Its Suspense fallback cannot know `?type`, so on a games tab the search field placeholder shows once, then goes away when the type resolves; this one time flash is accepted. The logo renders as on a page with no type: the catalog last viewed (`/shows` or `/movies`), and `game` is never written to its `localStorage` key.
- **AC-5**: `LibrarySection` parses `type` with `parseLibraryTypeParam(raw.type, getGamesLibrary() === "on")`. A null type, which includes `?type=game` with the flag off, shows the existing "That page doesn't exist" panel with its Back link to the shows tab. A malformed `page` shows the page number panel and keeps `type=game` in its Back to page 1 link. Both happen before any read, after `requireUser()`. An invalid flag value makes `getGamesLibrary()` throw here, so a misconfigured deploy shows the library error boundary instead of guessing.
- **AC-6**: Each games tab reads one page through `getGameLibraryPage({ userId, tab, page })` in `lib/tracking/game-library.ts`. It runs one query on `user_game_state` with `user_id = userId` (explicit, as well as RLS), `status` set by the tab (`watchlist` gives `want_to_play`, `upcoming` gives `playing`, `watched` gives `finished`), an exact count, and `range` over `LIBRARY_PAGE_SIZE` (24). Want to play is ordered by `added_at` desc, Playing by `started_at` desc, Finished by `finished_at` desc, each then by `game_id` asc. A page past the end redirects to the last page (page 1 when the tab is empty). PostgREST's `PGRST103` (an offset past the end) is answered with a count only read, as `getWatchedMoviesPage` does. The read never runs inside `use cache`.
- **AC-7**: The page's games come from one `getGamesByIds` call with only that page's ids (at most 24). There is no 500 game limit and no "checked" or "failed titles" note on a games tab. `getLibraryGames` turns IGDB's `found` array into a `Map` by id and passes `missingIds` through. Only an `IgdbError` (a systemic failure) becomes `failed`; an `IgdbValidationError` cannot happen with database ids and still throws as a bug. A failure replaces the grid with a "Couldn't reach IGDB" error panel (`IGDB didn't respond, so the games couldn't load. Try again in a moment.`) with Retry to the same URL, never the empty state. `TmdbFailed`'s inner `LoadFailed` becomes the shared panel, with a `CatalogFailed({ source: "TMDB" | "IGDB", href })` over it. A failed Postgres read shows the existing `ListFailed` panel for that list. Each failure is logged once with `logTrackingEvent(TRACKING_EVENT.listRead, …)`, outcome class only.
- **AC-8**: A Want to play card shows the cover, the name linking to `/games/{id}`, and the amber `IgdbRatingBadge` (the community rating, labelled as such). When `isGameReleased(releaseDate, today)` is false, with `today` from `requestTodayUtc()` read once per request, the card also carries `ReleasePill` with `formatReleaseDate(releaseDate, today)`: the short date, or Date TBA when IGDB has none.
- **AC-9**: A Playing or Finished card's badge is the cyan `PersonalScoreBadge` when the game has a score, else the amber `IgdbRatingBadge`. Its `meta` line reads `Started {Mon YYYY}` from `started_at` on Playing and `Finished {Mon YYYY}` from `finished_at` on Finished. The month is the UTC calendar month, formatted on the server by a new `formatMonthYear(iso)` in `lib/format.ts` (`en`, short month, numeric year, `timeZone: "UTC"`), for example `Finished Oct 2026`. A null date (impossible by the table checks, but nullable in the type) shows no line. The card picks its badge and line from its `list` prop. A score on a Want to play row cannot exist (spec 0024, AC-2) and is ignored.
- **AC-10**: A game IGDB returns with `hidden: true` renders as a normal card for its tab (cover, name, badge, date line, remove button), but its name is plain text, not a link, because its game page answers a soft 404 (spec 0025, AC-7).
- **AC-11**: A game id in IGDB's `missingIds` renders as a "No longer on IGDB" card at its normal place in the tab's order: the missing poster tile, that caption, no link, no badge, no date line, and its remove button. Nothing about the game is invented.
- **AC-12**: Every card, missing ones included, has one round remove button, labelled `Remove {name} from your games` (`Remove missing game from your games` on a missing card). A tap hides the card at once through `useOptimistic`, then calls `removeGame(gameId)`. On success with an `undo`, the toast `Removed from your games.` shows with Undo for `UNDO_TOAST_MS`. `removeGame` itself calls `refresh()` on success, so the hidden card is simply absent from the next `items`. The grid follows the movie grid's `useOptimistic`, transition and settle order exactly, so the card never flashes back. Undo calls `restoreRemovedGame` with the returned payload, and its `refresh()` brings the card back in its old place, since its dates come back too. The toast is shown by a plain `showGameUndo({ gameId, undo, returnPath, navigate, restoring })` factored out of `useGameUndo` (which stays as a thin wrapper for the game page). Its toast id stays `game-undo-{id}`, so a status Undo and a removal Undo for the same game replace each other. Undo still works after you leave the grid, as on the movie grid, because the toast holds only the action and `navigate`. A removal that finds no row (another tab got there first) is a quiet success with no toast. On failure the card reappears in place and the toast comes from `showGameTrackingError`. A `session_expired` toast carries Sign in back to this page's URL, `type` and `page` included. Each removal is its own transition and toast, so several in a row never interfere.
- **AC-13**: Removing a card moves focus first to the next card's title link, then to the previous one's, then to the heading. A card with no link (a hidden or missing game) takes focus on its remove button. Emptying a page past page 1 redirects, and the heading takes focus again after the remount. This uses the same rules and helpers as the movie grid (`card-focus.ts`, `focusLibraryHeading`).
- **AC-14**: Each empty games tab shows text only, with no button (there is no games browse page until G6). Want to play says `No games to play yet` / `Games you mark Want to play show up here.`; Playing says `Nothing in progress` / `Games you mark Playing show up here.`; Finished says `No finished games yet` / `Games you mark Finished show up here.` The grid labels are `Games you want to play, page {n}`, `Games you're playing, page {n}` and `Games you finished, page {n}`. All of this copy lives in `LIBRARY_COPY` in `lib/tracking/messages.ts`.
- **AC-15**: Nothing on these pages writes when it loads (spec 0020, AC-21). The rows are read per request under the user's session and never enter a shared cache. The IGDB batch is the existing `hours` cached public read, keyed on the ids alone. `/watchlist`, `/upcoming` and `/watched` stay private, through both the proxy redirect and `requireUser()`. A signed out visitor never receives game data.
- **AC-16**: At 375px and 1280px the games grid uses the `catalog` `PosterGrid` preset (2, 3, 4, 6 columns), the existing `LibrarySkeleton` is the loading state, nothing scrolls sideways, every control keeps a 44px tap target with visible focus, and keyboard alone can open a game, remove one and use Undo from the toast.
- **AC-17**: `/showcase` renders the game library card in every state: Want to play released, Want to play with a dated release pill, Want to play with Date TBA, Playing with and without a score, Finished with a score, hidden (no link) and missing.
- **AC-18**: No migration and no `database.types.ts` change. `user_game_state` keeps only its primary key (spec 0024, AC-12). `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass, and `pnpm test:db` passes unchanged.

## Decision

**Chosen option**: Option 1: a library only `LibraryType`, a stored status read as one SQL page plus one IGDB batch, behind a production off flag.

The three library routes accept `?type=game` (behind `NEXT_PUBLIC_GAMES_LIBRARY`) through a separate `LibraryType`. Each games tab is one ordered, counted Postgres page plus one IGDB read for that page, rendered by a new games grid that reuses the movie grid's removal, focus and panel patterns.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) for the read under RLS · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking the tabs and pages in the running app.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no change. The read uses `user_game_state` (spec 0024) as it is:

| Column | Type | Used for |
|---|---|---|
| `user_id` | uuid, not null, FK `auth.users`, PK part | the owner filter |
| `game_id` | integer, not null, PK part | the IGDB id, the card's key, the tie break |
| `status` | `game_status`, not null | which tab |
| `rating` | smallint, null | the personal score badge |
| `added_at` | timestamptz, not null | Want to play order |
| `started_at` | timestamptz, null (not null on Playing) | Playing order, the Started line |
| `finished_at` | timestamptz, null (not null on Finished) | Finished order, the Finished line |

No index beyond the primary key (spec 0024, AC-12). One user's games fit a primary key prefix scan and a sort in memory.

**State transitions**: none new. The only write here is the removal (row deleted) and its Undo (row restored), both spec 0026's.

**Tab mapping** (one place, `GAME_LIBRARY_TABS` in `lib/tracking/game-library.ts`):

| Route | `?type=game` tab | `status` | Order | Date line |
|---|---|---|---|---|
| `/watchlist` | Want to play | `want_to_play` | `added_at` desc, `game_id` asc | release pill when unreleased |
| `/upcoming` | Playing | `playing` | `started_at` desc, `game_id` asc | `Started {Mon YYYY}` |
| `/watched` | Finished | `finished` | `finished_at` desc, `game_id` asc | `Finished {Mon YYYY}` |

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getGamesLibrary()` (`lib/env.ts`) | pure read of the env, `LibrarySection` only | `NEXT_PUBLIC_GAMES_LIBRARY` | `"on" \| "off"` | none | throws on an invalid value, naming the variable |
| `gamesLibraryEnabled()` (`lib/env.ts`) | pure read of the env, navbar | `NEXT_PUBLIC_GAMES_LIBRARY` | `boolean` (invalid is false) | none | never throws |
| `parseLibraryTypeParam(value, gamesEnabled)` (`lib/catalog/media-type.ts`) | pure | `string \| string[] \| null \| undefined`, `boolean` | `LibraryType \| null` | none | null for an invalid value |
| `typedHref(path, type, options)` | pure, overloads | `"/search"` takes `MediaType`; the library paths take `LibraryType` | URL with `type` always written | none | compile error for `game` on `/search` |
| `libraryTypeForLocation(pathname, typeParam, gamesEnabled)` | pure | as `mediaTypeForLocation` | `LibraryType \| null` (`game` only on the library paths) | none | none |
| `getGameLibraryPage({ userId, tab, page })` (`lib/tracking/game-library.ts`, `server-only`) | Supabase read | verified `userId`, `LibraryList`, parsed page | `{ kind: "ok", rows: GameLibraryRow[], total }` or `{ kind: "failed" }` | the request's session client under RLS | `failed` on any Postgres or network error |
| `getLibraryGames(ids)` (same file) | IGDB read | at most 24 ids | `{ kind: "ok", games: Map<number, GameSummary>, missingIds }` or `{ kind: "failed" }` | none (public catalog) | `failed` on an `IgdbError`; any other error throws |
| `gameLibraryTab({ tab, userId, page, today })` (`components/library/game-library-tab.tsx`) | Server Component | the above | grid, empty panel, or a failure panel; redirect past the end | `requireUser()` already ran in `LibrarySection` | the panels of AC-7 |
| `GameLibraryGrid` (`components/library/game-library-grid.tsx`, client) | client grid | `items: LibraryGameItem[]`, `list`, `page`, `returnPath`, `label` | the cards, removal, Undo toast | calls `removeGame` / `restoreRemovedGame` (spec 0026, session checked there) | the spec 0026 error toasts |
| `GameLibraryCard` (`components/library/game-library-card.tsx`) | card on `PosterCard` | `LibraryGameItem`, `list`, `onRemove` | the card states of AC-8 to AC-11 | none | none |

`GameLibraryRow` is `{ gameId, rating, addedAt, startedAt, finishedAt }`. `LibraryGameItem` (plain data, in `components/library/types.ts`) is `{ gameId, name: string | null, coverUrl, communityRating, rating, hidden, release: { state: "released" } | { state: "unreleased"; date: ReleaseDate }, dateLine: string | null }`, where `name: null` means missing and an unreleased `date: null` is Date TBA. `gameHref(id)` lives in `lib/catalog/media-type.ts` beside `titleHref`. `showGameUndo` lives in `components/tracking/use-game-undo.ts`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| media tabs | whether GAMES shows | `gamesLibraryEnabled()` and the pathname being a `LibraryPath` |
| media tabs, Library links | which tab is lit, which type the links carry | the `type` search param, through `libraryTypeForLocation` into `PageMediaType.libraryType` |
| navbar search, logo | whether search shows, where the logo goes | `PageMediaType.type`, null on a games tab |
| `LibrarySection` | the user | `requireUser()`, never a client value |
| `getGameLibraryPage` | the status to filter on | the route's `list`, through `GAME_LIBRARY_TABS` |
| `getGameLibraryPage` | the order column | `GAME_LIBRARY_TABS` (`added_at`, `started_at`, `finished_at`) |
| `getGameLibraryPage` | the total and last page | PostgREST's exact count, `libraryLastPage(total)` |
| card | name, cover, community rating, hidden | `getGamesByIds` → `GameSummary.name`, `coverUrl`, `communityRating`, `hidden` |
| card | missing | the id is in `BatchResult.missingIds` |
| card | personal score | `user_game_state.rating` |
| Want to play card | released or not | `isGameReleased(GameSummary.releaseDate, today)`, `today` = `requestTodayUtc()` once per request |
| Want to play card | the pill text | `formatReleaseDate(GameSummary.releaseDate, today)` |
| Playing / Finished card | the month in the date line | `started_at` / `finished_at`, UTC month through `formatMonthYear` |
| card | the link | `/games/{gameId}`, through a new `gameHref(id)` beside `titleHref`, omitted when hidden or missing |
| removal | the Undo payload | `removeGame`'s `undo` (`{ kind: "removed", previous, removedAt }`, spec 0026) |
| session expired toast | where Sign in returns | `pageHref(list, "game", page)` |
| failure panels | the Retry URL | `pageHref(list, "game", page)` |

**Key invariants**:
- A game is on exactly one games tab: its stored `status`. Nothing is derived or classified.
- `game` reaches only the three library routes. `MediaType` never contains it (enforced by the compiler).
- With the flag off, `?type=game` is a "doesn't exist" panel and GAMES renders nowhere.
- Every order ends in `game_id`, so two games with the same timestamp never swap places between pages.
- The page reads at most 24 rows and makes at most one IGDB request.
- No page writes on load. No user row enters `use cache`.

**Security model**: The pages are private. The proxy sends a signed out visitor to sign in, and `LibrarySection` calls `requireUser()` before parsing anything, the real check. The read runs under the user's JWT, so RLS on `user_game_state` (spec 0024, AC-9, AC-10) limits it to the owner, and the query also filters on `user_id` from the verified session. Removal and Undo are spec 0026's Server Actions, which check the session and use `auth.uid()` in SQL. IGDB receives only game ids, never user data (AGENTS.md, Games). The flag is public by design: it decides only whether a control renders, never who may read what.

**Configuration required**:
- `NEXT_PUBLIC_GAMES_LIBRARY`: `on` shows the GAMES tab and accepts `?type=game` on the library pages. Unset or `off` hides both. Set `on` in `.env.local` and Vercel Preview, leave it unset in Vercel Production until G6 or G7 gives people a way to find games.

**Critical test scenarios**:
- Happy path: a signed in user with games in all three statuses opens `/watchlist?type=game`, `/upcoming?type=game` and `/watched?type=game` and sees each game once, in its tab's order, with the right badge and date line, verifies **AC-3**, **AC-6**, **AC-8**, **AC-9**.
- Paging: 30 Finished games give 24 on page 1 and 6 on page 2, and `?page=5` redirects to page 2, verifies **AC-6**.
- Removal: remove a Playing game, Undo brings it back in the same place with its score and dates, and a second tab's removal is a quiet success, verifies **AC-12**, **AC-13**.
- Failure case: an `IgdbError` shows "Couldn't reach IGDB" with Retry, never the empty state; a Postgres failure shows `ListFailed`, verifies **AC-7**.
- Hidden and missing: a hidden game has no link, a missing id shows "No longer on IGDB" in place, and both can be removed, verifies **AC-10**, **AC-11**.
- Flag off: no GAMES tab anywhere, and `?type=game` shows "That page doesn't exist", verifies **AC-1**, **AC-3**, **AC-5**.
- Type boundary: `parseMediaTypeParam("game")` stays null, `/search?type=game` shows its existing invalid type panel, and `typedHref("/search", "game")` fails to compile, verifies **AC-2**.
- Auth/permission: a signed out request to `/upcoming?type=game` is sent to sign in and renders no game data; user A never sees user B's games (the existing pgTAP isolation tests), verifies **AC-15**.

## Build plan

Tracer Bullet: first one thin real thread from the flag through the tab, the read and IGDB to a card on screen, then thicken one strand at a time, each end to end.

1. **Thin thread.** Add `getGamesLibrary()`, `gamesLibraryEnabled()` and `.env.example`, `LibraryType`, `LibraryPath`, `parseLibraryTypeParam` and the `typedHref` overloads. Make `LibrarySection` route `game` to a first `gameLibraryTab` that reads one Want to play page with `getGameLibraryPage`, calls `getLibraryGames`, and renders plain `PosterCard`s (cover, name, link). Prove it at `/watchlist?type=game` with a real game, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-6**.
2. **The tab in the navbar.** Add `libraryTypeForLocation` and `PageMediaType.libraryType`, the three tab `MediaTypeTabs` on library paths (and its own fallback), `LibraryNav` carrying `game` in the bar and the sheet, `NavbarSearch` and `BrandLink` reading `type` (null on games). Update `navbar.test.tsx` and the tab tests, satisfies **AC-3**, **AC-4**.
3. **All three tabs.** Add `GAME_LIBRARY_TABS` with the three orders, paging past the end, the `PGRST103` count read and the `game_id` tie break, with tests on the reader, satisfies **AC-6**.
4. **Cards.** Build `GameLibraryCard` with the per tab badges, `ReleasePill` on unreleased Want to play, `formatMonthYear` and the Started / Finished lines, `gameHref`, the hidden (no link) and missing states, and the `LibraryGameItem` mapping, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**.
5. **Removal and Undo.** Build `GameLibraryGrid` with `useOptimistic`, `removeGame`, the Undo toast through spec 0026's toast (factor the toast out of `useGameUndo` into a plain function both callers share, since a grid holds many games), the error toasts and the focus rules, satisfies **AC-12**, **AC-13**.
6. **States and copy.** Add the game entries to `LIBRARY_COPY` (with `browse` optional and the text only empty panel), the "Couldn't reach IGDB" panel (`CatalogFailed` over the shared `LoadFailed`), and the logging, satisfies **AC-7**, **AC-14**.
7. **Showcase, sizes and checks.** Add the `/showcase` card states, check 375px and 1280px and keyboard use in the running app (`next-dev-loop`), confirm no write on load, set the Vercel Preview variable and the `docs/deploy.md` line, then run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db` and `pnpm build`, satisfies **AC-15**, **AC-16**, **AC-17**, **AC-18**, **AC-1**.

## Consequences

**Positive**:
- The games library works end to end in local and preview builds, with one SQL query and at most one IGDB request per page.
- `MediaType` stays narrow, so G6 and G7 each widen the type on purpose, with the compiler listing every place that must handle `game`.
- Production shows nothing half built; turning it on is one variable and a redeploy.

**Negative / tradeoffs**:
- Two media type unions (`MediaType` and `LibraryType`) and two parsers now live side by side until G6 or G7 merges them.
- With the flag off in production, saved games stay invisible there, as they already are since spec 0026.
- The navbar search disappears on a games tab, which may surprise you until G7 ships.
- Headings read Watchlist, Upcoming and Watched over game lists titled Want to play, Playing and Finished. The words differ, though the grid labels and empty states say the games words.
- A UTC month can be a month off near midnight for someone far from UTC.
- On a games tab the navbar search placeholder flashes once while `?type` resolves.
- IGDB data on a card (name, cover, hidden) comes from the `hours` cached batch, so a change at IGDB can take a few hours to show.
- The flag is inlined at build time: a browser still running an older bundle can show GAMES while the server answers "doesn't exist" until it reloads.
- A second client grid (games) sits beside the movie grid and shares only its helpers, so a removal fix may need making in both.

**Neutral**:
- No migration, so no `supabase db push` for this feature.
- A new Vercel environment variable in Preview, recorded in `docs/deploy.md`.
- `LIBRARY_COPY` becomes keyed by `LibraryType`, and its `browse` becomes optional.

## Follow-up

- [ ] Before G6 or G7 turns the flag on in production, decide whether the flag then goes away. A short note in that spec is enough.
- [ ] G6: add `/games` to `CATALOG_PATHS`, show GAMES on every page, give the games empty states a Browse games button, and let the logo remember `game`.
- [ ] G7: let the navbar search run on the games tab, and widen `/search`'s parser.
- [ ] G8: replace `GameLibraryCard`'s remove button with the full status chip control, keeping the same item shape.
- [ ] `/sync` after merge: repo fact lines in `AGENTS.md` for `NEXT_PUBLIC_GAMES_LIBRARY` and `getGamesLibrary()`, `LibraryType` versus `MediaType`, and the games tabs' read shape (SQL page plus one IGDB batch, no 500 limit); a `components/AGENTS.md` line for the new library files.
