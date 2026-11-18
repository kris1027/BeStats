# 0033. Mobile app: an Expo client beside the web app, sharing one core and one API

**Date**: 2026-11-18
**Status**: Proposed

## Summary

BeStats gets a real iOS and Android app built with Expo (a toolkit on top of React Native), living next to the Next.js web app in one pnpm monorepo. The phone never holds the TMDB or IGDB keys, so it talks to a new versioned API (`/api/v1`) on the existing Vercel project, which reuses today's catalog modules and the same server side rules as the Server Actions. Pure rules (ratings, progress, schemas) move into a shared `packages/core` so web and mobile can never disagree. Every screen is rebuilt natively in the look of the shipped web UI, starting with one thin thread: sign in, open a movie, mark it watched.

## Structure

This is an umbrella decision. `index.md` holds the overall stack and the contracts the children share; each child is complete enough to build from on its own.

- [0034-monorepo-shared-core.md](0034-monorepo-shared-core.md): the repo move to `apps/web`, `apps/mobile`, `packages/core`, and the rule for what code may live in core. Supports the code sharing decision.
- [0035-mobile-api-v1.md](0035-mobile-api-v1.md): the `/api/v1` surface, bearer auth, caching, rate limits and the minimum version check. Supports the "keys stay on the server" decision.
- [0036-mobile-auth-account-deletion.md](0036-mobile-auth-account-deletion.md): mobile sessions, deep links for email flows, and self serve account deletion for both apps. Supports the auth and App Store compliance decision.

Reasoning and options: see [rationale.md](rationale.md).

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
| Navigation | Expo Router, file based, paths mirroring web (`/movies/[id]`, `/shows/[id]/season/[number]`, `/games/[id]`, library routes) | Universal links open the same path in the app that they open on the web (basis: `lib/catalog/AGENTS.md` route names). |
| Styling | NativeWind v5 (Tailwind v4, `@theme` tokens), exact versions pinned, plus `expo-blur` for glass plates | The only option that shares Tailwind v4 tokens with `app/globals.css`. It is a release candidate, so the tracer slice proves it first and Uniwind is the named fallback. |
| Design source | The shipped web UI and `/showcase`, adapted to native patterns (tab bar, sheets, swipe back, 44pt targets) | AGENTS.md section 3: the shipped UI is the design reference; redesign nothing unasked. |
| Data layer | TanStack Query v5 with a persisted cache in AsyncStorage | Caching, retries and refetch on focus, plus the offline read cache the engineer chose. |
| Images | `expo-image` loading straight from the TMDB and IGDB image CDNs | Image URLs need no secret, and disk caching is built in, so no Vercel image quota is spent. |
| Catalog and writes | `/api/v1` Route Handlers in `apps/web`, Zod contracts in `packages/core` | Keys stay in `lib/tmdb/env.ts` and `lib/igdb/env.ts` (AGENTS.md section 11), and the release gate stays on the server (child 0035). |
| Auth | Supabase Auth, email and password only in v1; `supabase-js` session stored with `expo-secure-store` | Matches web today; Google and Sign in with Apple come later together (child 0036). |
| Account deletion | Security definer `delete_own_account()` in Postgres, called by web and mobile | Required by App Store guideline 5.1.1(v), and keeps the service role ban from spec 0001 AC-15 intact (child 0036). |
| Deep links | Universal Links and Android App Links on the web domain | One https link opens the app or falls back to the web page (child 0036). |
| Builds and releases | EAS Build, EAS Submit, EAS Update (over the air JS fixes) | No Mac build pipeline to run; free plan covers 15 iOS and 15 Android builds and 1,000 update users. |
| Tests | Vitest for `packages/core` and web; `jest-expo` plus React Native Testing Library for mobile screens | Vitest's React Native support is thin; core rules keep their existing Vitest suites. |
| Observability | Store consoles only (App Store Connect, Play Console); server logs as today | No new processor in `PROCESSORS` or `/privacy`. |
| Store identity | Bundle and package ID `com.kris1027.bestats`, published from an individual developer account as kris1027 | Matches the data controller in `lib/legal/operator.ts`, so `/privacy` stays true. The ID can never change after the first upload. |

## Shared contracts (across the children)

- **Same rules, one place.** Every product rule in AGENTS.md section 7 and section 9 runs either in Postgres or in a function both apps call. Mobile never reimplements a rule; it imports it from `packages/core` (pure) or calls `/api/v1` (needs catalog data or the session).
- **Action cores.** Each Server Action in `app/movies/actions.ts`, `app/shows/actions.ts`, `app/games/actions.ts` and `app/account/actions.ts` splits into a framework free core (`lib/tracking/commands/*`, server only) taking `(supabase client, parsed input)` and returning the existing result types. The Server Action keeps parsing, the cookie session and `refresh()`; the v1 route keeps parsing, the bearer session and cache headers. Both call the same core.
- **One result shape.** v1 write routes return the same `MovieTrackingResult` style unions the actions return today, as JSON, so the mobile UI handles failures exactly as the web does.
- **Attribution**: the app has an About screen showing `TMDB_ATTRIBUTION` and `IGDB_ATTRIBUTION` (moved to core) with the two logos, and the same footer notice the web uses wherever catalog data is shown (AGENTS.md section 12, spec 0017).
- **Library tabs**: the app's library pages and their names come from `LIBRARY_PAGE_PATHS` and `libraryPageName` in core, so they match the web exactly (games have no Upcoming page, shows have no Coming soon page).
- **English only, real data only** (AGENTS.md section 3 and section 14): the app shows TMDB English text first with the original language as fallback, never invented metadata, and personal ratings visibly apart from TMDB and IGDB ratings.

## First slice (the tracer, Tracer Bullet approach)

The project builds Tracer Bullet style (`docs/scope/scope.md` header). The first thread through every layer is: **sign in, open a movie, mark it watched**. It proves the monorepo move (web still deploys from `apps/web`), `packages/core`, one public v1 read (`GET /api/v1/movies/{id}`), one private v1 write (`PUT /api/v1/me/movies/{id}/watched`) with bearer auth and the release gate, the secure session store, NativeWind v5 on a real device, and an EAS development build. It also proves two risky assumptions early: that a `use cache` catalog read works when a command is called from a Route Handler under `cacheComponents`, and that `delete_own_account()` can delete from `auth.users` (a pgTAP test, even though deletion itself ships later). Everything else thickens from there. The build steps themselves are derived by `/develop` from this spec and its children.

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
- `/privacy` gains a short section on the mobile app (same processors, store providers as distribution only) and the store privacy labels; `LEGAL_LAST_UPDATED` changes with it.
- The `supabase/AGENTS.md` note that `username_available` is "the one security definer function" changes to name `delete_own_account` as the second exception.

## Follow-up

- [ ] Enroll this as a scope feature (or a small epic) in `docs/scope/` so `/develop` can build the tracer and its thickening slices.
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
