# AGENTS.md

You are a principal-level full-stack engineer building **BeStats**, a movie, TV and game tracking web app inspired by TV Time. TMDB (movies, TV) and IGDB (games) supply the catalog; Supabase holds accounts and private user state. BeStats tracks; it never streams. All product copy is English.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Code comments cite this file by section number ("AGENTS.md section 11"), so keep sections 1 to 14 numbered as they are.

## 1. Product

Public: the movie, TV and game catalogs, title pages (cast, seasons, episodes), and search with filters. Private (Google or email/password sign-in): planned and watched movies, episode and season marks, tracked shows, game statuses, and 1 to 10 ratings. Every tracked show, planned movie and listed game sits on one library page (section 9). No public profiles, no social features.

## 2. Workflow

For each implementation request:

1. Read this file, any skill the user names, and the nested `AGENTS.md` of every area you touch (Context files, below).
2. Inspect the existing code and the related UI (the shipped pages and `/showcase`).
3. Ask focused questions in the question panel when a material requirement is ambiguous.
4. Write the plan to `prompts/<descriptive-name>.md`: goal, inspected code, skills used, decisions and assumptions, expected files, requirements, security considerations, acceptance criteria, automated checks, exact manual test steps.
5. Ask "I prepared the implementation plan at prompts/<name>.md. Is this good to execute?" with Yes and No, then wait. Approval to prepare a plan is not approval to implement it; only an explicit waiver from the user skips this step.
6. Implement the approved scope, run the checks (section 13), and get approval for any material scope change.

Close with three headings: **What I did** (short bullets), **Test** (numbered steps plus the actual check results), **Needs your attention** ("None" when empty). Rationale lives in the plan; report only checks you ran.

## 3. UI

The shipped UI and `/showcase` are the design reference (the `design/` artboards were removed on 2026-10-06). Use Tailwind v4 and shadcn/ui adapted to the glass system, reuse existing components and patterns, and redesign nothing unasked. Every view has loading, empty, error, missing-image and signed-out states, works at phone width with 44px touch targets, keyboard use and visible focus, and shows only real metadata (English TMDB text first, the original language as fallback). A screen with no precedent gets its layout approved in its plan. The plate rule, tokens and shell boundaries: [components/AGENTS.md](components/AGENTS.md).

## 4. Skills and docs

Project skills live in `.agents/skills/` (symlinked into `.claude/skills/`, pinned by `skills-lock.json`). Load `supabase-postgres-best-practices` before any schema, migration, RLS or index work, and `supabase` for anything Supabase. Read framework docs for the installed versions (`package.json`) and the official TMDB and IGDB docs for endpoints, limits and attribution.

## 5. Structure

One Next.js App Router app at the repo root (`app/`, `components/`, `lib/`, `supabase/`, `prompts/`; no `src/`).

- Server Components by default; a Client Component only where an interaction needs it.
- `lib/tmdb/` and `lib/igdb/` are server-only modules that own every catalog request, its normalization, caching and errors.
- Mutations are Server Actions (or Route Handlers, following the existing pattern): validate input with Zod, authenticate inside the action, and take the user ID from the verified session, never from the client.
- Business rules (ratings, episode eligibility, library placement) are pure functions in `lib/`.
- Postgres constraints and RLS enforce ownership and valid data independently of the UI.
- Ordinary user operations never use an elevated role that bypasses RLS: no service role key in application code or `.env.example` (`security-boundary.test.ts`).

## 6. Stack

Next.js 16, TypeScript strict, Supabase (Postgres and Auth), Tailwind v4, shadcn/ui, Zod, Vitest, pnpm; Vercel and Supabase Cloud host it. Biome lints and formats (`pnpm lint`, `pnpm lint:ci`); the repo uses Biome alone, so add no ESLint or Prettier. Versions and scripts: `package.json`.

## 7. Product rules

- Catalog, search and title pages are public; lists, history, tracking, ratings and library pages are private to their owner.
- TMDB and IGDB are the catalog source and Supabase the user state source. Catalog metadata is fetched and cached per request, never stored in Postgres.
- A movie is planned or watched, never both; its score needs a watch mark; it can be watched or scored only from its release day (UTC). Planning a watched movie or removing its mark drops mark and score, with Undo.
- An episode's watched mark and rating are independent: unmarking keeps the rating.
- Seasons and shows have only calculated ratings (section 9).
- Marking a season watched marks only its aired episodes, never future or undated ones, and keeps existing ratings.
- Specials (TMDB season 0) can be marked and rated, and count toward no progress, page placement or show rating.
- Tracking and history are separate: Stop tracking keeps every mark and rating.
- Games carry a hand set status (Want to play, Playing, Finished) behind a release gate.
- Search uses no AI.

Edge cases, Undo and the games rules: [lib/tracking/AGENTS.md](lib/tracking/AGENTS.md).

## 8. Data model

### Catalog identity

A title is identified by media type plus external ID, since a TMDB movie and show can share a number; titles, posters and descriptions are metadata, never identifiers.

### User account

Supabase Auth owns identity. A profile table exists only for fields the UI needs beyond the auth account: `profiles` holds the username and nothing else, and there are no public profile routes.

### Rows

One row per user and movie, per user and episode, per user and tracked show, per user and game; derived values (season and show ratings, library page) are computed per request, never stored. Tables, constraints, RLS and migrations: [supabase/AGENTS.md](supabase/AGENTS.md).

## 9. Ratings, progress and library pages

- A movie's or episode's personal rating is the user's integer score from 1 to 10.
- A season's rating is the mean of its rated episodes; unrated episodes are excluded, never counted as zero.
- A show's rating is the mean of its rated regular seasons, each season weighted equally whatever its episode count; season 0 and unrated seasons are excluded. Seasons rated 8 and 6 give a show 7.
- Keep full precision and round only for display, to one decimal. No eligible rating reads "Not rated", never zero.
- Personal ratings and community ratings (TMDB, IGDB) are always visibly distinct; search's minimum rating filter uses TMDB's.
- Progress counts aired regular episodes only: no specials, unaired or undated episodes. A zero total shows an empty state, never a division error. Air dates are UTC days; never imply a local release time.
- Every tracked show, planned movie and listed game sits on exactly one library page, worked out per request from the user's state and the catalog's dates. No page writes when it loads.

Page placement: [lib/tracking/AGENTS.md](lib/tracking/AGENTS.md). Page routes, names and links: [lib/catalog/AGENTS.md](lib/catalog/AGENTS.md).

## 10. Search

One results page with a movie, TV or game selection, title query, genre, year (release year; first-air year for TV) and minimum TMDB rating, in shareable URL params with pagination. TMDB search and discover accept different filters, so a query combined with filters is filtered locally across upstream pages: every result shown meets every filter, the count is exact or marked partial, and title searches keep upstream relevance order. Loading, empty and retry states, and filters survive opening a title and coming back.

## 11. Security and privacy

- RLS on every user-owned table; policies limit select, insert, update and delete to the authenticated owner, including the owner of a newly written row.
- Private page redirects are UX only. Every server operation rechecks the session, and Postgres enforces ownership. Tests prove one user cannot read or change another's data, including through direct requests.
- Secrets live in env vars with placeholders in the committed `.env.example`. Only public Supabase config reaches the browser; the TMDB token and IGDB credentials are read only in `lib/tmdb/env.ts` and `lib/igdb/env.ts`, and `security-boundary.test.ts` fails on any other reader or a `NEXT_PUBLIC_` prefix.
- Private responses stay out of shared caches; public catalog data is cached apart from user state.
- Logs carry no tokens, session material, passwords or needless personal data.
- Validate IDs, media types, ratings, pagination and filters. A failed write or expired session shows visibly; the UI never shows a false success.

## 12. Integrations and deployment

Handle catalog rate limits, failures, missing translations, images and episode data; keep user history visible when the catalog is down. Time-sensitive metadata (new episodes, show status) refreshes rather than caching forever. TMDB and IGDB attribution follow their current terms. Schema changes ship only as migrations. Deployment and remote migrations are part of a plan when the work includes them; the runbook is [docs/deploy.md](docs/deploy.md).

## 13. Checks

Run from the repo root and report actual results: `pnpm typecheck` and `pnpm lint` for any change; `pnpm build` when routes, config, dependencies or server code change; `pnpm test` with targeted tests for ratings, eligibility, page placement and security; `pnpm test:db` when database behavior changes; and a runtime check in the running app (`next-dev-loop`). A check blocked by credentials or provider setup is reported as blocked, never replaced by a mock. Release-level acceptance list: [docs/scope/acceptance.md](docs/scope/acceptance.md).

## 14. When in doubt

Keep the scope small, follow the existing UI, keep ratings, watched progress and tracking distinct, and never invent unavailable data.

## Games

Planned in [docs/scope/games.md](docs/scope/games.md) (G1 to G10, all shipped). IGDB is read only through `lib/igdb/` ([lib/igdb/AGENTS.md](lib/igdb/AGENTS.md): credentials, catalog filter, hidden games). `game` is a `LibraryType`, never a `MediaType`, so it is narrowed away before any TMDB read. Statuses, release gate, ratings and timestamps: [lib/tracking/AGENTS.md](lib/tracking/AGENTS.md).

## Commands and repo facts

- Scripts live in `package.json`; `pnpm dev:docker` runs the dev server against the local Supabase stack. `pnpm-workspace.yaml` exists only to pin `allowBuilds`; this is a single package repo.
- Imports use the `@/*` alias for the repo root.
- `cacheComponents: true`: every route is prerenderable or exports `instant = false`; every cached read calls `cacheLife` inside its own `use cache` scope, and returns a plain result rather than throwing (a thrown error loses its class across the scope). Routing, proxy, images and region rules: [app/AGENTS.md](app/AGENTS.md), read before editing `proxy.ts`, `next.config.ts` or a route.
- Middleware is `proxy.ts` exporting `proxy` (Next.js 16 ignores a `middleware.ts`).
- Read public env values through `getPublicEnv()` in `lib/env.ts`, never `process.env`. It validates lazily, so a build with no Supabase project still succeeds while every auth call fails loudly. Code on every page calls `publicEnvProblems()` first and falls back to signed out, so a missing auth config never takes the catalog down.
- Supabase clients: `lib/supabase/client.ts` (browser) and the async `lib/supabase/server.ts`, created per request.
- A colour value lives only in `app/globals.css` (Tailwind v4 is CSS first; there is no `tailwind.config.*`); `design-tokens-boundary.test.ts` enforces it.
- Legal facts live only in `lib/legal/operator.ts`, `TMDB_ATTRIBUTION` and `IGDB_ATTRIBUTION` (`lib/legal/boundary.test.ts`). A change that adds a processor, email provider or analytics updates `PROCESSORS`, `/privacy`, `/terms` and `LEGAL_LAST_UPDATED` in the same PR. Never edit `public/tmdb-logo.svg` or `public/igdb-logo.svg` (hash checked).
- Production: push a migration with `supabase db push` before merging its PR; auth settings reach the cloud only through `supabase config push`. Both run from an agent shell without a prompt, so run them only once approved. Functions are pinned to `fra1` beside Supabase `eu-central-1`.

## Code conventions

- Work on a `feat/<slug>` branch off `main`, write conventional commit subjects (`feat(supabase): ...`), merge through a pull request.
- Exported functions carry a JSDoc block saying why the code is shaped this way, citing the governing `AGENTS.md` section. Comments explain reasons, not mechanics.

## Context files

Each folder's `AGENTS.md` holds its files and rules; read it before changing code there.

- [app/AGENTS.md](app/AGENTS.md): routes, `proxy.ts`, `next.config.ts`, images, visitor region.
- [components/AGENTS.md](components/AGENTS.md): plate rule, tokens, client boundaries, navbar, library and landing components.
- [lib/catalog/AGENTS.md](lib/catalog/AGENTS.md): library page routes and names, media type params, link builders.
- [lib/tracking/AGENTS.md](lib/tracking/AGENTS.md): movie, episode, show and game state rules, library placement, Undo.
- [lib/auth/AGENTS.md](lib/auth/AGENTS.md): session boundary, private paths, auth forms and actions, email delivery flag.
- [lib/tmdb/AGENTS.md](lib/tmdb/AGENTS.md) and [lib/igdb/AGENTS.md](lib/igdb/AGENTS.md): catalog modules, caching, errors, live checks.
- [lib/seo/AGENTS.md](lib/seo/AGENTS.md): metadata, sitemap, robots, crawl budget.
- [supabase/AGENTS.md](supabase/AGENTS.md): schema, RLS, migrations, pgTAP.
- [docs/scope/scope.md](docs/scope/scope.md): feature list and status. [docs/deploy.md](docs/deploy.md): production runbook.
