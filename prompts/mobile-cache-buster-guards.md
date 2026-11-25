# Guards for the build ID cache buster

## Goal

Make sure the fix in [mobile-cache-buster-build-id.md](mobile-cache-buster-build-id.md) keeps working: test that a cache saved by one build is never restored by another, and give EAS cloud builds a commit SHA even when `git` cannot run.

## Inspected code

- `apps/mobile/app.config.ts`: `gitBuildId()` runs `git rev-parse --short HEAD`; without git, `extra.buildId` is absent.
- `apps/mobile/src/lib/query-client.ts`: `cacheBuster(version, buildId)` and `persistOptions`.
- `apps/mobile/src/lib/query-client.test.ts`: already calls TanStack's `persistQueryClientSave` against AsyncStorage (the jest mock); `cacheBuster` is tested only as a pure function.
- `apps/mobile/src/lib/native-intent.test.ts`: `configForVariant()` evaluates `app.config.ts`.
- EAS docs (Built-in environment variables): every EAS Build job sets `EAS_BUILD_GIT_COMMIT_HASH`, the full commit hash. It is not set when `app.config.ts` is evaluated locally.

## Skills used

`vitest` is not used here: the mobile app runs Jest (`jest-expo`). `react-native-testing` conventions for test layout.

## Decisions

1. **Restore test through TanStack.** Save a query with `persistQueryClientSave` under buster `1.1.0:aaaaaaa`, then restore it into a fresh client with `persistQueryClientRestore` under `1.1.0:bbbbbbb`. The cache comes back empty and the stored entry is removed. A second case restores with the same buster and gets the query back, so the test can't pass because restore is broken. It uses `persistOptions`'s own persister settings and `cacheBuster`, so a change back to a version-only buster fails it.
2. **EAS fallback.** `buildId` comes from `EAS_BUILD_GIT_COMMIT_HASH`, cut to the same 7 characters `git rev-parse --short` prints, when the variable is set; otherwise from `git`; otherwise absent (version only, as today). EAS goes first because it is the commit EAS actually built, even if the upload has no `.git`. `eas update` runs where you run it (your Mac or CI), so it uses `git`.
3. **Config tests.** With `EAS_BUILD_GIT_COMMIT_HASH` set to a known hash, `extra.buildId` is its first 7 characters in both variants. With the variable unset, the existing git test still holds. Each test restores the variable afterwards.
4. Not doing: rendering screens with made-up "old shape" answers. It cannot predict the next missing field.

## Expected files

- `apps/mobile/app.config.ts`: read `EAS_BUILD_GIT_COMMIT_HASH` first; JSDoc cites this plan.
- `apps/mobile/src/lib/query-client.test.ts`: the two restore cases.
- `apps/mobile/src/lib/native-intent.test.ts`: the EAS variable case.
- `apps/mobile/AGENTS.md`: name the EAS source in the buster line.

## Security

The commit hash is public repository metadata. `EAS_BUILD_GIT_COMMIT_HASH` is a non-secret EAS system variable, read only in `app.config.ts`, never with an `EXPO_PUBLIC_` prefix (AGENTS.md section 11).

## Acceptance criteria

1. A cache saved under one build's buster restores nothing under another build's buster, and the stored entry is gone.
2. The same buster restores the saved query.
3. On EAS, `extra.buildId` is the built commit's short hash even without git.
4. Locally, behavior is unchanged: the git short SHA, or the version alone without git.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. Each new test is also run once against a broken version (version-only buster, EAS variable ignored) to show it fails.

## Manual test steps

None on the phone: nothing in the app's behavior changes for the personal build. To see the EAS path locally:
1. Run `cd apps/mobile && EAS_BUILD_GIT_COMMIT_HASH=88f28ab5ea39108ade978de2d0d1adeedf0ece76 npx expo config --type public | grep buildId`. Expect `buildId: '88f28ab'`.
2. Run the same command without the variable. Expect the current commit's short SHA.
