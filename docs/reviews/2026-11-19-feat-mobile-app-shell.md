# Review, feat/mobile-app-shell, 2026-11-19

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 41 files, branch vs main
**Verdict**: Approve with nits

## Summary
Slice 5a of the mobile app: native tabs with per-tab stacks, Home landing, list pages, Search with filters sheet, read-only show and game pages, signed-out Library/Account states and a sign-in modal. Shared empty-state copy moves into core (`search/messages`) and the web consumes it, so both apps say the same thing. Quality is good: public catalog queries sit under a separate root, every view has loading/error/empty states, no invented data. `tsc` passes, mobile jest (46) and core search vitest (96) pass. Only minors remain.

## Minor
### 🟡 Empty browse can read "No shows match “null”", `packages/core/src/search/messages.ts:46` / `apps/mobile/src/lib/search-results.ts:50`
**Problem**: `searchView` routes an empty browse (no query, no filters, non-game) to `noMatchesMessage`, whose unfiltered branch interpolates `params.q`, which is null.
**Why it matters**: If TMDB's popular list ever returns nothing, the phone prints a literal "null" title. The web never reached this path (its NoMatches only ran with a query or filter).
**Suggested fix**: Give browse its own empty message (like `no_popular_games`), or have `noMatchesMessage` handle a null query.

### 🟡 Session notice pushes Sign in from the root effect, `apps/mobile/src/app/_layout.tsx:55`
**Problem**: `router.push("/sign-in")` runs in `Navigator`'s effect, which can fire in the same commit that mounts the `Stack`. A notice already present at first render (e.g. a failed session restore) could hit a navigator that is not ready yet.
**Why it matters**: The expired-session notice (AGENTS.md section 11) is the one thing that must not be lost; if the push is dropped or throws, it is silent. Not verified on device.
**Suggested fix**: Gate the push on router/navigation readiness (root layout navigation state), and cover with a test where the notice is set at mount.

### 🟡 Background refetch failures are silent in Search, `apps/mobile/src/screens/search-screen.tsx:121`
**Problem**: Only `isLoadingError` and next-page errors are surfaced; a failed refetch with stale data shows the old results with no sign.
**Why it matters**: Minor; the user sees stale results as current (section 11, no false success).
**Suggested fix**: Show the existing error notice when `isRefetchError`.

### 🟡 Single-select chips use the checkbox role, `apps/mobile/src/components/filters-sheet.tsx:222`
**Problem**: Year and Rating choices are mutually exclusive but announce as checkboxes.
**Why it matters**: Screen reader users are told they can select several.
**Suggested fix**: Use the radio role for Year and Rating, keep checkbox for Genres.

### 🟡 Untested branches in new screens, `apps/mobile/src/__tests__/catalog-screens.test.tsx`
**Problem**: No tests for the show and game screens (invalid id, not_found vs retry via `TitleReadError`), the `[id]` route's list-vs-id split (`movies|shows|games/[id].tsx`), the filters sheet (cap, clear), or the sign-in modal close/notice behavior. `search-results.ts` and core messages are well covered.
**Why it matters**: These are branching and error-handling paths.
**Suggested fix**: Add focused tests for the route split and `TitleReadError`, plus a notice-at-mount test.

## Nits
- ⚪ `apps/mobile/src/components/poster-card.tsx:96`, IGDB ratings use the `text-rating-tmdb` colour; the text names the source, but a neutral or IGDB token would be cleaner.
- ⚪ `apps/mobile/src/components/media-switch.tsx:11`, JSDoc line wraps awkwardly after the edit.
- ⚪ `apps/mobile/src/lib/search-results.ts:106`, nested function declared after `return`; hoist `noMatches` above for readability.

## Strengths
- Catalog query keys live under their own root so sign out never wipes public browsing; per-section Home queries fail independently.
- Search copy and counts come from core and are shared with the web, with a pure, tested `searchView`.
- Honest signed-in Library placeholder and read-only title pages that omit missing fields instead of inventing them; 44pt touch targets and labelled community ratings throughout.

## Test coverage
Good: `search-results.test.ts`, core `messages.test.ts`, and screen tests for Home, list paging/404 end, Search params and error retry. Gaps listed under Minor (show/game screens, route split, filters sheet, sign-in notice).
