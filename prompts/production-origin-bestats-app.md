# Move production to bestats-app.vercel.app

## Goal

Serve production at `https://bestats-app.vercel.app` and remove `https://bestats-sable.vercel.app` completely: from the Vercel project, from Supabase Auth, and from every live file in the repo. `bestats.vercel.app` was the first choice, but another Vercel account owns it (it serves an unrelated Vite app), so it can't be added to the project.

## Inspected

- `curl` on 2026-11-18: `bestats.vercel.app` answers 200 with a "Vite + React + TS" page and is in none of the 8 projects in `kris1027s-projects`; `bestats-app.vercel.app` answers 404 `DEPLOYMENT_NOT_FOUND` (unclaimed).
- `vercel project inspect bestats`: Root Directory `apps/web`, Node 22, latest production URL `bestats-sable.vercel.app`.
- The app reads its origin only from `NEXT_PUBLIC_SITE_URL` (`apps/web/lib/env.ts`), which drives canonicals, `og:url`, `robots.txt` and the sitemap. No code hardcodes the host.
- `supabase/config.toml` `[remotes.production.auth]`: `site_url` and `additional_redirect_urls` name the sable origin.
- `apps/web/deploy-config.test.ts` reads `PRODUCTION_ORIGIN` from that `site_url` and checks the redirect list is exactly `${origin}/auth/callback` and `${origin}/**`, so it follows the config with no edit.
- Live docs naming the old host: `README.md:7`, `docs/deploy.md` (lines 11, 72, 160, 161).

## Skills used

`supabase` (auth config push), Vercel CLI/MCP for domains and env.

## Decisions and assumptions

- Name `bestats-app`, chosen by you.
- The old host is removed, not redirected: you said nobody uses it.
- Historical records keep the old host: `docs/specs/0018-*/verify.md`, `docs/specs/0032-*/verify.md`, `docs/reviews/2026-10-04-*.md` and older `prompts/*.md` record checks that really ran against `bestats-sable` on those dates. Rewriting them would claim checks that never happened. Say so at approval if you want them rewritten anyway.
- `docs/deploy.md` gets a dated note that production moved on 2026-11-18, and its old "Checked on" lines stay as they are.
- Branch `feat/production-origin-bestats-app`, one PR. There's no migration, so `db push` isn't needed.

## Expected files

- `supabase/config.toml`: `site_url` and `additional_redirect_urls` become `https://bestats-app.vercel.app`.
- `README.md`: the Live link.
- `docs/deploy.md`: the facts table, the env table and the section 9 URLs, plus the move note.
- `prompts/production-origin-bestats-app.md`: this plan.

## Remote steps (each needs your OK at execution time)

1. **Vercel, add the domain:** add `bestats-app.vercel.app` to project `bestats` for Production (Vercel MCP `add_project_domain`, or Settings → Domains).
2. **Vercel, env:** set Production `NEXT_PUBLIC_SITE_URL` to `https://bestats-app.vercel.app`. It is inlined at build time, so this needs a redeploy.
3. **Supabase, auth:** `pnpm exec supabase config push` after merge. The agent shell pushes without asking (memory), so run it yourself or approve me running it.
4. **Merge the PR.** The merge deploys production with the new env value.
5. **Vercel, remove the old domain:** remove `bestats-sable.vercel.app` from the project's Domains.
6. **Google Search Console:** if you ever added the sable property, add `https://bestats-app.vercel.app` and resubmit `sitemap.xml`. This step is yours.

Order: steps 1 to 3 before the merge deploy lands, so sign-in redirects agree with the new host. Step 5 comes only after the new host is verified.

## Requirements

- Production answers on `bestats-app.vercel.app`, and the sable host answers 404 `DEPLOYMENT_NOT_FOUND`.
- Canonicals, `og:url`, the `robots.txt` sitemap line and sitemap `<loc>`s all use the new origin.
- Email/password sign-up, sign-in and sign-out work on the new host.
- No live repo file names `bestats-sable`.

## Security considerations

- The redirect allowlist stays exact (origin plus localhost), with no `*.vercel.app` wildcard. `deploy-config.test.ts` enforces this.
- No secrets change, and no service role key is involved.

## Acceptance criteria

- AC-1: `curl -sI https://bestats-app.vercel.app` gives 200 from this project.
- AC-2: `curl -sI https://bestats-sable.vercel.app` gives 404.
- AC-3: `/robots.txt` names `https://bestats-app.vercel.app/sitemap.xml`. `/movies/550` has its canonical and `og:url` on the new origin.
- AC-4: Sign up and sign in on the new host land back on the new host.
- AC-5: `grep -rn bestats-sable README.md docs/deploy.md supabase apps packages` finds nothing.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (covers `deploy-config.test.ts`). `pnpm build` isn't needed: no route, config or server code changes.

## Manual test steps

1. Open `https://bestats-app.vercel.app/shows` and see real TMDB data.
2. View the source of `/movies/550` and check the canonical and `og:url` hosts.
3. Open `/robots.txt` and `/sitemap.xml`. Every URL should be on `bestats-app`.
4. Sign up with a throwaway email/password, sign out, sign back in, and confirm you stay on `bestats-app`. Delete the test user afterwards (deploy.md section 11).
5. Open `https://bestats-sable.vercel.app` and expect Vercel's 404.
