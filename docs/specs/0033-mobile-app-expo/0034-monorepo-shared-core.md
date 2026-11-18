# 0034. Monorepo and shared core: apps/web, apps/mobile, packages/core

**Date**: 2026-11-18

## Summary

Today the web app sits at the repo root. This child moves it into `apps/web`, adds the Expo app at `apps/mobile`, and creates `packages/core` for code both apps run. Core holds only pure TypeScript (no server, no Next.js, no React Native), so a rule written once runs the same everywhere. The database folder `supabase/` stays at the root because both apps share one database.

## Decision

Use a pnpm workspace with three packages and a strict purity rule for `packages/core`.

```
/                       workspace root: pnpm-workspace.yaml, biome.json, AGENTS.md, supabase/, docs/, prompts/
apps/web/               today's Next.js app (app/, components/, lib/, proxy.ts, next.config.ts, public/, root level *.test.ts)
apps/mobile/            Expo app (app/ for Expo Router, components/, lib/)
packages/core/          @bestats/core: pure rules, Zod schemas, shared types, v1 API contracts
```

**What goes in `packages/core`** (move, do not copy; web imports it back). This inventory was checked on 2026-11-18 by grepping each file for `server-only`, `next`, `react`, `@supabase` and `@/lib/(tmdb|igdb|supabase)` imports. Run the same grep again just before the move PR, since files change.

| Verdict | Files |
|---|---|
| **Move as is** (no framework or server import) | `lib/tv/air-status.ts`, `progress.ts`, `ratings.ts`, `season-watch.ts`; `lib/tracking/episode-intent.ts`, `game-intent.ts`, `ids-key.ts`, `intent.ts`, `messages.ts`, `schemas.ts`; `lib/catalog/game-page.ts`, `ids.ts`, `landing.ts`, `library-list.ts`, `lists.ts`, `movie-page.ts`, `pages.ts`, `region.ts`, `seasons.ts`; `lib/search/constants.ts`, `count.ts`, `mode.ts`, `quick.ts`; `lib/auth/action-state.ts`, `identity.ts`, `messages.ts`, `next-path.ts`, `private-paths.ts`, `schemas.ts`, `username.ts`; `lib/legal/operator.ts` |
| **Move with its type or constant dependency** (imports only types or constants from a catalog module; those type and constant files move to core too: `lib/igdb/constants.ts`, `lib/igdb/types.ts`, `lib/tmdb/types.ts`, after confirming each is itself pure) | `lib/format.ts`, `lib/catalog/game-lists.ts`, `grid-page.ts`, `media-type.ts`; `lib/search/catalogs.ts`, `params.ts`; `lib/tracking/types.ts` (with `lib/supabase/database.types.ts`, which is plain generated types and moves to core as the shared database types) |
| **Split** (pure function to core, read stays in web) | `lib/tv/library-page.ts` (placement rule to core; the `lib/tmdb` read stays); `lib/catalog/library-metadata.ts` (names to core; the `next` Metadata builder stays) |
| **Stay in `apps/web`** (session, cookies, `refresh`, React `cache`, or a catalog read) | `lib/tracking/episode-state.ts`, `game-library.ts`, `game-state.ts`, `library-lists.ts`, `log.ts`, `movie-state.ts`, `show-grid-status.ts`, `show-ratings.ts`, `show-state.ts`, `supabase-error.ts`, `write.ts`; `lib/search/game-read.ts`, `lists.ts`, `read.ts`, `scan.ts`; `lib/auth/log.ts`, `profile.ts`, `supabase-error.ts`, `user.ts`; all of `lib/tmdb/`, `lib/igdb/` (except the moved type and constant files), `lib/supabase/`, `lib/seo/` |

Also in core:
- Every `/api/v1` request and response Zod schema, the Undo cleared state schemas, `MIN_APP_VERSION`, `API_VERSION` and `compareSemver` (child 0035).
- `TMDB_ATTRIBUTION` and `IGDB_ATTRIBUTION` move to core so the app's About screen shows the same text; `lib/legal/boundary.test.ts` is updated to name their new home. The mobile app keeps its own copy of the two logo files, and the hash check covers that copy too.
- Design tokens: `app/globals.css` stays the single colour source (`design-tokens-boundary.test.ts`). A script, `pnpm tokens`, reads its `@theme` block and writes `packages/core/src/tokens.generated.ts`; CI fails if that file is out of date, and the boundary test allows exactly that generated file. Glass plates (blur) are not tokens; mobile rebuilds the plate rule natively with `expo-blur`.

**Purity rule (enforced by a test in core):** no file under `packages/core/src` imports `server-only`, `next`, `next/*`, `react`, `react-native`, `expo*`, `@supabase/*`, or reads `process.env`. Allowed dependencies: `zod` only. A file that mixes a pure rule with a server read is split: the pure function goes to core, the read stays in `apps/web/lib`.

**Stays in `apps/web` (server only):** `lib/tmdb/`, `lib/igdb/`, `lib/supabase/`, `lib/auth/user.ts`, the new action cores (`lib/tracking/commands/`), `lib/seo/`, `lib/legal/`, and every reader of a secret.

**Tooling:**
- `pnpm-workspace.yaml` lists `apps/*` and `packages/*` and keeps its `allowBuilds` pin. Start with pnpm's default isolated linker (Expo supports it since SDK 54); switch to `nodeLinker: hoisted` only if a native library fails to build.
- Mobile Metro config uses `expo/metro-config` with no manual `watchFolders` (SDK 52 and later handle monorepos).
- `packages/core` ships TypeScript source (no build step); both apps compile it. `apps/web` adds it to `transpilePackages` in `next.config.ts`.
- Biome stays one config at the root. Root scripts run per package with `pnpm -r` or `--filter`: `typecheck`, `lint`, `test`, `build` keep their names so AGENTS.md section 13 still reads true.
- Vercel: the project's Root Directory becomes `apps/web`, with "Include source files outside of the Root Directory" turned on and install run at the workspace root; `vercel.json` and the `fra1` region pin move with it. Supabase CLI commands keep running from the root, and `pnpm db:types` writes into `packages/core`.
- Next.js: set `turbopack.root` (and `outputFileTracingRoot` if the installed version still uses it) to the workspace root, checked against `node_modules/next/dist/docs/` for Next 16 before editing `next.config.ts` (read `app/AGENTS.md` first).
- CI: path filters so a web only change runs no mobile jobs and a mobile only change runs no Vercel build. EAS builds run only from tags or by hand.
- The boundary tests (`security-boundary.test.ts`, `design-tokens-boundary.test.ts`, `lib/legal/boundary.test.ts`, `private-actions-boundary.test.ts`) widen their scan to the whole workspace, so `apps/mobile` and `packages/core` are covered too. `security-boundary.test.ts` adds `EXPO_PUBLIC_` to the forbidden prefixes for the TMDB and IGDB secrets, since an `EXPO_PUBLIC_` value is baked into the app bundle.
- A core purity test (in `packages/core`) fails on any forbidden import, using the same list as the grep above.

**Key invariants**:
- One version of `zod` and `typescript` across the workspace.
- A rule exists in exactly one package. If both apps need it, it lives in core.
- The web app's routes, URLs, behavior and checks are unchanged by the move (a pure refactor PR, merged before any mobile code).

**Critical test scenarios**:
- After the move, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm test:db` pass from the root, and a Vercel preview of `apps/web` serves the same pages.
- The core purity test fails if a core file imports `server-only` or `next/cache`.
- The security boundary test still finds the TMDB and IGDB env readers only in `apps/web/lib/tmdb/env.ts` and `apps/web/lib/igdb/env.ts`.

**Rationale (short)**: One repo keeps a rule change and both of its callers in one PR, which matters because ratings, progress and placement are product rules that must never drift between apps (AGENTS.md section 9). Moving the web into `apps/web` costs one large mechanical PR, but keeping web at the root would make the root `AGENTS.md`, Biome and test configs permanently web shaped. The cross check suggested keeping web at the root to avoid that PR; the engineer chose the full move, accepting that the move PR lands first and blocks mobile work until it is green on Vercel. To keep it reviewable, the move PR does only `git mv` plus path and config fixes, and the core extraction follows in its own PRs. A separate mobile repo was rejected because shared rules would be copied or published and would drift.
