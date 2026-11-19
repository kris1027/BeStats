# Mobile API v1: review fixes (branch feat/mobile-api-games-browse)

## Goal

Close the gaps a two-axis review (standards, spec 0035) found on `main...HEAD`, without changing any route's behaviour:

1. The one hard standards breach: the lists route hard codes `pageSize: 24`.
2. Spec 0035 Security model: "user B's token cannot read or change user A's rows through any v1 route". The local cross-user suite covers movies, games, titles and library, but not shows, episodes, seasons or profile.
3. Spec 0035 AC (Auth): "an expired token … answers 401". This is covered only by a mock (`bearer.test.ts`), never against the real stack.
4. Spec 0035 text that the plan `prompts/mobile-api-v1.md` and `docs/deploy.md` already say is owed an update, but which still disagrees with the shipped decisions.

The rest of the review is out of scope: the soft `process.env` read in the harness, the smells, and the genres CDN cache versus the IGDB terms. See Needs attention.

## Inspected code

- `apps/web/app/api/v1/lists/[type]/[list]/route.ts` (literal 24); `search/route.ts` and `lib/api/v1/library.ts` (use `V1_PAGE_SIZE`); `packages/core/src/api/v1/browse.ts` (`V1_PAGE_SIZE = GRID_PAGE_SIZE`, `pageSize: z.literal(V1_PAGE_SIZE)`).
- `apps/web/app/api/v1/cross-user.local.ts`, `scripts/api-local.sh`, `apps/web/vitest.api-local.mts`.
- Routes: `me/shows/{id}/tracking` (+restore), `me/shows/{id}/seasons/{n}` (GET), `…/seasons/{n}/watched` (+restore), `me/episodes/{episodeId}` (+restore), `me/profile`.
- `lib/tracking/commands/show-writes.ts` (reads `loadShow`, `loadSeason`), `lib/supabase/bearer.ts` (`getClaims`), `supabase/config.toml` (`jwt_expiry = 600`, no asymmetric signing keys, so local tokens are HS256).
- `supabase/seed.sql`: A tracks 1396 and 1399 and has Breaking Bad S1 episodes 62085–62087 plus the special 62131; B tracks 1396 and has 63056 (1399). There are no `profiles` rows. The `profiles` RLS has owner select, insert, update and delete.
- Spec `docs/specs/0033-mobile-app-expo/0035-mobile-api-v1.md` lines 48, 53, 61, 75, 76, 79, 100–110, 148; `docs/deploy.md` §5.

## Skills used

None beyond the repo docs. No schema, RLS or migration change, so `supabase-postgres-best-practices` isn't needed.

## Decisions and assumptions

- **Page size:** the lists route uses `V1_PAGE_SIZE` from core. This changes no value (it is 24).
- **Cross-user, shows and episodes:** add `loadShow` and `loadSeason` mocks fed by the existing `tv-1396.json` and `season-1396-1.json` fixtures, plus any other TMDB read the titles route needs. Then, as B against A's seeded Breaking Bad rows:
  - B unmarks and unrates episode 62085;
  - B unmarks season 1 with A's episode ids;
  - B stops tracking 1396.

  After each step, A's `GET /me/shows/1396/seasons/1` and tracking state are unchanged. B's own seeded tracking of 1396 is put back with its own Undo. Every B row the suite creates is removed afterwards, so the seed stays clean for pgTAP.
- **Cross-user, profile:** A claims a test username through `PUT /me/profile`. B's `GET` still answers a null username, and B's `PUT` of the same name answers 409 `conflict` (taken) without touching A's row. Cleanup deletes each user's own `profiles` row through a client signed in as that user (owner delete RLS), never an elevated role.
- **Expired token, real stack:** the local stack signs HS256 with the stack's own dev JWT secret. `scripts/api-local.sh` already reads `supabase status -o env`. It will also export `JWT_SECRET` as `API_LOCAL_JWT_SECRET`, read only by the `.local.ts` suite, to re-sign user A's real claims with `exp` in the past. The test expects 401 on a read and a write.
  - This is the local stack's published dev secret, never a cloud value, and it never touches `.env.local` or `.env.example`.
  - The script comment "never reads the secret key" stays true: the secret key and the JWT secret are different values. The comment will name the new value and why it is safe.
  - If the security boundary test objects to the name, it gets renamed, not exempted.
- **Spec 0035 text:** these are line edits recording decisions already made in `prompts/mobile-api-v1.md` and `docs/deploy.md`, not new design:
  - page size 24 (`V1_PAGE_SIZE = GRID_PAGE_SIZE`);
  - search adds `type`, `mode`, `nextPage` and `scanned`, and answers 404 past the end;
  - `PUT /me/profile` answers `{ ok, changed }`;
  - game `PUT` takes exactly one of `status` or `rating`, and answers `{ ok, undo? }`, which the client turns into a `game_status` or `game_removed` cleared state;
  - game restore also answers 409 `conflict` (Undo expired);
  - the rate limit section notes that Hobby allows one rule, as `docs/deploy.md` §5 records;
  - `/me/library` adds `total`, `failedCount` and `capped`, and pages placed by catalog dates answer 502 when the catalog is down, while the watched pages keep `card: null`. The AC line at 148 is corrected to match.

  The "owes an `/architect` update" note in `docs/deploy.md` is reworded once the spec is updated.

## Changes during implementation (2026-11-19)

- **Expired token:** the local stack signs sessions with ES256 and never exposes that private key, so an ES256 re-sign was impossible. Its Auth server still verifies HS256 tokens signed with the legacy `JWT_SECRET`, so the suite signs with an HS256 header. A control case (the same token with a future `exp` answers 200) proves the 401 comes from the expiry, not the signature.
- **Profile:** `authenticated` is deliberately never granted DELETE on `profiles` (pgTAP 170), so a claimed name could not be cleaned up and broke pgTAP 170. On the user's choice, the profile cases are read-only: each user's GET answers its own unclaimed name, and B's invalid PUT answers 400 and writes nothing. Row isolation stays with pgTAP 170 ("A cannot read B").
- **Seed clean-up bug (found while checking):** the existing suite used IGDB game 1942, which the seed already holds for both users, and its clean-up deleted those rows, so `test:db` failed after `api:local`. The suite's game now uses id 7346, which the seed never uses.

## Expected files

- `apps/web/app/api/v1/lists/[type]/[list]/route.ts`
- `apps/web/app/api/v1/cross-user.local.ts`
- `scripts/api-local.sh`
- `docs/specs/0033-mobile-app-expo/0035-mobile-api-v1.md`
- `docs/deploy.md` (one sentence)

## Requirements

- No route behaviour changes; `pnpm test` stays green with no edits to the existing unit tests.
- The local suite still leaves the seed exactly as it found it.

## Security considerations

- No elevated role: every cleanup uses the user's own session.
- The dev JWT secret is read only from the running local stack, in the opt-in script, and never written to a file.

## Acceptance criteria

- The lists route builds `pageSize` from `V1_PAGE_SIZE`.
- `pnpm api:local` passes, with new cases for episodes, seasons, show tracking, profile and an expired token.
- After `pnpm api:local`, `pnpm test:db` passes without a db reset.
- Spec 0035 no longer contradicts the code on page size, search, profile, game write, restore errors, rate limits or the library catalog failure.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm api:local` (local stack via OrbStack), then `pnpm test:db`.

## Manual test steps

1. Run `orb start`, then `pnpm exec supabase start`.
2. Run `pnpm api:local` and confirm every case passes, including the new describe blocks.
3. Run `pnpm test:db` immediately afterwards and confirm 030/040 pass (a clean seed).
4. Run `curl "http://localhost:3000/api/v1/lists/movie/popular?page=1"` against `pnpm dev:docker` and confirm `"pageSize":24`.

## Commits

1. `fix(api): read the lists page size from core`
2. `test(api): cover shows, episodes, profile and an expired token across users`
3. `docs(spec): record the shipped v1 decisions in spec 0035`
