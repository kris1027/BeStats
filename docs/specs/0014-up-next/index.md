# 0014. Up Next: the Upcoming page with your next episodes and planned movies coming soon

**Date**: 2026-09-28
**Status**: Accepted

Scope feature: [15. Up Next](../../scope/scope.md) · Beta tier

## Summary

This decides what the Upcoming link in the navbar opens. `/upcoming` becomes one private page with two sections. "Up Next" lists every show you are Watching, most recently watched first, each showing the next aired episode to watch with a button that marks it watched. "Coming soon" is the page the artboard draws: your planned movies that TMDB says are not released yet, soonest first. Nothing new is stored. One new database view orders the shows, the next episode comes from the existing progress rule, and release dates come from the cached TMDB reads the watchlist already uses.

## Requirements

**User stories**:
- As a signed in user, I want one place that shows the next episode of every show I am watching, so that I can pick up where I left off without opening each show.
- As a signed in user, I want to mark that episode watched right there, and undo a mis tap, so that keeping up takes one tap.
- As a signed in user, I want to know when I am caught up on a show and, when TMDB knows it, when the next episode airs, so that I know when to come back.
- As a signed in user, I want to see the planned movies that are not out yet, soonest first, so that I know what is coming.
- As a signed in user, I want paused, dropped, planned and finished shows kept out of Up Next, so that the queue only holds what I am actively watching.

**Acceptance criteria**:

*Page and navigation*

- **AC-1**: Signed in, the navbar's library links read Watchlist, Upcoming, Watched, in that order, in the desktop bar and in the mobile menu sheet (`design/desktop-navbar-signed-in.svg`, `design/mobile-menu-open.svg`). The Upcoming link goes to `/upcoming` and carries `aria-current="page"` there. `/upcoming` stays in `PRIVATE_PATH_PREFIXES`, so a visitor is redirected to sign in by the proxy, and the page's data section also calls `requireUser()` itself.
- **AC-2**: `/upcoming` renders the h1 "Upcoming" (the artboard's page title, through `LibraryHeading`), then an h2 "Up Next" section, then an h2 "Coming soon" section. The heading is the static shell; everything that reads the session streams behind one Suspense boundary with a skeleton of both sections. The page has `robots: { index: false }` and the title "Upcoming", and does not gain `instant = false`.

*Up Next*

- **AC-3**: Up Next lists every show whose `user_show_state.status` is `watching`, and no show with any other status (Want to Watch, On Hold, Dropped, Completed never appear). Shows are ordered by `last_activity_at` descending, then `show_id` ascending, where `last_activity_at` is the later of the most recent `watched_at` of the user's regular season (`season_number >= 1`) episodes of that show and the row's `status_changed_at`. All Watching shows are shown on one page, with no pagination.
- **AC-4**: `lib/tv/up-next.ts` holds the pure rule `upNextState(episodes, watchedEpisodeIds, today)`, built on `showProgress` (spec 0013, AC-9) and `airStatus` (spec 0011). It returns `UpNextState`: `{ kind: "next", episode: NextEpisode }` (the existing `{ id, seasonNumber, episodeNumber }` type from `lib/tv/progress.ts`) when `showProgress` returns `counted` with a non null `next`; `{ kind: "caught_up", upcoming: UpcomingEpisode | null }` when it returns `counted` with `next` null; `{ kind: "not_aired", upcoming: UpcomingEpisode | null }` when it returns `none_aired`. `UpcomingEpisode` is `{ seasonNumber, episodeNumber, airDate: string }`: the first regular season episode, in season then episode order, whose `airStatus` is `upcoming` (a known date after today). A special (season 0) or an episode with no date is never `episode` or `upcoming`.
- **AC-5**: Each Up Next card (`UpNextCard`, a new component) follows the Upcoming artboard's card: the poster, the show name linking to `/shows/{id}`, no TMDB rating badge. In both `caught_up` states a secondary caption "You're up to date" sits under the show name (the `AGENTS.md` section 9 wording, always visible). Its bottom left pill (`UpNextPill`, a new server component) follows `upNextState`:
  - `next`: the watchlist Next episode pill's look (`NextEpisodeIcon`, visible `S{s}E{e}`, accessible text "Next episode, season {s} episode {e}"), sharing `NEXT_EPISODE_MESSAGES`.
  - `caught_up` with `upcoming`: the artboard's calendar pill reading `S{s}E{e} · {date}`, accessible text "Next episode, season {s} episode {e}, airs {full date}".
  - `caught_up` with no `upcoming`: a pill reading "Up to date", the watchlist's pill text.
  - `not_aired` with `upcoming`: the calendar pill `S{s}E{e} · {date}`, accessible text "Season {s} episode {e} airs {full date}".
  - `not_aired` with no `upcoming`: no pill.
  `{date}` is `formatShortDate`: `Dec 25` when the date falls in today's UTC year, else `Feb 3, 2027`, as the artboard prints them; `{full date}` is always `formatAirDate` (`Dec 25, 2026`). Never "0 of 0", never a percentage. The caught up caption is decided by the same `upNextState` read as the pill, so it streams inside the same per card boundary.
- **AC-6**: Each card's pill, caption and button stream in their own Suspense boundary whose fallback is a pill sized skeleton, so the section, posters and titles never wait on any show's episodes. The watched ids for every card come from one `getWatchedEpisodeIds(showIdsKey)` read for the whole section.
- **AC-7**: When a card's `getShowEpisodes` read throws a `TmdbError` or returns `complete: false`, or the watched ids read fails, the pill slot shows "Next episode unavailable" in secondary text with the existing `RetryLink`, and the card has no Mark watched button and no caption. No episode number or date from a partial read is shown. (The watchlist's `NextEpisodePill`, which renders nothing in these cases, is not reused; `UpNextPill` shares only its icon and message constants.) A Watching show TMDB no longer has renders a missing title card in the spec 0008 style ("No longer on TMDB") with no pill and no button.

*Mark watched*

- **AC-8**: A card in the `next` state has, bottom right, a `CardRoundButton` with the outline `WatchedIcon` and the accessible name "Mark {show} season {s} episode {e} watched". Other states have no button. Activating it (the client `MarkNextWatchedButton`) calls `setEpisodeWatched(showId, seasonNumber, episodeId, true)` with `episode.seasonNumber` and `episode.id` of that `next` episode; while the action and the following refresh run, the button is disabled with `aria-busy="true"` (`CardRoundButton` gains an optional `disabled` prop; its other callers are unchanged). On success it calls `router.refresh()` inside a transition, so the server works out the following episode and the card moves to the top by its new `last_activity_at`.
- **AC-9**: `mark_episode_watched` also returns `newly_marked boolean`, computed as `u.watched_at = now()` on the upserted row: `now()` is the transaction's start time, and `coalesce` keeps an earlier writer's `watched_at`, so it is true only for the transaction that actually set the mark, even when two tabs race. `setEpisodeWatched` alone returns a new `MarkEpisodeWatchedResult` (the shared `EpisodeTrackingResult` success shape plus `newlyMarked`, false when unmarking); `setEpisodeRating`, `setSeasonWatched`, `undoSeasonWatched` and the shared type stay unchanged. When `newlyMarked` is true, a toast "Marked {show} S{s}E{e} watched" offers Undo for the standard 10 second toast; Undo calls `setEpisodeWatched(showId, seasonNumber, episodeId, false)`, which clears `watched_at` only and keeps any rating, then refreshes. When false (another tab already marked it), the toast reads "{show} S{s}E{e} was already watched" with no Undo, and the page refreshes.
- **AC-10**: A failed mark or Undo shows the existing tracking error toast, or the session expired toast with its Sign in action; the button becomes active again, the page does not refresh, and the card stays as it was. Marking from Up Next never changes the show's status (the show is already Watching, so `start_watching_show` does nothing), and never creates, changes or deletes a rating.

*Coming soon*

- **AC-11**: Coming soon reads the user's planned movies (`user_movie_state.in_watchlist`), the most recent 200 by `watchlisted_at` descending then `movie_id` descending, with the exact total. It fetches their summaries with `getMovieSummaries` and keeps only movies whose `releaseDate` has `airStatus(releaseDate, requestTodayUtc())` equal to `upcoming` (a known date strictly after today's UTC date). Undated, released and missing movies are left out; they stay on `/watchlist`. The kept movies are ordered by `releaseDate` ascending, then title (`localeCompare`, `en`), then id ascending. When the total is above 200, a line under the heading reads "Checked your 200 most recently planned movies", and no count of upcoming movies is claimed beyond what is shown.
- **AC-12**: Each Coming soon card (`ComingSoonCard`, a new component; items typed `ComingSoonItem` with `releaseDate`) matches the artboard: the poster, the title linking to `/movies/{id}`, bottom left the calendar pill with `formatShortDate(releaseDate)` (accessible text "Releases {full date}"), bottom right the filled green Planned bookmark ("Remove {title} from watchlist"). Activating the bookmark removes the movie from the watchlist with the spec 0008 behavior, carried by a small client `ComingSoonGrid` that follows `LibraryGrid`'s pattern: `setMovieWatchlist(false)`, the card hides at once (optimistic), focus moves to the next card, else the previous, else the "Coming soon" heading, and a toast offers Undo through `restoreMovieWatchlist`, which refreshes. `LibraryList`, `LibraryItem`, `LibraryCard` and `LibraryGrid` are not changed.

*Empty, loading and failure states*

- **AC-13**: When Up Next has no Watching show, it shows the line "Start watching a show and its next episode shows up here." with a "Browse shows" link to `/shows`. When Coming soon has no upcoming movie, it shows "No planned movies are waiting for release." with a "Browse movies" link to `/movies`. When both reads succeed, both are empty, and Coming soon checked every planned movie (the total is at most 200), one `StatePanel` replaces both sections: "Nothing upcoming yet", with the same two links. Past the ceiling the two sections stay, so the "Checked your 200 most recently planned movies" line is never hidden.
- **AC-14**: The two sections' data reads run concurrently (`Promise.all`) inside the one boundary, and fail independently. A failed Supabase read or a systemic TMDB batch failure in one section shows that section's load failed message with a `RetryLink` under its h2; the other section renders normally. When both fail, each h2 shows its own failure message. The both empty panel never appears when either read failed.

*Safety*

- **AC-15**: Two users never see each other's Up Next: a direct PostgREST select of `user_up_next_shows` returns only the caller's rows, and `anon` gets a permission error. Every action validates its input with Zod and derives the user from `requireUser()`. No user specific value enters a `use cache` scope; the TMDB reads stay in their existing public caches, and the watched ids, the view rows, the planned movie ids and `today` are read per request.
- **AC-16**: At 375px the page shows the artboard's two column grid with no horizontal page scroll; pills never overlap the round button, and every button and link is at least 44px on touch. A card's title link is a stretched link (`PosterCard`'s `absolute inset-0` overlay covers the whole card, under the z-20 controls), so its target is its hit area, not the `<a>` element's own one line box: a tap at the centre of the poster, and at the centre of the title line, both resolve (`elementFromPoint`) inside that card's link. `PosterCard` is not changed for this. Keyboard alone can reach every card link, Mark watched button, Planned bookmark, toast action and Retry, with visible focus. Each Up Next card link carries `id="up-next-{showId}"`; after a Mark watched refresh settles (the transition's pending state ends), focus moves to that id, wherever the card now sits. After an Undo refresh, focus moves to the same id only when focus was on the toast; otherwise it is left where it is.

## Decision

**Chosen option**: Option 1: one `/upcoming` page with two server rendered sections, Up Next ordered by a `security_invoker` view, the next episode from a pure rule over the existing progress function, and Coming soon filtered from cached TMDB summaries.

A new view `user_up_next_shows` gives each Watching show its `last_activity_at`; `lib/tv/up-next.ts` turns `getShowEpisodes` plus the watched ids into the card state; Mark watched reuses `setEpisodeWatched` with `mark_episode_watched` now reporting `newly_marked`; Coming soon reads the latest 200 planned movie ids and filters their cached summaries by release date.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (extends `design/`, approved in this spec)

`design/desktop-upcoming-page.svg` and `design/mobile-upcoming-page.svg` draw the page title, the card, the calendar pill and the Planned bookmark for movies only. They draw no Up Next section and no section headings. The additions below reuse what the watchlist already built.

- **Page.** h1 "Upcoming" as drawn. Under it, two sections in order, each an h2 in the `LibraryHeading` style one step smaller (`text-2xl font-bold`), with the page's existing vertical gap. Each section uses the watchlist grid (`PosterGrid`/`LibraryGrid` columns: two at 375px, more from `md`).
- **Up Next card.** A new `UpNextCard` on `PosterCard`, with no top right badge. Bottom left: the Next episode pill look, or the artboard's calendar pill geometry (calendar glyph from the artboard's `calendar` symbol) for a date, or "Up to date". Bottom right: the `CardRoundButton` with the outline `WatchedIcon`. Under the show name, for caught up shows only, the caption "You're up to date" in `text-sm text-text-secondary`.
- **Coming soon card.** A new `ComingSoonCard` on `PosterCard`, exactly the artboard: calendar pill bottom left, filled Planned bookmark bottom right, title under the poster.
- **Unavailable pill slot.** `text-sm text-text-secondary` "Next episode unavailable" and the `RetryLink`, bottom left inside the card, on a glass pill so it stays legible on any poster.
- **Empty lines** use the same secondary text; the both empty panel is the existing `StatePanel`.

### Data model sketch

| Entity | Key | Change | Relationship |
|---|---|---|---|
| `user_up_next_shows` (**new view**) | logical `(user_id, show_id)` | `with (security_invoker = true)`: `select s.user_id, s.show_id, greatest(max(e.watched_at) filter (where e.season_number >= 1), s.status_changed_at) as last_activity_at from public.user_show_state s left join public.user_episode_state e on e.user_id = s.user_id and e.show_id = s.show_id where s.status = 'watching' group by s.user_id, s.show_id, s.status_changed_at`. `greatest` ignores a null `max`, so a show with no watched regular episode sorts by `status_changed_at`. Source of truth in `supabase/schemas/06-views.sql`, copied into the migration with its grants, as spec 0013 did. | derived from `user_show_state` 1:N `user_episode_state`; stores nothing |
| `user_show_state` (exists) | PK `(user_id, show_id)` | unchanged | `auth.users` 1:N |
| `user_episode_state` (exists) | PK `(user_id, episode_id)` | unchanged; the existing index `user_episode_state_show_order_idx (user_id, show_id, season_number, episode_number)` serves the join. No new index until verify measures a need. | `auth.users` 1:N |
| `user_movie_state` (exists) | PK `(user_id, movie_id)` | unchanged; Coming soon reads `in_watchlist` rows by the existing watchlist index | `auth.users` 1:N |
| `mark_episode_watched` (function, changed) | | return table gains `newly_marked boolean`: `u.watched_at = now()` on the upserted row (true only for the transaction that set the mark; the `prior` CTE is not used for it, because it reads the statement's starting snapshot and two racing tabs could both see no prior mark). Dropped and recreated (a changed return shape), grants restated, declarative `05-functions.sql` updated | |

Nothing derived is stored: no next episode, no release date, no activity column.

### State transitions

Up Next adds no status. A card's state is derived per request:

```
Watching show ──TMDB read complete──▶ next | caught_up | not_aired      (upNextState)
Watching show ──TMDB read failed or incomplete──▶ unavailable
next ──Mark watched──▶ next (the following episode) | caught_up       (after refresh)
next ──Mark watched, Undo──▶ next (the same episode again)
any status other than watching ──▶ not listed
```

### API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `user_up_next_shows` | view, PostgREST select | filtered `user_id = user.id`, ordered `last_activity_at desc, show_id asc` | `show_id`, `last_activity_at` | `authenticated` select only | `42501` for `anon` |
| `getUpNextShows()` | request scoped read, `lib/tracking/up-next.ts`, React `cache()` | none (user from session) | `TrackingRead<number[]>`: show ids in order | `requireUser()` session | `failed` |
| `getUpcomingMovieCandidates()` | request scoped read, `lib/tracking/up-next.ts`, React `cache()` | none | `TrackingRead<{ ids: number[]; total: number }>`: at most `UPCOMING_MOVIE_CHECK_LIMIT` (200) planned ids, newest plan first, plus the exact count | session | `failed` |
| `getTvShowsByIds(ids)` (exists) | public cached TMDB batch | the Up Next show ids | names, posters, `missingIds` | none (public catalog) | `TmdbError` (systemic) |
| `getMovieSummaries(ids)` (exists) | public cached TMDB batch | the candidate ids | summaries with `releaseDate`, `missingIds` | none | `TmdbError` (systemic) |
| `getShowEpisodes(showId)` (exists) | public `hours` cache | show id | `episodes`, `complete` | none | `TmdbError` |
| `getWatchedEpisodeIds(showIdsKey)` (exists) | request scoped | every Up Next show id | `Map<showId, Set<episodeId>>` | session | `failed` |
| `upNextState(episodes, watchedIds, today)` | pure function, `lib/tv/up-next.ts` | as AC-4 | `UpNextState` | none | none |
| `UpNextCard`, `UpNextPill`, `MarkNextWatchedButton`, `ComingSoonCard`, `ComingSoonGrid` | new components, `components/upcoming/` | as AC-5, AC-8, AC-12 | | | |
| `CardRoundButton` (changed) | component | gains optional `disabled` (sets `disabled` and `aria-busy`) | | | |
| `formatShortDate(date, today)` | pure function, `lib/format.ts` | TMDB date, `requestTodayUtc()` | `Dec 25` or `Feb 3, 2027`, or null | none | null on a bad date |
| `mark_episode_watched` (changed) | SQL function | unchanged | current columns plus `newly_marked boolean` | `authenticated` | unchanged |
| `setEpisodeWatched(showId, seasonNumber, episodeId, watched)` (changed) | Server Action, `app/shows/actions.ts` | unchanged | `MarkEpisodeWatchedResult`: `{ ok: true, showStarted, newlyMarked }` (`newlyMarked` false when unmarking) or `{ ok: false, error }`; the shared `EpisodeTrackingResult` and the other episode actions are unchanged | `requireUser()` | unchanged: `invalid_input`, `session_expired`, `not_found`, `tmdb_unavailable`, `write_failed` |
| `setMovieWatchlist`, `restoreMovieWatchlist` (exist) | Server Actions, `app/movies/actions.ts` | unchanged | unchanged | `requireUser()` | unchanged |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Up Next section | which shows | `user_up_next_shows` rows (status `watching` only, in the view) |
| Up Next section | order | `last_activity_at desc, show_id asc` from the view |
| Up Next card | show name, poster | `getTvShowsByIds` (public `days` cache) |
| Up Next card | missing title card | `missingIds` of that batch |
| Up Next pill | state and episode | `upNextState(getShowEpisodes(id).episodes, watched.get(id) ?? empty set, requestTodayUtc())` |
| Up Next pill | whether it may show numbers | `getShowEpisodes(id).complete` and the watched ids read succeeding |
| Up Next pill | air date of `upcoming` | `Episode.airDate` from `getShowEpisodes` |
| Up Next pill | short vs long date | `formatShortDate(airDate, requestTodayUtc())`: year shown unless it equals today's UTC year |
| Mark watched | `showId`, `seasonNumber`, `episodeId` | `upNextState(...).episode.seasonNumber` and `.id`, rendered into the button's props on the server |
| Mark watched | focus target after refresh | `id="up-next-{showId}"` on the card link |
| caught up caption | whether it shows | `upNextState(...).kind === "caught_up"` |
| Mark watched | show name in the label and toast | the name the card renders, from `getTvShowsByIds` |
| Mark watched toast | Undo offered or not | `newlyMarked` from `setEpisodeWatched`, from `mark_episode_watched.newly_marked` |
| Coming soon | candidate ids and total | `getUpcomingMovieCandidates()` over `user_movie_state` |
| Coming soon | the 200 ceiling | the constant `UPCOMING_MOVIE_CHECK_LIMIT` in `lib/tracking/up-next.ts` |
| Coming soon | which are upcoming | `airStatus(summary.releaseDate, requestTodayUtc()) === "upcoming"` |
| Coming soon | order | `releaseDate` asc, then `title` (localeCompare, `en`), then id |
| Coming soon card | title, poster, date | `getMovieSummaries` (public cache) |
| Planned bookmark | removal and Undo | the spec 0008 watchlist actions and their Undo payload |
| every read | today | `requestTodayUtc()`, once per request, outside any cache |
| every read and write | owner | `requireUser()` in the app, `auth.uid()` and RLS in SQL |
| empty lines, toasts, headings | copy | constants in `lib/tracking/messages.ts` (`UP_NEXT_MESSAGES`, `COMING_SOON_MESSAGES`) |

### Key invariants

- Only `watching` shows are ever listed; the filter lives in the view, not the page.
- An Up Next episode is always an aired regular episode not in the user's watched set; a special, an upcoming or an undated episode is never offered to mark.
- A number or date from an incomplete or failed episode read is never shown.
- Mark watched offers Undo only when that tap created the mark (`watched_at = now()` of its own transaction), so an Undo never clears a mark made elsewhere, even under a race.
- Marking from Up Next never changes a status or a rating.
- A Coming soon movie always has a known release date after today's UTC date.
- Nothing on this page is stored or cached per user.

### Security model

Private and owner only (`AGENTS.md` section 11). No table or policy changes: all three tables keep forced RLS and their owner policies. The view is `security_invoker = true`, so the base tables' policies apply to the reader; `revoke all on public.user_up_next_shows from anon, public, authenticated`, then `grant select ... to authenticated`. The page reads also filter `user_id` explicitly, the spec 0007 pattern. `mark_episode_watched` stays `security invoker`, `set search_path = ''`, `auth.uid()` for the owner, with its grants restated after the recreate. Actions use the per request server client, never the service role; input is Zod validated and the user comes from `requireUser()`. TMDB reads are public catalog data in their existing caches; no personal value enters a `use cache` scope. Logs carry an event and an outcome class only. No regulated data.

### Configuration required

None. No new environment variable or credential.

### Critical test scenarios

- Happy path: a user Watching two shows, one mid season and one caught up with a dated next episode, plus two planned future movies and one released one; `/upcoming` shows the mid season show first after marking its episode, the caught up show's `S3E1 · Mar 4` pill, and only the two future movies, soonest first, verifies **AC-2**, **AC-3**, **AC-5**, **AC-8**, **AC-11**, **AC-12**
- Rule (unit): `upNextState` with specials, an undated episode, a watched upcoming episode, all aired watched, and nothing aired gives `next`, `caught_up` with and without `upcoming`, and `not_aired`; `formatShortDate` prints the year only outside today's UTC year, verifies **AC-4**, **AC-5**
- Exclusion (pgTAP and running app): shows in Want to Watch, On Hold, Dropped and Completed never appear in the view; `last_activity_at` ignores specials and unmarked rows and falls back to `status_changed_at`, verifies **AC-3**
- Mark and Undo: mark, toast with Undo, Undo leaves the rating and the status untouched; mark a card already marked in a second tab, "already watched" with no Undo (pgTAP asserts `newly_marked` true, then false on a second call in a later transaction); focus lands on the moved card after the refresh, verifies **AC-8**, **AC-9**, **AC-10**, **AC-16**
- Failure case: TMDB fails for one show, that card reads "Next episode unavailable" with Retry and no button; the movie batch fails, Coming soon shows its error while Up Next renders; both empty shows the single panel, verifies **AC-7**, **AC-13**, **AC-14**
- Auth/permission: user B's direct PostgREST select on `user_up_next_shows` returns none of A's rows; `anon` gets `42501`; a visitor opening `/upcoming` is sent to sign in, verifies **AC-1**, **AC-15**
- Layout: 375px and keyboard pass on both sections and the toasts, verifies **AC-16**

## Build plan

Tracer Bullet: the first task is one thin real thread, a Watching show's next episode on `/upcoming` from the database to the screen, then each strand thickens it end to end.

1. The thin thread: migration for `user_up_next_shows` with its grants (and `06-views.sql`); regenerated types; pgTAP for the status filter, the activity time rule, cross user and `anon`; `getUpNextShows`; `lib/tv/up-next.ts` with unit tests; `/upcoming` page with the h1, the Up Next section (cards with the `next` pill only) and the skeleton; the Upcoming link in `LibraryNav` and its test updated; verified in the running app, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-15**
2. The pill strand: `formatShortDate` with unit tests; `UpNextPill` with all five pill states and the caught up caption, the per card Suspense skeleton, the unavailable slot with Retry, the missing title card, satisfies **AC-5**, **AC-6**, **AC-7**
3. The mark strand: migration recreating `mark_episode_watched` with `newly_marked` (and `05-functions.sql`), pgTAP for true then false; `MarkEpisodeWatchedResult` from `setEpisodeWatched` (season page callers compile unchanged); `CardRoundButton`'s `disabled` prop; `MarkNextWatchedButton` with pending state, refresh in a transition, focus return by id, toasts and Undo, error rollback, satisfies **AC-8**, **AC-9**, **AC-10**
4. The movie strand: `getUpcomingMovieCandidates` and `UPCOMING_MOVIE_CHECK_LIMIT`; `ComingSoonItem`, `ComingSoonCard` and `ComingSoonGrid`; the filter, order, the ceiling line, the calendar pill and the Planned bookmark with optimistic removal, focus and Undo, satisfies **AC-11**, **AC-12**
5. The states strand: both section reads in `Promise.all`; per section empty lines, the both empty panel, independent section failures including both failing, satisfies **AC-13**, **AC-14**
6. Proof: 375px and keyboard passes; the request scope and layout purity tests extended to `/upcoming`; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm build` (route still partially prerendered); `explain analyze` of the Up Next view read on a seeded user with 50 Watching shows and 5,000 watched episodes, recorded in `verify.md`, ceiling 50 ms; a cold cache timing of `/upcoming` with 20 Watching shows and 200 planned movies, recorded; `verify.md`, satisfies **AC-15**, **AC-16**

## Consequences

**Positive**:
- The Upcoming link finally has a page, and it honors both the artboard and `AGENTS.md` without a fourth nav link.
- Up Next reuses `showProgress`, `getWatchedEpisodeIds`, the Next episode pill and `setEpisodeWatched`, so the rule for "next episode" still exists in one place.
- No stored catalog data, so the no catalog cache decision (spec 0008) holds.
- `newly_marked` makes Undo safe across tabs.

**Negative / tradeoffs**:
- Every Watching show reads its full episode list from TMDB (cached for hours). A cold page for a user with many Watching shows fans out to many season requests; the per card Suspense keeps the page usable, but pills can arrive slowly.
- Coming soon reads up to 200 movie summaries per view (cached, but cold for a new heavy user), and a film planned more than 200 plans ago can be missed; the page says so rather than hiding it.
- No pagination on Up Next: a user with hundreds of Watching shows gets one long page.
- A caught up card carries both a caption and a pill, one more line of text than the artboard's card.
- Up Next and Coming soon get their own card components rather than extending `LibraryCard`, so some poster card markup exists in two places.
- Changing `mark_episode_watched`'s return shape moves the season page's callers and the generated types together in one migration.

**Neutral**:
- Adds the schema's second view (`user_up_next_shows`), `lib/tv/up-next.ts`, `lib/tracking/up-next.ts`, `formatShortDate`, and `app/upcoming/`.
- Spec 0013's Follow-up on feature 15 is met: On Hold and Dropped are excluded by status, which the view filters.
- Upcoming movies were not in the scope row; the page adds them because the only artboard for this link draws them.

## Follow-up

- [ ] Update the scope row for feature 15 so its intent names both sections (the movie section was added here from the artboard).
- [ ] Feature 16 (automatic completion) will move shows out of Watching; they then leave Up Next through the view's status filter with no change here.
- [ ] If verify finds cold `/upcoming` loads slow, measure before adding anything: a lighter "latest aired episode" read, or a cap on Up Next, comes before any Postgres catalog cache (spec 0008).
