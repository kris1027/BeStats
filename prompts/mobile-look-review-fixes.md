# Mobile look: review fixes

## Goal

Fix the eight minor findings from `/check review mobile look` (2026-11-25, [docs/reviews/2026-11-25-feat-mobile-look-close.md](../docs/reviews/2026-11-25-feat-mobile-look-close.md)), so the feature can close with no open review item. You see no new screens. The only visible change is a toast when a link cannot open.

## Inspected code

- `apps/mobile/src/components/title-extras.tsx` (Trailer, Where to watch link, `MoreLikeThis`)
- `apps/mobile/src/screens/about-screen.tsx` (legal links, credit, logo links: the same unhandled `Linking.openURL`)
- `apps/mobile/src/lib/password.ts` and `apps/mobile/src/screens/change-password-screen.tsx`
- `apps/mobile/src/lib/card-states.ts` and its callers `poster-grid.tsx`, `landing-section.tsx`, `title-extras.tsx`
- `apps/mobile/src/lib/catalog.ts` (`catalogKeys.extras`), `apps/mobile/src/lib/query-client.ts` (persistence)
- `apps/web/app/api/v1/shows/[id]/route.ts`
- `packages/core/src/api/v1/movie.ts`, `show.ts`, `docs/deploy.md`, `apps/mobile/AGENTS.md`

## Skills used

`check` (the findings), `tanstack-query` (query keys, `dehydrateOptions`), `vercel-react-native-skills` (Linking).

## Decisions and assumptions

1. **Links that fail to open (finding 1).** A new hook `useOpenLink()` in `apps/mobile/src/lib/open-link.ts` calls `Linking.openURL` and, when it rejects, shows a toast: "Could not open the link." All five `Linking.openURL` calls go through it, the three on About too, since they have the same gap.
2. **Change password before its try (finding 2).** `getSupabase()` and `getPublicEnv()` move inside a `try` that returns `failure(AUTH_OUTCOME.unexpected)`, so a broken build shows the unexpected error line under the form instead of a dead button.
3. **Cards read one by one (finding 3).** The batch read returns only the ids it actually seeded, and only those count as known. A title the answer leaves out stays the plain catalog card (decision 6 of the card actions plan) and never triggers its own read.
4. **Memo that never holds (finding 4).** Every caller (`PosterGrid`, `LandingSection`, `MoreLikeThis`) passes a new array on each render, so the fix goes inside `useCardStates`: it keeps the previous ids array while `idsKey(ids)` is unchanged. One fix covers all three.
5. **Release order for new v1 fields (finding 5).** The schemas stay strict, since making the fields optional would spread null checks through the screens for a case only the release order causes. The rule goes into `docs/deploy.md` and `apps/mobile/AGENTS.md`: a new required field in a v1 answer means deploying the web before submitting the app build. Today the web already serves these fields (PR #113 is deployed), so nothing is broken now.
6. **Cast read for a missing show (finding 6).** The cast read keeps running beside the show read. Running it after would add one TMDB round trip to every cold show page to save one call on a mistyped id, which only a bad deep link sends, and the cast has its own day long cache. A comment in the route records this trade. **Your call:** say if you would rather read the cast after the show answers.
7. **Extras and the country (finding 6 in the file, "extras cache key").** The app cannot know the country before it asks, so the key cannot carry it. The extras answer is left out of the 24 hour offline cache (`shouldDehydrateQuery`), so a restart after a trip always reads the new country. Inside one session the 60 second `staleTime` already refreshes it.
8. **An old seed over a newer write (finding 8).** The batch read notes when it started and skips seeding any title whose key was updated after that (`dataUpdatedAt`), as well as one with a write in flight.

The four nits stay out of scope.

## Expected files

- New: `apps/mobile/src/lib/open-link.ts`, `apps/mobile/src/lib/open-link.test.tsx`
- Changed: `title-extras.tsx`, `about-screen.tsx`, `password.ts`, `password.test.ts`, `card-states.ts`, `card-states.test.tsx`, `query-client.ts`, `query-client.test.ts`, `apps/web/app/api/v1/shows/[id]/route.ts` (comment only), `docs/deploy.md`, `apps/mobile/AGENTS.md`, `docs/scope/scope.md`, the review file (each finding marked fixed)

## Requirements

- R1: a refused `openURL` shows the toast; no unhandled rejection.
- R2: a throw from `getSupabase` or `getPublicEnv` returns the unexpected outcome.
- R3: a title missing from the batch answer is not known and reads nothing on its own.
- R4: same ids in a new array give the same `useQueries` input.
- R5: the release order rule is written down.
- R6: extras are never persisted; other catalog answers still are.
- R7: a key updated after the batch read started is not overwritten.

## Security considerations

No new data leaves the phone. The toast names no URL. Extras are public catalog data; leaving them out of the disk cache only removes data. No password handling changes beyond moving two calls inside a `try`.

## Acceptance criteria

Each requirement above has a test that fails before the fix and passes after it (R5 is docs only).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (the route comment touches server code).

## Manual test steps

1. In the iOS Simulator, open a movie with a trailer, tap Trailer: YouTube or Safari opens.
2. Open a title with Where to watch, tap "All options on TMDB": Safari opens.
3. Signed in, open Home and a title's More like this: the cards show your marks, and the network log shows one `/me/titles` read per section, none per card.
4. Account, Change password: a wrong current password still shows its field error.
