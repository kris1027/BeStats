# GitHub pull request template

## Goal
Add a concise default PR template for one human developer working with AI agents. Make changes easy to assess without contributor bureaucracy.

## Inspected context and skills
- Root `AGENTS.md`, `.github/workflows/checks.yml`, and the recently merged issue forms on `origin/main`.
- The active checkout remains the design-system branch; work separately from it.
- Application references in `design/` do not apply to GitHub's Markdown layout.
- No specialized skill is needed for this Markdown-only change.
- Verified the supported template location and default-branch activation in GitHub's official documentation: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository

## Expected files and decisions
- Add `.github/pull_request_template.md` with three sections: `What changed`, `Verification`, and `Needs attention`.
- Use short hidden HTML comments as author guidance, not visible boilerplate or mandatory checklists.
- What changed: explain the concrete problem and resulting behavior; link an issue when applicable.
- Verification: report checks actually run and their results, manual verification steps, and screenshots for visible UI changes when useful. Clearly identify checks not run or blocked.
- Needs attention: note setup, migrations, limitations, or decisions only when relevant; write `None` otherwise.
- Do not add review assignments, approval checkboxes, required issue links, AI attribution, labels, workflows, or branch rules.
- Retain this plan in `prompts/github-pull-request-template.md`.
- Work on `feat/github-pull-request-template` based on current `origin/main` in an isolated checkout. Commit with a conventional subject and open a PR against `main`. Do not merge without the user's instruction.

## Security
No secrets, integrations, dependencies, or application changes. Guidance must not imply that unperformed verification passed or require sensitive logs.

## Acceptance criteria
1. Exactly one default PR template exists at the supported path.
2. It has the three concise sections above, with optional contextual guidance in properly closed comments.
3. It is useful for both the human developer and AI agents, without generic contributor administration.
4. The PR contains only the template and this plan.

## Checks
- Inspect Markdown structure and comments and run `git diff --check`.
- No permanent tests, application type checking, production build, or runtime checks are needed for prose-only files.
- Inspect the rendered file on GitHub where accessible; report automatic PR-body population as pending until the template reaches the default branch.

## Manual verification
1. Review the template in the PR and confirm it renders three headings without exposing comment guidance.
2. After merge, open the GitHub comparison page for a branch with changes and choose Create pull request.
3. Confirm the body is populated with the three sections and editable guidance.
4. Fill in a brief change summary, actual verification results, and `None` for attention when applicable; confirm the preview is readable. Do not submit a dummy PR solely for testing.
