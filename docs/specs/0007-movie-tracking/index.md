# 0007. Movie tracking: watchlist, watched and personal rating

**Date**: 2026-09-23
**Status**: In Progress

Scope feature: [8. Movie tracking](../../scope/scope.md) · GA tier

## Summary

This decides how a signed in user plans, marks watched and rates a movie. The movie page gets one row of three glass pills under the TMDB rating (Plan or Planned, Mark watched or Watched, and Your score, which opens a 1 to 10 picker), and every card on the `/movies` grid gets the round bookmark button the design draws. Each click flips at once and rolls back with a toast if the server refuses, so a failed save never looks like a success. Rating or marking a movie watched runs as one small Postgres function, so the "first watch also takes it off the watchlist" rule holds even with two tabs open. Visitors who are not signed in see no controls at all, and the public pages keep their prerendered, cached catalog.

## Requirements

**User stories**:
- As a signed in user, I want to plan a movie from its page or straight from the grid, so that I can build a watchlist without opening every title.
- As a signed in user, I want to mark a movie watched and give it a score from 1 to 10, so that I keep an honest record of what I saw and what I thought of it.
- As a signed in user, I want my changes to survive a reload and show up in another browser, and to be told plainly when a save fails, so that I can trust what the screen says.
- As a visitor, I want the catalog to stay fast and uncluttered, so that browsing works without an account.

**Acceptance criteria**:

- **AC-1**: Signed in, `/movies/{id}` shows one row of three controls directly under the TMDB rating block, in this order: the watchlist pill ("Plan" with an outline bookmark, or "Planned" with the green filled bookmark and its check), the watched pill ("Mark watched" with an outline circle check, or "Watched" with a filled circle check in near white), and the score pill (the cyan `PersonalScoreBadge` look reading "Not rated" or the integer score). The two toggles keep a fixed accessible name and report their state through `aria-pressed` only ("Plan {title}", "Mark {title} watched"). On first paint the row shows the stored state; it never renders a default state and then corrects itself.
- **AC-2**: Signed out, the movie page renders nothing visible in the tracking slot and the grid cards render no bookmark (an empty zero height wrapper is allowed). No skeleton appears for visitors, nothing errors, and both routes still serve their prerendered shell. The same holds when the Supabase public configuration is missing or partial: both reads check `publicEnvProblems()` first and treat a problem as signed out, as the navbar account slot does.
- **AC-3**: Clicking the watchlist pill sets `in_watchlist` to the opposite of what the pill showed. The new state survives a full reload and appears in a second browser signed in to the same account.
- **AC-4**: Marking a movie watched sets `watched_at` to the server's `now()` and, when the movie was not already watched, sets `in_watchlist` to false in the same statement. Marking an already watched movie watched again (for example from a stale second tab) changes nothing: the original `watched_at` stays and an existing bookmark stays.
- **AC-5**: Unmarking watched sets `watched_at` to null and leaves `rating` and `in_watchlist` exactly as they were. There is no confirm step.
- **AC-6**: The watchlist pill and the card bookmark work on a watched movie, so a user can plan a rewatch. Setting the bookmark never touches `watched_at` or `rating`.
- **AC-7**: Clicking the score pill opens a popover titled "Your score" holding ten choices, 1 to 10, as a radio group in two rows of five, plus a "Clear rating" button when a rating exists. Arrow keys only move focus and never save (Left and Right step by one, Up and Down step by five), Enter or Space picks and saves, Escape closes without saving, and focus returns to the score pill. The pill's accessible name includes the movie title and the current score or "Not rated".
- **AC-8**: Picking a score stores it. When the movie was not watched, the same single statement also sets `watched_at` to `now()` and `in_watchlist` to false. When it was already watched, `watched_at` and `in_watchlist` are untouched.
- **AC-9**: "Clear rating" sets `rating` to null and leaves `watched_at` and `in_watchlist` untouched. The pill then reads "Not rated".
- **AC-10**: The personal score always appears in the cyan score style with the accessible label "Your score", and the TMDB rating keeps its amber badge and "TMDB" label above it. An integer score shows no decimal (`8`, never `8.0`). Amber, cyan and green appear only with the meanings `components/AGENTS.md` assigns them.
- **AC-11**: Every control updates the moment it is clicked. If the Server Action returns an error, or its call rejects (offline, a server error, a deploy mismatch), the control returns to the last state the server confirmed and a toast explains why; a rejection uses the `write_failed` copy and never reaches an error boundary. A control never shows a state the database does not hold once its write has settled.
- **AC-12**: If the session has expired when a control is clicked (`getOptionalUser()` returns null, or PostgREST answers `PGRST301` or `PGRST303`), the action writes nothing and returns `session_expired`. The control rolls back and the toast reads "Your session expired. Sign in to save this." with a "Sign in" action linking to `/sign-in?next=<the page's path>`.
- **AC-13**: An action receiving a malformed input (a movie id that is not a positive 32 bit integer, a rating outside 1 to 10 or not an integer, a non boolean flag) returns `invalid_input` before any Supabase or TMDB call. The database constraints from spec 0001 reject the same values independently.
- **AC-14**: Before a write that can create state (plan, mark watched, rate), the action confirms the movie through the cached `loadMovie` read. Removals (unplan, unwatch, clear rating) skip the check, so they keep working for a movie TMDB later removes or during an outage, and they are updates only, so they never create a row. An unknown or adult id on a creating write returns `not_found` and writes nothing (toast: "This movie isn't available to track."). A TMDB failure returns `tmdb_unavailable` and writes nothing (toast: "Couldn't reach TMDB. Try again in a moment.").
- **AC-15**: Rapid clicks queue rather than being dropped. Double clicking the bookmark, or picking 7 then 8, leaves the stored row equal to the last click, and repeated identical writes leave exactly one row for that user and movie.
- **AC-16**: Signed in, each card on `/movies` shows the round glass bookmark button at its bottom right: an outline bookmark for Plan, the green filled bookmark with a check for Planned. Its hit target is at least 44px on mobile and 36px on desktop, it carries the fixed name "Plan {title}" with `aria-pressed` for its state, and clicking it toggles the bookmark without opening the movie. A grid render makes exactly one Supabase read for all its cards, checked by counting requests in the local Supabase API log during a running app check.
- **AC-17**: If reading the user's tracking state fails while TMDB succeeds, the movie page shows "Couldn't load your tracking." with a "Try again" link that reloads the page, and the grid cards render without a bookmark. The catalog content renders normally, and the failure is logged.
- **AC-18**: `user_id` on every write comes from the verified session, never from the client. `rate_movie` and `mark_movie_watched` are `SECURITY INVOKER` with `search_path` set to empty, executable by `authenticated` only (no execute for `anon` or `PUBLIC`). Acting as user A, calling either function, or any action, can never read or change user B's row, including by direct RPC or REST calls.
- **AC-19**: No tracking state enters a `use cache` scope or any shared cache. The request scoped reads live only in `components/tracking/`, each rendered inside its own Suspense boundary. `/movies` and `/movies/[id]` still build as partially prerendered routes, and the TMDB reads keep their existing cache profiles.
- **AC-20**: After a successful write, the action calls `refresh()` from `next/cache`. Planning a movie on its page and then pressing Back to `/movies` shows that card as Planned.
- **AC-21**: Failed actions log one line with an event and an outcome class only (for example `movie_tracking.rate refused session_expired`). No user id, email, movie id or rating value appears in any log line. Successful writes are not logged.
- **AC-22**: At 375px the three pills wrap within the hero with no horizontal page scroll, every control meets the 44px target, the picker's two rows of five fit on screen, and every control shows the visible focus ring when reached by keyboard.

## Decision

**Chosen option**: Option 2: Server Actions with optimistic controls, and two invoker functions for the conditional writes.

Three target value Server Actions validate, authenticate, confirm the movie with TMDB (for writes that can create state) and then write through Row Level Security: a partial upsert to plan, update only writes for the three removals, and two small `SECURITY INVOKER` Postgres functions (`mark_movie_watched`, `rate_movie`) for the two writes whose outcome depends on the current row. Client controls show the result optimistically over server supplied state and rely on `refresh()` to converge.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning, the options weighed, and the premise note on the grid bookmark: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (extends `design/`, approved in this spec)

`design/` draws the card bookmark (`show-movie-card.svg`, `bookmark-button`) and the Plan and Planned marks (`badge-legend.svg`). It draws no watched or score control and no movie page. Everything below is built from pieces spec 0004 already defined.

- **Movie page row.** A `flex flex-wrap gap-2` row inside `MovieHero`, directly under the rating block in the same column (spec 0006 left this slot empty). Three buttons wearing the pill recipe (plate, glass, rim, fully rounded, bold 13px text, 14px icon) at the touch sizes: `h-11` base, `h-9` from `md`. The recipe is exported once from `components/glass-pill.tsx` (for example `glassPillClassName(tone)`) and used by both `GlassPill` and these buttons, so it is never derived twice.
  - Watchlist pill: lucide `Bookmark` outline in near white with the label "Plan"; when set, `BookmarkCheck` filled `status-planned` with the check in `status-planned-mark`, label "Planned". Accessible name "Plan {title}" in both states, with `aria-pressed`.
  - Watched pill: lucide `CircleCheck` outline with "Mark watched"; when set, the filled near white circle check with "Watched". It uses no amber, cyan or green. Accessible name "Mark {title} watched" in both states, with `aria-pressed`.
  - Score pill: `tone="score"` (cyan rim and score plate) with the cyan star, reading "Not rated" or the integer. `aria-haspopup="dialog"`, `aria-expanded`.
- **Score picker.** The shadcn `Popover` (on `@base-ui/react`, added with the shadcn CLI) anchored to the score pill, on the panel plate with the panel radius. Title "Your score". Ten choices, 1 to 10, in two rows of five, each at least 44px square. Built by hand, not with Base UI `RadioGroup` (which selects on arrow keys and would save a rating per key press): a `role="radiogroup"` labelled "Your score" holding ten buttons with `role="radio"` and `aria-checked`, roving `tabindex`, arrows moving focus only (Left and Right by one, Up and Down by five), Enter or Space committing. The current score is checked and uses the cyan score styling. A "Clear rating" text button under the grid, shown only when a rating exists. Picking a score or clearing closes the popover.
- **Card bookmark.** Inside `PosterCard`'s existing `controls` slot, aligned to the bottom right (`ml-auto`, since the slot row is `justify-between`): a round button on the glass plate with glass fill and rim, visual diameter about 36px, hit target 44px on mobile, holding the outline bookmark (Plan) or the green filled bookmark with the check (Planned), per `bookmark-button`. It sits above the card's link overlay, as the slot already guarantees.
- **Toasts.** shadcn `Sonner`, one `<Toaster />` in `app/layout.tsx`, bottom center, styled with the sheet plate, the panel radius and existing tokens only (no colour literals, per `design-tokens-boundary.test.ts`). The generated `components/ui/sonner.tsx` imports `useTheme` from `next-themes`, which is not installed: remove that import and fix `theme="dark"`; do not add `next-themes`. Toasts appear only on failure; success is shown by the control itself. Each control uses one toast id (for example `movie-tracking-{movieId}-{control}`), so repeated failures replace each other instead of stacking. The session expired toast's "Sign in" action calls `router.push()` with the sign in URL.
- **Loading.** Both Suspense boundaries use `fallback={null}`. The existing comment in `movie-hero.tsx` promising a reserved height and skeleton is updated to match. Signed in users see the row appear once the read returns, which pushes Overview down once; visitors see nothing, ever.
- **Read failure (AC-17).** In place of the row: muted text "Couldn't load your tracking." and a `RetryLink` to the same page.

### Data model sketch

No table changes. `user_movie_state` from spec 0001 is used as is:

| Column | Type | Null | Role in this feature |
|---|---|---|---|
| `user_id` | `uuid` | no | owner, from the session; PK part; FK `auth.users(id)` on delete cascade |
| `movie_id` | `integer` | no | TMDB movie id; PK part; `check (movie_id > 0)` |
| `in_watchlist` | `boolean` | no, default `false` | Plan or Planned |
| `watched_at` | `timestamptz` | yes | null means not watched; set to `now()` in Postgres, never by the client |
| `rating` | `smallint` | yes | Your score; `check (rating between 1 and 10)` |
| `created_at`, `updated_at` | `timestamptz` | no | trigger maintained |

Relationship: `auth.users` 1:N `user_movie_state`. Rows are created only by a creating write (plan, mark watched, rate). Removals update an existing row and never insert. A row that becomes all empty (not planned, not watched, no rating) is kept, never deleted.

**New database functions** (declared in `supabase/schemas/05-functions.sql`, shipped in one generated migration):

- `public.mark_movie_watched(p_movie_id integer) returns public.user_movie_state`
  `insert (user_id, movie_id, watched_at, in_watchlist) values (auth.uid(), p_movie_id, now(), false) on conflict (user_id, movie_id) do update set watched_at = coalesce(user_movie_state.watched_at, now()), in_watchlist = case when user_movie_state.watched_at is null then false else user_movie_state.in_watchlist end returning *`
- `public.rate_movie(p_movie_id integer, p_rating smallint) returns public.user_movie_state`
  Same shape, also setting `rating = excluded.rating` (and `p_rating` on insert).

Both: `language sql`, `volatile`, `security invoker`, `set search_path = ''`, fully qualified names. `revoke all ... from public, anon`; `grant execute ... to authenticated`, written in `05-functions.sql` itself (as `04-policies.sql` does for tables) and carried into the migration. Under invoker rights the `insert ... on conflict do update ... returning` applies all four RLS policies from spec 0001 (insert check, update using and check, select for the conflict row and `returning`); the conflicting row is always the caller's own, because the primary key includes `auth.uid()`. The explicit revoke is required: Supabase's default privileges grant execute on new `public` functions to `anon`, and `supabase db diff` does not track that (the same trap spec 0001's migration documents for tables). An `auth.uid()` of null fails the `not null` on `user_id` and the RLS check, so an unauthenticated call can never write.

### State transitions

Per user and movie, three independent facts, with two couplings:

```
bookmark ─────────────► in_watchlist = value           (nothing else changes)
mark watched ─────────► watched_at = coalesce(old, now())
                        in_watchlist = false only if it was unwatched
unwatch ──────────────► watched_at = null              (rating, bookmark kept)
rate n ───────────────► rating = n
                        + the "mark watched" effect if it was unwatched
clear rating ─────────► rating = null                  (watched, bookmark kept)
```

### API surface

All three are Server Actions in `app/movies/actions.ts` (`"use server"`), called directly with arguments inside a transition, never through a form post. Each returns `MovieTrackingResult = { ok: true } | { ok: false; error: MovieTrackingError }`, where `MovieTrackingError = "invalid_input" | "session_expired" | "not_found" | "tmdb_unavailable" | "write_failed"`. No state comes back: the controls converge on the server prop that `refresh()` delivers in the same response. None of them throws or redirects. The client wraps every call in `try`/`catch` and treats a rejection as `write_failed`.

`MovieTrackingState = { inWatchlist: boolean; watched: boolean; rating: number | null }` is the shape the reads return and the controls hold.

| Action | Inputs | Write | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `setMovieWatchlist` | `movieId: number` (req), `inWatchlist: boolean` (req) | `true`: upsert `{ user_id, movie_id, in_watchlist: true }` on `(user_id, movie_id)`; `false`: `update { in_watchlist: false } where user_id and movie_id` | `{ ok }` | session | `invalid_input`, `session_expired`, `not_found` and `tmdb_unavailable` (creating writes only), `write_failed` |
| `setMovieWatched` | `movieId: number` (req), `watched: boolean` (req) | `true`: rpc `mark_movie_watched`; `false`: `update { watched_at: null } where user_id and movie_id` | `{ ok }` | session | same |
| `setMovieRating` | `movieId: number` (req), `rating: number \| null` (req) | number: rpc `rate_movie`; null: `update { rating: null } where user_id and movie_id` | `{ ok }` | session | same |

Order inside every action: Zod parse, then `getOptionalUser()`, then (creating writes only) `loadMovie(movieId)`, then the write, then `refresh()` on success only. An update that matches no row is a success (the state was already empty). Every payload names only the columns that action changes (spec 0001's partial write rule). Supabase errors never reach the client. Mapping: `PGRST301` and `PGRST303` (an expired or invalid JWT) map to `session_expired`; `42501` (a missing grant or a policy refusal, which means a bug, not an expired session) maps to `write_failed` with its own log outcome `forbidden`; every other error maps to `write_failed` with the outcome `db_error`.

Reads (server only, `lib/tracking/movie-state.ts`, never inside `use cache`):

| Read | Inputs | Query | Output | Signed out |
|---|---|---|---|---|
| `getMovieTracking(movieId)` | `movieId` | `publicEnvProblems()` first, then select `in_watchlist, watched_at, rating` where `user_id = user.id and movie_id = movieId` | `{ kind: "signed_out" } \| { kind: "ok"; state } \| { kind: "failed" }`; no row means the empty state | `signed_out`, no query (also on an env problem) |
| `getWatchlistedMovieIds(idsKey)` | a comma joined sorted id list (a primitive, so React `cache()` dedupes it per request) | `publicEnvProblems()` first, then select `movie_id` where `user_id = user.id and movie_id in (...) and in_watchlist` | same union with a `Set<number>` | `signed_out`, no query (also on an env problem) |

Components:

| Component | Kind | Role |
|---|---|---|
| `components/tracking/movie-tracking-slot.tsx` | server | calls `getMovieTracking`; renders nothing, the retry line, or the controls |
| `components/tracking/movie-tracking-controls.tsx` | client | the three pills and the picker; one `useOptimistic` over the whole `MovieTrackingState` prop, reduced by `applyTrackingIntent` |
| `components/tracking/card-bookmark.tsx` | server | calls `getWatchlistedMovieIds` for the grid; renders nothing or the button |
| `components/tracking/card-bookmark-button.tsx` | client | the round bookmark; `useOptimistic` over the `inWatchlist` prop |
| `lib/tracking/intent.ts` | pure | `applyTrackingIntent(state, intent)`: mirrors the SQL rules exactly (mark watched and rate on an unwatched movie also set `watched` and clear `inWatchlist`; unwatch and clear rating touch only their own field). Unit tested against the same cases as the pgTAP file |
| `components/tracking/tracking-toast.ts` | client | maps a `MovieTrackingError` to its toast, including the Sign in action |

Every toggle computes its target from the optimistic value, not the server prop, so a double click sends `true` then `false`, never `true` twice. `MovieHero` gains a `tracking?: React.ReactNode` prop rendered in the slot. `app/movies/[id]/page.tsx` passes `<Suspense fallback={null}><MovieTrackingSlot … /></Suspense>`; `app/movies/page.tsx` passes `<Suspense fallback={null}><CardBookmark … /></Suspense>` as each card's `controls`.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| any write | `user_id` | `getOptionalUser()` (verified `getClaims()`), spec 0005. Never a client field |
| any write | `movie_id` | the action argument, parsed by Zod as an integer from 1 to 2147483647 |
| creating write | whether the movie may be tracked | `loadMovie(movieId)` in `app/movies/[id]/load-movie.ts`: `found` proceeds; `not_found` (including adult) and `failed` refuse. Removals skip it |
| bookmark | `in_watchlist` | the action argument (the target value, not a toggle) |
| mark watched | `watched_at`, cleared `in_watchlist` | `now()` and the conditional inside `mark_movie_watched` |
| unwatch | `watched_at = null` | the action, constant |
| rate | `rating` | the action argument, Zod 1 to 10 integer, then the CHECK constraint |
| rate on unwatched | `watched_at`, cleared `in_watchlist` | the conditional inside `rate_movie` |
| clear rating | `rating = null` | the action, constant |
| action result | `ok` or the error class | the action's own checks and the error mapping above. No row is returned to the client |
| controls, first paint | current state | `getMovieTracking` (page) or `getWatchlistedMovieIds` (grid), request time |
| controls, after click | optimistic state | `applyTrackingIntent(optimistic, intent)` inside `useOptimistic`; converges on the prop that `refresh()` delivers. If that post write read fails, the slot shows its AC-17 retry line, which is acceptable |
| controls, after a rejected call | rollback and toast | the transition ends with the old prop; `try`/`catch` maps the rejection to `write_failed` |
| toast | id | `movie-tracking-{movieId}-{control}` |
| session expired toast | Sign in link `next` | a `returnPath` prop the server passes down: `/movies/{id}` on the page, `pageHref(page)` on the grid. Validated again by `safeNextPath()` on the sign in page |
| every aria label | movie title | the TMDB `title` already loaded by the page or grid, passed as a prop |
| score pill | "Not rated" or the integer | `state.rating` through `PersonalScoreBadge`'s formatting rule |
| toast copy | message text | `lib/tracking/messages.ts`, keyed by `MovieTrackingError` |
| failure log line | event and outcome | `logTrackingEvent(event, outcome)` in `lib/tracking/log.ts`. Events: `movie_tracking.watchlist`, `movie_tracking.watched`, `movie_tracking.rate`, `movie_tracking.read`. Outcomes: the error classes plus `forbidden` and `db_error` |

Toast copy, final:

| Error | Toast |
|---|---|
| `session_expired` | "Your session expired. Sign in to save this." + action "Sign in" |
| `not_found` | "This movie isn't available to track." |
| `tmdb_unavailable` | "Couldn't reach TMDB. Try again in a moment." |
| `write_failed`, `invalid_input`, a rejected call | "Couldn't save that change. Try again." |

### Key invariants

- Watched and rating stay separate: unwatching never clears the rating, and clearing the rating never unwatches (AGENTS.md section 7).
- Only a creating write can insert a row; removals are updates.
- Only the first transition into watched clears the bookmark. Nothing else ever sets `in_watchlist` to false except the user's own bookmark click.
- Every write sends a target value; the same call twice gives the same row (idempotent).
- A control's settled state always equals the database row: the confirmed state is only ever the server's.
- No tracking value is computed or read inside `use cache`, and no public route loses its prerendered shell.

### Security model

- Private, owner only data. Reads and writes run as the signed in user through the per request server client, so the RLS policies from spec 0001 apply to every query and to both functions (invoker rights).
- `user_id` is never an input. The functions take it from `auth.uid()`; the plain upserts take it from the verified session.
- Three layers, as AGENTS.md section 11 requires: `getOptionalUser()` in every action, RLS in Postgres, and the grants (`anon` and `PUBLIC` hold no table privilege and no execute on the new functions).
- No service role, no elevated client, no new secret. TMDB stays behind `lib/tmdb`.
- Logs carry no identifiers or viewing history (AC-21). No compliance scope beyond ordinary personal data.

### Configuration required

None. No new environment variable or credential. Two new dependencies arrive through the shadcn CLI: `sonner`, plus the `popover` component source on the existing `@base-ui/react`. `next-themes` is deliberately not added (see Toasts).

### Critical test scenarios

- Happy path: plan, mark watched (bookmark clears), rate 8, clear rating, unwatch (rating kept), reload, then open the same movie in a second signed in browser and see the same state; verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-8**, **AC-9**.
- Rate an unwatched, planned movie: one call leaves `rating = n`, `watched_at` set, `in_watchlist` false; rate it again: `watched_at` unchanged; verifies **AC-8**, **AC-4**.
- Stale tab: tab A marks watched, tab B (still showing unwatched) plans a rewatch, tab A's stale Mark watched fires again: bookmark and original date survive; verifies **AC-4**, **AC-6**, **AC-15**.
- Failure: session cookie deleted before clicking: nothing written, control rolls back, toast with Sign in link to `/sign-in?next=/movies/{id}`; verifies **AC-11**, **AC-12**.
- Failure: TMDB blocked at the network, click Plan: `tmdb_unavailable`, nothing written, rollback. With TMDB still blocked, unplan a movie planned earlier: it succeeds. Note that TMDB failures are cached for a few seconds, so recovery can lag by that long; verifies **AC-14**, **AC-11**.
- Failure: the dev server restarted between render and click, or the network drops: the call rejects, the control rolls back, the `write_failed` toast shows, no error boundary; verifies **AC-11**.
- Failure: Supabase unreachable on read: page shows the retry line, grid shows no bookmarks, catalog intact; verifies **AC-17**.
- Auth: as user A, rpc `rate_movie` and REST upserts aimed at user B's row change nothing; as `anon`, execute on both functions is denied; verifies **AC-18**.
- Visitor: signed out `/movies` and `/movies/550` show no controls, no skeleton, and `pnpm build` still reports both as partially prerendered; verifies **AC-2**, **AC-19**.

## Build plan

Tracer Bullet: the first slice pushes one control through every layer (UI, action, TMDB check, Postgres, RLS, refresh, toast) before anything is widened.

1. **Thin thread: the watchlist pill on the movie page.** Add `sonner` and the `Toaster` in `app/layout.tsx` (keep `layout-purity.test.ts` green); export the pill recipe from `components/glass-pill.tsx`; `lib/tracking/` (Zod schemas, `MovieTrackingResult`, messages, `logTrackingEvent`, `applyTrackingIntent`, `getMovieTracking` with the env guard); `setMovieWatchlist` in `app/movies/actions.ts` with the full parse, session, `loadMovie`, write, `refresh()` order and the update only removal; `MovieTrackingSlot` plus a controls component holding only the watchlist pill with `useOptimistic`, the `try`/`catch` and the toast mapping (Sonner with `useTheme` removed); the `tracking` prop on `MovieHero` and its updated comment. Amend `app/movies/request-scope.test.ts` as described under Consequences. Verify in the running app with two browsers. Satisfies **AC-1** (watchlist pill), **AC-2**, **AC-3**, **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-19**, **AC-21**.
2. **Migration: the two functions.** `supabase/schemas/05-functions.sql` including its `revoke`/`grant` lines, generate the migration with `supabase db diff` and confirm the grants landed in it (add them by hand if the diff dropped them), `pnpm db:types`, and pgTAP file `supabase/tests/050-movie-tracking-functions.test.sql` (invoker and `search_path` set, `anon` has no execute, first watch clears the bookmark, repeat keeps date and bookmark (assert the user visible columns only; the `updated_at` trigger still fires), rate on unwatched sets all three, rate on watched touches only `rating`, 0 and 11 rejected, user A cannot reach user B's row, one row after repeats). Satisfies **AC-4**, **AC-8**, **AC-15**, **AC-18**.
3. **Watched pill.** `setMovieWatched` (rpc for true, update only for false) and the pill. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**.
4. **Score pill and picker.** Add the shadcn `popover`; `setMovieRating` (rpc for a number, update only for null); the hand built radio group picker (arrows move focus only, Enter or Space commits), Escape and focus return; the score pill through `PersonalScoreBadge`'s formatting. Satisfies **AC-1**, **AC-7**, **AC-8**, **AC-9**, **AC-10**.
5. **Card bookmark on the grid.** `getWatchlistedMovieIds` behind React `cache()`; `CardBookmark` and `CardBookmarkButton` in each card's `controls` slot, reusing `setMovieWatchlist`; count requests in the local Supabase API log during a running app check to confirm one read per grid render. Satisfies **AC-6**, **AC-16**, **AC-2**.
6. **Failure and edge states.** The read failure line and quiet card fallback; rapid click queueing; Back navigation after `refresh()`; mobile 375px wrap and targets; focus rings. Satisfies **AC-15**, **AC-17**, **AC-20**, **AC-22**.
7. **Proof.** Vitest for the actions (each error path writes nothing; removals skip TMDB and never insert; each payload names only its own columns; the error mapping for `PGRST301`, `PGRST303` and `42501`; `refresh()` only on success; log lines carry no ids), `applyTrackingIntent` against the pgTAP cases, the controls (optimistic flip, rollback plus toast on an error and on a rejection, `aria-pressed` with fixed names, picker keyboard), the card bookmark, and the amended request scope test; `pnpm test:db`; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; `security-boundary.test.ts` and `design-tokens-boundary.test.ts` still pass; write `verify.md` and run it in the running app (local Supabase stack) with two users. Satisfies **AC-10**, **AC-13**, **AC-18**, **AC-19**, **AC-21**, plus a regression pass over all others.

## Consequences

**Positive**:
- The two rules that depend on the current row (first watch clears the bookmark, rating implies watched) are single atomic statements, so they cannot race between tabs or half apply.
- Clicks feel instant, yet the settled screen always equals the database, which is the scope row's "no false success" requirement.
- The public catalog stays public: visitors get the same prerendered shell and cached TMDB reads as before, and see no tracking UI.
- Sonner, the pill button recipe and the `lib/tracking` result, message and log pattern are reusable by episode tracking (feature 12) and TV status (feature 14).

**Negative / tradeoffs**:
- Every creating write waits on a TMDB check. It is usually a cache hit, but when TMDB is down nobody can plan, watch or rate, even though the page may still be showing from cache (removals still work). On a cold cache the check fetches the full movie details just to validate an id.
- The grid now makes one Supabase read per render for signed in users, and the landing is no longer free of request scoped code. The "no session read" guarantee of spec 0006 becomes "no session read outside `components/tracking/` Suspense boundaries".
- Signed in users see the controls appear a moment after the page, which moves Overview down once. Visitors never do.
- Two SQL functions now hold business rules, so those rules live in two places (Postgres for the conditional writes, TypeScript for everything else). They are small and covered by pgTAP.
- Rating an unwatched movie also marks it watched and takes it off the watchlist. A user who rates by mistake gets a watched mark to remove by hand, and the bookmark does not come back when they do.
- `refresh()` renders the current route's dynamic parts again after every successful click: an extra server render per click.

**Neutral**:
- Spec 0006 AC-7 (the slot renders no DOM node) and AC-13 (no request scoped read under `app/movies` and `components/movie`) are superseded by this spec for the tracking slot and the card controls. `app/movies/request-scope.test.ts` changes to: route and `components/movie` files still import no `cookies(`, `headers(`, `@/lib/supabase` or `@/lib/auth/user` directly; `app/movies/actions.ts` is exempt (a POST handler, not render code); imports from `components/tracking/` are allowed; and no file in `components/tracking/` or `lib/tracking/` may contain `"use cache"`, which is the real leak risk. The build itself enforces that request scoped reads sit inside Suspense under `cacheComponents`, so the test does not try to.
- `lib/auth/AGENTS.md` says `getOptionalUser()` is used only by the navbar; the tracking reads and actions become the second and third users.
- `components/AGENTS.md` lists Plan and Planned as unbuilt legend badges; they ship here.
- Rows that became empty are kept, so feature 9 must always filter on `in_watchlist` or `watched_at`, never on row existence.

## Follow-up

- [ ] Feature 9 builds its Watched list on `watched_at` and its Watchlist on `in_watchlist`. A rated but unwatched movie can exist (rate, then unwatch), so feature 9 must not assume every rated movie is watched.
- [ ] Feature 11 (search results) and feature 10 (TV) reuse `CardBookmark`; the TV version writes `user_show_state.status = want_to_watch` instead, which feature 14 owns.
- [ ] Spec 0006 is `done`; `/sync` should note on it that AC-7 and AC-13 were amended by spec 0007 for the tracking slot.
- [ ] `/sync` should add a `lib/tracking/AGENTS.md` once the module exists (the result type, messages, logging and the partial write rule) and record the `components/tracking/` exception in `components/AGENTS.md`.
- [ ] If Back navigation to `/movies` still shows a stale bookmark after `refresh()` (AC-20), treat it as a bug for `/debug`, not a reason to cache private state.
- [ ] Feature 9 may show `watched_at` in the Watched list; this spec stores it but displays nothing about it.
