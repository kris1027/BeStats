# Up Next PR review fixes (PR #22)

## Goal

Before `feat/up-next` merges, act on the second review of PR #22 (the two axis code review plus CodeRabbit):

- make the Up Next Undo clear only the mark it was offered for,
- bring `/showcase` up to date with the new pieces,
- stop restating the `/upcoming` path in the nav,
- correct the caption wording in the earlier fixes prompt.

## Inspected

- `components/upcoming/mark-next-watched-button.tsx`: Undo calls `setEpisodeWatched(showId, seasonNumber, episodeId, false)` with no condition.
- `app/shows/actions.ts`: `setEpisodeWatched` unmarks with a plain `update({ watched_at: null })` on `(user_id, episode_id)`. Its mark branch reads `newly_marked` from `mark_episode_watched`.
- `supabase/migrations/20260928120100_mark_episode_newly_marked.sql`: the function already returns the upserted `watched_at`.
- `lib/tracking/types.ts` (`MarkEpisodeWatchedResult`, `EpisodeTrackingError` with `undo_expired`), `lib/tracking/schemas.ts`, `lib/tracking/messages.ts` (`UP_NEXT_MESSAGES`, `EPISODE_TRACKING_MESSAGES.undo_expired`).
- `app/shows/actions.test.ts` (`newlyMarked` block).
- `app/showcase/page.tsx`: its Badges section has no calendar pill or "Up to date" pill, and its Buttons section has no `CardRoundButton`.
- `components/upcoming/dated-pill.tsx`, `components/tracking/card-round-button.tsx`, `components/upcoming/ids.ts`, `components/layout/library-nav.tsx:25`.
- `docs/specs/0014-up-next/index.md`: AC-9 and the Key invariants ("an Undo never clears a mark made elsewhere, even under a race").
- `prompts/up-next-review-fixes.md` lines 16, 32 and 42.

## Skills

- `supabase`: PostgREST filter on `timestamptz`. There is no schema change.
- `next-dev-loop`: runtime check of Mark and Undo.

## The problem

`newly_marked` decides only whether Undo is *offered*. The Undo itself clears whatever mark is stored. If another tab unmarks and marks the episode again within the 10 second toast, the first tab's Undo clears that newer mark. This breaks the spec 0014 invariant.

## Decisions

1. **Bind Undo to its mark, with no migration.**
   - When `newlyMarked` is true, `setEpisodeWatched` also returns `markedAt` (the `watched_at` the function returned). Otherwise `markedAt` is null.
   - A new Server Action, `undoEpisodeMark(showId, episodeId, markedAt)`:
     - Zod validates the input: TMDB ids, and `markedAt` as an ISO datetime with offset.
     - The user comes from `requireUser()`, through the existing `runEpisodeWrite`.
     - It runs `update({ watched_at: null })` filtered on `user_id`, `episode_id` and `watched_at = markedAt`, with `.select("episode_id")`.
     - Zero rows means the mark changed elsewhere, and the action returns `undo_expired`. That is the spec 0008 pattern for a refused Undo.
     - It skips TMDB and leaves the rating and the status alone, like today's unmark. RLS still owns the row.
   - `setEpisodeWatched(…, false)` is unchanged for the season page.
   - Why not a new SQL function: PostgREST's `eq` on `timestamptz` compares the full microsecond value, and the string comes straight from the database. A conditional update covers it with the owner policies that already exist.
2. **Up Next copy for a refused Undo.** Add `UP_NEXT_MESSAGES.undoChanged`: "Couldn't undo. This episode changed in another tab." The page refreshes so the card shows the stored state. Other errors keep the existing tracking toasts.
3. **Showcase.** Add these to Badges:
   - the calendar `DatedPill` twice ("Dec 25" and "Feb 3, 2027", so the below `sm` glyph drop shows),
   - the Up Next pill "S2E4" and the "Up to date" pill.

   Add `CardRoundButton` in its rest and disabled (busy) states to Buttons, and update the Badges note: the Release date badge is now built.
4. **Nav path.** `library-nav.tsx` imports `UPCOMING_PATH` from `components/upcoming/ids.ts`. The other two links stay literal, because no shared constant exists for them.
5. **Prompt wording.** In `prompts/up-next-review-fixes.md`, "No episodes aired yet" becomes "No episodes have aired yet" (the three lines CodeRabbit flagged).
6. **Spec text.** Spec 0014 AC-9 says Undo calls `undoEpisodeMark` with `markedAt`, and a refused Undo shows the new toast. The invariant stays as written, because the code now meets it.

Out of scope, all judgement call smells: the duplicated `UNDO_TOAST_MS`/`EAGER_POSTERS`, the repeated TMDB failure block, `showsNothingUpcomingPanel`'s constant argument, and the module level focus variable.

## Expected files

- `app/shows/actions.ts`, `app/shows/actions.test.ts`
- `lib/tracking/types.ts`, `lib/tracking/schemas.ts` (+ test), `lib/tracking/messages.ts`, `lib/tracking/log.ts` (a new event name)
- `components/upcoming/mark-next-watched-button.tsx`
- `components/layout/library-nav.tsx`
- `app/showcase/page.tsx`
- `docs/specs/0014-up-next/index.md`, `prompts/up-next-review-fixes.md`

## Security

- The new action validates every input with Zod and derives the user from the session, never from the client.
- It writes through the per request client under the existing RLS owner policies.
- `markedAt` only narrows the update. A forged value can only make the update match nothing.
- No cache, schema or grant changes.

## Acceptance criteria

- Mark then Undo within the toast: the episode is unmarked, the rating and status are kept, and the card returns to that episode.
- Mark in tab A. In tab B, unmark then mark the same episode. Undo in tab A: nothing is cleared, the toast reads "Couldn't undo. This episode changed in another tab.", and the page refreshes.
- The season page's watched pill still marks and unmarks as before.
- `/showcase` under `next dev` shows the calendar pills, the Up Next pills, and the round button at rest and busy.
- The Upcoming nav link still points to `/upcoming` and is marked current there.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Runtime Mark, Undo and stale Undo on `pnpm dev:docker`.

## Manual test

1. Run `pnpm dev:docker`, sign in as a user with a Watching show that has an unwatched aired episode, and open `/upcoming`.
2. Press Mark watched on the card, then Undo in the toast. The same episode is back on the card.
3. Mark it again. Open `/shows/{id}/season/{n}` in a second tab, unmark the episode there, then mark it again. Back in the first tab, press Undo. You see "Couldn't undo. This episode changed in another tab.", and the episode stays watched.
4. Open `/showcase` and check the new pills and the round button states.
