# Verify: IGDB integration module · spec 0023 · updated 2026-10-17
_Steps derived from spec 0023 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `IGDB_CLIENT_ID= IGDB_CLIENT_SECRET= pnpm build` → succeeds with neither variable set → AC-1
- [x] `pnpm test` → passes with no network and no IGDB credentials → AC-1, AC-19
- [x] Add a temp file naming `IGDB_CLIENT_SECRET` outside `lib/igdb/env.ts`, run `pnpm vitest run security-boundary.test.ts` → fails naming that file; remove it → passes → AC-2
- [x] After `pnpm build`, `grep -rl "IGDB_CLIENT\|api.igdb.com\|id.twitch.tv" .next/static` → no hits → AC-2
- [x] `pnpm igdb:live` with real credentials in `.env.local` → 12 checks pass; the log reports the count header on search and on a plain `where`, and any unpinned game type → AC-3, AC-5, AC-9, AC-10, AC-18
- [x] `pnpm igdb:live` with no credentials (move `.env.local` aside) → skips, does not fail → AC-18
- [x] `pnpm tmdb:live` → runs only `lib/tmdb/tmdb.live.ts`, labelled `tmdb-live` → AC-18
- [x] `pnpm vitest run lib/igdb/surface.test.ts` → `index.ts` exports exactly the six reads, `isIgdbNotFound`, `IgdbError`, `IgdbValidationError`; every non pure file starts with `server-only` → AC-2, AC-20

## Behaviour (fixture suite, `pnpm vitest run lib/igdb`)
- [x] Token: form body, never in the URL; reused until 10 minutes before expiry; three concurrent callers share one Twitch request; a failed request is cleared so the next caller retries; an 8 s timeout → AC-3
- [x] 401 → one refresh with a new token, then success; a second 401 → `unauthorized`; Twitch 400/401/403 → `unauthorized`, 429 → `rate_limited`, 5xx → `upstream`; a blank `IGDB_CLIENT_SECRET` → `unauthorized` naming the variable, no request made → AC-4
- [x] Injection: `zelda"; where id = 1;` stays inside one quoted string; control characters stripped; 101 characters refused → AC-5
- [x] Limiter: starts ≥ 250 ms apart, at most 4 open, a queued request fails `rate_limited` unsent after 5 s; `Retry-After: 60` waits 10 s; a hang fails `timeout` after 8 s with no retry; the whole read gives up after 20 s → AC-6
- [x] Every read caches success for its profile (`hours`, `minutes`, `max`) and failures for `seconds` (timeout, rate_limited, upstream) or `minutes` (the rest); `isIgdbNotFound` stays true across the boundary → AC-7, AC-8
- [x] `getGame`: one request; empty → `not_found`; no `id` or `name` → `bad_response` with nothing partial; a DLC by id → `hidden: true` → AC-9, AC-16
- [x] Catalog filter: the clause equals the live confirmed string, and the parity test agrees with the rule on every fixture record (no themes, no `game_type`, edition, DLC, Erotic) → AC-10
- [x] Batch: `[378958, 1942, 336481, 1942]` → one request with `(1942,336481,378958)`; ids not returned land in `missingIds`; `[]` makes no request; 501 ids throw `IgdbValidationError` before fetch; a 503 raises → AC-11
- [x] Search: every filter in one `where`, no `sort`, `limit 21`, `offset (page − 1) × 20`; 21 rows → 20 results and `hasNextPage`; no `X-Count` → `totalResults: null` → AC-12
- [x] Validation: page 0 and 51, 21 genre ids, a year of 1949 or current + 6, `minRating` 11, `2026-02-30`, from after to → `IgdbValidationError` naming the field, no request, nothing cached → AC-12b
- [x] Discover: each sort writes its field and `!= null`; `releasedTo` is inclusive (`< next day`) → AC-13
- [x] Genres and platforms: one request each, sorted by name, nameless rows dropped → AC-14
- [x] Missing stays missing: absent values, blank text, and a rating or count of 0 → `null`; release day in UTC, including before 1970; `communityRating` = `rating / 10` → AC-15
- [x] Logs: one JSON line per retry or failure with only `event`, `endpoint`, `status`, `kind`, `attempt`, `elapsedMs`; no token, client id, secret or body → AC-17

## Value sourcing
- [x] `coverUrl` is `https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg`, and the live check gets 200 for one
- [x] `releaseDate` for a timestamp at 23:30 UTC on 31 December reads that day, not the next (local time zone has no effect)
- [x] `year` 2017 → `first_release_date >= 1483228800 & < 1514764800`
- [x] `minRating` 7.5 → `rating >= 75`; 0 → no clause
- [x] `gameType` maps 0, 4, 8, 9, 10 to their names, any other id to `other`, absent to `null`
- [x] `hidden` comes from the rule over `game_type`, `version_parent`, theme ids, even when a theme has no name
- [x] `hasNextPage` is true only when IGDB returned 21 rows
- [x] Discover's `releasedFrom` and `releasedTo` come from the caller; nothing in the module reads today

## Docs
- [x] `lib/igdb/AGENTS.md` exists; root `AGENTS.md` points to it and carries the Games section → AC-21

## Acceptance-criteria coverage
- AC-1 build and env steps · AC-2 boundary, bundle, surface · AC-3 token · AC-4 401 and credentials · AC-5 injection, live · AC-6 limiter and deadlines · AC-7 failure cache · AC-8 lifetimes · AC-9 getGame · AC-10 filter, parity, live · AC-11 batch · AC-12 search · AC-12b validation · AC-13 discover · AC-14 reference lists · AC-15 missing values · AC-16 dropped entries · AC-17 logs · AC-18 live check · AC-19 fixture suite · AC-20 surface · AC-21 docs
