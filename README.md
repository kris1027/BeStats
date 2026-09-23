# BeStats

[![Checks](https://github.com/kris1027/BeStats/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/kris1027/BeStats/actions/workflows/checks.yml)

A movie and TV show tracking app inspired by TV Time. BeStats is being built to help you discover titles, manage a private watchlist, track watched movies and episodes, and rate what you watch. It is a tracking app, not a streaming service.

TMDB supplies catalog metadata. Supabase stores accounts and private user data. The application uses Next.js; the authoritative stack and product rules live in [AGENTS.md](AGENTS.md), with installed versions in [package.json](package.json).

## Development status

**In development — not a finished product.** The foundations (scaffold, checks, database schema and ownership policies, server-only TMDB integration, design system), email/password authentication, the public movie catalog and movie pages are implemented. Movie tracking (watchlist, watched, personal rating) is being built. TV, search, and Up Next are still planned.

The project follows a thin end-to-end approach: finish the core movie loop before expanding into TV progress, search, and Up Next. See the [scope and roadmap](docs/scope/scope.md) for the feature breakdown and [specifications](docs/specs/) for decisions already made.

## Local setup

Use Node.js 22, matching CI, and the pnpm version pinned in the `packageManager` field of [package.json](package.json). A running Docker-compatible container runtime is needed for local Supabase and database tests.

From a clone of this repository:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

If `.env.local` already exists, update it using the example instead of overwriting it. The committed [.env.example](.env.example) explains each setting and where to obtain it. Keep real credentials in the ignored local file.

### Start local Supabase

The CLI and project configuration are already included; initialization is not needed. With your container runtime running, execute from the repository root:

```sh
pnpm exec supabase start
pnpm exec supabase status
```

The first start downloads the required container images and applies the migrations and the local seed. Local Studio is available at [127.0.0.1:54323](http://127.0.0.1:54323), and Mailpit, which catches confirmation and recovery emails, at [127.0.0.1:54324](http://127.0.0.1:54324).

You do not need to copy the local keys into `.env.local`: `pnpm dev:docker` (below) reads them from `supabase status` for you. If you prefer plain `pnpm dev` against the local stack, copy the local **project URL** and **publishable key** into `.env.local`. Use the project root URL, without `/rest/v1/`, and do not use a secret key in the public key field.

To start the database again from the migrations and seed, run `pnpm exec supabase db reset`. It erases local data only.

See the [official Supabase local-development guide](https://supabase.com/docs/guides/local-development/cli/getting-started) for container-runtime setup. These commands start local services; they do not deploy or migrate a cloud project.

### Start the app

For live catalog requests, replace the TMDB token placeholder in `.env.local` with your API Read Access Token, as described in the example file. It stays server-only.

```sh
pnpm dev:docker
```

This runs the development server against the local Supabase stack, starting it first if it is not running. It exports the local URL, the publishable key and a site URL of `http://localhost:3000` for this process only, and they take precedence over `.env.local`; everything else, such as the TMDB token, still comes from `.env.local`. Extra arguments go to `next dev`. A port other than 3000 is refused, because the local auth redirect allow list in `supabase/config.toml` only covers that origin.

Use plain `pnpm dev` when `.env.local` points at the project you want, such as a cloud project. A cloud project must have the migrations in [supabase/migrations/](supabase/migrations/) applied, otherwise every tracking read fails and the server logs `movie_tracking.read refused db_error`.

Open [localhost:3000](http://localhost:3000). `/` redirects to `/shows`; the movie catalog is at `/movies`.

#### Local test accounts

The seed creates two confirmed users on the local stack, used by the database tests and handy for trying sign-in and tracking:

| Email | Password |
| --- | --- |
| `user-a@example.test` | `password-a` |
| `user-b@example.test` | `password-b` |

They exist only locally and are never applied to a deployed project.

## Everyday commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server with the settings in `.env.local`. |
| `pnpm dev:docker` | Start the development server against the local Supabase stack. |
| `pnpm typecheck` | Generate route types and check TypeScript. |
| `pnpm lint:ci` | Check formatting and lint rules without changing files. |
| `pnpm format` | Apply Biome formatting and fixes. |
| `pnpm test` | Run fixture-based tests; no live providers or credentials required. |
| `pnpm test:db` | Run database tests against the running local Supabase stack. |
| `pnpm db:types:check` | Check generated database types against local Supabase. |
| `pnpm tmdb:live` | Run the opt-in live TMDB checks; requires network access and a real token. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Serve an existing production build. |

The live TMDB check reads its token from the environment or `.env.local` and skips when no token is configured. A placeholder is not a valid token. Passing fixture tests does not establish that a live integration works.

[CI](.github/workflows/checks.yml) runs type checking, linting, fixture tests, and a production build. Database tests run when files under `supabase/` change.

## Repository map

| Path | Contents |
| --- | --- |
| [app/](app/) | App Router pages, layout, and global styles. |
| [lib/tmdb/](lib/tmdb/) | Server-only catalog access, caching, normalization, and fixtures. |
| [lib/supabase/](lib/supabase/) | Browser/server clients and generated database types. |
| [supabase/](supabase/) | Local configuration, declarative schemas, migrations, and database tests. |
| [docs/](docs/) | Scope, specifications, and verification records. |
| [prompts/](prompts/) | Implementation plans prepared for approval. |
| [.github/](.github/) | CI, issue forms, and the pull request template. |

## Working on BeStats

This is a solo developer project supported by AI agents. Read [AGENTS.md](AGENTS.md) and any directory-specific instructions before making changes. Prepare an implementation plan, obtain approval, then implement and report actual verification results.

Use a feature branch and a pull request. Changes to `main` require passing CI and an up-to-date branch; no approving reviewer is required. [Issue forms](https://github.com/kris1027/BeStats/issues/new/choose) capture reproducible bugs and features with observable acceptance criteria. Blank issues remain available for other work.
