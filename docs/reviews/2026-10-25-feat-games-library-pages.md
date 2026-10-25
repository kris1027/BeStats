# Review, feat/games-library-pages, 2026-10-25

**Reviewed by**: Sonnet 5.5 (author on unknown model)
**Scope**: 42 files (27 tracked, 15 new), branch vs main (all uncommitted on merge base b37c56e)
**Verdict**: Approve with nits

## Summary
Adds the games tabs to /watchlist, /upcoming and /watched behind `NEXT_PUBLIC_GAMES_LIBRARY`: one counted, user-filtered Postgres page per tab, one IGDB batch for that page, a game card/grid with optimistic remove and Undo, a `catchError` boundary around the streamed section, and `LibraryType`/`typedHref` overloads that keep `game` off /search and catalog pages. The logic is sound: session user id, no cached private reads, no writes on load, failures never fall to the empty state. Only minors and nits found; nothing blocks merge.

## Minor
### 🟡 Root AGENTS.md not updated for the new flag, `.env.example:62`
**Problem**: The Games section still says the GAMES tab "stays hidden until G5 ships" and the env facts list only `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY`; `NEXT_PUBLIC_GAMES_LIBRARY`, `getGamesLibrary()` and `gamesLibraryEnabled()` are documented only in the spec, deploy.md and JSDoc.
**Why it matters**: The next agent will not know the flag is the gate or that `type=game` is valid on the three library paths.
**Suggested fix**: Add one line to Commands and repo facts (and amend the Navigation bullet) in /sync.

### 🟡 Non-IGDB errors blow up the whole section, `lib/tracking/game-library.ts:144`
**Problem**: Anything that is not an `IgdbError` (including `IgdbValidationError`, or a cache layer failure) is rethrown and lands in the generic boundary, which says "Your list didn't load" with a Try again that re-runs the same read.
**Why it matters**: Acceptable as documented ("a bug"), but the user loses the per-tab Retry/ListFailed copy and the failure is not logged via `logTrackingEvent`.
**Suggested fix**: Optionally log an outcome class before rethrowing so the bug is visible in logs.

### 🟡 Month line is UTC, `lib/format.ts:222`
**Problem**: "Started Oct 2026" can be a month off near month boundaries for users far from UTC.
**Why it matters**: Documented as accepted; noting only because the card is the only place a user sees these timestamps.
**Suggested fix**: None required; keep the documented tradeoff.

## Nits
- ⚪ `components/layout/page-media-type.tsx:38`, JSDoc line runs past the surrounding wrap width after the edit; re-wrap.
- ⚪ `components/library/game-library-grid.tsx:91`, the `data-item-key` selector interpolates the key into a CSS selector; safe here (numeric id) but `CSS.escape` would be future proof.
- ⚪ `components/library/game-library-card.tsx:46`, a missing game keeps a `released` release state in `gameItem`; harmless since the card ignores it, but a `null` release would say so.

## Strengths
- Reads are explicit about ownership (`.eq("user_id", userId)` plus RLS), stable ordering ends in `game_id`, exact counts, and the past-the-end page redirects to the real last page.
- Failure states are distinct (Postgres failed, IGDB unreachable, boundary) and never render as the empty state, so users are not invited to remove healthy rows.
- `typedHref` overloads make `typedHref("/search", "game")` a compile error; the invalid flag value throws only in `LibrarySection`, while the navbar degrades to off.
- `showGameUndo` extraction keeps one toast id per game across surfaces.

## Test coverage
Good. New unit/component tests exist for `game-library.ts` (past-the-end, no count, db error, IGDB failure vs bug), the tab via `LibrarySection` (flag on/off dispatch), grid, card demo, error boundary, undo helper, env parsing, media-type parsing, and navbar/tabs/library-nav with the flag. Gaps are small: no test of focus movement after the last card is removed on page 1, and no pgTAP change is needed since no schema changed.
