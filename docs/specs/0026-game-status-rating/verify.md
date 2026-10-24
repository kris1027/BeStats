# Verify: game status and rating · spec 0026 · updated 2026-10-24
_Steps derived from spec 0026 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against the local stack (`pnpm dev:docker`), signed in as user A (`user-a@example.test` / `password-a`) unless a step says otherwise. Run `supabase db reset` first so the seed is clean (user A has 1942 as Playing with score 8).

## UI / manual
- [ ] Signed out, open `/games/1942` → the hero shows, and there are no pills and no release line under the IGDB rating → AC-1
- [ ] Signed in, open `/games/1942` → the pills appear already showing Playing pressed and a score pill reading `8`, with no flash of a default state → AC-1, AC-12
- [ ] With the screen reader tree (or devtools), check the group is labelled `Status for The Witcher 3: Wild Hunt`, the pills are named `Want to play: …`, `Playing: …`, `Finished: …` with `aria-pressed`, and the score pill is named `Your score for …: 8` → AC-2, AC-6
- [ ] Click Finished → it is pressed at once, the score stays 8, and no picker opens (the game already has a score) → AC-3, AC-6, AC-7
- [ ] Click Want to play → the score pill disappears and a toast reads `Moved to Want to play. Your score was removed.` with Undo; click Undo within 10 seconds → Finished and 8 come back, and in the database `added_at`, `started_at` and `finished_at` equal their values before the move → AC-5, AC-14
- [ ] Click Playing on a game with no score (or after clearing it) → no picker opens; then click Finished → the picker opens at once; press Escape → the game stays Finished and unscored → AC-7
- [ ] Open the score pill, pick 9 → the popover closes and the pill reads 9; open it again and press Clear rating → the pill reads `Rate`, the status stays → AC-6
- [ ] Click the pressed pill → the game is removed (no pill pressed) and a toast reads `Removed from your games.` with Undo; Undo → status, score and all three dates come back exactly → AC-4, AC-14
- [ ] Remove the game in a second tab, then click the pressed pill in the first tab → no toast, and the page settles on no status → AC-4
- [ ] Reload after each change, and open the page in a second browser signed in as user A → the same state shows → AC-12
- [ ] Open an unreleased game (IGDB release date after today, or none) → under the pills: `Releases {date}` or `Release date to be announced`; Playing and Finished are `aria-disabled` and do nothing; Want to play works → AC-8
- [ ] On an unreleased game stored as Playing (set it directly in the database), the pressed Playing pill still removes, Want to play still works, and the picker shows the release line with its ten choices disabled while Clear rating works → AC-8, AC-9
- [ ] Sign out in another tab, then click a pill → the change rolls back and a toast says the session expired with Sign in, which goes to `/sign-in?next=%2Fgames%2F1942` → AC-10, AC-11
- [ ] At 375px and 1280px: the pills wrap with no horizontal scroll, each tap target is at least 44px on mobile, focus is visible, and the score popover fits the screen → AC-17
- [ ] Keyboard only: Tab to each pill and press Enter or Space to set, remove, open the picker, move with the arrows and commit a score, and reach Undo in the toast → AC-17

## Commands
- [ ] `pnpm test:db` (after `supabase db reset`) → all files pass, including `190-game-tracking-functions` and `020-security-configuration`, with `140-security-sweep` unchanged → AC-13, AC-14, AC-16
- [ ] `supabase db diff` after `supabase db reset` → `No schema changes found` → AC-16
- [ ] `pnpm db:types:check` → the types match the schema → AC-16
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` → all pass, and `/games/[id]` stays a partial prerender → AC-1, AC-16
- [ ] `pnpm vitest run app/games/actions.test.ts private-actions-boundary.test.ts` → the release gate, hidden game, IGDB failure and missing session cases pass → AC-9, AC-10, AC-15
- [ ] `supabase db push` before the PR merges (docs/deploy.md) → the five functions exist in the cloud project → AC-16

## Value sourcing checks
- [ ] `user_id`: call `set_game_status` as user A for game 1942 → user B's row for 1942 stays Want to play with its seed date → value source `auth.uid()`
- [ ] `game_id`: call `setGameStatus(0, "playing")` → `invalid_input`, nothing written → `gameIdSchema`
- [ ] status target: double click a pill quickly → two different targets are sent (set, then remove), never the same one twice → optimistic state
- [ ] cleared score Undo payload: in two tabs, move Finished (scored) to Want to play in both → only the first gets an Undo with the score → `prev_*` under the row lock
- [ ] removal Undo payload and `removedAt`: remove, wait over 10 minutes (or move `removed_at` back in a direct call), then Undo → `Couldn't undo. Set the status again on this page.` → `remove_game` and its `now()`
- [ ] restore window: change `updated_at` to 10 minutes ago and call `restore_game_status` → `P0002` → `updated_at` against `now()`
- [ ] release gate server side: set a game with today's UTC date and one with tomorrow's → today's accepts Playing, tomorrow's returns `not_released` → `Game.releaseDate` against `todayUtc(new Date())`
- [ ] release gate on the page: the same two games show no line and the `Releases {date}` line, deciding by the UTC day, not the local day → `requestTodayUtc()`
- [ ] score display: a score of 7 shows `7`, none shows `Rate` with the name `… Not rated` → `formatPersonalScore`
- [ ] Sign in return: the session expired toast's Sign in returns to `/games/{id}` → `returnPath`

## Acceptance-criteria coverage
- AC-1: visitor and signed in steps, page test · AC-2: names and group step · AC-3: Finished click · AC-4: removal and Undo steps · AC-5: Want to play toast step · AC-6: score pick and clear · AC-7: auto open steps · AC-8: unreleased steps · AC-9: actions tests, unreleased stored step · AC-10: session step, boundary test · AC-11: rollback steps, component tests · AC-12: reload and second session · AC-13: pgTAP grants and lock · AC-14: Undo window checks · AC-15: actions tests (BS004, BS003, logs) · AC-16: commands · AC-17: 375px, 1280px and keyboard steps
