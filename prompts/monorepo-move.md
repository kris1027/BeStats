# Monorepo move: the web app into `apps/web`

Feature 28 (Mobile app), spec [0033](../docs/specs/0033-mobile-app-expo/index.md) Build plan step 1, child [0034](../docs/specs/0033-mobile-app-expo/0034-monorepo-shared-core.md). Satisfies AC-1 and the workspace half of AC-3.

## Goal

Move today's Next.js app from the repo root into `apps/web` inside a pnpm workspace, with no change to any route, URL, behavior or check. This is a pure refactor PR, merged and green on Vercel before any shared core or mobile code lands (spec 0034, Key invariants). `packages/core` and `apps/mobile` come in later PRs (steps 2 and 3), each with its own plan.

## Inspected code

- Root files: `package.json` (name `bestats-v1`, all scripts), `pnpm-workspace.yaml` (only the `allowBuilds` pin), `biome.json` (`files.includes` excludes `public`, `supabase`, `lib/supabase/database.types.ts`), `tsconfig.json` (`@/*` to `./*`), `next.config.ts`, `vercel.json` (`fra1`), `vitest.config.mts` and the two live configs, `components.json`, `postcss.config.mjs`, `.gitignore` (root anchored `/node_modules`, `/.next/`, `/coverage`).
- Root tests that read paths from the working directory: `security-boundary.test.ts` (walks `.`), `design-tokens-boundary.test.ts` (reads `app/globals.css`), `deploy-config.test.ts` (reads `supabase/config.toml` and `vercel.json` from `process.cwd()`), `proxy.test.ts` (reads `proxy.ts`), `private-actions-boundary.test.ts`, `lib/legal/boundary.test.ts` (`app`, `components`, `lib`, `proxy.ts`).
- `scripts/dev-docker.sh` (runs `next dev` against the local stack) and `scripts/db-types-check.sh` (diffs `lib/supabase/database.types.ts`).
- `.github/workflows/checks.yml`: one fast job (`typecheck`, `lint:ci`, `test`, `build`) and a database job gated on `supabase/**`.
- Next 16 docs: `turbopack.root` (`05-config/01-next-config-js/turbopack.md`) and `outputFileTracingRoot` (`output.md`), both needed when the app reads files outside its own folder.
- Nine nested `AGENTS.md` files under `app/`, `components/`, `lib/*` with relative links to `prompts/` and `docs/`.

## Skills used

`develop` (this flow). No schema work, so neither Supabase skill applies. Next docs read from `node_modules/next/dist/docs/`.

## Decisions and assumptions

1. **What moves to `apps/web`**: `app/`, `components/`, `lib/`, `public/`, `proxy.ts`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `components.json`, `postcss.config.mjs`, `vercel.json`, `.env.example`, the `vitest*` configs and setup, and every root level `*.test.ts(x)`. All through `git mv`, so history follows.
2. **What stays at the root**: `supabase/`, `docs/`, `prompts/`, `scripts/`, `.agents/`, `.claude/`, `.github/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `biome.json`, `skills-lock.json`, `test-preferences.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the `.vercel/` link.
3. **Package names**: root becomes `bestats` (private workspace root, holds `@biomejs/biome` and the `supabase` CLI). Web becomes `@bestats/web` with today's dependencies. Spec 0034 names core `@bestats/core`, so this matches.
4. **Root scripts keep their names** so AGENTS.md section 13 stays true: `typecheck`, `test`, `build`, `dev` delegate with `pnpm --filter @bestats/web …`; `lint`, `lint:ci`, `format` run Biome once at the root; `test:db`, `db:types`, `db:types:check` keep running the Supabase CLI from the root, with `db:types` now writing `apps/web/lib/supabase/database.types.ts` (it moves to core in step 2).
5. **Boundary tests scan the whole workspace.** `security-boundary.test.ts`, `design-tokens-boundary.test.ts` and `lib/legal/boundary.test.ts` resolve the workspace root from their own file (`import.meta.url`), not the working directory, so `apps/mobile` and `packages/core` are covered the day they appear. `security-boundary.test.ts` also forbids the `EXPO_PUBLIC_` prefix on the TMDB and IGDB secrets now (AC-3), since it costs one line. `private-actions-boundary.test.ts` and `proxy.test.ts` stay web only.
6. **Next config**: `turbopack.root` and `outputFileTracingRoot` point at the workspace root (two folders up), so the build can follow files outside `apps/web` once core exists.
7. **`.gitignore`**: the root anchored patterns lose their leading slash (`node_modules/`, `.next/`, `coverage/`) so they match inside `apps/web`.
8. **Your local `.env.local`** (git ignored, holds your keys) moves to `apps/web/.env.local` with a plain `mv`, since Next reads env files from the app folder. Nothing in it is read or printed.
9. **Links**: path fixes only. Relative links inside the moved `AGENTS.md` files, the root `AGENTS.md` Context files list, `docs/deploy.md` and the feature 28 code pointer in the scope are corrected to the new paths. Root `AGENTS.md` prose (section 5 "one app at the root", a mobile section) is left for `/sync`, as spec 0033 Follow-up says. Old specs and prompts are history and keep their old paths. _Revised after code review: dead links in old specs and prompts were repointed too (paths only, no prose), and the three stale root `AGENTS.md` facts (section 5, the workspace file, the `@/*` alias) were corrected rather than left wrong until `/sync`._
10. **Vercel**: the project's Root Directory becomes `apps/web` with "Include files outside the root directory" on. This is a dashboard setting that affects production, so it is a separate step you approve at the time (see Manual test). Order: open the PR, flip the setting, redeploy the PR preview and check it, then merge so production builds from `apps/web`. Flipping it back is the rollback.
11. **pnpm linker**: the default isolated linker (spec 0034). No `nodeLinker: hoisted` unless something fails. _Implementation note: `next` resolves the React types from its own folder upward, which no longer passes through `apps/web/node_modules`, so `publicHoistPattern` hoists only `@types/react` and `@types/react-dom`._

## Expected files

- New: `apps/web/package.json`, `prompts/monorepo-move.md` (this file), `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` (written by `next dev` once it runs from `apps/web`).
- Moved (`git mv`, content unchanged unless listed): everything in decision 1.
- Edited: root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (regenerated), `biome.json`, `.gitignore`, `apps/web/next.config.ts`, the five path sensitive tests, `apps/web/vitest.config.mts` (only if a path needs it), `scripts/dev-docker.sh`, `scripts/db-types-check.sh`, `.github/workflows/checks.yml` (only if a step needs a path), the nested `AGENTS.md` links, root `AGENTS.md` Context files links, `docs/deploy.md`, `docs/scope/scope.md` (feature 28 status and pointer), spec 0033 `**Status**:` line (`Proposed` to `In Progress`).

## Requirements

- AC-1 (this step's half): the web app lives in `apps/web`; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm test:db` pass from the root; a Vercel preview of `apps/web` serves the same routes and behavior as before.
- AC-3 (workspace half): the TMDB and IGDB env readers are still found only in `apps/web/lib/tmdb/env.ts` and `apps/web/lib/igdb/env.ts`; no workspace file names the service role key; `NEXT_PUBLIC_` and `EXPO_PUBLIC_` are both forbidden on those secrets.
- No route, URL, response, redirect, header or test expectation changes. Test count stays the same plus the two new `EXPO_PUBLIC_` cases (one each for TMDB and IGDB).

## Security considerations

- The boundary scans get wider, never narrower: they walk the workspace root, so a later `apps/mobile` or `packages/core` file is checked without anyone remembering to add it.
- `.env.local` is moved, not copied, so there is one copy of your keys. `.gitignore` still covers `.env*` at any depth.
- The Vercel setting change is the only production facing action, done only with your yes.

## Acceptance criteria

1. `git log --follow apps/web/lib/tracking/schemas.ts` shows the file's old history.
2. All the root checks below pass with the same test count as `main` plus two.
3. `pnpm dev:docker` serves the app at `localhost:3000`, signed in and signed out, as before.
4. A Vercel preview built from `apps/web` serves `/shows`, a movie page, a game page, `/sitemap.xml` and sign in exactly as production does.

## Automated checks

From the repo root: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:ci`, `pnpm test`, `pnpm build`, `pnpm test:db` (after `supabase db reset`, per the clean seed note). Before the move I record `main`'s test count to compare.

## Manual test steps

You may run these, or skip any you trust the checks for.

1. Run `pnpm dev:docker` from the root and open `http://localhost:3000`. Expect a redirect to `/shows` with posters.
2. Open a movie, sign in with a seed user, mark it watched, then open `/watched`. Expect the movie there.
3. Open `/games` and one game page. Expect covers and the IGDB notice in the footer.
4. Vercel (needs your approval at the time): in the project settings, set Root Directory to `apps/web` and turn on "Include files outside the root directory". Redeploy the PR preview and repeat steps 1 to 3 on its URL, plus `/sitemap.xml` and `/robots.txt`.
5. Merge, then open production and check `/shows` and one movie page. If anything is off, set Root Directory back to empty and redeploy the previous production build.
