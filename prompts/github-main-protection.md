# Protect main on GitHub

## Goal and context
Protect the default branch for a solo developer working with AI agents, while allowing the owner to merge their own PRs. GitHub currently returns no rulesets and reports main as unprotected. Inspected `.github/workflows/checks.yml` and successful `checks` and `database` checks on PRs #6 and #7. No application design applies, and no specialized skill is needed.

## Proposed configuration
Create one active GitHub branch ruleset named `Protect main`, targeting `refs/heads/main` only:
- Require pull requests with zero required approving reviews.
- Require `checks` and `database` from GitHub Actions; verify the integration ID before configuring it.
- Require the PR branch to be up to date with main, so concurrently working agents cannot merge against stale code.
- Block force pushes and branch deletion.
- No bypass actors. The owner can still edit the ruleset in repository settings if recovery is needed.
- Leave CodeRabbit advisory; do not gate merges on an external review service.
- Do not require code-owner review, last-push approval, signed commits, linear history, or conversation resolution. Preserve current merge methods and all other repository settings.

## Files and scope
This plan is the only local file. Apply the approved settings through GitHub's rulesets API; no application files, workflows, dependencies, or branch changes are needed.

## Security and acceptance
The resulting rules must apply to main, require the two existing CI jobs and PRs, allow zero-review solo merges, and prevent ordinary direct pushes, force pushes, and deletion. Do not grant new bypass access. The database workflow's existing path-gated steps remain unchanged.

## Verification
1. Re-read current rules immediately before applying; avoid duplicates or overwriting unexpected changes.
2. Verify the GitHub Actions app identity from an existing check run.
3. Create the ruleset and read it back to verify every configured rule, target, enforcement state, and empty bypass list.
4. Check the effective rules for main through the API.
5. Open Settings > Rules > Rulesets > Protect main and inspect the settings.
6. On the next real PR, confirm merging waits for required CI and requires no human approval. Do not create destructive push attempts or dummy PRs to test enforcement.

No code tests or build are applicable. Report API verification separately from enforcement checks deferred to the next real PR.

## Sources
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://docs.github.com/en/rest/repos/rules
