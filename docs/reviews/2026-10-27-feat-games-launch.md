# Review, feat/games-launch (PR #61, merged), 2026-10-27

**Reviewed by**: claude-sonnet-5-5 (author model not recorded)
**Scope**: 66 files, branch vs main (merge base 82102a1, head f2827c0) plus two uncommitted doc ticks (docs/scope/games.md, docs/specs/0032-games-launch/verify.md)
**Verdict**: Approve with nits

## Summary
The change opens games to search engines (canonical, share card and `VideoGame` JSON-LD on the game page, `/games` and the five list pages, game ids in the sitemap with failure isolation), adds the hash-checked IGDB logo and the `IGDB_ATTRIBUTION` credit to the footer and `/terms`, shortens the genre and platform caches to the 24 hour limit, and removes the `NEXT_PUBLIC_GAMES_LIBRARY` flag everywhere. It follows spec 0032 closely and respects the repo's rules: metadata and sitemap read no request state, the not found and failed branches stay `noindex`, the credential and legal-fact boundaries are enforced by tests, and `lib/seo/` stays free of IGDB imports. No blockers or majors. One real inconsistency with the 24 hour caching rule the PR itself adopts (the sitemap's game ids), plus small documentation drift.

## Minor
### 🟡 Sitemap keeps IGDB game ids for days, past the 24 hour cap the PR applies to genres, `app/sitemap.ts:101`
**Problem**: `popularTitleIds` is one cached scope that ends with `cacheLife("days")` when nothing failed. It now holds `gameIds` copied from IGDB's Popular list. The same PR moved the genre and platform reads from `max` to `hours` because the Twitch Developer Services Agreement caps a cached copy of IGDB data at 24 hours (AC-11), and the inner `getPopularGames` read is `hours`.
**Why it matters**: The outer scope outlives the inner one, so a derived copy of IGDB data (ids, and which games are visible/popular) can live well past 24 hours. The data is small and low sensitivity, so the practical risk is low, but the rule is applied unevenly and a hidden game could stay listed for days.
**Suggested fix**: Either record in the rationale why a list of bare ids is not "cached data" under the clause, or cap the outer scope at a lifetime of 24 hours or less when game ids are present (for example `hours` when the list is complete). Note a prerendered sitemap is also frozen until the next deploy, so say so in `lib/seo/AGENTS.md`.

### 🟡 Share-image doc comments still say "TMDB image", `lib/seo/metadata.ts:22`, `:61`
**Problem**: `catalogMetadata`'s `image` is now also an IGDB art URL (`app/games/[id]/page.tsx` passes `artUrl ?? screenshotUrls[0] ?? coverUrl`), but the param docs and the "no TMDB artwork" wording say TMDB only.
**Why it matters**: A future reader may add a host allowlist or validation based on the stale comment, or conclude a non-TMDB URL is a bug.
**Suggested fix**: Reword the docs to "an absolute catalog image URL (TMDB or IGDB)".

## Nits
- ⚪ `lib/seo/metadata.ts:114`, the "failed TMDB read" wording in the list-page doc is TMDB-only; games lists now follow the same rule through `IgdbError`.
- ⚪ `components/layout/site-footer.tsx:78-87`, the logo has `alt="IGDB"` and the link also shows the credit text, so a screen reader hears "IGDB Game data and images from IGDB.com". The spec asks for this (AC-10), so it is only worth a look if you want `alt=""` for the decorative logo inside a link that already has visible text.
- ⚪ `lib/search/params.ts` (`parseSearchParams`), now returns a wide `ParseResult` and is wrapped by two narrowing helpers; its JSDoc could say that callers should prefer the narrowed helpers.
- ⚪ `components/search/navbar-search.tsx:19-20`, the comment now wraps awkwardly after the flag text was removed ("games under `/games`, and the" on its own line).
- ⚪ Working tree: `docs/scope/games.md` still leaves "Review it" unticked, which is correct until this review is accepted; tick it afterwards.

## Strengths
- The failure model of the sitemap is right: `Promise.allSettled`, only `IgdbError` drops the game ids, anything else (including `IgdbValidationError`) is rethrown, and `cacheLife` shortens to `minutes` on a partial result. Errors are rebuilt outside the cached scope so `instanceof` holds.
- Indexing is conservative: only a found, visible game gets a canonical and JSON-LD; not found, hidden and failed branches stay `noindex`, and the canonical is built from the id so a query string never reaches it.
- `catalogListMetadata` handles games' unknown last page explicitly (`hasResults` plus nullable `lastPage`) without changing the TMDB rule.
- Guard rails are encoded as tests: the logo's SHA-256, the one-home rule for `IGDB_ATTRIBUTION`, and a repo-wide test that fails if the removed flag name reappears outside `docs/`.
- Flag removal is complete and simplifies types (`quickSearchRequestSchema` is a plain constant, `TabHrefs` is `Record<LibraryType, string>`, no more optional GAMES tab branch).

## Test coverage
Configured (vitest). The new logic is covered: `gameJsonLd` (including omission of empty fields) in `lib/seo/json-ld.test.ts`; sitemap order, dedupe, 200 cap and IGDB failure isolation in `app/sitemap.test.ts` and `lib/seo/sitemap.test.ts`; game page metadata for found, hidden, failed and invalid ids in `app/games/[id]/page.test.ts`; list metadata results rule in `lib/landing-metadata.test.ts`; footer credit and logo hash; `/terms` content; request-scope tests for the new code. The flag removal updated every affected test and added the leftover-name guard. Not covered: the 24 hour behavior of the sitemap's game ids (no test asserts the outer `cacheLife` for a complete games list), and nothing checks that the share image URL is a real IGDB host, which is fine given the optimizer-independent `og:image`. I did not run the suite; I judged coverage from the diff.
