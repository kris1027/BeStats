# GitHub issue forms

## Goal
Add concise English bug report and feature request forms to BeStats, using the approved `bug` and `feature` labels. This is a one-human-developer project supported by AI agents; optimize for quick capture and actionable agent tasks, not community contribution management.

## Inspected context
- Root `AGENTS.md`, `.github/workflows/checks.yml`, `package.json`, and `docs/scope/scope.md`.
- `.github/` currently contains the checks workflow and no issue templates or nested instructions.
- GitHub labels were verified in this task; `bug` and `feature` exist.
- The current clean checkout is `feat/design-system-ui-foundation`. Keep this change separate on `feat/github-issue-forms`, based on `main`, using an isolated checkout if needed.
- The references in `design/` describe application screens; none applies to GitHub-owned form layout.
- No specialized skill is needed for this YAML-only repository configuration task. No application, Next.js, or database code changes are planned.

## Decisions and expected files
- `.github/ISSUE_TEMPLATE/bug_report.yml`: automatically apply `bug`. Use three fields: required observed problem, required reproduction steps (a failing command or test is also valid), and required expected result. Add one optional context field for relevant paths, browser/device details, screenshots, or sanitized logs. Use short examples relevant to BeStats.
- `.github/ISSUE_TEMPLATE/feature_request.yml`: automatically apply `feature`. Use two required fields: goal/problem and observable acceptance criteria. Add one optional context/scope field for references, relevant paths, constraints, and anything explicitly out of scope. Do not require the human to prescribe the implementation.
- `.github/ISSUE_TEMPLATE/config.yml`: explicitly keep blank issues enabled for maintenance, refactoring, documentation, and other work that does not fit the two forms.
- Keep titles free of forced prefixes, and do not automatically assign people or milestones. No contributor onboarding, code-of-conduct acknowledgments, duplicate-search checkboxes, triage process, or mandatory administrative checklists. Existing repository instructions continue to govern agent execution; an issue does not bypass implementation approval.
- Preserve the existing labels, colors, workflow, and application files.
- Commit with a conventional subject and open a PR against `main`; do not merge automatically. Forms become available in the normal issue chooser after merging into the default branch.

## Security considerations
Use a brief reminder to omit credentials, session tokens, and personal information from screenshots or logs. Do not request environment files or invent a private security reporting contact. No new workflows, credentials, dependencies, or external services.

## Acceptance criteria
1. GitHub accepts both YAML forms, with unique field IDs and meaningful field labels.
2. Required fields gather enough information to investigate a bug or evaluate a feature.
3. Each form references its existing unprefixed GitHub label.
4. Optional fields remain optional, and blank issues remain available.
5. The PR contains only the plan and issue-template configuration.

## Automated checks
- Parse all three YAML files using an available local YAML parser; verify top-level keys, supported field types, unique IDs, required flags, and label references. Do not add a dependency or permanent test suite for this configuration.
- Run `git diff --check`, `pnpm typecheck`, and `pnpm lint:ci`; report actual results or blockers.
- No production build or application runtime check is needed: routes, application configuration, dependencies, and server code are unchanged.
- Inspect GitHub's template preview where accessible; distinguish local syntax checks from live validation.

## Manual verification
1. Open each form file on the PR branch in GitHub and inspect the form preview if available.
2. After merge, open `https://github.com/kris1027/BeStats/issues/new/choose`.
3. Confirm Bug report, Feature request, and the blank issue option are available.
4. Open Bug report: verify all required and optional fields, attachment support, and the `bug` label.
5. Open Feature request: verify all required and optional fields and the `feature` label.
6. Confirm required fields prevent an incomplete submission. Avoid submitting dummy issues; report post-merge checks as pending until they can be performed.

## Documentation
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository
