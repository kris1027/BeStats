# Review, feat/calculated-ratings, 2026-09-26

**Reviewed by**: Sonnet 5 (author on Sonnet 5)
**Scope**: 21 files, branch vs base (a4973b3)
**Verdict**: Approve with nits

## Summary

Implements spec 0012: calculated season and show ratings as pure functions over stored episode ratings, with no persistence, no `use cache` involvement, and one deduped per-request Supabase read (`getShowEpisodeRatings`) shared by the show heading and every season card via React `cache()`. `lib/tv/ratings.ts` (mean over rated episodes, equal-weight mean over rated regular seasons excluding Specials) and `formatCalculatedRating` (half-up rounding with `1e-9` tie tolerance) match the `AGENTS.md` section 9 rules and the worked example exactly, and are exercised by a thorough unit suite. The season header's optimistic rating (`SeasonRating`) reuses spec 0011's `useEpisodeStates`/pending-intent machinery, so it moves and rolls back with the score pill in the same commit, verified by real deferred-promise tests (not stubs) in `season-tracking.test.tsx`. All touched checks were re-run: `pnpm typecheck` equivalent (`tsc --noEmit`) clean, the 6 directly relevant test files (113 tests) plus `design-tokens-boundary.test.ts` and `security-boundary.test.ts` all pass.

## Minor
### 🟡 `CalculatedRatingBadge` JSDoc doesn't cite an `AGENTS.md` section, `components/rating-badges.tsx:69`
**Problem**: The code convention in root `AGENTS.md` ("Exported functions carry a JSDoc block that says why the code is shaped the way it is, citing the `AGENTS.md` section when a rule governs it") is followed everywhere else in this diff (`formatCalculatedRating` cites section 9, `getShowEpisodeRatings` cites section 11, `lib/tv/ratings.ts` functions cite AC numbers), but `CalculatedRatingBadge`'s doc comment cites only spec 0012 and `AGENTS.md` section 9 implicitly through "AGENTS.md section 9" is actually absent — it only says "(spec 0012)".
**Why it matters**: Very small consistency gap; a future reader has to chase the spec to find the governing rule (personal-vs-TMDB rating distinction, section 9) that this component exists to enforce.
**Suggested fix**: Add "(`AGENTS.md` section 9)" alongside the existing "(spec 0012)" reference, matching the sibling `formatCalculatedRating` doc a few lines above it in the diff.

## Nits
- ⚪ `components/show/show-components.test.tsx:13`, the hoisted mock's `_props` type annotation uses `React.ReactNode` as a return type without an explicit `React` import; this matches an existing pattern already in the same file (`renderHero(meta: React.ReactNode)`), so it's consistent, just worth confirming the global JSX types keep covering it if the tsconfig ever tightens.
- ⚪ `docs/scope/scope.md:236`, two checklist items ("Review it (fresh model)" and "Document it") are still unchecked, which is expected since this review is what completes the first one — no action needed, just noting the scope file will need a follow-up tick after this review lands.

## Strengths
- The rounding function, the season/show mean rules, and the "equal weight per season regardless of episode count" invariant are each covered by a dedicated test that reproduces the exact `AGENTS.md` section 9 worked example (8 over 10 episodes, 6 over 2 episodes → 7), leaving no ambiguity about the intended semantics.
- `verify.md` shows two independently dated real runs (`/develop` and `/check verify`) against the local Supabase stack with concrete numbers, a Kong request-log count confirming the single dedup'd read (AC-9), a second-browser/second-user isolation check (AC-13), and a deliberately broken PostgREST run confirming the failure copy and single clean log line (AC-11) — this is genuine live verification, not just unit tests.
- Optimistic rollback for the season rating is tested through the real `SeasonTrackingStore` with hand-settled deferred promises, exercising the exact code path a browser would hit, rather than mocking the rating calculation itself.

## Test coverage
Fully covered for this feature's scope: `lib/tv/ratings.test.ts` (pure rules, AC-1/AC-2/AC-3/AC-17), `lib/tracking/show-ratings.test.ts` (query shape, owner scoping, signed-out/env-missing/failure paths, AC-9/AC-10/AC-11/AC-13), `components/tracking/show-rating.test.tsx` (both slots' rendering, Not-rated/Specials-note/failure/tab-stop/color states), and the new `describe` block in `components/tracking/season-tracking.test.tsx` (optimistic move, rollback, clear, unmark-preserves-rating, future-dated episode counts, "Nothing aired yet" branch, no tab stop). `show-components.test.tsx` confirms `SeasonGrid` wires each card's badge to the right season number and preserves the link's accessible name. No untested new logic found.
