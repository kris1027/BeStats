# Shared core: packages/core (feature 28, spec 0033 Build plan step 2)

## Goal

Create `@bestats/core` in `packages/core`: the pure rules, Zod schemas, shared types and constants that both the web app and the coming Expo app will run. Files move (never copy) from `apps/web/lib`, and the web imports them back. The web's routes, behavior and checks stay exactly as they are. This is step 2 of spec 0033 and satisfies **AC-2**; it keeps **AC-1** and **AC-3** green. No mobile code and no `/api/v1` code lands here (that is step 3, the tracer, with its own plan).

## Inspected code

- Spec 0033 `index.md` and child `0034-monorepo-shared-core.md` (the file inventory, purity rule and tooling).
- Step 1 is merged (PR #74, `prompts/monorepo-move.md`): the web lives in `apps/web`, `pnpm-workspace.yaml` already lists `packages/*`, `turbopack.root` already points at the workspace root, and the boundary tests already walk the whole workspace through `apps/web/workspace-files.ts`.
- I ran the spec's purity grep again on 2026-11-18 over every file in the inventory. Result: the inventory still holds. No listed file imports `server-only`, `next`, `react` or `@supabase/*`, and none reads `process.env`.
- Import sites: 221 files in `apps/web` hold 381 imports of the moving modules.
- Root `package.json` scripts `typecheck` and `test` filter to `@bestats/web` only. CI (`.github/workflows/checks.yml`) runs the root scripts, so core is covered once those scripts run in every package.
- `scripts/db-types-check.sh` and the root `db:types` script point at `apps/web/lib/supabase/database.types.ts`; `biome.json` excludes that same path.
- `app/globals.css` holds the `@theme` tokens; `design-tokens-boundary.test.ts` forbids colour literals elsewhere.
- `TMDB_ATTRIBUTION` lives in `lib/tmdb/constants.ts` (with server values like the API base and timeouts) and is re-exported by `lib/tmdb/index.ts`; `IGDB_ATTRIBUTION` lives in `lib/legal/operator.ts`. Readers: `app/terms/page.tsx`, `components/layout/site-footer.tsx`, `lib/legal/boundary.test.ts`, `lib/tmdb/surface.test.ts`.

## Skills used

None beyond this file and the nested `AGENTS.md` files. No schema, RLS or Expo work happens in this step.

## Decisions and assumptions

1. **Specifier shape.** Core keeps the web's folder layout under `packages/core/src` (`lib/tracking/schemas.ts` becomes `src/tracking/schemas.ts`) and exposes it through one `exports` pattern, `"./*": "./src/*.ts"`. So `@/lib/tracking/schemas` becomes `@bestats/core/tracking/schemas`, a mechanical rewrite that is easy to review. There is no barrel file, so tree shaking and client bundles stay as small as today.
2. **No build step.** Core ships TypeScript source; `apps/web` adds `@bestats/core` to `transpilePackages` (spec 0034, Tooling). Inside core, files import each other with relative paths (the `@/*` alias belongs to the web).
3. **The two "split" files need no split.** The spec marked them split, but the fresh grep shows otherwise:
   - `lib/tv/library-page.ts` imports only *types* from the `@/lib/tmdb` barrel, and those types live in `lib/tmdb/types.ts`, which moves to core. So the whole file moves, with its type import pointed at `./../tmdb/types`.
   - `lib/catalog/library-metadata.ts` already gets its names from `library-list.ts` (which moves). What remains is the `next` Metadata builder, so the file stays in `apps/web` unchanged apart from its import.
4. **Attribution.** `TMDB_ATTRIBUTION` leaves `lib/tmdb/constants.ts` for core (`src/legal/attribution.ts` beside `operator.ts`, which already holds `IGDB_ATTRIBUTION`); the rest of `lib/tmdb/constants.ts` is server config and stays. `lib/tmdb/index.ts` stops re-exporting it and its readers import from core. `lib/legal/boundary.test.ts` names the new home.
5. **Tests move with their files** and run in core's own Vitest (node only; core has no components). Two moved tests read repo files (`lib/auth/schemas.test.ts`, `username.test.ts`, `catalog/region.test.ts`); their paths are fixed to resolve from their own file, per the root AGENTS.md rule.
6. **Root scripts** `typecheck` and `test` change to `pnpm -r --if-present <script>`, so they keep their names and now cover core and web (and mobile later). `build` stays on the web.
7. **Tokens.** `pnpm tokens` is a small Node script in `scripts/tokens.mjs` that reads the `@theme` block of `apps/web/app/globals.css` and writes `packages/core/src/tokens.generated.ts`. A core test regenerates it in memory and fails if the committed file differs, so CI catches drift with no new CI step. `design-tokens-boundary.test.ts` allows exactly that one generated file. Values that are `var(...)` references are resolved against `:root` and the dark block so the app gets real colours; I will keep both light and dark sets if the file has them.
8. **Database types.** `lib/supabase/database.types.ts` moves to `packages/core/src/supabase/database.types.ts`; `db:types`, `scripts/db-types-check.sh` and the Biome exclude follow it. The web's Supabase clients import the `Database` type from core.
9. **Purity test** in `packages/core/src/purity.test.ts`: walks every non test file under `src` and fails on an import of `server-only`, `next`, `next/*`, `react`, `react-native`, `expo*`, `@supabase/*`, or any `process.env` read. Core's only runtime dependency is `zod`, pinned to the web's version (one version across the workspace).
10. **Commits.** Small, each one building: package skeleton and purity test; the moves, grouped by folder (`tv`, `tracking`, `catalog`, `search`, `auth` and `legal`, then `format`, the TMDB and IGDB type files, database types); tokens; scripts and docs. The move commits use `git mv` so history follows.

## Expected files

- New: `packages/core/package.json`, `tsconfig.json`, `vitest.config.mts`, `src/purity.test.ts`, `src/tokens.generated.ts`, `src/tokens.test.ts`, `src/legal/attribution.ts`, `scripts/tokens.mjs`.
- Moved into `packages/core/src/` (with their tests): `tv/{air-status,progress,ratings,season-watch,library-page}`, `tracking/{episode-intent,game-intent,ids-key,intent,messages,schemas,types}`, `catalog/{game-page,ids,landing,library-list,lists,movie-page,pages,region,seasons,game-lists,grid-page,media-type}`, `search/{constants,count,mode,quick,catalogs,params}`, `auth/{action-state,identity,messages,next-path,private-paths,schemas,username}`, `legal/operator`, `format`, `igdb/{constants,types}`, `tmdb/types`, `supabase/database.types`.
- Edited: about 221 import sites in `apps/web`; `apps/web/package.json` (dependency `@bestats/core: workspace:*`), `apps/web/next.config.ts` (`transpilePackages`), `apps/web/lib/tmdb/constants.ts` and `index.ts`, `apps/web/lib/legal/boundary.test.ts`, `apps/web/design-tokens-boundary.test.ts`; root `package.json`, `biome.json`, `scripts/db-types-check.sh`, `pnpm-lock.yaml`.
- Docs: the nested `AGENTS.md` files that list moved files get their pointers fixed (paths only); a short `packages/core/AGENTS.md` with the purity rule. Broader AGENTS.md prose is left for `/sync`.

## Requirements

- AC-2: no file under `packages/core/src` imports `server-only`, `next`, `react`, `react-native`, `expo*` or `@supabase/*`, or reads `process.env`, and a test proves it.
- AC-1 stays true: typecheck, lint, test, build and test:db pass from the root; web routes and behavior are unchanged.
- AC-3 stays true: the TMDB and IGDB env readers remain only in `apps/web/lib/tmdb/env.ts` and `apps/web/lib/igdb/env.ts`.
- Every moved rule exists exactly once; no shim or re-export file is left behind in `apps/web/lib`.

## Security considerations

- Core can never read a secret: the purity test forbids `process.env`, and `security-boundary.test.ts` already scans `packages/`.
- No server only module moves. The TMDB and IGDB clients, `lib/supabase/*` clients, `lib/auth/user.ts` and every session reader stay in the web.
- No database, RLS or auth change in this step.

## Acceptance criteria

1. `packages/core` exists as `@bestats/core` with only `zod` as a runtime dependency.
2. Every inventory file lives in core once, and `apps/web/lib` holds no copy or re-export of it.
3. The purity test passes, and fails when a core file imports `server-only` or `next/cache` (checked once by hand, then reverted).
4. `tokens.generated.ts` matches `globals.css`, and the drift test fails when one token value changes without `pnpm tokens`.
5. The web renders exactly as before.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (core and web), `pnpm build`, and `pnpm db:types:check` plus `pnpm test:db` against the local stack (only the types file moves, but the check script changes).

## Manual test steps

1. `pnpm install`, then `pnpm test` and see both `@bestats/core` and `@bestats/web` suites run.
2. `git log --follow packages/core/src/tracking/schemas.ts` shows the old history.
3. Add `import "server-only";` to any core file, run `pnpm test`, see the purity test fail, then undo it.
4. Change one colour in `apps/web/app/globals.css`, run `pnpm test`, see the token drift test fail; run `pnpm tokens`, see it pass; undo both.
5. `pnpm dev`, then open `/`, a movie page, a show season page, a game page, `/search?type=movie&q=dune`, sign in, and the Watchlist page. Everything looks and behaves as on production.
6. The PR's Vercel preview serves the same pages.
