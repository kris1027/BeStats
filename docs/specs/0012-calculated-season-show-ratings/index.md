# 0012. Calculated season and show ratings: pure averages over your episode scores

**Date**: 2026-09-25
**Status**: In Progress

Scope feature: [13. Calculated season and show ratings](../../scope/scope.md) · GA tier

## Summary

This decides how BeStats turns your episode scores into a season rating and a show rating, and where you see them. A season rating is the plain average of the episodes you rated in it; a show rating is the average of your rated regular seasons, each season counting once no matter how long it is, with Specials left out. Both are worked out on every page view by small pure TypeScript functions (code with no database or network access, easy to test) over rows you already store, so nothing new is saved and nothing can go stale. You see the season rating in the season page header, a badge on each season card, and the show rating beside the "Seasons" heading on the show page, always labelled as yours and always one decimal, or "Not rated".

## Requirements

**User stories**:
- As a signed in user, I want each season I rated to show my average score, so that I can compare seasons at a glance.
- As a signed in user, I want one overall rating for a show that treats every season fairly, so that a long season does not drown out a short one.
- As a signed in user, I want the rating to change the moment I score an episode, so that I trust it reflects what I just did.
- As a signed in user, I want to see what a calculated rating is based on and that Specials are left out, so that the number never looks arbitrary.
- As a visitor, I want the show and season pages to stay fast and free of empty personal widgets, so that browsing works without an account.

**Acceptance criteria**:

- **AC-1**: `lib/tv/ratings.ts` holds the pure rules. `seasonRating(ratings)` returns `{ mean, ratedEpisodes }`, where `mean` is the arithmetic mean of the given integer episode ratings, or `null` when there are none. Unrated episodes never enter the list, so they are excluded, never counted as zero.
- **AC-2**: `showRating(seasons)` takes each season's number and its `seasonRating` result and returns `{ mean, ratedSeasons, specialsRated }`, with `mean` the arithmetic mean of the season means of every season whose number is 1 or more and whose `seasonRating` is not null. Season 0 (Specials) and seasons with no rated episode are excluded. Every included season has equal weight, whatever its episode count or how many of its episodes were rated. No included season gives a `null` mean. Worked check from `AGENTS.md` section 9: season 1 rated 8 over 10 episodes and season 2 rated 6 over 2 episodes gives exactly 7.
- **AC-3**: Means keep full floating point precision through both steps; nothing is rounded before display. `formatCalculatedRating(value)` in `lib/format.ts` returns `"Not rated"` for `null`, otherwise the value rounded half up to one decimal with a `1e-9` tolerance (`Math.round(value * 10 + 1e-9) / 10`, then `toFixed(1)`), so `7` reads `7.0`, `10` reads `10.0`, `7.25` reads `7.3`, `8.05` reads `8.1` and `22 / 3` reads `7.3`. It never produces `0.0` for a missing rating. Explicit movie and episode scores keep `formatPersonalScore` unchanged (integers, no decimal).
- **AC-4**: A stored episode rating counts whether or not the episode is marked watched, and whatever its air status, because watched state and rating are separate facts (`AGENTS.md` section 7). Clearing an episode's rating removes it from every average; unmarking an episode does not.
- **AC-5**: Signed in, the season page header (`/shows/{id}/season/{n}`, Specials included) shows, in the same wrapping row as the season button and count, the text "Your season rating", then the cyan score pill (the `PersonalScoreBadge` look) reading `formatCalculatedRating` of `seasonRating` over the ratings of the episodes this page lists, then a muted basis "from {k} rated episodes" (singular "episode" when `k = 1`). When no listed episode is rated, the pill reads "Not rated" and the basis is hidden. The value comes from the page's existing single tracking read (spec 0011, AC-18): no extra query.
- **AC-6**: Picking or clearing an episode score on the season page updates the season rating and its basis in the same commit as the score pill, from the confirmed states plus the season store's pending intents (spec 0011). If the write fails, the rating returns to its confirmed value with the pill. Marking or unmarking an episode or the season never changes the rating.
- **AC-7**: Signed in, the show page (`/shows/{id}`) shows the show rating in the "Seasons" section heading row, after the `h2`: the text "Your show rating", the cyan score pill reading `formatCalculatedRating` of `showRating`, and a muted basis "from {s} rated seasons" (singular "season" when `s = 1`), followed by " · Specials not included" only when Specials holds at least one rating. With no rated regular season the pill reads "Not rated" and the basis shows only "Specials not included" when Specials is rated, else nothing.
- **AC-8**: Signed in, each season card on the show page whose season has at least one stored rating shows a cyan calculated rating badge in the card's top right `badge` slot, reading `formatCalculatedRating` of that season's `seasonRating`, with the accessible text "Your season rating {value}". The Specials card follows the same rule. A season with no rating shows no badge. The card's link name stays the season name.
- **AC-9**: The show page's rating data comes from one Supabase read per render, shared by the heading and every card through React `cache()` keyed by the show id: `select season_number, rating from user_episode_state where user_id = <session user> and show_id = <id> and rating is not null`, grouped by the stored `season_number`. Rows for episodes TMDB has since removed or renumbered are counted under their stored season (accepted, see Consequences). Verified by counting requests in the local Supabase API log during a running app check.
- **AC-10**: Signed out, or with the Supabase public configuration missing or partial (`publicEnvProblems()`), neither page shows any rating label, pill, basis or card badge, no skeleton appears, nothing errors, and both routes still serve their prerendered shells.
- **AC-11**: If the show page's rating read fails, the "Seasons" heading row shows "Couldn't load your tracking." with a "Try again" link to `/shows/{id}`, no card shows a badge, and the rest of the page renders normally. The failure logs one line, `show_tracking.rating_read refused db_error`, with no user id, show id or rating. On the season page, a failed read keeps spec 0011's existing retry line and shows no rating.
- **AC-12**: After scoring an episode on a season page, pressing Back or following the show link shows the updated show rating and card badge; a reload and a second signed in browser show the same values.
- **AC-13**: No rating value enters a `use cache` scope or any shared cache. The new read lives in `lib/tracking/` and is called only from `components/tracking/`, inside Suspense boundaries with `fallback={null}`. `user_id` comes from the verified session, and Row Level Security (the database rule that limits each row to its owner) from spec 0001 applies; acting as user B, no page, action or direct REST request shows user A's calculated or episode ratings.
- **AC-14**: No season or show rating is stored anywhere. This feature adds no table, column, migration or database function, and performs no writes.
- **AC-15**: Personal and TMDB ratings stay visibly distinct: calculated ratings always use the cyan score look plus the word "Your" (visible in the header and heading, screen reader text on cards), never the amber TMDB badge, and the TMDB rating block keeps its "TMDB" label.
- **AC-16**: At 375px the season header row, the "Seasons" heading row and the card badges wrap or fit with no horizontal page scroll. The rating elements are not interactive and add no tab stop.
- **AC-17**: `lib/tv/ratings.test.ts` covers the `AGENTS.md` worked example, unrated episodes excluded, a season with no ratings excluded, season 0 excluded (including a show rated only in Specials giving `null`), unequal season lengths not changing the weight, a single rated episode, and the rounding cases in AC-3. Component tests cover the Not rated, singular and plural basis, Specials note and failure states.

## Decision

**Chosen option**: Option 1: pure TypeScript rules over the rows already stored, computed at read time.

`lib/tv/ratings.ts` computes season and show averages from plain `{ seasonNumber, rating }` inputs; the season page feeds it from its existing tracking read (plus pending intents), the show page from one new request scoped read grouped by stored season number, and nothing derived is persisted.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (extends `design/`, approved in this spec)

`design/` draws no season header rating, no show rating and no season card badge. Everything reuses pieces specs 0004, 0007, 0009 and 0011 already define.

- **Calculated badge.** A new `CalculatedRatingBadge` in `components/rating-badges.tsx`: the `PersonalScoreBadge` recipe (`GlassPill tone="score"`, cyan star) with its text from `formatCalculatedRating`, and an optional `label` prop for a screen reader prefix (no default: when omitted, no hidden prefix renders). Only the season card passes it ("Your season rating"), since it has no visible label; the header and heading omit it because their visible label already names the value, so a screen reader never hears the label twice. Kept a separate named component so an explicit score and an average can never share a formatter by accident.
- **Season header.** Inside spec 0011's `data-slot="season-tracking"` row, after the count: a `span` group `inline-flex flex-wrap items-center gap-2` holding "Your season rating" (`text-sm text-text-secondary`), the badge, and the basis (`text-sm text-text-secondary`). The "Nothing aired yet" branch keeps the rating group too, since specials and old seasons can hold ratings for undated episodes: the same group is appended after the disabled button, and that branch's row gains `items-center` to match the normal row. Its button keeps its own `aria-label` unchanged.
- **Show page heading row.** The "Seasons" `h2` moves into a `div` `flex flex-wrap items-center justify-between gap-x-4 gap-y-2`; the show rating group (same pieces, label "Your show rating") sits on the right from `md` and wraps below the heading on a phone.
- **Season cards.** `SeasonGrid` passes each `PosterCard` a `badge` of `<Suspense fallback={null}><SeasonRatingBadgeSlot .../></Suspense>`; the slot renders the badge or nothing. Unlike `library-card.tsx`, which passes `undefined` when there is no badge, the value here is only known after the async read, so `PosterCard`'s badge wrapper always mounts; with an empty child it has no size, background or border and collapses to 0×0. The 375px pass confirms an unrated card shows no mark.
- **Loading.** Every new boundary uses `fallback={null}`; ratings appear once the read returns.
- **Read failure.** In the show heading row's rating place: muted "Couldn't load your tracking." plus `RetryLink` to `/shows/{id}`, the same pieces as the season header.

### Data model sketch

No schema change. The feature reads `user_episode_state` from spec 0001 as is:

| Column | Type | Null | Role here |
|---|---|---|---|
| `user_id` | `uuid` | no | owner, from the session; RLS filter |
| `show_id` | `integer` | no | the show being rated |
| `episode_id` | `integer` | no | season page filter (only listed episodes) |
| `season_number` | `smallint` | no | groups ratings into seasons on the show page; 0 is Specials |
| `rating` | `smallint` | yes | the explicit 1 to 10 score; null rows are excluded |

Relationship: `auth.users` 1:N `user_episode_state`. The existing index `user_episode_state_show_order_idx (user_id, show_id, season_number, episode_number)` serves the show read's `user_id, show_id` prefix; the `rating is not null` filter runs over at most one show's rows, so no new index.

Derived, never stored:

```
episode ratings (1..10, per listed or stored episode)
  └─ seasonRating(season) = mean(rated episodes)            null if none
       └─ showRating(show) = mean(seasonRating of seasons ≥ 1, non null)   null if none
```

### State transitions

None. Ratings are pure functions of the stored episode ratings at read time; the only state is spec 0011's.

### API surface

No new actions or routes. One new read, two pure modules, four components.

Read (server only, `lib/tracking/show-ratings.ts`, never inside `use cache`):

| Read | Inputs | Query | Output | Signed out |
|---|---|---|---|---|
| `getShowEpisodeRatings(showId)`, exported as `cache(async (showId: number) => ...)` | the show id (primitive, so `cache()` dedupes the heading and every card to one query) | `publicEnvProblems()` first, then `getOptionalUser()`, then `select season_number, rating` where `user_id = user.id and show_id = showId and rating is not null` | `TrackingRead<{ seasonNumber: number; rating: number }[]>` | `signed_out`, no query (also on an env problem) |

On error it logs `TRACKING_EVENT.showRatingRead` (`"show_tracking.rating_read"`) with `db_error` and returns `{ kind: "failed" }`.

Pure modules:

| Module | Exports | Role |
|---|---|---|
| `lib/tv/ratings.ts` | `seasonRating(ratings: readonly number[]): SeasonRatingResult \| null` with `SeasonRatingResult = { mean: number; ratedEpisodes: number }`; `ratingsBySeason(rows: readonly { seasonNumber: number; rating: number }[]): Map<number, SeasonRatingResult>`; `showRating(seasons: ReadonlyMap<number, SeasonRatingResult>): { mean: number \| null; ratedSeasons: number; specialsRated: boolean }`, with `mean` null and `ratedSeasons` 0 when no season is included, and `specialsRated` true when the map holds season 0; `REGULAR_SEASON_MIN = 1` | the AGENTS.md section 9 rules, once; no imports beyond types |
| `lib/format.ts` | `formatCalculatedRating(value: number \| null): string` | one decimal, half up with tolerance, "Not rated" |

Components:

| Component | Kind | Role |
|---|---|---|
| `components/rating-badges.tsx` | server safe | adds `CalculatedRatingBadge({ value, label })` |
| `components/tracking/season-rating.tsx` | client | `SeasonRating({ episodes, states })`: `useEpisodeStates(states)` from the season store, collects the `rating` of each listed episode that has one, renders the header group; rendered by `SeasonWatchedControl` inside its row so it shares the store and the row layout |
| `components/tracking/show-rating-slot.tsx` | server | calls `getShowEpisodeRatings`; renders nothing, the retry line, or the "Your show rating" group |
| `components/tracking/season-rating-badge-slot.tsx` | server | same read (deduped); renders `CalculatedRatingBadge` for its `seasonNumber` or nothing (also nothing on `failed`, since the heading carries the retry line) |

`app/shows/[id]/page.tsx` wraps the Seasons heading in the row and adds `<Suspense fallback={null}><ShowRatingSlot showId={id} /></Suspense>`; `SeasonGrid` gains the `badge` per card. `SeasonTrackingSlot` needs no new data: the episode ids and confirmed states it already passes contain every rating.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| season header | the ratings averaged | `rating` of each episode in the page's TMDB episode list, from `getSeasonEpisodeTracking` confirmed states with the store's pending `rating` intents applied (`applyEpisodeIntent`) |
| season header | `mean`, `k` | `seasonRating` over those ratings |
| season header | display text | `formatCalculatedRating(mean)` |
| show heading | per season ratings | `getShowEpisodeRatings(showId)` rows, grouped by stored `season_number` via `ratingsBySeason` |
| show heading | `mean`, `s` | `showRating` over that map (seasons 1 and up only) |
| show heading | "Specials not included" | `showRating(...).specialsRated` (the map has season 0) |
| season card | badge value | `ratingsBySeason(...).get(season.seasonNumber)` from the same deduped read; the card's season number comes from `show.seasons` (TMDB) |
| any read | `user_id` | the verified session (`getOptionalUser()`), never a client value |
| any read | show id | the route param, parsed by `parseTmdbId`, confirmed by `loadShow` |
| any display | rounding rule | decided here (AC-3): half up to one decimal, `1e-9` tolerance |
| read failure | copy | `TRACKING_READ_FAILED` in `lib/tracking/messages.ts` |

### Key invariants

- No season or show rating is persisted; each is computed at read time from `user_episode_state.rating`.
- An unrated episode never contributes, and no rating is ever treated as zero.
- Season 0 never contributes to a show rating; it always gets its own season rating.
- Every included regular season has weight exactly 1 in the show mean.
- Rounding happens only in `formatCalculatedRating`, never inside `lib/tv/ratings.ts`.
- The rules live once in `lib/tv/ratings.ts`; the season page, show heading and cards all call it.
- No rating value is computed inside `use cache` or reaches a shared cache.

### Security model

The only data touched is the user's own episode ratings, private user owned data. Reads run on the per request server client under the user's session, filtered by `user_id = user.id` and, independently, by spec 0001's forced RLS select policy (`(select auth.uid()) = user_id`, `to authenticated`). No new function, grant, write, or elevated role; the service role is not used. The browser Supabase client never queries the table. Nothing is cached across users, and logs carry an event and outcome class only (`AGENTS.md` section 11). Compliance scope: none beyond keeping viewing history private.

### Configuration required

None. No new environment variables, secrets or providers.

### Critical test scenarios

- Happy path: user A rates Breaking Bad season 1 episodes 8, 8, 8 and season 2 episode 6; the season 1 header shows "Your season rating 8.0 from 3 rated episodes", the show heading shows "Your show rating 7.0 from 2 rated seasons", and cards 1 and 2 carry 8.0 and 6.0, verifies **AC-2**, **AC-5**, **AC-7**, **AC-8**.
- Exclusions: rate one Specials episode 10 and leave season 3 unrated; the show rating stays 7.0 with "· Specials not included", the Specials card shows 10.0, season 3 shows no badge, verifies **AC-1**, **AC-2**, **AC-7**, **AC-8**.
- Optimistic and rollback: pick 9 then clear it on the season page and watch the header move with the pill; go offline and pick a score, and the rating returns with the pill, verifies **AC-6**.
- Separation: unmark a rated episode; every rating stays the same; clear its rating; it leaves the averages, verifies **AC-4**.
- Freshness and one read: rate on a season page, press Back, the show heading and card match; the Supabase API log shows one rating read per show page render, verifies **AC-9**, **AC-12**.
- Failure case: make the show read fail; the heading shows the retry line, no badges, the rest renders, one clean log line, verifies **AC-11**.
- Auth/permission: signed out sees nothing and the shells still prerender; as user B, the pages and a direct REST select show none of A's ratings, verifies **AC-10**, **AC-13**.

## Build plan

Tracer Bullet: the first task is one thin real thread (the season rating, database to screen, from the read that already exists), then each strand thickens it end to end. No migration in any task.

1. The thin thread: `lib/tv/ratings.ts` with `seasonRating`, `ratingsBySeason` and `showRating` and their unit tests; `formatCalculatedRating` with the rounding tests; `CalculatedRatingBadge`; `SeasonRating` in the season header computed from the confirmed states only, with the label, Not rated and basis states, verified in the running app on a regular season and on Specials, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-14**, **AC-15**, **AC-17**
2. The optimistic strand: feed `SeasonRating` through `useEpisodeStates` so pending `rating` intents move it with the pill and roll back with it, satisfies **AC-6**
3. The show strand: `getShowEpisodeRatings` with the log event; `ShowRatingSlot` in the new Seasons heading row with its Not rated, Specials note and retry states; the request scope test still passing for `app/shows`, satisfies **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**
4. The card strand: `SeasonRatingBadgeSlot` in each season card's `badge`, sharing the deduped read, satisfies **AC-8**, **AC-9**
5. Proof: 375px and keyboard passes (including an unrated season card showing no badge mark), two browsers for isolation, spec 0011's season control tests updated for the "Nothing aired yet" branch and passing, the API log read count, component tests, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (both routes still partially prerendered), and `verify.md`, satisfies **AC-10**, **AC-13**, **AC-16**, **AC-17**

## Consequences

**Positive**:
- The rules sit in one small pure module with the `AGENTS.md` example as a test, so every place that shows a rating agrees by construction.
- Nothing derived is stored, so a rating can never drift from the episode scores behind it.
- The season page costs no extra query; the show page costs one small indexed read.
- Features 14 and 15 (watchlist TV cards, Up Next) can import `showRating` unchanged.

**Negative / tradeoffs**:
- The show page groups by the season number stored at write time and counts every stored rating, while the season page counts only episodes TMDB lists now. If TMDB deletes or renumbers an episode, the season card and show rating can differ slightly from the season header until the user clears that rating. The same holds when TMDB removes a whole season the user rated: it still counts in the show mean and in "from {s} rated seasons" with no card on the page. Accepted as rare; fixing it would cost a TMDB read per season on every show page.
- The show page gains its first request scoped reads, adding a small streamed piece after the shell for signed in users.
- The `1e-9` tolerance means a true value within a billionth below a tie displays rounded up; harmless at one decimal, but it is a documented approximation rather than exact rational arithmetic.

**Neutral**:
- Adds `formatCalculatedRating` next to `formatPersonalScore`, `CalculatedRatingBadge` next to `PersonalScoreBadge`, and the `showRatingRead` event name.
- The "Seasons" heading changes from a lone `h2` to a heading row; `SeasonGrid` starts filling the `badge` slot spec 0009 left empty on season cards.

## Follow-up

- [ ] Feature 14 puts the status control in the show hero's reserved place; the show rating stays in the Seasons heading row.
- [ ] Features 14 and 15 reuse `showRating` and `formatCalculatedRating` if TV watchlist or Up Next cards show a personal rating.
- [ ] If orphaned or renumbered episode rows ever cause visible mismatches, revisit the show page source with a TMDB backed filter (see rationale.md, option B for the row source).
