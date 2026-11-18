# 0033. Mobile app: rationale

The decision record behind [index.md](index.md). `/develop` reads the index and children; this file explains why.

## Context

BeStats is a Next.js 16 web app (about 42 pages, 139 components, 55 of them client components) on Vercel, with Supabase for accounts and private state and TMDB and IGDB as the catalog. People track what they watch and play mostly on their phones, and the product's inspiration (TV Time) lives in the app stores. The question is how to get BeStats onto phones without breaking what makes the web app correct.

Several forces constrain the answer. The TMDB token and IGDB credentials may be read only in two server files and never reach a browser (AGENTS.md section 11), so any phone client needs a server between it and the catalog. Most reads happen inside Server Components and every write is a Server Action (5 action files, about 20 mutations); neither is callable from a native app. The product rules (release day gate, season marks only for aired episodes, calculated ratings, library placement) are spread between Postgres functions, pure functions in `lib/`, and the actions, and 67 `lib/` files import `server-only` while 10 import Next.js modules, so not all of it can be imported by another runtime as is. The UI is built on Tailwind v4, shadcn and Base UI, which are web only.

The app stores add their own rules: Apple requires in app account deletion for any app that allows sign up (guideline 5.1.1(v)), rejects apps that are mainly a website in a shell (guideline 4.2), and requires Sign in with Apple once a third party sign in ships on iOS. Meanwhile the project bans the Supabase service role key anywhere in the repo (spec 0001 AC-15), which rules out the usual admin based deletion. The team is one developer, so whatever ships has to be maintainable by one person across two platforms plus the web.

Not deciding means either no mobile presence, or a quick wrapper that is likely to be rejected and can't work offline.

## Options considered

### Option 1: Expo app, shared core, versioned API on the web project

A native React Native app built with Expo for iOS and Android, in a pnpm monorepo with the web app. Pure rules move to `packages/core`; catalog reads and tracking writes go through `/api/v1` Route Handlers that reuse the existing catalog modules and the same server side cores as the Server Actions.

**Pros**:
- Real native app: passes review, feels native (gestures, sheets, haptics), works offline for reads.
- Keeps the security model: keys on the server, user ID from the verified session, RLS everywhere.
- One place per rule, shared by both apps.
- Expo handles native builds, signing and over the air JS updates, so no Mac build pipeline to maintain.

**Cons**:
- Every screen is built a second time; ongoing double UI work.
- A large mechanical repo move before any mobile code ships.
- A new public API surface to secure, cache and keep backward compatible.

### Option 2: Progressive Web App first, native later

Add a manifest, icons and a service worker so the existing web app installs to the home screen and caches pages.

**Pros**:
- Days of work, not months; one codebase stays.
- No store accounts, fees or review.

**Cons**:
- Not in the App Store, where people look for a tracker; iOS limits install prompts and background work.
- Server Components need the network, so offline is a shell at best.
- Delays, rather than avoids, the native decision.

### Option 3: Capacitor shell around the live website

A native container that loads the deployed web app, with native plugins for a few device features.

**Pros**:
- Fastest way into both stores; the web UI is reused as is.

**Cons**:
- High risk of rejection under guideline 4.2 (minimum functionality, "a repackaged website").
- No offline at all, since pages are server rendered remotely.
- Web interactions (hover patterns, web sheets) feel foreign on a phone.

### Option 4: Expo app writing directly to Supabase, catalog via Edge Functions

Same native app, but tracking writes go straight from the phone to Supabase (RLS keeps ownership safe), and catalog reads move to Supabase Edge Functions.

**Pros**:
- Fewer HTTP routes to write; RLS already protects ownership.
- Catalog functions sit next to the database.

**Cons**:
- The release day gate needs catalog dates the database never stores (AGENTS.md section 7), so it would run only on the device and could be bypassed.
- The catalog modules, their caching and failure handling would be rewritten for Deno, and the Next.js cache lost.
- Two backends to deploy and observe instead of one.

## Rationale

Option 1 is the only one that meets the store rules and the project's security model at the same time. The wrappers (Options 2 and 3) are cheap but fail the two things that matter for a tracker: being in the App Store, and being usable on a train with no signal. Option 4 gets the native app but moves a product rule onto the device, which AGENTS.md section 5 and section 11 exist to prevent: "every server operation rechecks", and the release gate cannot be rechecked without trusted catalog dates.

Routing the phone through `/api/v1` on the existing Vercel project costs one more API surface, but that surface reuses everything already built and tested (the catalog modules with their caching, rate limits and failure handling, and the action logic), and keeps one deploy for one developer. Splitting each action into a framework free core is real refactoring work, yet it makes the web code more testable too, and it is what guarantees the two apps behave identically.

On styling, the engineer chose NativeWind v5 knowing it is a release candidate. It is the only option that speaks Tailwind v4 and `@theme` tokens like the web, which is what lets one token source feed both apps. The risk is contained by pinning exact versions and proving it in the tracer slice on real devices, with Uniwind as the named fallback; stable NativeWind v4 was rejected because it would put a second Tailwind major in the monorepo.

On account deletion, the engineer first preferred a shared server route with an admin key. That conflicts with spec 0001 AC-15 and its enforced test, so the decision moved to a security definer function bound to `auth.uid()`: the store rule is met without adding the one key the project has deliberately kept out.

## Landscape check (2026-11-18)

- Expo SDK 58 is the latest stable (released 2026-10-15) with React Native 0.88. Its React version was not confirmed on an official page; check it against web's React 19.2 at scaffold time.
- NativeWind 5.0.0-rc.0 with `react-native-css` 3.1.0-rc.0 (upgrade together), built on Tailwind v4.1+, `@theme` config; the official page says it is not for production yet. NativeWind v4 stays on Tailwind 3.
- Supabase's Expo guide stores an encryption key in `expo-secure-store` and the AES encrypted session in AsyncStorage. Server side verification checks signature, expiry, issuer and audience.
- Expo monorepos: pnpm works with isolated dependencies since SDK 54; use `nodeLinker: hoisted` only if a native library fails; `expo/metro-config` without manual `watchFolders`.
- TanStack Query persistence: `maxAge` defaults to 24 hours; keep `gcTime` at least as long; use `buster` to drop the cache on breaking changes.
- EAS free plan: 15 Android and 15 iOS builds, 1,000 monthly update users, concurrency 1 on macOS.
- Agent Skills installed for this stack: `expo/skills` (router, dev client, design system, app stores, update, upgrade), `vercel-labs/agent-skills` (React Native), `callstackincubator/agent-skills` (performance), `tanstack-skills/tanstack-skills` (Query), `callstack/react-native-testing-library` (tests). The official Expo MCP server exists at `https://mcp.expo.dev/mcp` and is deferred until the EAS project exists.

## References

**Project sources**:
- `AGENTS.md` sections 3, 5, 7, 9, 11, 12, 13 and the Games and Commands sections
- `supabase/AGENTS.md` (security definer exception, cascades, pgTAP sweep)
- Spec 0001 (AC-15, service role ban), spec 0005 (authentication), spec 0010 (`/api/search` caching), spec 0017 (legal pages), spec 0018 (email confirmation off, Google deferred)
- `app/api/search/route.ts`, `app/auth/callback/route.ts`, `security-boundary.test.ts`, `lib/legal/operator.ts`
- Installed skills listed under Implementation skills in `index.md`

**Practices & standards**:
- Strangler pattern: build mobile beside the web, move code into core step by step, never a big bang rewrite
- Thin client, trusted server: business rules that need trusted data run on the server
- API versioning with a frozen v1 and a minimum client version
- Least privilege: a security definer function with no inputs instead of an admin key
- PKCE for the email reset flow

**Links** (checked during this design):
- Expo SDK 58 changelog: https://expo.dev/changelog/sdk-58
- Expo monorepo guide: https://docs.expo.dev/guides/monorepos/
- NativeWind v5 migration guide: https://www.nativewind.dev/v5/guides/migrate-from-v4
- Supabase Auth with Expo: https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth
- Supabase JWT fields: https://supabase.com/docs/guides/auth/jwt-fields
- TanStack Query persistQueryClient: https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Expo pricing (EAS free plan): https://expo.dev/pricing
- Expo MCP server: https://docs.expo.dev/eas/ai/mcp
