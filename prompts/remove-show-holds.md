# Remove Pause and Drop, with the 0020 contract migration

Spec: [0020](../docs/specs/0020-progress-based-library-pages/index.md), amended 2026-10-10 (AC-1 to AC-4, AC-10 withdrawn, build plan steps 4, 5 and 8, Migration plan phase 3). Reasons: [rationale.md](../docs/specs/0020-progress-based-library-pages/rationale.md#amendment-2026-10-10-pause-and-drop-removed). Scope feature 23. Branch `feat/remove-show-holds`.

## Goal

A show is tracked or not. Pause, Drop, Resume and the Paused & dropped section disappear, every existing hold is cleared, and Stop tracking (with Undo) is the only way off the pages. The same PR carries spec 0020's contract migration, so the legacy status columns, enums, views, functions and the hold machinery all leave in one migration, and the remaining 0020 "Docs and proof" strand.

## Inspected code

- Production: `supabase migration list --linked` shows every local migration through `20261007130000_legacy_status_helpers` pushed; no contract yet.
- Database: `supabase/schemas/01-enums.sql` (`tv_status`, `status_source`, `show_hold`), `02-tables.sql` (`user_show_state` with legacy columns, `hold_state`, `hold_changed_at`, their check, the held index), `03-triggers.sql` (the `tracked_at`/`hold_changed_at` trigger, the completion and reopen triggers), `05-functions.sql` (`track_show`, `set_show_hold`, `untrack_show(p_show_id, p_expected)`, `restore_show_tracking(p_show_id, p_tracked_at, p_hold, p_hold_changed_at)`, the legacy helpers, every status function), `06-views.sql` (`user_tracked_shows` exposes the hold columns; the old views).
- App: `app/shows/actions.ts` (`setShowHold`, `untrackShow` with `expected`, `restoreShowTracking` with hold fields, the `hold_changed`/`not_tracked` mapping), `lib/supabase/database.ts` (the `HoldFunctions` overrides), `lib/tracking/types.ts`, `schemas.ts`, `messages.ts`, `show-state.ts`, `library-lists.ts` (`getHeldShows`, the unheld filter), `components/tracking/show-tracking-control.tsx`, `use-show-tracking.ts`, `tracking-icons.tsx`, `show-card-bookmark-button`, `components/library/held-shows.tsx`, `held-show-card.tsx`, `ids.ts`, `show-library-tab.tsx`, `app/watchlist/page.tsx`, `app/showcase/page.tsx`, `app/privacy/page.tsx` ("whether you paused or dropped one"), `lib/legal/operator.ts`.
- Tests: pgTAP 010 to 165 (every status file per 0020 build plan step 8, 160 for tracking, 165 the legacy mapping), and the unit tests beside each file above.

## Skills

`supabase`, `supabase-postgres-best-practices` (migration, functions, RLS tests), `next-dev-loop` (runtime check of the show page, Watchlist and the bookmark).

## Decisions (settled in grilling, 2026-10-10)

1. Existing holds are cleared: paused and dropped shows become ordinary tracked shows and land on the page AC-7 gives them.
2. One migration: the 0020 contract plus the hold removal. Rollout: `supabase db push`, then merge at once; the few minutes before Vercel deploys are accepted broken. After that, rollback is a forward fix.
3. Spec 0020 is amended in place (done in this branch's first commit).
4. The show page control is a toggle: "Plan to watch" untracked; "Tracking" tracked, with `aria-label` "Stop tracking {title}" (no `aria-pressed`: see the rationale amendment). A click stops tracking with the existing toast and Undo.
5. The Paused & dropped section is deleted, with its components, read, tests and `/showcase` entries. Icons left unused (`DroppedIcon`, `StopWatchingIcon` if nothing else uses it) are deleted.
6. `untrack_show(p_show_id)` loses `p_expected` and is idempotent. When no row was deleted it returns no row; the action reports success with no Undo and the toast says the show is no longer tracked. `restore_show_tracking(p_show_id, p_tracked_at)` loses its hold arguments. `hold_changed` and `not_tracked` go from the error union and messages.
7. Current docs are rewritten; specs 0001 to 0019 and `docs/reviews/` stay as history.
8. Production is verified once, after the deploy, which also closes 0020's "Docs and proof" strand.

## Expected files

**Database**
- `supabase/migrations/2026101012xxxx_show_tracking_contract.sql` (new). As built it was written by hand from `supabase/schemas/`, because the diff cannot carry the function grants or the drop order; it has no separate update, since dropping `hold_state` is what clears every hold (checked on held rows, 0020 `verify.md`). Planned order:
  1. `update public.user_show_state set hold_state = null where hold_state is not null` (the check constraint needs `hold_changed_at` cleared in the same statement)
  2. drop the hold check, the held index, the hold branch of the trigger, `set_show_hold`, the old `untrack_show` and `restore_show_tracking` signatures, the view's hold columns (recreate `user_tracked_shows`), the columns, then `show_hold`
  3. everything in 0020 build plan step 8: the legacy columns with their checks, indexes and triggers, `tv_status`, `status_source`, the old views and functions, both legacy helpers, the mirror writes in `track_show`, and the `show_started` → `show_tracked` rename in the episode functions
  4. create `untrack_show(integer)` and `restore_show_tracking(integer, timestamptz)` as `security invoker`, `set search_path = ''`, `anon` and `public` revoked, `authenticated` granted
- `supabase/schemas/01-enums.sql`, `02-tables.sql`, `03-triggers.sql`, `05-functions.sql`, `06-views.sql` to match
- `lib/supabase/database.types.ts` regenerated (`pnpm db:types`); `lib/supabase/database.ts` loses `HoldFunctions`
- pgTAP: delete 165, 100, 130, 131; rewrite 160 (no hold, idempotent untrack, restore round trip, episode mark tracks an untracked show); rewrite 010, 020, 030, 040, 090, 110, 120, 140, 150 against the new model per step 8 (as built: 090, 110, 150 and 120 deleted, `120-newly-marked` added, 020 unchanged); touch 050, 060, 070, 080 where they name a dropped column

**App**
- `app/shows/actions.ts` and test: remove `setShowHold`; `untrackShow(showId)`; `restoreShowTracking({ showId, trackedAt })`; map `show_tracked`
- `lib/tracking/types.ts`, `schemas.ts`, `messages.ts`, `show-state.ts`, `library-lists.ts` and their tests: no `ShowHold`, `SHOW_HOLDS`, hold labels, `hold_changed`, `getHeldShows` or held copy; `ShowTrackingState` becomes `{ tracked: boolean }` (or the existing null for untracked)
- `components/tracking/show-tracking-control.tsx`, `use-show-tracking.ts`, `tracking-icons.tsx`, `show-card-bookmark-button.tsx` and tests
- delete `components/library/held-shows.tsx`, `held-show-card.tsx` and tests; update `ids.ts`, `show-library-tab.tsx`, `library-section.test.tsx`, `library-grid.test.tsx`, `app/watchlist/page.tsx`
- `app/showcase/page.tsx` and test: drop the hold states, show the toggle in both states
- `app/privacy/page.tsx`: "…the TV shows you track." and `LEGAL_LAST_UPDATED = "2026-10-10"`

**Docs**
- `AGENTS.md`: section 1 bullet ("Tracked TV shows."), section 7 tracking line, section 8 TV tracking state and the hold validity line, section 9 placement paragraph and "Tracking and holds" (renamed "Tracking"), section 11 "holds" in the validation list, section 13 items 9 and 11, the repo facts about the hold filter and the legacy columns (the contract removes the latter fact)
- `components/AGENTS.md` where it names Paused & dropped
- `docs/scope/scope.md` checkboxes as each strand lands
- `docs/specs/0020-progress-based-library-pages/verify.md` with the results

## Requirements

- No UI, type, column, function or copy mentions Pause, Paused, Drop, Dropped, Resume or a hold, apart from history docs and the migration itself (AC-1).
- Toggle, bookmark and Undo behave per AC-2, AC-3, AC-4, AC-6; every episode mark and rating survives Stop tracking.
- Every tracked show is on exactly one library page (AC-8), including the ones that were held.
- No page writes on load (AC-21).
- `pnpm test:db` passes on a fresh `pnpm exec supabase db reset`.

## Security

- RLS on `user_show_state` is unchanged (owner only for every command); the recreated functions write only `auth.uid()` rows and never take a user id. pgTAP 030 proves user B cannot read, track, untrack or restore user A's show, including through direct function calls.
- `restore_show_tracking` still refuses a future `tracked_at` and an existing row.
- The recreated view stays `security_invoker` with select only for `authenticated`.
- No new processor; the privacy text shrinks to what is stored.

## Acceptance criteria

The amended 0020 AC-1 to AC-4, AC-6, AC-8, AC-10 (withdrawn), AC-19 (contract clears holds), AC-20, AC-21 and AC-23, plus AC-24 and the remaining "Docs and proof" items.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec supabase db reset` then `pnpm test:db`, `pnpm db:types:check`, `pnpm build`.

## Manual test steps (local, `pnpm dev:docker`)

1. On `main`'s local stack, pause one tracked show and drop another. Switch to this branch and apply only the new migration (`pnpm exec supabase migration up`, which keeps the data). Both now appear on Watchlist, Upcoming or Watched; Watchlist has no Paused & dropped section.
2. Open an untracked show: the control reads "Plan to watch". Click it: "Tracking", and the show appears on its page.
3. Tab to the control: focus is visible, the screen reader name is "Stop tracking {title}". Press Enter: the toast offers Undo; the show leaves every page; its episode marks and ratings remain on the show page.
4. Click Undo: the show returns to its old position in the list.
5. Stop tracking in two tabs: the second tab's click succeeds quietly with no Undo and refreshes.
6. Catalog card bookmark: fill and empty it; the Undo toast appears when emptying.
7. Mark an episode on an untracked show: "{Show} added to your shows".
8. `/showcase` shows the toggle in both states and no hold states. `/privacy` reads the new sentence and date.
9. 375px: the toggle is 44px tall and nothing overflows.

## Production rollout

1. All checks green, PR reviewed.
2. `pnpm exec supabase db push` (production), then merge the PR straight away.
3. After Vercel deploys: open each tab, track, stop tracking and undo on a test account; confirm previously held shows are on a page. Record the result in `verify.md`.
