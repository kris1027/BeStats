# BeStats README

## Goal
Replace the Next.js starter README with a useful GitHub landing page and local-development guide for one developer working with AI agents.

## Inspected context and skills
- Read the README, package scripts, `.env.example`, Supabase configuration, and scope from `origin/main`; reviewed `.github/workflows/checks.yml`, root instructions, and `lib/tmdb/AGENTS.md`.
- Main records the scaffold, tooling, database foundation, and TMDB integration as complete. The design-system work is on another branch; do not describe it as shipped on main.
- Inspected the design file inventory; those files are design references, not screenshots of a finished app. Do not present them as product screenshots or add placeholder images.
- Loaded `.agents/skills/supabase/SKILL.md` for setup guidance. Before writing setup commands, consult current Supabase changelog/docs and installed CLI help. No database changes are involved.

## Proposed content
1. BeStats name, plain-English purpose, and a clear in-development notice. Describe it as a tracking app, not a streaming service.
2. A compact completed/planned overview with a link to the living scope rather than duplicating its entire feature list.
3. Local setup: prerequisites aligned with CI and the pinned pnpm version, dependency installation, copying `.env.example` to `.env.local`, supplying configuration, and starting the app.
4. Explain local Supabase/Docker setup separately from ordinary fixture tests; distinguish local setup from remote deployment. Verify commands against installed CLI help. Do not include destructive reset commands in the quickstart.
5. A short table of everyday scripts, with explicit prerequisites for database checks and the opt-in live TMDB check.
6. A small repository map and links to scope, specs, and `AGENTS.md`; describe the existing plan/approval/PR workflow briefly for agent work.
7. A restrained GitHub Actions status badge if useful; no invented deployment link, license, screenshots, or completed-feature claims.

Refer to `AGENTS.md` for the authoritative stack and rules and `package.json` for versions. Keep environment details in `.env.example`, linking to it instead of repeating secret-variable identifiers throughout the README. Do not modify other documentation to fix unrelated stale text.

## Expected files and delivery
- `README.md`
- `prompts/github-readme.md` (this approved plan)

Use a separate `feat/github-readme` branch from fresh `origin/main`, preserving the design-system checkout. Commit and open a PR. Do not merge automatically.

## Security
Use only committed placeholder configuration; never read or copy real credentials into documentation. No remote migrations, provider changes, deployment, database writes, or dependency upgrades.

## Acceptance criteria
- A reader understands the purpose, current limitations, and how to run/check the project.
- Every documented package script exists; relative links resolve on the PR branch.
- Setup is consistent with committed configuration, CLI help, and current provider documentation.
- CI status refers to this repository's actual workflow.
- The README does not imply that pending authentication/tracking UI works today.

## Checks and manual verification
1. Validate relative link targets, command names, Markdown fences, and `git diff --check`.
2. Review setup instructions against installed CLI help and committed configuration. Do not claim a fresh-install test unless actually run.
3. Run the existing repository checks in CI; no new test suite or application changes are needed for Markdown documentation.
4. Inspect GitHub's rendered README for headings, tables, badge, and links when accessible.
5. After merge, open the repository landing page and confirm the new README is visible. Report any unperformed setup/render checks explicitly.
