# Refresh README development status

## Goal
Update the README's development-status summary to match the code and current scope on `main`, without claiming the MVP is finished.

## Inspected code and designs
- `README.md` currently calls movie tracking "being built" and TV and search "planned".
- `docs/scope/scope.md` marks the foundations, authentication, movie pages and tracking, watchlist/history, TV show page, search/filters, and episode/season tracking done. It marks calculated ratings in progress, with TV status/progress, Up Next, automatic completion, launch work, and provider setup planned.
- `app/` contains the corresponding public, private, auth, movie, TV, episode, and search routes. Google sign-in is deferred to provider setup in scope feature 20.
- `design/` contains application screen references; this prose change does not affect those screens.
- The working tree is clean on `main`. Use an isolated `feat/readme-status-refresh` branch from current `main`.

## Skills, decisions, and files
- No specialized skill is needed for a prose-only status correction. No Supabase integration or application behavior changes are planned.
- Edit only `README.md` plus this plan. Keep the summary short and link the detailed scope instead of repeating its full status table.
- State clearly that email/password flows, core movie tracking, TV detail and episode tracking, and search are implemented. Distinguish the in-progress calculated ratings from planned TV status/progress, Up Next, automatic completion, Google provider setup, and launch work.
- Correct the "finish the core movie loop before expanding" wording because that work has already expanded into TV and search.
- Avoid broad README or scope rewrites and avoid claiming a live deployed service.

## Security considerations
No credentials, account data, configuration, deployments, or permission changes. The documentation must not imply that planned authentication providers or status rules have been verified.

## Acceptance criteria
1. The development status agrees with the scope and visible routes on `main`.
2. The README remains a concise entry point; detailed progress stays in the scope.
3. Local setup, commands, links, and environment guidance remain intact.
4. The PR contains only the README edit and plan.

## Automated checks and manual verification
1. Run `git diff --check` and inspect the diff for accidental changes.
2. Compare each status claim with `docs/scope/scope.md` and the relevant route files.
3. Review the rendered README on the PR branch for readable paragraphs and links.
4. CI will run existing typecheck, lint, fixture tests, and build; report actual results.
5. After merge, open the repository landing page and compare its summary with the scope. No app runtime check is needed for prose-only changes.

## Delivery
Commit with a conventional subject and open a PR against `main`. Do not merge it without an explicit follow-up instruction.
