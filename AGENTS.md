# AGENTS.md

You are a **principal-level full-stack engineer and AI implementation agent** building **BeStats**, A production-style movie and TV show tracking platform inspired by TV Time, powered by TMDB. Discover titles, track your watch history, manage watchlists, and find your next favorite movie or series with intelligent search.

Your job is to understand the request, use the right project skills, write a clear implementation prompt, get approval, then implement.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 1. What you are building

BeStats is a movie and TV show discovery and tracking platform inspired by TV Time, powered by TMDB. Users browse titles, manage their watchlists, track watched movies and episodes, and rate what they watch. The interface and catalog content are in English.

Build a production-style web application with Next.js and Supabase. TMDB supplies catalog metadata; Supabase stores accounts and private user data. BeStats is a tracking application, not a streaming service.

The first version includes:

- A public movie and TV catalog with title search and filters.
- Movie and TV detail pages with cast, seasons, and episodes where applicable.
- Google and email/password authentication.
- A private watchlist and watched movie history.
- Episode and season completion controls.
- TV statuses: Want to Watch, Watching, On Hold, Dropped, and Completed.
- A private Up Next view for tracked TV shows.
- Movie and episode ratings from 1 to 10, with calculated season and TV show ratings.

## 2. How to work

Follow this loop for each implementation request:

1. Read this specification and any applicable repository instructions.
2. Read any skills explicitly named by the user and relevant available supporting skills. Do not assume that a skill or tool exists.
3. Inspect the existing code, configuration, and relevant files in `design/` before choosing an implementation.
4. Ask focused questions when a material requirement is ambiguous. Use the agent's native question panel when available.
5. Write an implementation plan in `prompts/<descriptive-name>.md`. Include the goal, inspected code and designs, skills used, decisions and assumptions, expected files, requirements, security considerations, acceptance criteria, automated checks, and exact manual test steps.
6. Ask: “I prepared the implementation plan at prompts/<name>.md. Is this good to execute?” Offer Yes and No in the question panel when available.
7. Wait for approval before writing implementation code, unless the user explicitly waives this requirement. Approval to prepare a plan is not approval to implement it.
8. Implement the approved scope, run the appropriate checks, and report the actual results. Seek approval for material scope changes.

Close implementation work with a short report under three headings:

- **What I did:** short bullets describing the changes.
- **Test:** numbered steps to verify the behavior, plus actual check results.
- **Needs your attention:** decisions, setup, or blockers; say “None” when there are none.

Keep detailed rationale in the plan. Never claim that a check passed without running it.

## 3. UI and design

The user provides reference designs in `design/`. Those references are the source of truth for layout, spacing, typography, colors, and visible states.

Use Tailwind CSS and shadcn/ui, adapting components to the reference rather than imposing their default appearance. Reuse existing components and patterns first. Do not redesign supplied views or introduce features simply because a component supports them.

When no mobile reference exists, adapt the desktop layout sensibly for small screens while preserving its visual style. Ensure usable navigation, touch targets, keyboard interaction, visible focus, and readable content.

Include loading, empty, error, missing-image, and unauthenticated states. If a required screen has no reference, state the proposed approach in the implementation plan and obtain approval through the normal workflow.

All product copy is English. Prefer English TMDB metadata; use available original-language text when English text is missing. Handle missing metadata without inventing content.

## 4. Documentation and skills

Use installed skills when they genuinely apply. Do not copy the original learning platform's Sanity-specific skills or dependencies into this project.

These skills are installed in this repository. They live in `.agents/skills/`, and `.claude/skills/` holds symlinks to the same folders, so both tools read one copy. `skills-lock.json` pins their sources. Load only the ones a task needs.

- [next-cache-components-adoption](.agents/skills/next-cache-components-adoption/): `vercel/next.js`, turning on Cache Components and fixing the routes it flags.
- [next-cache-components-optimizer](.agents/skills/next-cache-components-optimizer/): `vercel/next.js`, driving one route to instant navigation and guarding it with a test.
- [next-dev-loop](.agents/skills/next-dev-loop/): `vercel/next.js`, verifying a change in the running app, not just in the type checker.
- [next-partial-prefetching-adoption](.agents/skills/next-partial-prefetching-adoption/): `vercel/next.js`, turning on Partial Prefetching and working through its insights.
- [next-partial-prefetching-optimizer](.agents/skills/next-partial-prefetching-optimizer/): `vercel/next.js`, choosing what each client navigation prefetches.
- [supabase](.agents/skills/supabase/): `supabase/agent-skills`, anything touching Supabase (Auth, database, SSR clients, CLI, debugging).
- [supabase-postgres-best-practices](.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, read before writing schema, migrations, RLS policies, or indexes.

For implementation details, use the documentation matching the installed versions of Next.js, Supabase, Tailwind CSS, and shadcn/ui. Consult official TMDB documentation for supported endpoints, filters, pagination, attribution, and usage requirements.

Inspect the repository and package versions before relying on framework conventions. Verify current provider setup requirements during implementation rather than hardcoding assumptions into the application.

## 5. Application structure

Use one Next.js application with the App Router. Keep database migrations and relevant backend configuration in the repository's Supabase directory. There is no separate Studio workspace or standalone backend application.

Keep these responsibilities separate:

- **Pages and UI:** render catalog information and private user state. Use Server Components by default and Client Components for interactions that need them.
- **TMDB integration:** a server-only module handles authenticated TMDB requests, normalizes responses, and applies appropriate caching and error handling.
- **Authentication:** Supabase Auth manages identity, sessions, and account recovery.
- **User data access:** authenticated server operations read and write watchlists, progress, statuses, and ratings under the current user's session.
- **Business rules:** reusable domain functions define rating calculations, episode eligibility, Up Next selection, and automatic completion.
- **Database security:** PostgreSQL constraints and Supabase Row Level Security enforce ownership and valid data independently of UI checks.

Use Server Actions or Route Handlers for application data mutations, following a consistent existing project pattern. Validate input and authenticate each protected operation. Derive the user ID from the verified session, never from a client-supplied ownership field.

Supabase Auth may use its supported browser client with a public key. TMDB credentials and any elevated Supabase credentials remain server-only. Ordinary user operations must not use an elevated role that bypasses RLS.

## 6. Tech stack

- Next.js with the App Router.
- TypeScript with strict checking.
- Supabase PostgreSQL for persistent application data.
- Supabase Auth for Google and email/password sign-in.
- Tailwind CSS and shadcn/ui for the interface.
- Zod for validating external inputs and structured request data.
- TMDB API for movie, TV, cast, season, and episode metadata.
- Vercel for the Next.js deployment.
- Supabase Cloud for the database and authentication.
- Biome for linting and formatting. It replaces ESLint (installed today) in scope feature 2; until then `pnpm lint` still runs ESLint. Do not add Prettier.
- pnpm as the package manager.

This section is the only place the stack is defined. Installed versions live in `package.json`; check it instead of trusting a list here. Choose compatible supported package versions at implementation time and commit the lockfile.

## 7. Decisions already made

- Catalog browsing, search, and title detail pages are public.
- Watchlists, history, statuses, ratings, and Up Next require authentication and are private to their owner.
- Authentication supports Google and email/password, including the necessary verification, sign-out, and password recovery flows.
- TMDB is the source of catalog metadata. Supabase is the source of user state.
- Movies can be marked watched and rated directly from 1 to 10.
- TV episodes can be marked watched and rated directly from 1 to 10.
- Seasons and TV shows cannot be rated directly. Their ratings are calculated from the user's episode ratings.
- Watched state and rating are separate: marking something watched does not require a rating, and removing a watched mark does not silently delete its rating.
- TV status and episode history are separate: changing a status must preserve watched episodes and ratings.
- Marking a season watched marks only eligible episodes that have already aired, never future or unknown-date episodes.
- Specials, represented by TMDB season 0, can be marked watched and rated but are excluded from overall TV progress, Up Next, and the TV show's calculated rating.
- Search includes title queries and genre, release year, and minimum TMDB rating filters. It uses no AI.
- There are no public user profiles or social features in the MVP.

## 8. Data model

Use database migrations and explicit constraints. The following are logical entities; adapt physical table names to repository conventions without changing their meaning.

### Catalog identity

Identify a title by both its media type and TMDB ID. A movie ID and TV ID can have the same numeric value and must never collide.

Use TMDB episode IDs where available, retaining the parent TV ID, season number, and episode number needed for display and ordering. Treat titles, posters, and descriptions as external metadata, not stable identifiers.

Fetch or cache catalog metadata as needed. Do not import the entire TMDB catalog. If metadata is cached in PostgreSQL, distinguish that cache from private user data and define a refresh policy.

### User account

Supabase Auth owns identity. Add a separate profile table only if actual UI requirements need fields beyond the authentication account. Do not create public profile routes.

### Movie state

One record per user and movie contains watchlist membership, watched state, an optional watched timestamp, and an optional integer rating from 1 to 10. Keeping these fields in related tables is also acceptable if existing project conventions favor that structure.

### TV tracking state

One record per user and TV show contains one status: Want to Watch, Watching, On Hold, Dropped, or Completed. Store enough information to distinguish manual status choices from automatic transitions so background refreshes do not overwrite deliberate user choices.

Want to Watch is the TV watchlist state; avoid a second conflicting TV watchlist flag. A private watchlist view combines these TV entries with movie watchlist entries.

### Episode state

One record per user and episode contains its TV and episode identity, watched state, an optional watched timestamp, and an optional integer rating from 1 to 10.

Enforce ownership references, uniqueness, rating bounds, and valid status values in the database. Repeated writes must not create duplicate state records.

Do not persist rounded season or TV ratings as independent editable values. Derive them from episode ratings, or use a consistently maintained database projection if needed.

## 9. Ratings and progress

### Rating rules

- A movie's personal rating is the user's explicit integer score from 1 to 10.
- An episode's personal rating is the user's explicit integer score from 1 to 10.
- A season's personal rating is the arithmetic mean of its rated episodes. Unrated episodes are excluded, not counted as zero.
- A TV show's personal rating is the arithmetic mean of its rated regular seasons. Seasons with no ratings and season 0 are excluded.
- Every included season has equal weight, regardless of its episode count or how many of its episodes the user rated.
- Preserve full precision during calculations and round only for display, using one decimal place for calculated ratings.
- No eligible ratings means “Not rated,” not zero.

For example, if one season has a personal average of 8 and another has an average of 6, the TV show rating is 7, even if those seasons contain different numbers of rated episodes.

Clearly distinguish personal ratings from TMDB community ratings everywhere. Search's minimum-rating filter uses the TMDB rating.

### Progress and Up Next

Calculate overall progress using aired regular episodes. Exclude specials, unaired episodes, and episodes with no confirmed air date from the eligible total. A zero eligible total must produce a sensible empty state, not a division error or automatic completion.

Use the available TMDB air date consistently; do not imply a precise local release time that the source does not provide. Document the date boundary chosen in the implementation plan.

Up Next shows the first unwatched eligible episode in season and episode order for each show with Watching status. A Watching show with all eligible episodes watched displays “You're up to date.” On Hold and Dropped shows are excluded from the active queue until the user resumes them.

Marking a whole season watched must be idempotent and preserve existing ratings. New episodes remain unwatched when they become available later.

### Automatic status

A TV show may become Completed automatically only when TMDB identifies it as ended or canceled and the user has watched all aired regular episodes. Require complete episode metadata before making this decision; a partial fetch must never establish completion.

An ongoing show stays Watching when the user catches up. Users can change status manually. Preserve intentional On Hold, Dropped, or manually selected statuses during metadata refreshes. Watching an episode may move a new or Want to Watch entry to Watching; do not use it to silently resume an On Hold or Dropped show.

Keep automatic completion reversible when its underlying condition changes, while preserving explicit manual choices. Describe and verify these transitions in the implementation plan.

## 10. Search and discovery

Provide a full results page with movie/TV selection, a title query, genre filters, a year filter, and a minimum TMDB rating filter. Use shareable URL parameters and paginated results.

For movies, the year refers to the release year; for TV shows, it refers to the first-air year. Use media-appropriate genre options.

TMDB title search and filtered discovery may have different capabilities. Verify the supported API behavior before implementation. Do not assume that passing discovery parameters to a search endpoint applies them.

When combining a title query with filters, ensure every displayed result meets the selected filters. If filtering upstream search pages locally, continue pagination appropriately and never present the unfiltered total as the filtered result count. If an exact count is unavailable, omit it or explicitly indicate that it is partial.

Keep upstream relevance ordering for title searches unless the approved design specifies another supported order. Never claim semantic matching or comprehensive AI recommendations.

Show clear loading and empty states, preserve filters when opening and returning from a title, and provide a retry path for failures. Do not fabricate results, metadata, availability, ratings, or counts.

## 11. Security and privacy

Enable RLS on every table containing user-owned data. Policies must constrain reads, inserts, updates, and deletes to the authenticated owner, including ownership checks on newly written rows.

Private page redirects are a UX measure, not the security boundary. Recheck authentication and authorization in server operations, and enforce ownership in PostgreSQL.

Test that one user cannot read or change another user's lists, episode state, ratings, or tracking status, including through direct data requests.

Keep secrets in environment variables. Maintain a committed `.env.example` with placeholder values and descriptions. Only explicitly public Supabase configuration may reach the browser; TMDB credentials and elevated database keys must not.

Do not place private user responses in shared caches. Cache public catalog metadata independently from user-specific state. Avoid logging tokens, session material, passwords, or unnecessary personal data.

Validate IDs, media types, ratings, statuses, pagination, and filter inputs. Handle session expiry and failed writes visibly without leaving the UI in a false success state.

## 12. Integration and deployment considerations

- Handle TMDB rate limits, failed requests, missing translations, missing images, and incomplete episode data.
- Refresh time-sensitive metadata so newly aired episodes and changed show statuses can appear. Do not rely on an indefinitely cached catalog response.
- Preserve user history when external metadata is temporarily unavailable.
- Include TMDB attribution and branding required by its current terms. Verify those requirements before release.
- Configure Supabase Auth redirects and Google OAuth for local and deployed environments. Verify email confirmation and password recovery delivery before production use.
- Keep schema changes reproducible through migrations. Avoid dashboard-only schema changes that are absent from version control.
- Verify environment variables and target projects before deploying or applying migrations (hosting is defined in section 6).
- A normal build request does not bypass the approval workflow. Include deployment and remote migrations explicitly in a plan when they are part of the requested work.

## 13. Checks and acceptance criteria

Run checks from the correct application directory and report actual results:

- Type checking and linting for implementation changes.
- A production build when routes, configuration, dependencies, or server code change.
- Targeted tests for rating calculations, progress eligibility, automatic status transitions, and security-sensitive behavior.
- Runtime verification in the running application for the changed flows.
- Migration and RLS verification against an appropriate Supabase development or test environment when database behavior changes.

At minimum, verify these behaviors before considering the MVP complete:

1. A signed-out visitor can browse, search, filter, and open title details.
2. Google and email/password flows work, including sign-out and password recovery.
3. Private routes and data are unavailable without a valid session.
4. Two test users cannot access or mutate each other's data.
5. Movie watchlist, watched state, and rating survive reload and sign-in from another session.
6. Episode and whole-season completion work without including future episodes or overwriting ratings.
7. Unrated episodes and seasons are excluded from averages; unequal season lengths do not change equal season weighting.
8. Specials can be tracked and rated without affecting overall TV progress or rating.
9. Up Next selects the correct aired episode and excludes On Hold and Dropped shows.
10. Ongoing shows display “You're up to date”; ended or canceled shows meet the agreed automatic completion rule.
11. Manual status changes preserve episode history and ratings.
12. Combined search filters apply correctly, pagination works, and result counts remain truthful.
13. Loading, failure, empty, and missing-metadata states remain usable on desktop and mobile.
14. The interface matches supplied references in `design/`.
15. Secrets are absent from browser bundles, and private data is not served through shared caches.

If credentials, provider configuration, or reference designs prevent a check, report it as blocked or unverified. Do not substitute a mock-only check for a claimed live integration result.

## 14. When in doubt

Keep the scope small. Follow the designs. Use TMDB for catalog metadata and Supabase for private user state. Preserve the distinction between ratings, watched progress, and tracking status. Never invent unavailable data.

Inspect the code and current documentation, record material decisions in `prompts/`, obtain approval before coding, run the relevant checks, and provide clear verification steps.

## Build approach

Tracer Bullet: prove the whole pipe works with one thin real thread, then thicken one strand at a time, always end to end. Mirrored from the scope header in `docs/scope/scope.md`.

## Commands and repo facts

- Imports use the `@/*` alias, which maps to the repo root (set in `tsconfig.json`). Prefer it over long relative paths.
- Scripts: `pnpm dev`, `pnpm dev:docker` (the dev server against the local Supabase stack, see `scripts/dev-docker.sh`), `pnpm build`, `pnpm start`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:ci`, `pnpm format`, `pnpm test`, `pnpm test:db`, `pnpm tmdb:live`, `pnpm db:types`, `pnpm db:types:check`.
- Supabase, Zod, shadcn/ui and `server-only` are installed. `zod` validates every external input; `server-only` is what makes a Client Component import of a server module a build failure.
- Routes live in `app/` at the repo root (there is no `src/` directory). `design/`, `supabase/` and `components/` exist; `prompts/` does not, create it when needed.
- `/` is a temporary (307) redirect to `/shows`, declared in `redirects()` in `next.config.ts` rather than a Server Component, so nothing renders and no browser caches it permanently. There is no `app/page.tsx`.
- `.gitignore` ignores `.env*`, which also hides `.env.example`. Add a `!.env.example` exception before committing it, as section 11 requires.
- Middleware lives in `proxy.ts` at the repo root and exports `proxy`. Next.js 16 renamed it; a `middleware.ts` would be ignored.
- `proxy.ts` answers a malformed `/movies/{id}` with a real 404 before its auth check, using `parseMovieId` from `lib/catalog/ids.ts`, the same parser the page uses. A streamed page has already sent 200 by the time it could decide, so an unknown or adult id is a soft 404 (`noindex`) instead. `app/not-found.tsx` is the styled 404 for every unmatched URL. The proxy `matcher` skips image file extensions everywhere except under `movies/`, so `/movies/550.jpg` still reaches that rule; a new id checked route needs the same exception.
- `lib/catalog/` (id and `page` param parsing) and `lib/format.ts` (runtime, vote count, language name, word truncation) are pure and free of `server-only`, so the proxy and tests can import them.
- Supabase clients: `lib/supabase/client.ts` for the browser, `lib/supabase/server.ts` for Server Components, Server Actions and Route Handlers. The server client is async (`cookies()` is async in Next.js 16) and is created per request, never reused across requests.
- Read public environment values through `getPublicEnv()` in `lib/env.ts`, never `process.env` directly. It validates with Zod, lazily, so a build with no Supabase project configured still succeeds. Code that runs on every page (the proxy, the navbar account slot) calls `publicEnvProblems()` first and falls back to signed out, so a missing or partial auth configuration never takes the public catalog down; everything that performs an auth call still fails loudly through `getPublicEnv()`.
- shadcn/ui is configured in `components.json`: style `base-nova`, base color neutral, components land in `components/ui/`, icons from `lucide-react`, primitives from `@base-ui/react` (not Radix). `cn` is re-exported by `lib/utils.ts` from the `cn` package.
- Tailwind v4 is CSS first: the theme lives in `app/globals.css`, across `@theme inline`, `@theme`, `:root` and the `@utility` blocks. There is no `tailwind.config.*` file. That file is the only place a colour value may be written; `design-tokens-boundary.test.ts` fails the suite if one appears elsewhere. See [components/AGENTS.md](components/AGENTS.md).
- `pnpm-workspace.yaml` exists only to pin `allowBuilds`. This is a single package repo, not a monorepo.
- `cacheComponents: true` is on in `next.config.ts`. Every route must be prerenderable or opt out with `export const instant = false`, and every cached read calls `cacheLife` inside its own `use cache` scope. A rejection thrown inside a cached scope loses its class and its fields, so return a plain result and rebuild the error outside the scope.
- The TMDB token is server only. Only `lib/tmdb/env.ts` may read `TMDB_READ_ACCESS_TOKEN`, and `security-boundary.test.ts` fails if any other file names it or gives it a `NEXT_PUBLIC_` prefix, the same rule the Supabase service role key carries.
- TMDB images render through `next/image`; `image.tmdb.org` is the one allowed remote pattern.

## Code conventions

- Work on a `feat/<slug>` branch off `main`, write conventional commit subjects (`feat(supabase): ...`), and merge through a pull request.
- Exported functions carry a JSDoc block that says why the code is shaped the way it is, citing the `AGENTS.md` section when a rule governs it. Comments explain reasons, not mechanics.

## Context files

- [docs/scope/scope.md](docs/scope/scope.md) (living feature list and status, owned by /scope; the stack and rules stay here in AGENTS.md)
- [lib/tmdb/AGENTS.md](lib/tmdb/AGENTS.md): the server only TMDB module, its cache and error conventions, and how to run the live check
- [components/AGENTS.md](components/AGENTS.md): the UI foundation, the plate rule, the token and glass utility vocabulary, and the server by default policy for the shell
- [lib/auth/AGENTS.md](lib/auth/AGENTS.md): the session boundary (`requireUser`, `getOptionalUser`), the private path registry, and the rules every auth form and Server Action follows
