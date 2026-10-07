# Review, feat/media-tabs-everywhere, 2026-10-07

**Reviewed by**: Sonnet 5.5 (author on unknown)
**Scope**: 41 files, branch vs main
**Verdict**: Approve with nits

## Summary
The change makes the navbar SHOWS | MOVIES tabs drive `/watchlist`, `/watched`, `/upcoming` and `/search` through a validated `?type=` parameter, with the parsing and URL building in one pure helper. It matches the plan closely: reads add `.eq("kind", kind)` to both page and count queries under the same RLS session, `useSearchParams` is confined to typed paths inside Suspense, and the movies tab of `/upcoming` performs no write. Typecheck, biome and the full vitest suite (1964 tests) pass. Only copy and small robustness issues remain.

## Minor
### 🟡 Invalid-type panel reuses page-number copy, `components/library/library-section.tsx:~250`
**Problem**: `NoSuchPage` says "There are no titles at this page number." and "Back to page 1" even when the cause is a bad `?type=` value.
**Why it matters**: A wrong-type link shows text about a page number the user never touched.
**Suggested fix**: Pick the description by cause (bad type vs bad page), or use neutral copy; keep the `?type=tv` target.

### 🟡 Sign-in fallback drops the query, `lib/auth/user.ts:79` (via `proxy.ts:232`)
**Problem**: `requireUser()` builds `next` from `x-pathname`, which is pathname only. The proxy's own redirect keeps the search, but if the session lapses after the proxy check, `/watchlist?type=movie` returns as `/watchlist` (shows tab).
**Why it matters**: Narrow window, but the plan's AC-10 promise (return to the same URL) holds only on the proxy path; it is now more visible because the type is in the query.
**Suggested fix**: Also record the search in a request header, or accept and note the limit.

## Nits
- ⚪ `app/watchlist/page.tsx:17`, doc comment still says "the movies the user plans to watch"; it now lists either type.
- ⚪ `components/library/library-section.tsx` (LibrarySection JSDoc), a sentence is broken across lines awkwardly ("so a malformed ... (AC-9). Then one / Postgres read").
- ⚪ `components/upcoming/ids.ts:10`, `UPCOMING_PATH` is now used only inside `upcomingHref`; could be a non-exported const.

## Strengths
- One pure, `server-only`-free helper (`lib/catalog/media-type.ts`) used by tabs, Library nav, navbar search and list pages; invalid type is shown as a panel after `requireUser()` and before any read, never a redirect.
- Per-type count and page queries keep totals truthful and past-the-end redirects inside the type; dead code (`mapGenresAcrossTypes`, `showsNothingUpcomingPanel`, empty-panel focus fallback) was removed with its tests.
- Prerendered shells preserved: `useSearchParams` read only on typed paths in dedicated Suspense boundaries with same-footprint fallbacks.

## Test coverage
Good: new helper, Library nav, tabs, library section copy/legend, library-lists queries, request-scope (no write on movies tab), filter bar and mark-next button tests were added or updated. Not covered: the `requireUser` fallback losing the query, and the invalid-type copy. Not run: build and the live dev loop (manual steps in the plan).
