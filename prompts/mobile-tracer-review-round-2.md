# Mobile tracer review, round 2

## Goal

Fix the small, concrete findings from the two-axis review of `feat/mobile-tracer` against `main`, on the same branch, without widening the tracer's scope.

## Inspected code

- `apps/mobile/src/app/movies/[id].tsx`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/lib/{movies,api,query-client}.ts`
- `packages/core/src/tracking/intent.ts` (`applyTrackingIntent`), `packages/core/src/tracking/messages.ts`, `packages/core/src/format.ts` (`formatAirDate`), `packages/core/src/api/v1/{errors,titles}.ts`
- `apps/web/components/movie/movie-overview.tsx` ("No overview available.")
- JSDoc blocks named by the standards review
- `docs/specs/0033-mobile-app-expo/0036-mobile-auth-account-deletion.md:46`

## Skills used

None beyond the repo's AGENTS.md files (no schema, RLS or Supabase work).

## Decisions and assumptions

1. **Optimistic watched update uses core's rule.** `onMutate` maps the cached `{ planned, watchedAt, rating }` to core's `MovieTrackingState`, runs `applyTrackingIntent(state, { kind: "watched", value })`, and maps back, keeping `watchedAt` (now, or the existing date). The planned/watched/score rule then exists only in core, as apps/mobile/AGENTS.md requires.
2. **Shared copy moves to core.**
   - `MOVIE_OVERVIEW_MISSING = "No overview available."` goes in `tracking/messages.ts` beside the other movie copy. Both the web `MovieOverview` and the mobile screen use it, so the two apps say the same thing.
   - A `signedInAs(email)` helper goes in `auth/messages.ts` for the mobile home.
3. **The release date shows in full.** The meta line uses `formatAirDate(detail.releaseDate)` (for example "31 Mar 1999") in place of the year, falling back to the year. This matches plan decision 7, "poster, title, release date".
4. **The accessibility label follows the action.** It reads "Mark {title} watched" or "Remove {title} from watched", taken from a small core helper so the web can use it later.
5. **Error codes and keys get real types.**
   - `ApiError.code` is typed `V1ErrorCode | "network"`.
   - `fetchMovieState` throws `ApiError(…, "internal", V1_ERROR_MESSAGES.internal)` in place of a plain `Error`.
   - The private query-key root becomes one exported `PRIVATE_QUERY_ROOT = "me"` in `movies.ts`, used by both `queryKeys` and `clearPrivateQueries`.
   - `titles.ts` builds `titleKeySchema` and `movieTitleKey` from one `MOVIE_TITLE_PREFIX`.
6. **JSDoc blocks cite their AGENTS.md section**, alongside the spec they already cite:
   - the three v1 routes
   - `readBearerToken`
   - `checkTmdb`
   - `compareSemver` and `checkAppVersion`
   - the mobile `getPublicEnv`
7. **Spec 0036:46 is updated** to say sign out wipes every `"me"` query and every mutation, never `queryClient.clear()`, citing prompts/mobile-sign-out-spinner.md. /architect normally owns spec files; this is a one-line correction to match shipped, approved behaviour.

### Left out on purpose

- Moving the route-level Zod wrappers into core.
- Recording `reason` in spec 0035.
- `withJwtSkewRetry`.
- The command-layer refactors (long parameter list, functions that only pass calls on, the duplicated `TrackingDeps`).
- The duplicated sign-out tail.
- Real-device builds.

These are design calls or larger refactors, better handled in step 4 or by /architect.

## Expected files

- `apps/mobile/src/app/movies/[id].tsx`, `apps/mobile/src/app/index.tsx`
- `apps/mobile/src/lib/{movies,api,query-client}.ts`, `apps/mobile/src/lib/env.ts`, mobile tests as needed
- `packages/core/src/tracking/messages.ts`, `packages/core/src/auth/messages.ts`, `packages/core/src/api/v1/{titles,version}.ts`, with their tests
- `apps/web/components/movie/movie-overview.tsx`
- `apps/web/app/api/v1/**/route.ts`, `apps/web/lib/supabase/bearer.ts`, `apps/web/lib/tracking/commands/movie.ts`
- `docs/specs/0033-mobile-app-expo/0036-mobile-auth-account-deletion.md`

## Requirements

- No user-visible string literal remains in `apps/mobile/src/app`, apart from button labels already shared with the web pattern.
- The optimistic state for watched equals `applyTrackingIntent` for every starting state.
- Behaviour is otherwise unchanged.

## Security considerations

No change to auth, RLS or caching. The sign-out wipe keeps the same key root, now read from one constant.

## Acceptance criteria

1. Marking a planned movie watched clears planned at once. Unmarking a rated movie clears the rating at once. A refusal reverts both.
2. A movie with no overview reads "No overview available." on both web and mobile.
3. The movie screen shows the full release date.
4. The pill's accessibility label matches the action it will take.
5. Typecheck catches an `ApiError` code outside the v1 set.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile), `pnpm build`.

## Manual test steps

1. Run `pnpm dev:docker`, then in `apps/mobile` run `npx expo start --dev-client` with the simulator build.
2. Sign in, open movie 603, and check the full release date and the overview.
3. Tap Mark watched. With VoiceOver, check the label now reads "Remove The Matrix from watched". Tap again.
4. Open a movie with no overview on web and mobile, and check both read "No overview available."
