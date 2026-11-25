# Review, feat/mobile-look-close, 2026-11-25

**Reviewed by**: Claude Sonnet 5.5 (author on Claude Opus 5.5, confirmed by you; a different model family)
**Scope**: 208 files, branch vs main (review base da408920, PRs #99 to #113)
**Verdict**: Approve with nits

## Summary
The "mobile look" feature brings the app's title pages, catalog card actions, search filters, library cards and account screens in line with the web. It adds three read-only `/api/v1` routes (movie and show extras, game similar, platforms), a small set of pure core helpers, a password change flow and haptics. Writes, Undo, cache keys and route validation are consistently built on `useTrackingWrite`, `withV1` and core's rules, and I found no blocker or major. `pnpm -r typecheck` is clean and the 66 mobile Jest suites (495 tests) pass. The findings are minor robustness and cost points.

## Minor
### 🟡 Opening an external URL can reject unhandled, `apps/mobile/src/components/title-extras.tsx:69` and `:191`
**Problem**: `Linking.openURL(url)` returns a promise that rejects when no app can handle the URL (no browser, restricted device). It is passed straight to `onPress`, so the rejection is unhandled and the user sees nothing.
**Why it matters**: The Trailer and "All options on TMDB" buttons would do nothing and say nothing (AGENTS.md section 11: a failed action shows visibly).
**Suggested fix**: Route both through one small helper that catches the rejection and shows a toast.

### 🟡 `changePassword` can throw before its try blocks, `apps/mobile/src/lib/password.ts:52` and `:62`
**Problem**: `getSupabase()` and `getPublicEnv()` (which "fails loudly" by design) run outside any try. The screen's `submit` (`change-password-screen.tsx:73`) has only a `finally`, so a throw becomes an unhandled rejection. `busy` resets but the user sees no message.
**Why it matters**: A misconfigured build shows a silently dead button instead of the unexpected-error line.
**Suggested fix**: Move both calls inside the existing try or catch, and return `failure(AUTH_OUTCOME.unexpected)`.

### 🟡 Individual state read per card when a batch answer lacks a key, `apps/mobile/src/lib/card-states.ts:83-95, 109-115`
**Problem**: `known` marks every id of a successful chunk, but a state is seeded only when `pickTitleState` is non-null and no write is in flight. If either skips, `useCardState` falls back to a per-title `fetchTitleState`, one request per such card, which the batch design (R6) set out to avoid. A null pick then surfaces as an `internal` error query.
**Why it matters**: Rare in practice, since the API answers every key, but it breaks the "one request per page" guarantee and the rate limit rule (AGENTS.md section 12).
**Suggested fix**: Mark a card known only when its state was seeded, or make `useCardState` read the cache only (`enabled: false`).

### 🟡 `useCardStates` memo never holds for More like this, `apps/mobile/src/components/title-extras.tsx:250`
**Problem**: `read.data?.map(...) ?? []` builds a new array every render, so `useMemo([ids])` in `useCardStates` recomputes on every render and `useQueries` gets a fresh list each time. Query keys are value based, so behaviour is correct, but the work is wasted.
**Suggested fix**: Memoize the id list in `MoreLikeThis`, or key the hook's memo on `idsKey(ids)`.

### 🟡 Required new fields in shared v1 schemas, `packages/core/src/api/v1/movie.ts:60-70`, `show.ts:81-94`
**Problem**: `originalLanguage`, `budget`, `revenue`, `productionCompanies`, `writers`, `networks`, `type` and `cast` are required in `v1MovieSchema` and `v1ShowSchema`. An app build that ships before the web deploy fails to parse every movie and show. Older apps are safe, since they drop unknown keys.
**Why it matters**: Release order matters here; the existing `MIN_APP_VERSION` gate protects only in the other direction.
**Suggested fix**: Note "deploy web first" in the release runbook, or make the new fields tolerant of absence in the app.

### 🟡 Show detail reads cast for titles that turn out 404, `apps/web/app/api/v1/shows/[id]/route.ts:42`
**Problem**: `Promise.all([loadShow, showCastOrNull])` runs the cast read in parallel even when `loadShow` says not found or adult. It costs a TMDB call, but discloses nothing because the result is dropped.
**Suggested fix**: Acceptable for latency. Consider reading the cast after `loadShow` succeeds if TMDB call volume matters.

### 🟡 Extras cache key ignores the country, `apps/mobile/src/lib/catalog.ts:47`
**Problem**: The extras answer is country specific (picked from the connection) but cached under a public key per title only, which sign out keeps. A user who changes network or country sees the earlier country's providers until the entry goes stale.
**Suggested fix**: Add `region.code` to the key once known, or keep a short `staleTime` for extras. Low impact.

### 🟡 Seed can overwrite a newer state, `apps/mobile/src/lib/card-states.ts:79-85`
**Problem**: The batch `queryFn` skips seeding only while a write is in flight. A write that finished while the batch request was in flight is then overwritten by an older answer until the write's invalidation refetch lands.
**Why it matters**: A brief flash of stale card state. Self-correcting.
**Suggested fix**: Compare the key's `dataUpdatedAt` with the read's start time before seeding.

## Nits
- ⚪ `apps/mobile/src/components/title-extras.tsx:150`, the error source is `CATALOG_SOURCES.movie` even for shows; same text today, but pass the type.
- ⚪ `apps/web/lib/region.ts:33`, `x-country` is read after Vercel's header and is client suppliable on a host that does not overwrite it; harmless because the answer is `private`, but worth one line in app/AGENTS.md.
- ⚪ `packages/core/src/api/v1/browse.ts:9`, the doc comment line now exceeds the wrap width after adding `/platforms`.
- ⚪ `apps/mobile/src/components/poster-card.tsx`, each known card creates two mutations (write plus restore) through its menu hook; fine at 24 cards but worth knowing for long rows.

## Strengths
- Writes have one path: optimistic by core's rule, rolled back on refusal, haptics only after the server's answer, and no buzz on a 401 (`tracking.ts`).
- Undo is consistent across screen and cards, and `settleThen` fixes the unmounted card toast spinner.
- New `/api/v1` routes use `withV1`: Zod params, `private, max-age` for country data, public CDN caching only for anonymous reads, `no-store` on failure, and a region rule shared with the web.
- External URLs are validated at three layers (normalizer, v1 schema, `youtubeWatchUrl`) and the TMDB link is restricted to TMDB's host.
- The password flow keeps the app session safe (throwaway client, `scope: "local"`, no logging) and does not call a rate limit "wrong password".
- Placement and marks come from core (`movieCardStatus`, `gameCardStatus`), with no copied rules; no raw colours in the app source.

## Test coverage
Strong. Route behaviour (`apps/web/app/api/v1/extras.test.ts`, 331 lines), the contract (`packages/core/src/api/v1/extras.test.ts`), the card menus and marks, `title-writes`, `card-states`, `password`, haptics, the picker and the library card menu all have tests. Mobile: 66 suites and 495 tests pass; typecheck passes in all three packages. Gaps: no test for the fallback single read in `useCardState` when a seed is skipped, and none for `Linking.openURL` rejecting.

## Follow up (2026-11-25)
All eight minors were handled on `feat/mobile-look-close` under [prompts/mobile-look-review-fixes.md](../../prompts/mobile-look-review-fixes.md):
- Outside links: fixed, every `Linking.openURL` goes through `useOpenLink` (`apps/mobile/src/lib/open-link.ts`), which shows a toast when the phone cannot open the link. About's three links had the same gap and were fixed too.
- `changePassword`: fixed, both clients are made inside a `try` that answers the unexpected error.
- Card reads one by one: fixed, only titles the batch answer carried count as known.
- `useCardStates` memo: fixed in the hook (`useStableIds`), which covers all three callers.
- Required v1 fields: kept strict by decision; the web first rule is in `docs/deploy.md` section 12 and `apps/mobile/AGENTS.md`.
- Show cast on a 404: kept in parallel by decision, with the reason recorded in the route.
- Extras and the country: extras are no longer written to the offline cache (`shouldPersistQuery`).
- Seed over a newer state: fixed, a seed skips a key updated after the read started.
The four nits stay open.
