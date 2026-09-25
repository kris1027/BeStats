# 0011. Episode and season tracking: watched, personal rating and mark season watched

**Date**: 2026-09-25
**Status**: In Progress

Scope feature: [12. Episode and season tracking](../../scope/scope.md) · GA tier

## Summary

This decides how a signed in user marks TV episodes watched, rates them from 1 to 10, and marks a whole season watched in one click. Everything happens on the season page: each episode row gets the same Watched and score pills movies already have, and the season header gets a "Mark season watched" button with a "4 of 10 watched" count. An episode counts as aired when its TMDB air date is today or earlier in UTC (the world reference clock); future episodes show a quiet "Upcoming" label, episodes with no date can still be marked one at a time, and the season button only ever marks aired ones. Writes whose result depends on the current row run as small Postgres functions, so repeated clicks and two open tabs can never move a date or wipe a rating.

## Requirements

**User stories**:
- As a signed in user, I want to mark an episode watched and give it a score from 1 to 10, so that I keep an honest record of what I saw and what I thought of it.
- As a signed in user, I want to mark a whole season watched in one click, and undo it if I misclicked, so that catching up on a show I already saw is quick and safe.
- As a signed in user, I want future episodes to be clearly unavailable to mark, so that my history only holds what I could actually have watched.
- As a signed in user, I want my changes to survive a reload and a second browser, and to be told plainly when a save fails, so that I can trust what the screen says.
- As a visitor, I want the season pages to stay fast and uncluttered, so that browsing works without an account.

**Acceptance criteria**:

- **AC-1**: Signed in, every episode row on `/shows/{id}/season/{n}` that is eligible (AC-3: aired or no date) shows two controls in the row's reserved `tracking` place, below the overview: the watched pill ("Mark watched" with the outline circle check, or "Watched" with the filled near white circle check) and the score pill (the cyan score look reading "Not rated" or the integer). Both reuse the spec 0007 pill recipe, icons and `ScorePicker` unchanged, including its keyboard rules (spec 0007, AC-7) and colour meanings (spec 0007, AC-10). The watched pill keeps a fixed accessible name "Mark {episode label} watched" and reports its state through `aria-pressed` only; the score pill's name includes the episode label and the current score or "Not rated". `{episode label}` is the episode name, or `Episode {number}` when TMDB gives none. On first paint the controls show the stored state, never a default that then corrects itself.
- **AC-2**: Signed in, a row whose air date is after today (AC-3) and which has no stored state shows a muted "Upcoming" label in the tracking place and no controls. A future dated row that already has stored state (watched or rated, for example because TMDB moved its date after it was marked) shows the controls instead, limited to removals so the state can still be removed: the watched pill can unmark but not mark, and the score picker offers "Clear rating" while its ten score choices are disabled under a note "Airs {date}". The `not_aired` refusal in AC-7 stays absolute.
- **AC-3**: An episode's air status is one of `aired` (TMDB air date on or before today), `upcoming` (after today) or `unknown` (no date, or a value that is not a real `YYYY-MM-DD` date). "Today" is the server's current date in UTC as `YYYY-MM-DD`, read once per request. The rule is one pure function in `lib/tv/air-status.ts`, used by the page and by every action, never evaluated inside a `use cache` scope, and unit tested at the boundary (yesterday, today and tomorrow in UTC, a missing date, a rolled over date such as `2013-02-30`).
- **AC-4**: Signed out, the season page shows no controls, no "Upcoming" label, no season button and no count; no skeleton appears, nothing errors, and the route still serves its prerendered shell. The same holds when the Supabase public configuration is missing or partial: the read checks `publicEnvProblems()` first and treats a problem as signed out.
- **AC-5**: Marking an episode watched sets `watched_at` to the server's `now()` when it was unwatched. Marking an already watched episode watched again (for example from a stale second tab) changes nothing, so the original date stays. Unmarking sets `watched_at` to null and leaves `rating` untouched. There is no confirm step for a single episode.
- **AC-6**: Picking a score stores it. When the episode was not watched, the same single statement also sets `watched_at` to `now()`; when it was already watched, `watched_at` is untouched. "Clear rating" sets `rating` to null and leaves `watched_at` untouched; the pill then reads "Not rated".
- **AC-7**: Before a write that can create state (mark one episode, rate, mark season), the action reads the season through the cached `loadSeason`. An unknown or adult show, a season the show does not list, or an episode id that is not in that season returns `not_found` and writes nothing (toast: "This episode isn't available to track."). A TMDB failure returns `tmdb_unavailable` and writes nothing. Marking or rating an episode whose air status is `upcoming` returns `not_aired` and writes nothing (toast: "This episode hasn't aired yet."). `season_number` and `episode_number` are taken from that TMDB response, never from the client. Removals (unmark, clear rating, unmark season, the Undo of mark season) skip TMDB, are updates only and never insert a row, so they keep working during a TMDB outage and for episodes TMDB later removes.
- **AC-8**: Signed in, the season header shows the season button and, beside it, the count "{w} of {a} watched", where `a` is the number of episodes in this season whose air status is `aired` and `w` is how many of those are watched. `unknown` and `upcoming` episodes are in neither number. The button reads "Mark season watched" when `a > 0` and `w < a`; "Season watched" with `aria-pressed="true"` when `a > 0` and `w = a`; and reads "Nothing aired yet", with the count hidden, when `a = 0`. That state uses `aria-disabled="true"` on a button that stays focusable and whose click does nothing (not the native `disabled` attribute, which would take it out of the keyboard order AC-23 checks). It has a 44px target on mobile and 36px from `md`.
- **AC-9**: "Mark season watched" marks, in one statement, every episode of the season whose air status is `aired` at the moment the action runs, taken from the TMDB season read and deduplicated by episode id. Unwatched ones get `watched_at = now()`; already watched ones keep their date; no rating is touched; `upcoming` and `unknown` episodes are never marked. Running it twice changes nothing the second time and never creates a second row for any episode. The statement succeeds or fails as a whole.
- **AC-10**: After a successful mark season, a toast reads "Marked {n} episodes watched" (singular "episode" when `n = 1`) with an "Undo" action. Undo clears `watched_at` on exactly those `n` episodes (the ids the write reported as newly marked), leaving episodes watched earlier and every rating untouched. When `n = 0` the toast reads "Every aired episode is already watched" with no Undo.
- **AC-11**: Clicking "Season watched" clears `watched_at` on every watched episode the page lists for this season, including `unknown` and `upcoming` ones marked one at a time, and keeps every rating. A toast reads "Unmarked {n} episodes" with "Undo". Undo puts back each episode's original `watched_at`, but only for rows that are still unwatched, were changed in the last 10 minutes, and whose date is not in the future. If no row qualifies, the toast reads the existing `undo_expired` copy.
- **AC-12**: The Specials page (`/shows/{id}/season/0`) gets the same row controls, the same season button and count, and the same rules. Nothing in this feature computes a show level progress or show level rating, so specials cannot affect either here (features 13 to 15 own those and exclude season 0).
- **AC-13**: Every control updates the moment it is clicked. Marking or unmarking the season flips every affected row and the count at once, and an episode click updates the count at once. If an action returns an error or its call rejects (offline, a server error, a deploy mismatch), every affected control returns to the last state the server confirmed and a toast explains why; a rejection uses the `write_failed` copy and never reaches an error boundary. No control shows a state the database does not hold once its write has settled.
- **AC-14**: If the session has expired when a control is clicked (`getOptionalUser()` returns null, or PostgREST answers `PGRST301` or `PGRST303`), the action writes nothing and returns `session_expired`; the controls roll back and the toast reads "Your session expired. Sign in to save this." with a "Sign in" action linking to `/sign-in?next=<the page's path>`.
- **AC-15**: An action receiving malformed input (a show or episode id that is not a positive 32 bit integer, a season number that is not an integer from 0 to 32767, a rating outside 1 to 10 or not an integer, a non boolean flag, an episode id list that is empty, longer than 1000 or holds a bad id, a restore entry with an unparsable or future date) returns `invalid_input` before any Supabase or TMDB call. The database constraints from spec 0001 and the new functions reject the same values independently.
- **AC-16**: Rapid clicks queue rather than being dropped. Double clicking the watched pill, picking 7 then 8, or clicking the season button twice leaves the stored rows equal to the last click, and repeated identical writes leave exactly one row per user and episode.
- **AC-17**: If reading the user's episode state fails while TMDB succeeds, the season header shows "Couldn't load your tracking." with a "Try again" link that reloads the page, the rows show no controls and no "Upcoming" label, and the catalog content renders normally. The failure is logged.
- **AC-18**: One season page render makes exactly one Supabase read for all its rows and its header together, checked by counting requests in the local Supabase API log during a running app check.
- **AC-19**: `user_id` on every write comes from the verified session, never from the client. The five new functions are `SECURITY INVOKER` with `search_path` set to empty and executable by `authenticated` only (no execute for `anon` or `PUBLIC`). Acting as user A, calling any function or action, or any direct RPC or REST request, can never read or change user B's episode rows; pgTAP proves this for every function.
- **AC-20**: No tracking state enters a `use cache` scope or any shared cache. The request scoped read lives in `lib/tracking/` and is called only from `components/tracking/`, inside Suspense boundaries with `fallback={null}`. The request scope test is relaxed so `app/shows` and `components/show` may import `components/tracking/`, and still may not call `cookies()`, `headers()`, a Supabase client or `@/lib/auth/user` directly; `app/shows/actions.ts` is exempt, like `app/movies/actions.ts`. The season route still builds as a partially prerendered route, and the TMDB reads keep their cache profiles.
- **AC-21**: After a successful write, the action calls `refresh()` from `next/cache`. Marking a season, moving to the next season and pressing Back shows the marked state.
- **AC-22**: Failed actions log one line with an event and an outcome class only (for example `episode_tracking.rate refused session_expired`). No user id, email, show id, episode id, count or rating appears in any log line. Successful writes are not logged.
- **AC-23**: At 375px the row pills and the header button with its count wrap with no horizontal page scroll, every control meets the 44px target, the picker's two rows of five fit on screen, and every control shows the visible focus ring when reached by keyboard.
- **AC-24**: No action or function in this feature creates, changes or deletes a `user_show_state` row. Tests assert the table is untouched after every write path.
- **AC-25**: Episode rows whose episode id TMDB no longer lists for the season are kept, never deleted, and never shown or counted on the page.

## Decision

**Chosen option**: Option 2: Server Actions with a season scoped optimistic store, and invoker functions for the writes that depend on the current row.

Server Actions in `app/shows/actions.ts` validate, authenticate, confirm the episode or season with TMDB for writes that can create state, check air status with one pure rule, and write through Row Level Security; five small `SECURITY INVOKER` Postgres functions carry the conditional writes (keep the first watched date, rate and mark together, bulk mark with a report of what changed, bulk unmark with the old dates, bounded restore). A client store wrapping the season page holds pending optimistic intents so the header and every row move together, and `refresh()` converges them on the server's truth.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (extends `design/`, approved in this spec)

`design/` draws no season page, no episode control and no season action. Everything below reuses pieces specs 0004, 0007 and 0009 already defined.

- **Episode row.** In `EpisodeRow`'s existing `tracking` place (spec 0009), a `flex flex-wrap gap-2` row after the overview holding the watched pill and the score pill, built with `glassPillClassName` and the icons in `components/tracking/tracking-icons.tsx`, at `h-11` base and `h-9` from `md`. The score pill opens the existing `ScorePicker` in the shadcn `Popover`, titled "Your score".
- **Upcoming label.** In the same place: muted `text-text-secondary` text "Upcoming", no pill, no icon, not interactive.
- **Season header.** In `SeasonHeader`'s existing `tracking` place (spec 0009, shared later with feature 13's season rating): a `flex flex-wrap items-center gap-3` row holding the season button (the watched pill recipe: outline circle check with "Mark season watched", filled near white circle check with "Season watched", or the muted `aria-disabled` look with "Nothing aired yet") and the count in `text-sm text-text-secondary`. Accessible name "Mark {season name} watched" with `aria-pressed` for the two enabled states.
- **Toasts.** The existing Sonner `<Toaster />`. Failures replace each other per control through one toast id (`episode-{episodeId}-{control}`, `season-{showId}-{seasonNumber}`). The two season success toasts carry "Undo" through the same action slot spec 0008 uses on the list pages.
- **Loading.** Every tracking Suspense boundary uses `fallback={null}`; signed in users see the controls appear once the read returns.
- **Read failure (AC-17).** In the header's tracking place: muted "Couldn't load your tracking." with a `RetryLink` to the same page; rows render nothing in theirs.

### Data model sketch

No table or column changes. `user_episode_state` from spec 0001 is used as is:

| Column | Type | Null | Role in this feature |
|---|---|---|---|
| `user_id` | `uuid` | no | owner, from the session; PK part; FK `auth.users(id)` on delete cascade |
| `episode_id` | `integer` | no | TMDB episode id; PK part; `check (episode_id > 0)` |
| `show_id` | `integer` | no | TMDB show id; `check (show_id > 0)` |
| `season_number` | `smallint` | no | from the TMDB season read at write time; `>= 0`, 0 is Specials |
| `episode_number` | `smallint` | no | from the TMDB season read at write time; `>= 1` |
| `watched_at` | `timestamptz` | yes | null means unwatched; set to `now()` in Postgres, restored only by the bounded Undo |
| `rating` | `smallint` | yes | the personal score; `check (rating between 1 and 10)` |
| `created_at`, `updated_at` | `timestamptz` | no | trigger maintained; `updated_at` also measures the Undo window |

Relationship: `auth.users` 1:N `user_episode_state`. No link to `user_show_state` (spec 0001 keeps them independent). Rows are created only by a creating write (mark, rate, mark season). A row emptied by removals is kept, never deleted. The existing `user_episode_state_show_order_idx (user_id, show_id, season_number, episode_number)` serves the page read's `user_id, show_id` prefix; the `episode_id` filter is then applied to at most one season's rows, so no new index is needed.

**New database functions** (declared in `supabase/schemas/05-functions.sql`; each `security invoker`, `set search_path = ''`, fully qualified names, `revoke all ... from public, anon, authenticated` then `grant execute ... to authenticated`, written in the schema file and carried into each generated migration by hand, the trap spec 0007 documents):

- `public.mark_episode_watched(p_show_id integer, p_season_number smallint, p_episode_number smallint, p_episode_id integer) returns public.user_episode_state`, `language sql`:
  `insert (user_id, episode_id, show_id, season_number, episode_number, watched_at) values (auth.uid(), ..., now()) on conflict (user_id, episode_id) do update set watched_at = coalesce(s.watched_at, now()) returning *`. It never touches `rating`, `show_id` or the numbers on conflict.
- `public.rate_episode(p_show_id integer, p_season_number smallint, p_episode_number smallint, p_episode_id integer, p_rating smallint) returns public.user_episode_state`, `language sql`: the same shape, also setting `rating = excluded.rating`.
- `public.mark_season_watched(p_show_id integer, p_season_number smallint, p_episode_ids integer[], p_episode_numbers smallint[]) returns integer[]`, `language plpgsql`: raises `22023` when the two arrays differ in length, are empty or exceed 1000 entries. Inserts `select distinct on (id) ... from unnest(p_episode_ids, p_episode_numbers) ... order by id, episode_number` with `watched_at = now()`, `on conflict (user_id, episode_id) do update set watched_at = now() where s.watched_at is null returning episode_id`, and returns those ids as the newly marked set (rows already watched are skipped by the `where` and not returned). The `distinct on` makes a duplicate id harmless even if the TypeScript deduplication regresses (spec 0001's `21000` trap).
  A `do update ... where` that is false skips that row without an error and leaves it out of `returning`; the migration carries a one line comment saying so, since it is not obvious Postgres behaviour.
- `public.unmark_episodes_watched(p_show_id integer, p_episode_ids integer[]) returns table (episode_id integer, watched_at timestamptz)`, `language plpgsql`: raises `22023` when the array is empty or exceeds 1000 entries, then runs one statement, `with old as (select episode_id, watched_at from public.user_episode_state where user_id = auth.uid() and show_id = p_show_id and episode_id = any(p_episode_ids) and watched_at is not null for update) update ... set watched_at = null from old where ... returning old.episode_id, old.watched_at`. It reports the dates it cleared, which a plain PostgREST update cannot (it returns only the new values). Used by unmark season and by the Undo of mark season.
- `public.restore_episodes_watched(p_show_id integer, p_entries jsonb) returns integer`, `language plpgsql`: `p_entries` is an array of `{ "episode_id": int, "watched_at": timestamptz }`; it raises `22023` when the array is empty or exceeds 1000 entries, and reads the entries with `jsonb_to_recordset(p_entries) as e(episode_id integer, watched_at timestamptz)`, so a malformed entry sent by a direct RPC fails the cast and the whole call errors (mapped to `write_failed`, logged `db_error`). Updates `set watched_at = entry.watched_at where user_id = auth.uid() and show_id = p_show_id and episode_id = entry.episode_id and watched_at is null and entry.watched_at <= now() and updated_at > now() - interval '10 minutes'`, returns the number restored, and raises `P0002` (`undo_expired`, as spec 0008's restores do) when that number is 0. It never inserts and never touches `rating`.

Three migrations, one per slice that needs them (see Build plan): `mark_episode_watched`; `rate_episode`; then the three season functions.

### State transitions

Per user and episode, two independent facts with one coupling:

```
mark watched ─────► watched_at = coalesce(old, now())         (rating kept)
unmark ───────────► watched_at = null                         (rating kept)
rate n ───────────► rating = n; watched_at = coalesce(old, now())
clear rating ─────► rating = null                             (watched kept)
mark season ──────► for each aired episode: watched_at = coalesce(old, now())
unmark season ────► for each listed watched episode: watched_at = null
undo mark season ─► the newly marked ids: watched_at = null
undo unmark ──────► each cleared row: watched_at = its old date (bounded)
```

Per season, the header state is derived, never stored: `none aired` (`a = 0`) · `partly watched` (`w < a`) · `season watched` (`w = a > 0`).

### API surface

All five are Server Actions in `app/shows/actions.ts` (`"use server"`), called directly with arguments inside a transition, never through a form post. They follow the `runTrackingWrite` order from `app/movies/actions.ts`: Zod parse, then `getOptionalUser()`, then (creating writes only) `loadSeason` plus the episode lookup and air status check, then the write, then `refresh()` on success only. None throws or redirects; the client wraps every call in `try`/`catch` and treats a rejection as `write_failed`.

Types in `lib/tracking/types.ts`: `EpisodeTrackingState = { watched: boolean; rating: number | null }`; `EpisodeTrackingError = MovieTrackingError | "not_aired"`; `EpisodeTrackingResult = { ok: true } | { ok: false; error: EpisodeTrackingError }`; `SeasonWatchedResult = { ok: true; undo: SeasonUndo | null } | { ok: false; error: EpisodeTrackingError }` where `SeasonUndo = { kind: "unmark"; episodeIds: number[] } | { kind: "restore"; entries: { episodeId: number; watchedAt: string }[] }`.

| Action | Key inputs | Write | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `setEpisodeWatched` | `showId:int` (req), `seasonNumber:int` (req), `episodeId:int` (req), `watched:boolean` (req) | `true`: rpc `mark_episode_watched` with the TMDB numbers; `false`: `update { watched_at: null } where user_id, episode_id` | `EpisodeTrackingResult` | session | `invalid_input`, `session_expired`, `not_found`, `tmdb_unavailable`, `not_aired` (creating only), `write_failed` |
| `setEpisodeRating` | same ids, `rating:int\|null` (req) | number: rpc `rate_episode`; null: `update { rating: null } where user_id, episode_id` | `EpisodeTrackingResult` | session | same |
| `setSeasonWatched` | `showId:int` (req), `seasonNumber:int` (req), `watched:boolean` (req), `episodeIds:int[]` (req when `watched` is false: the ids the page rendered) | `true`: aired ids and numbers from `loadSeason`, deduplicated, rpc `mark_season_watched` (skipped with `undo: null` when none are aired); `false`: rpc `unmark_episodes_watched(showId, episodeIds)` | `SeasonWatchedResult`: `undo` is `{ kind: "unmark", episodeIds: <returned ids> }` or `{ kind: "restore", entries: <returned rows> }`, or null when nothing changed | session | `invalid_input`, `session_expired`, `not_found`, `tmdb_unavailable` (mark only), `write_failed` |
| `undoSeasonWatched` | `showId:int` (req), `undo: SeasonUndo` (req) | `unmark`: rpc `unmark_episodes_watched`; `restore`: rpc `restore_episodes_watched` | `EpisodeTrackingResult` | session | `invalid_input`, `session_expired`, `undo_expired`, `write_failed` |

Supabase error mapping reuses `classifyTrackingError` unchanged: `PGRST301`/`PGRST303` to `session_expired`; `42501` to `write_failed` logged `forbidden`; `P0002` to `undo_expired`; `22023` (the array guard) to `invalid_input`; anything else to `write_failed` logged `db_error`. An update that matches no row is a success.

Read (server only, `lib/tracking/episode-state.ts`, never inside `use cache`):

| Read | Inputs | Query | Output | Signed out |
|---|---|---|---|---|
| `getSeasonEpisodeTracking(showId, idsKey)`, exported as `cache(async (...) => ...)` like `getWatchlistedMovieIds` | show id and a comma joined sorted list of the whole season's TMDB episode ids, built once by `episodeIdsKey` in `SeasonDetail` and passed unchanged to the header slot and to every row slot (never a row's own id, or each row would make its own query and AC-18 breaks); both are primitives, so React `cache()` dedupes to one query per request | `publicEnvProblems()` first, then select `episode_id, watched_at, rating` where `user_id = user.id and show_id = showId and episode_id in (...)` | `TrackingRead<Record<number, EpisodeTrackingState>>`; a missing id means the empty state | `signed_out`, no query (also on an env problem) |

Pure domain modules:

| Module | Role |
|---|---|
| `lib/tv/air-status.ts` | `todayUtc(now: Date): string` and `airStatus(airDate: string \| null, today: string): "aired" \| "upcoming" \| "unknown"`, reusing the strict date parse behind `formatAirDate`. Features 14 to 16 import the same rule |
| `lib/tv/season-watch.ts` | `seasonWatchSummary(episodes, states, today)` returns `{ aired, watchedAired }` and the header state; `airedEpisodesForMarking(episodes, today)` returns the deduplicated ids and numbers |
| `lib/tracking/episode-intent.ts` | `applyEpisodeIntent(states, intent)` over a map of episode states, mirroring the SQL exactly: `watched`, `rating` (rating an unwatched episode also marks it), `season_mark` (the aired ids), `season_unmark` (the listed ids). Unit tested against the same cases as the pgTAP file |

Components:

| Component | Kind | Role |
|---|---|---|
| `components/tracking/season-tracking-store.tsx` | client | `SeasonTrackingStore` provider wrapping the season `<article>`; holds one `useOptimistic` list of pending intents and a `run(intents, action)` helper that queues calls, rolls back on failure and fires the toasts. It holds no user data of its own, so the page stays free of session reads |
| `components/tracking/season-tracking-slot.tsx` | server | calls `getSeasonEpisodeTracking` and `todayUtc`; renders nothing, the retry line, or `SeasonWatchedControl` with the confirmed states, the season's episodes (id, number, air date) and `today` (the UTC date string), so the client computes the same aired set for its optimistic `season_mark` intent as the server will |
| `components/tracking/season-watched-control.tsx` | client | the season button and count; computes its display from confirmed states plus the store's pending intents, using the `today` prop, never its own clock |
| `components/tracking/episode-tracking-slot.tsx` | server | same read (deduped); computes the row's air status with `todayUtc`; renders nothing, "Upcoming", or `EpisodeTrackingControls` with the confirmed state, the air status and the air date (for the "Airs {date}" note) |
| `components/tracking/episode-tracking-controls.tsx` | client | the watched pill and score pill for one episode, over confirmed state plus pending intents; removals only when the air status is `upcoming` (AC-2) |

**Optimistic convergence.** Every call goes through the store's `run`, inside one `startTransition`, so the pending intents live exactly as long as that transition. The action's response carries the refreshed tree from `refresh()`, and React commits it in the same transition; boundaries that already show content are kept rather than falling back during a transition, so the header and every row switch from the guess to the confirmed state in one commit, with no flash back. The running app check for AC-13 marks a season of at least 20 episodes and watches for any row flipping back.

The season page (`SeasonDetail`) wraps its `<article>` in `SeasonTrackingStore`, passes `<Suspense fallback={null}><SeasonTrackingSlot .../></Suspense>` to `SeasonHeader`'s `tracking`, and `EpisodeList` passes one `<Suspense fallback={null}><EpisodeTrackingSlot .../></Suspense>` per row to `EpisodeRow`'s `tracking`.

### Value sourcing

| Action | Value produced, computed or displayed | Source |
|---|---|---|
| any write | `user_id` | `auth.uid()` inside each function, or the verified session on plain updates; never a client field |
| creating writes | `show_id`, the season number | the action's `showId` and `seasonNumber`, Zod validated, then confirmed by `loadSeason` |
| creating writes | `episode_id` | the client's `episodeId` for single episodes, confirmed present in the TMDB season; for mark season, the TMDB season list itself |
| creating writes | `season_number`, `episode_number` stored on the row | the TMDB season response at write time (spec 0001) |
| mark, rate, mark season | `watched_at` | `now()` in Postgres |
| rate | `rating` | client input, Zod 1 to 10, again the CHECK constraint |
| mark, rate, mark season, page | "today" for air status | `todayUtc(new Date())` on the server, per request, outside any cache scope |
| mark, rate, mark season, page | each episode's air date | `Episode.airDate` from the cached `getSeason` read (`hours` profile), which is why today must not be evaluated inside that cache |
| mark season | the eligible list | `airedEpisodesForMarking(season.episodes, today)`, deduplicated by id |
| mark season toast | `n` and the Undo ids | the ids `mark_season_watched` returns |
| unmark season | which episodes | the episode ids the page rendered for this season, sent by the client; `unmark_episodes_watched` only ever touches the caller's own watched rows, which the caller may always unmark |
| unmark season toast | `n` and the dates to restore | the rows `unmark_episodes_watched` returns |
| undo unmark | the restored dates | the client passes back the `entries` the action returned; bounded in SQL (still unwatched, changed in the last 10 minutes, not in the future) |
| season header | `a` and `w` | `seasonWatchSummary` over the TMDB season episodes, the confirmed states and pending intents |
| episode row | label, air date, "Upcoming" | TMDB episode name or `Episode {number}`; `airStatus` |
| any read | confirmed states | `getSeasonEpisodeTracking`, one query per render |
| any write | `updated_at` | the `set_updated_at` trigger |

### Key invariants

- `user_id` always equals the verified session user. No action or function accepts an owner.
- No bulk or single mark ever touches `rating`; no unmark ever touches `rating`; clearing a rating never touches `watched_at` (`AGENTS.md` section 7).
- A watched episode's first `watched_at` never moves, except through a bounded Undo that puts back its own earlier value.
- Mark season never marks an `upcoming` or `unknown` episode. The air status rule exists once, in `lib/tv/air-status.ts`.
- Each episode id appears at most once in any bulk statement, enforced in TypeScript and again by `distinct on` in SQL.
- Exactly one row per user and episode. Removals never insert.
- No row in `user_show_state` is read or written by this feature.
- No season or show rating or progress value is stored anywhere.
- `today` is never computed inside a `use cache` scope; the air date is cached, the comparison is not.
- `lib/tracking/episode-intent.ts` and the SQL agree case for case, so no control flips twice.

### Security model

`user_episode_state` is private, user owned data. The spec 0001 policies (four per table, `to authenticated`, `(select auth.uid()) = user_id`, forced RLS) already cover it. All five functions are `SECURITY INVOKER`, so those policies apply inside them, including the conflict row and `returning`; the primary key includes `auth.uid()`, so a conflict is always the caller's own row. A null `auth.uid()` fails the `not null` on `user_id`, so an unauthenticated call cannot write. Execute is revoked from `public`, `anon` and `authenticated` and granted back to `authenticated` only. The client supplied inputs that reach SQL (ids, a rating, restore dates) can only ever affect the caller's own rows, and the only client supplied timestamp is bounded in SQL. The service role is not used. All reads and writes happen server side; the browser's Supabase client never queries the table. Compliance scope: none (viewing history is personal data, kept private and out of logs, `AGENTS.md` section 11).

### Configuration required

None. No new environment variables, secrets or providers.

### Critical test scenarios

- Happy path: user A marks episode 3 watched, rates episode 5 (which marks it too), marks the season watched and sees "Marked {n} episodes watched" with only the aired, unwatched ones counted; reload and a second browser show the same, verifies **AC-1**, **AC-5**, **AC-6**, **AC-8**, **AC-9**, **AC-10**.
- Boundary: with TMDB air dates of yesterday, today and tomorrow (UTC) and one missing, the rows show controls, controls, "Upcoming" and controls; mark season marks the first two only; a direct action call for tomorrow's episode returns `not_aired`, verifies **AC-2**, **AC-3**, **AC-7**, **AC-9**.
- Rating preservation: rate four episodes, mark season, unmark season, Undo, then Undo of a fresh mark; every rating is unchanged and original dates come back, verifies **AC-9** to **AC-11**.
- Failure case: the action rejects mid season mark (offline); every row and the count roll back and the `write_failed` toast shows; with the session expired, the Sign in toast shows and nothing is written, verifies **AC-13**, **AC-14**.
- Idempotency and races: double click the season button and pick 7 then 8 quickly; the rows equal the last click and the row count per episode is one; pgTAP calls `mark_season_watched` twice with a duplicated id, verifies **AC-9**, **AC-16**.
- Auth/permission: as user B, direct RPC calls to all five functions and REST updates with user A's episode ids change nothing and read nothing of A's; `anon` has no execute, verifies **AC-19**.
- Isolation from status: after every write path, `user_show_state` is unchanged, verifies **AC-24**.

## Build plan

Tracer Bullet: the first task is one thin real thread (a single watched pill, database to screen), then each strand thickens it end to end. Each database function lands in the slice that first needs it, so there are three small migrations.

1. The thin thread: `lib/tv/air-status.ts` with its boundary tests; `mark_episode_watched` in `05-functions.sql` with grants, its migration, regenerated types and pgTAP (own row, stale second call keeps the date, cross user refusal, `anon` refused, `user_show_state` untouched); `getSeasonEpisodeTracking`; `setEpisodeWatched` (both directions) with the `loadSeason` check, `not_aired`, the log events and `refresh()`; `SeasonTrackingStore`, `EpisodeTrackingSlot` and the watched pill in each row; the request scope test relaxed for `app/shows` with `app/shows/actions.ts` exempt. Verified in the running app with two browsers and as a prerendered shell in the build, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-14**, **AC-15**, **AC-19**, **AC-20**, **AC-21**, **AC-22**, **AC-24**
2. The rating strand: `rate_episode` with grants, migration, types and pgTAP; `setEpisodeRating`; the score pill and `ScorePicker` in each row; `lib/tracking/episode-intent.ts` for `watched` and `rating` with tests mirroring the pgTAP cases, satisfies **AC-1**, **AC-6**, **AC-13**, **AC-16**
3. The upcoming strand: `airStatus` in the row slot, the "Upcoming" label, and the removals only controls (with the "Airs {date}" note in the picker) for a future row that already has state, satisfies **AC-2**, **AC-3**
4. The season strand: `mark_season_watched`, `unmark_episodes_watched` and `restore_episodes_watched` with grants, one migration, types and pgTAP (idempotency, duplicate id, array guard, no rating touched, restore bounds, cross user); `lib/tv/season-watch.ts`; `setSeasonWatched` and `undoSeasonWatched`; the season slot, button, count and the two Undo toasts; the `season_mark` and `season_unmark` intents so rows and count move together, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-16**, **AC-19**
5. Failure, edge states and proof: the read failure line, the one read check in the Supabase API log, orphaned rows ignored, the Specials page pass, 375px and keyboard passes, component and action tests, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db`, `pnpm build`, and `verify.md`, satisfies **AC-12**, **AC-17**, **AC-18**, **AC-23**, **AC-25**

## Consequences

**Positive**:
- The movie tracking pattern (actions, result types, toasts, pill recipe, picker, log rules) is reused almost unchanged, so the episode controls look and behave like the movie ones.
- The air status rule and the season summary are pure, tested functions that features 14 to 16 import rather than reinvent.
- Conditional writes live in Postgres, so two tabs or a double click cannot move a first watched date or duplicate a row.
- One read per season page, whatever its length.

**Negative / tradeoffs**:
- UTC "today" can make an evening premiere in the Americas markable a few hours before it airs, and a late night one in Asia a few hours after. Accepted for simplicity; revisit only with a user timezone source.
- Episodes with no TMDB date can be marked one at a time but are never in the season count or the season action, which may surprise someone on an older show with patchy data.
- Five new functions widen the grant surface each migration must carry by hand; the pgTAP grant checks are what keep that honest.
- The client store adds a small amount of shared client state to a page that had none.
- `loadSeason` is cached for hours, so a TMDB date change reaches the eligibility check only when that cache refreshes.

**Neutral**:
- No schema change to tables; three function migrations.
- Adds `not_aired` to the tracking error union and its toast copy to `lib/tracking/messages.ts`, plus new `TRACKING_EVENT` names (`episode_tracking.watched`, `episode_tracking.rate`, `episode_tracking.read`, `season_tracking.watched`, `season_tracking.undo`).
- The request scope test changes shape for `app/shows`, as spec 0009 anticipated.

## Follow-up

- [ ] Feature 14 hooks the "new or Want to Watch becomes Watching" rule into these write paths and adds overall progress; it should reuse `lib/tv/air-status.ts` and `lib/tv/season-watch.ts`.
- [ ] Feature 13 places the calculated season rating beside the season button in the same header slot.
- [ ] If users report early or late availability, revisit the UTC boundary with a timezone source (a cookie set from the browser), updating `todayUtc` in one place.
