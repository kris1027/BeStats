# 0033. Mobile app: an Expo client beside the web app, sharing one core and one API

**Date**: 2026-11-18
**Status**: In Progress

Scope feature: [28. Mobile app (iOS and Android)](../../scope/scope.md#28-mobile-app-ios-and-android--planned--ga) · GA tier

## Summary

BeStats gets a real iOS and Android app built with Expo (a toolkit on top of React Native), living next to the Next.js web app in one pnpm monorepo. The phone never holds the TMDB or IGDB keys, so it talks to a new versioned API (`/api/v1`) on the existing Vercel project, which reuses today's catalog modules and the same server side rules as the Server Actions. Pure rules (ratings, progress, schemas) move into a shared `packages/core` so web and mobile can never disagree. Every screen is rebuilt natively in the look of the shipped web UI, starting with one thin thread: sign in, open a movie, mark it watched.

## Structure

This is an umbrella decision. `index.md` holds the overall stack and the contracts the children share; each child is complete enough to build from on its own.

- [0034-monorepo-shared-core.md](0034-monorepo-shared-core.md): the repo move to `apps/web`, `apps/mobile`, `packages/core`, and the rule for what code may live in core. Supports the code sharing decision.
- [0035-mobile-api-v1.md](0035-mobile-api-v1.md): the `/api/v1` surface, bearer auth, caching, rate limits and the minimum version check. Supports the "keys stay on the server" decision.
- [0036-mobile-auth-account-deletion.md](0036-mobile-auth-account-deletion.md): mobile sessions, deep links for email flows, and self serve account deletion for both apps. Supports the auth and App Store compliance decision.

The children take numbers 0034 to 0036, so the next top level spec is 0037, not 0034.

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a signed in user on my phone, I want to browse, search and track movies, shows and games in a native app, so I don't have to open the website.
- As a user, I want the app to follow exactly the same rules, page names and ratings as the web, so my library looks the same wherever I open it.
- As a user, I want to delete my account myself, in either app, so I don't have to send an email.
- As the operator, I want no catalog secret or service role key anywhere a phone can reach, so shipping an app doesn't weaken the security model.

**Acceptance criteria** (the contract):

- **AC-1**: The web app lives in `apps/web`, the Expo app in `apps/mobile` and the shared pure code in `packages/core`. After the move, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm test:db` pass from the root, and a Vercel preview of `apps/web` serves the same routes and behavior as before (child 0034).
- **AC-2**: No file under `packages/core/src` imports `server-only`, `next`, `react`, `react-native`, `expo*` or `@supabase/*`, or reads `process.env`; a core purity test fails otherwise. Every rule both apps use lives in core, once (child 0034).
- **AC-3**: The TMDB and IGDB credentials are read only in `apps/web/lib/tmdb/env.ts` and `apps/web/lib/igdb/env.ts`; no workspace file names the service role key; neither secret takes a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix. `security-boundary.test.ts` scans the whole workspace and proves it (children 0034, 0036).
- **AC-4**: Every handler under `/api/v1` goes through `withV1`: version check (400 without a valid header, 426 below `MIN_APP_VERSION`, `/config` exempt), bearer auth on `me` routes with the user ID from the verified `sub` claim, Zod parsing with the core schemas, and the error body `{ error: { code, message } }` (child 0035).
- **AC-5**: Each v1 write route calls the same command as its Server Action and returns the same result union for the same input; the web's Server Actions behave exactly as before the split (child 0035).
- **AC-6**: The release gate runs on the server for every write: watching or scoring a movie, and Playing, Finished or a score on a game, before release day (UTC) answers 409 `not_released` and writes nothing. Removing a mark, score or status is never gated (`lib/tracking/AGENTS.md`) (child 0035).
- **AC-7**: Every write that the web offers Undo for returns a `cleared` state (or, for the watchlist, an Undo the server can honor), and posting it to the matching `…/restore` route restores the earlier state for the caller's own rows only (child 0035).
- **AC-8**: Public v1 routes answer `public, s-maxage=…` on success and `no-store` on errors and 426; every `me` route answers `private, no-store`. A test asserts both for every route (child 0035).
- **AC-9**: User B's token cannot read or change user A's rows through any v1 route; no token, an expired token or the publishable key as a token answers 401 (child 0035, AGENTS.md section 11).
- **AC-10**: The app's library tabs, pages, routes and names come from `LIBRARY_PAGE_PATHS`, `libraryPages` and `libraryPageName` in core and match the web on all three tabs; `/api/v1/me/library` accepts only a type and route pair `libraryPageAt` resolves, and answers 404 otherwise (child 0035).
- **AC-11**: The app signs in with email and password, keeps the session encrypted at rest (key in `expo-secure-store`, encrypted session in AsyncStorage), refreshes only through `supabase-js`, and on a second 401 signs out with a visible notice (child 0036).
- **AC-12**: `delete_own_account()` deletes only the caller's account and, by cascade, every row of theirs in the five user tables; `anon` cannot execute it. Web (`/account`) and mobile both offer it behind typing `DELETE`, then sign out; pgTAP proves the cascade and the grants (child 0036).
- **AC-13**: Sign out, an expired session and account deletion clear the persisted query cache, so no private data stays on the phone. Offline, the last loaded library and title pages show with a banner and writes fail visibly with Retry (child 0036).
- **AC-14**: The app has an About screen showing `TMDB_ATTRIBUTION`, `IGDB_ATTRIBUTION` and the two logos, plus the web's catalog notice wherever catalog data shows; personal ratings are visibly apart from TMDB and IGDB ratings.
- **AC-15**: `/privacy` gains a mobile app section naming Expo (EAS Update) as a new processor in `PROCESSORS`, saying the app loads images straight from TMDB's and IGDB's image services, and describing self serve deletion; `/terms` changes with it, and `LEGAL_LAST_UPDATED` moves in the same PR. The App Store and Play privacy labels match that text.
- **AC-16**: Universal Links and Android App Links open `/reset-password/app` and the title paths (`/movies/*`, `/shows/*`, `/games/*`) in the app; library routes are not linked in v1 (child 0036).
- **AC-17**: An EAS build of the app reaches TestFlight and Play internal testing, signs in, browses, searches, tracks and shows every library page.

## Decision

**Chosen option**: Option 1: Expo app with a shared core and a versioned API on the web project.

Build a native Expo app for iOS and Android in `apps/mobile`, backed by `/api/v1` Route Handlers in `apps/web` and pure shared code in `packages/core`; the web app keeps its Server Components and Server Actions unchanged in behavior.

**Implementation skills**: `expo-router` (`expo/skills`, `.agents/skills/expo-router/`) · `expo-dev-client` (`expo/skills`, `.agents/skills/expo-dev-client/`) · `expo-design-system` (`expo/skills`, `.agents/skills/expo-design-system/`) · `eas-app-stores` (`expo/skills`, `.agents/skills/eas-app-stores/`) · `eas-update` (`expo/skills`, `.agents/skills/eas-update/`) · `expo-upgrade` (`expo/skills`, `.agents/skills/expo-upgrade/`) · `vercel-react-native-skills` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-native-skills/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `tanstack-query` (`tanstack-skills/tanstack-skills`, `.agents/skills/tanstack-query/`) · `react-native-testing` (`callstack/react-native-testing-library`, `.agents/skills/react-native-testing/`) · `supabase` and `supabase-postgres-best-practices` (already installed, for the deletion function and bearer auth) · `next-dev-loop` (already installed, for checking the v1 routes in the running web app)

## Proposed stack

Versions are as of 2026-11-18 and move fast; confirm the current ones when the scaffold runs (basis: the landscape check in rationale.md).

| Layer | Choice | Reason |
|---|---|---|
| Delivery | Native app with Expo, iOS and Android from one codebase | Passes App Store review (a wrapped website risks guideline 4.2) and reaches both platforms with one team (basis: rationale.md, Options considered). |
| Expo SDK | Latest stable at scaffold time (SDK 58 with React Native 0.88 today) | Expo picks matching React Native and React versions, so the app never hand tunes native versions. Confirm its React version against web's `react` 19.2. |
| Repo | pnpm monorepo: `apps/web`, `apps/mobile`, `packages/core`, `supabase/` stays at the root | One lockfile and one PR for a rule change in both apps (child 0034). |
| Navigation | Expo Router, file based, paths mirroring web (`/movies/[id]`, `/shows/[id]/season/[number]`, `/games/[id]`, library routes) | The same path names keep the two apps easy to compare; in v1, Universal Links open only the title paths and `/reset-password/app` in the app (child 0036) (basis: `lib/catalog/AGENTS.md` route names). |
| Styling | NativeWind v5 (Tailwind v4, `@theme` tokens), exact versions pinned, plus `expo-blur` for glass plates | The only option that shares Tailwind v4 tokens with `app/globals.css`. It is a release candidate, so the tracer slice proves it first and Uniwind is the named fallback. |
| Design source | The shipped web UI and `/showcase`, adapted to native patterns (tab bar, sheets, swipe back, 44pt targets) | AGENTS.md section 3: the shipped UI is the design reference; redesign nothing unasked. |
| Data layer | TanStack Query v5 with a persisted cache in AsyncStorage | Caching, retries and refetch on focus, plus the offline read cache the engineer chose. |
| Images | `expo-image` loading straight from the TMDB and IGDB image CDNs | Image URLs need no secret, and disk caching is built in, so no Vercel image quota is spent. |
| Catalog and writes | `/api/v1` Route Handlers in `apps/web`, Zod contracts in `packages/core` | Keys stay in `lib/tmdb/env.ts` and `lib/igdb/env.ts` (AGENTS.md section 11), and the release gate stays on the server (child 0035). |
| Auth | Supabase Auth, email and password only in v1; `supabase-js` session encrypted at rest, its key in `expo-secure-store` | Matches web today; Google and Sign in with Apple come later together (child 0036). |
| Account deletion | Security definer `delete_own_account()` in Postgres, called by web and mobile | Required by App Store guideline 5.1.1(v), and keeps the service role ban from spec 0001 AC-15 intact (child 0036). |
| Deep links | Universal Links and Android App Links on the web domain | One https link opens the app or falls back to the web page (child 0036). |
| Builds and releases | EAS Build, EAS Submit, EAS Update (over the air JS fixes) | No Mac build pipeline to run; free plan covers 15 iOS and 15 Android builds and 1,000 update users. |
| Tests | Vitest for `packages/core` and web; `jest-expo` plus React Native Testing Library for mobile screens | Vitest's React Native support is thin; core rules keep their existing Vitest suites. |
| Observability | Store consoles only (App Store Connect, Play Console); server logs as today | No crash reporting or analytics SDK. EAS Update is the one new processor: every installed app asks Expo's servers for updates, which see the device's IP address, so Expo joins `PROCESSORS` and `/privacy` (AC-15). |
| Store identity | Bundle and package ID `com.kris1027.bestats`, published from an individual developer account as kris1027 | Matches the data controller in `lib/legal/operator.ts`, so `/privacy` stays true. The ID can never change after the first upload. |

## Shared contracts (across the children)

- **Same rules, one place.** Every product rule in AGENTS.md section 7 and section 9 runs either in Postgres or in a function both apps call. Mobile never reimplements a rule; it imports it from `packages/core` (pure) or calls `/api/v1` (needs catalog data or the session).
- **Action cores.** Each Server Action in `app/movies/actions.ts`, `app/shows/actions.ts`, `app/games/actions.ts` and `app/account/actions.ts` splits into a framework free core (`lib/tracking/commands/*`, server only) taking `(supabase client, parsed input)` and returning the existing result types. The Server Action keeps parsing, the cookie session and `refresh()`; the v1 route keeps parsing, the bearer session and cache headers. Both call the same core.
- **One result shape.** v1 write routes return the same `MovieTrackingResult` style unions the actions return today, as JSON, so the mobile UI handles failures exactly as the web does.
- **Attribution**: the app has an About screen showing `TMDB_ATTRIBUTION` and `IGDB_ATTRIBUTION` (moved to core) with the two logos, and the same footer notice the web uses wherever catalog data is shown (AGENTS.md section 12, spec 0017).
- **Library tabs**: the app's library pages, their routes and their names come from `LIBRARY_PAGE_PATHS`, `libraryPages` and `libraryPageName` in core, so they match the web exactly. Page keys are not names: games' `upcoming` key is Playing (`/playing`) and movies' `upcoming` key is Coming soon (`/coming-soon`). The API and the app address a page by its route path plus type, never by a key read as a name; only games have the `coming-soon` key.
- **English only, real data only** (AGENTS.md section 3 and section 14): the app shows TMDB English text first with the original language as fallback, never invented metadata, and personal ratings visibly apart from TMDB and IGDB ratings.

## First slice (the tracer, Tracer Bullet approach)

The project builds Tracer Bullet style (`docs/scope/scope.md` header). The first thread through every layer is: **sign in, open a movie, mark it watched**. It proves the monorepo move (web still deploys from `apps/web`), `packages/core`, one public v1 read (`GET /api/v1/movies/{id}`), one private v1 write (`PUT /api/v1/me/movies/{id}/watched`) with bearer auth and the release gate, the secure session store, NativeWind v5 on a real device, and an EAS development build. It also proves two risky assumptions early: that a `use cache` catalog read works when a command is called from a Route Handler under `cacheComponents`, and that `delete_own_account()` can delete from `auth.users` (a pgTAP test, even though deletion itself ships later). Everything else thickens from there, in the order of the Build plan below.

## Build plan

Tracer Bullet: the monorepo move lands alone first, because every later path depends on it; then one thin thread through every layer; then the API and the app thicken; the release comes last.

1. **Monorepo move**: `git mv` the web into `apps/web`, the workspace, Biome, CI path filters, Vercel Root Directory and `turbopack.root`, the boundary tests widened to the workspace, green on a Vercel preview, in its own PR with no other change, satisfies **AC-1**, **AC-3**
2. **Shared core**: `packages/core` from the file inventory in child 0034, the splits, the `pnpm tokens` script and its CI check, the core purity test, `pnpm db:types` writing into core, satisfies **AC-2**
3. **Tracer: sign in, open a movie, mark it watched**: `withV1`, `bearer.ts`, the first command split (`setMovieWatched`), `GET /api/v1/movies/{id}`, `PUT /api/v1/me/movies/{id}/watched`, `/api/v1/config`, the Expo app with the secure session store, NativeWind v5 and an EAS development build on a real iPhone and Android phone, the `use cache` from a Route Handler proof and the pgTAP proof that `delete_own_account()` can delete from `auth.users`, satisfies **AC-4**, **AC-5**, **AC-6** (movies), **AC-11**
4. **API thickened**: every public and `me` route, every command split, the cleared state union and the restore routes, `/me/titles` and `/me/library` batching, the claim username sign up, the caching headers and their per route test, the cross user HTTP tests, the firewall rules recorded in `docs/deploy.md`, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**
5. **App thickened**: every screen ported from the shipped UI and `/showcase` (catalog, search, title pages, seasons, library tabs, account), Undo toasts, the offline cache and its wipe, About and attribution, account deletion on web and mobile with its migration, the deep link files, satisfies **AC-10**, **AC-12**, **AC-13**, **AC-14**, **AC-16**
6. **Release**: Apple and Google developer accounts, EAS Submit, `/privacy` and `/terms` with Expo in `PROCESSORS` and `LEGAL_LAST_UPDATED`, the store privacy labels, the first TestFlight and Play internal builds, satisfies **AC-15**, **AC-17**

## Consequences

**Positive**:
- Phones get a native app in both stores while the web stays the public, indexed catalog.
- Rules move into one shared place, which also makes the web code easier to test.
- The new API, deletion function and deep links help the web too (self serve deletion closes a parked scope item).

**Negative / tradeoffs**:
- Every screen is built twice from now on (web and native). That is the biggest ongoing cost, larger than the API work.
- The monorepo move touches every path, Vercel's root directory, CI, and the nested `AGENTS.md` files.
- NativeWind v5 is a release candidate. If it fails on device, styling moves to Uniwind and the shared token story weakens.
- Two release trains: store review adds days to native fixes; EAS Update covers JS only fixes.
- A public, CDN cached v1 catalog API is easier to scrape than server rendered pages; the firewall rule limits it.

**Neutral**:
- New accounts: Apple Developer Program (yearly fee), Google Play Console (one time fee), Expo account.
- `/privacy` gains a short section on the mobile app (Expo added as a processor for EAS Update, store providers as distribution only, images loaded straight from TMDB and IGDB) and the store privacy labels; `LEGAL_LAST_UPDATED` changes with it (AC-15).
- The `supabase/AGENTS.md` note that `username_available` is "the one security definer function" changes to name `delete_own_account` as the second exception.

## Follow-up

- [x] Enroll this as a scope feature: feature 28 in `docs/scope/scope.md`.
- [ ] Root `AGENTS.md` needs a mobile section and a pointer to a new `apps/mobile/AGENTS.md` (Expo, NativeWind, TanStack Query, EAS conventions), and section 5 ("no `src/`", one app at the root) changes with the monorepo. `/sync` owns this after the build.
- [ ] The installed skills (`expo-router`, `expo-dev-client`, `expo-design-system`, `eas-app-stores`, `eas-update`, `expo-upgrade`, `vercel-react-native-skills`, `react-native-best-practices`, `tanstack-query`, `react-native-testing`) are not yet in AGENTS.md; their conventions belong in `apps/mobile/AGENTS.md`, not root, since they only matter there.
- [ ] Consider the `expo-web-to-native` skill from `expo/skills`; it is written for moving a whole web app to native and was not installed in this run.
- [ ] Connect the official Expo MCP server once the EAS project exists (`claude mcp add --transport http expo https://mcp.expo.dev/mcp`); it gives the agent live build and docs access.
- [ ] Push notifications (new episode aired for a tracked show) are out of v1. Design them in their own spec: a device token table, a scheduled air date check, and Expo Push as a new processor.
- [ ] Google sign in and Sign in with Apple come to web and mobile together in a later spec (Apple requires its own sign in once any third party sign in ships on iOS).
- [ ] Password reset is unavailable on web and mobile while production email delivery is off (`docs/deploy.md`). Accepted for v1; turning it on is the existing email delivery decision from spec 0018.
- [ ] Record the `/api/v1` firewall rules from child 0035 in `docs/deploy.md` when they are created in the Vercel dashboard.
- [ ] Before the first store upload, confirm the current Expo SDK's React version against web's React 19.2 and the NativeWind v5 status; switch to Uniwind if v5 is still not production ready by then.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
