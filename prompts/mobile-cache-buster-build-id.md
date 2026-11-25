# Fix: a new build reads an old build's cached answers and crashes

## Goal

Opening Dexter: Resurrection (TMDB tv 259909) crashes the personal Release build installed on 2026-11-25. Stop a new build from rendering query data that an older build saved to disk.

## What happened (inspected)

- Device console (`devicectl process launch --console`): `TypeError: Cannot read property 'length' of undefined` in `showFacts` (`apps/mobile/src/components/title-details.tsx`), called by `ShowScreen`. `namesFact` reads `show.networks.length`.
- Production's answer for `/api/v1/shows/259909` passes `v1ShowSchema` and renders in Jest. The API is fine.
- `PersistQueryClientProvider` restores the query cache from AsyncStorage for 24 hours. `persistOptions.buster` is `appVersion()`, which is `app.json`'s `version` (`apps/mobile/src/lib/query-client.ts`).
- The old personal build and the new one are both `1.1.0`. The old build was made before `networks`, `productionCompanies` and `cast` were added to the v1 show and movie reads (1e072ef8, PR #100). Its core schema dropped those keys and the app saved the stripped show to disk. The new build kept the cache because the version matched, so it rendered a show with no `networks`.
- Restored data never runs through `apiRequest`'s schema parse, so any title the old build cached in the last 24 hours can crash the new build (movies through `productionCompanies`, shows through `networks` or `cast`).

## Decision

The cache buster becomes the app version plus a build ID: `appVersion()` + `:` + `extra.buildId`.
- `app.config.ts` sets `extra.buildId` to the short git commit SHA when the config is evaluated (Xcode build, EAS build, `eas update`). Each build from a new commit drops the old cache, just as a version bump does today.
- If git is unavailable, `buildId` is absent and the buster stays the version alone, which is today's behavior.
- The SHA stays stable across Metro reloads, so the offline cache keeps working in development.
- Rejected: a hand-bumped cache version (easy to forget, which is how this bug happened); `?? []` guards in `namesFact` (hides one symptom, and the next missing field crashes elsewhere); validating restored entries against core schemas (TanStack has no per-query restore hook, so it means a larger change).

## Expected files

- `apps/mobile/app.config.ts`: add `extra.buildId`.
- `apps/mobile/src/lib/query-client.ts`: buster from version and build ID; JSDoc cites this plan.
- `apps/mobile/src/lib/query-client.test.ts` (or the existing persistence test): buster changes when the build ID changes and equals the version when absent.
- `apps/mobile/AGENTS.md`: one line on the buster.

## Security

No change. The commit SHA is public repository metadata; no secret enters the bundle (AGENTS.md section 11).

## Acceptance criteria

1. Two builds of the same version from different commits never share a persisted cache.
2. With no build ID, the buster equals the app version.
3. After installing the fixed build, Dexter: Resurrection opens on the phone.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (mobile Jest included).

## Manual test

1. Rebuild and install the personal Release build (`docs/deploy.md` section 12, `apps/mobile/AGENTS.md`).
2. Open Shows, then Dexter: Resurrection. It opens with its Facts (Networks: Paramount+ with Showtime).
3. Open a movie viewed earlier today. It opens.
