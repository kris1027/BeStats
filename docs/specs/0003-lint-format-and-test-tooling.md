# 0003. Lint, format and test tooling

**Date**: 2026-09-20
**Status**: In Progress

Scope feature: [2. Coding standards and tooling](../scope/scope.md) · Beta tier

## Summary

This settles the checks every later feature leans on: Biome for linting and formatting, `tsc` for type checking, and Vitest as the test runner, with database policy tests written as pgTAP (a testing framework that runs inside PostgreSQL) and run by the Supabase CLI. GitHub Actions runs the fast checks on every pull request and the database tests in a second job. ESLint goes, but only after one measurement shows what Next.js specific rules Biome does not replace, because nobody has checked that yet. Spec 0002 was blocked on naming a runner; this unblocks it.

## Context

> ⚠️ Premise note: `AGENTS.md` section 6 already mandates that Biome replaces ESLint, and that call was made before anyone measured what it costs. `eslint-config-next` carries Next.js specific rules (things like flagging a raw `<img>` where `next/image` belongs, or a synchronous script in the document) and I could not verify from Biome's published rule index which of those Biome 2.5 has an equivalent for. There are signs Biome groups them under a `next` linter domain, which would close most of the gap, but the page that would confirm it could not be reached, so it stays a thing to check rather than a thing to assume. Deleting ESLint on faith is how a project quietly loses a class of check and finds out during a performance review months later. The fix is cheap: run both linters over the same code once, write down the difference, then delete ESLint knowing exactly what you gave up. The decision below keeps the mandate and adds that one measurement in front of it.

BeStats has no tests, no formatter, and a lint script that runs ESLint with the Next.js defaults. Three foundation features are about to land on top of that gap. Spec 0001 defines tables whose Row Level Security policies are the actual security boundary for every user's private data, and `AGENTS.md` section 13 makes cross user isolation a release gate. Spec 0002 defines a TMDB module whose normalization, validation, retry and error mapping logic is exactly the kind of code that breaks silently, and that spec's own AC-23 is written for fixture tests with no network and no token. Neither can be checked today.

Two more forces shape the choice. The rating and progress rules in `AGENTS.md` sections 9 and 13 are unusual enough (seasons weigh equally regardless of episode count, unrated episodes are excluded rather than counted as zero, specials are excluded from progress but still trackable) that they will be got wrong at least once, and a wrong average is invisible until a user complains. And the project builds by Tracer Bullet, so the checks need to exist end to end early rather than arrive once there is code worth protecting.

The cost of not deciding is concrete: spec 0002 ends with an open question naming this gap, and spec 0001's security guarantee has no way to be proven.

## Options considered

### Option 1: Vitest and Biome, enforced in CI, database tests included

Vitest as the single TypeScript test runner, Biome for lint and format, `tsc --noEmit` for types, all three enforced by GitHub Actions on every pull request, plus a second CI job that boots the local Supabase stack and runs pgTAP policy tests.

**Pros**:
- Vitest needs no plugin for TypeScript or JSX here, so the config stays small.
- One runner covers domain logic, TMDB fixtures and React components, with per project environments so pure logic tests never pay for a simulated DOM.
- pgTAP tests the policies where they actually run, inside PostgreSQL, so no client side mistake can make a broken policy look safe.
- CI makes the security gate real rather than a habit.

**Cons**:
- Two test kinds means two commands and two mental models.
- The database CI job is slow (it starts a full Supabase stack) and will occasionally fail for reasons unrelated to the change.
- Vitest 5 is current but moves fast, so config churn across majors is likely.

### Option 2: Vitest and Biome, local only

The same tools, scripts in `package.json`, nothing automated.

**Pros**:
- Fastest to set up, nothing to maintain in CI.
- No waiting on a pull request.

**Cons**:
- A check nobody is forced to run is a check that stops being run, usually right when a change is urgent.
- The cross user isolation gate in `AGENTS.md` section 13 would rest entirely on remembering.

### Option 3: Jest instead of Vitest

**Pros**:
- The most widely known runner, so the largest pool of examples.

**Cons**:
- Needs meaningful configuration for ESM and TypeScript in this stack, which is exactly the setup cost this feature exists to avoid.
- Slower on a suite this size, and no advantage that Vitest lacks here.

### Option 4: node:test instead of Vitest

**Pros**:
- Built into Node, zero dependencies, nothing to upgrade.

**Cons**:
- Needs its own TypeScript story and has no React component testing path, so feature 5 would have to revisit this decision anyway.
- Weaker mocking and fixture ergonomics for the TMDB tests spec 0002 describes.

## Decision

**Chosen option**: Option 1: Vitest and Biome, enforced in CI, database tests included.

Vitest is the TypeScript test runner, Biome is the linter and formatter, `tsc --noEmit` is the type check, pgTAP through the Supabase CLI covers Row Level Security, and GitHub Actions enforces all of it across two jobs.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

The forces point one way. Spec 0002's AC-23 is already written for a runner that can call plain functions with no framework transform active and no network, which Vitest does with no configuration (basis: spec 0002, AC-23). Spec 0001's policies are enforced inside PostgreSQL, so a test that proves them has to speak to PostgreSQL as a specific user, which is what Supabase documents pgTAP plus `set local role authenticated` for (basis: the installed `supabase` skill, and Supabase's local testing guide). Using a TypeScript integration test instead would prove the client behaves, not that the policy holds, and the policy is the security boundary that `AGENTS.md` section 11 says must not depend on UI checks.

Vitest over Jest and `node:test` is the boring choice here rather than the exciting one: it is the runner Next.js documents for this stack, it needs no ESM or TypeScript wiring, and it has a React component path ready for feature 5 (basis: the Next.js testing guide). `node:test` would have to be revisited the moment a component test appears, and revisiting a test runner mid project is a tax paid twice.

The engineer chose to measure the Biome and ESLint gap before deleting ESLint rather than deleting it outright, which is the right call and the one I would have pushed for. `AGENTS.md` section 6's mandate stands; this only puts one command in front of it so the cost is known rather than assumed. Biome groups rules into linter domains and has a `react` one, which the config turns on explicitly rather than relying on auto detection. Whether it also has a `next` domain is the load bearing question, and it is unverified: if it does, the gap is small and the measurement takes minutes; if it does not, the gap is the whole of `next/core-web-vitals` and worth knowing before you delete it (basis: Biome's linter domains).

Two smaller calls I made rather than asking. Formatting is configured to match the code already in the repository (2 space indent, double quotes, semicolons, trailing commas) rather than Biome's tab default, because the alternative reformats every file on day one and makes `git blame` useless for the reason that matters least. The runner up, adopting tabs, is genuinely better for anyone who reads code at a custom indent width, and is worth doing as its own deliberate commit if you ever want it. And `lint` reports without writing while `format` writes, because an agent runs these commands unattended and a command that silently rewrites files mid task is a bad surprise.

## Standard definition

**Canonical pattern**:

```jsonc
// package.json scripts. lint reports, format writes, CI runs lint:ci.
// lint:eslint is temporary and is deleted in the second rollout commit.
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check",
    "lint:ci": "biome ci --error-on-warnings",
    "lint:eslint": "eslint",
    "format": "biome check --write",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:db": "supabase test db"
  }
}
```

Every package below is a devDependency. Pin whatever is current at install time and
commit the lockfile, as `AGENTS.md` section 6 requires.

| Package | Why it is needed |
|---|---|
| `@biomejs/biome` | lint and format |
| `vitest` | the test runner |
| `@vitest/coverage-v8` | the coverage provider, not bundled with Vitest |
| `jsdom` | the browser like environment, a separate package from Vitest |
| `vite-tsconfig-paths` | resolves the `@/*` alias, see the note below |
| `@testing-library/react` | component tests, v16 or later for React 19 |
| `@testing-library/dom` | an explicit peer of Testing Library v16, not installed for you |
| `@testing-library/jest-dom` | the DOM matchers used in the setup file |

`AGENTS.md` requires imports through the `@/*` alias, and Vite does not read the alias
out of `tsconfig.json`. Without `vite-tsconfig-paths` registered as a top level plugin,
every test that imports `@/lib/...` fails to resolve. This is the single easiest thing
to get wrong here.

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!.agents/**", "!.claude/**", "!docs/**", "!supabase/**"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "css": {
    "formatter": { "enabled": true },
    "linter": { "enabled": false }
  },
  "linter": {
    "enabled": true,
    "domains": { "react": "recommended", "next": "recommended" }
  }
}
```

Three notes on that config. The `files.includes` negations are required because the git
ignore file does NOT cover `.agents/` or `.claude/` (both are committed), so without them
Biome would reformat third party skill content. CSS linting is off because Tailwind v4
puts `@theme` and similar at-rules in `app/globals.css` that Biome's CSS linter does not
understand; CSS formatting stays on. And the `next` domain must be confirmed against the
installed Biome's own schema before it is written in: if that version has no `next`
domain, remove the key and say so in the measurement below, because its presence is
exactly what decides how large the ESLint gap is.

Severity policy: locally `biome check` uses its default, so warnings report without
failing. In CI `biome ci --error-on-warnings` fails on them, so a warning cannot
accumulate unnoticed on `main`.

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Top level, so BOTH projects resolve the @/* alias.
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/*.config.*", ".next/**", "supabase/**", "**/__fixtures__/**"],
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", ".next/**"],
        },
      },
      {
        test: {
          name: "components",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude: ["node_modules/**", ".next/**"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
```

```ts
// vitest.setup.ts, loaded by the components project only.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

**Exactly two test file names are run**, and nothing else is. `*.test.ts` runs in the
node project, `*.test.tsx` runs in the jsdom project. A file named anything else
(`*.spec.ts`, `*.test.mts`, or any other convention) matches no project and is skipped
in silence, with no warning, because Vitest only reports a problem when nothing at all
matches. A component test therefore must be `.tsx` even if it contains no JSX.
`globals` stays off, so every test imports `describe`, `it` and `expect` from `vitest`
explicitly.

```
File placement, tests next to the code they test:
  lib/ratings.ts              lib/ratings.test.ts          node
  lib/tmdb/movies.ts          lib/tmdb/movies.test.ts      node
  lib/tmdb/__fixtures__/      saved TMDB responses, no network in any test
  components/rating.tsx       components/rating.test.tsx   jsdom
  supabase/tests/*.test.sql   pgTAP policy tests, run by supabase test db
```

Database tests come in two stages. This feature ships only the plumbing, proven by a
test that touches no table, because no table exists yet:

```sql
-- supabase/tests/000-smoke.test.sql. Proves the pipe, asserts nothing about a schema.
begin;
select plan(1);
select ok(true, 'pgtap runs and supabase test db reaches the database');
select * from finish();
rollback;
```

Feature 3 then adds the real policy tests in this shape. Two details in it must be
checked against the `supabase` skill and the installed CLI before being relied on: the
exact form of the user impersonation setting (the JSON claims blob shown here, versus
the older single claim form), and that seed rows are inserted before the role switch,
since once the role changes the policies block the setup itself.

```sql
-- The shape of a real policy test. Verify the impersonation form before use.
begin;
select plan(1);

-- Seed as the privileged role FIRST, while policies do not apply.
insert into user_movie_state (user_id, movie_id) values ('<user-a-uuid>', 550);

set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-b-uuid>","role":"authenticated"}';

select is_empty(
  $$ select * from user_movie_state where user_id = '<user-a-uuid>' $$,
  'user B cannot read user A movie state'
);

select * from finish();
rollback;
```

**Replaces**:
- `eslint.config.mjs` and the `eslint` plus `eslint-config-next` dependencies, removed in
  the second rollout commit below.
- `"lint": "eslint"` in `package.json`, which reports nothing about formatting.
- Having no type check script, no test script, and no automated check on a pull request.

**Enforcement**:
One workflow at `.github/workflows/checks.yml`, triggered on `pull_request` targeting
`main` and on `push` to `main`, with `permissions: contents: read` and a `concurrency`
group that cancels superseded runs. Both jobs install with `pnpm/action-setup` (reading
the `packageManager` field), `actions/setup-node` on Node 22 with `cache: "pnpm"`, and
`pnpm install --frozen-lockfile`.

1. `checks`, on every run: `pnpm typecheck`, `pnpm lint:ci`, `pnpm test`, `pnpm build`.
   The build is included because `AGENTS.md` section 13 requires a production build when
   routes, configuration, dependencies or server code change, which is most changes. No
   database, no secrets and no TMDB token, since every unit test runs from fixtures.
2. `database`, gated on `paths: ["supabase/**"]` so it does not run (and cannot fail) on
   a change that touches no database file: `supabase/setup-cli` pinned to a version,
   start the local stack, then `supabase test db`. The `pgtap` extension is enabled by a
   migration, which feature 3 owns.

**Rollout**:
New code immediately, in this order, because the order is what keeps the measurement
honest:

1. Commit one: add Biome, Vitest, the scripts and CI. `lint` becomes `biome check` and
   ESLint stays reachable as `lint:eslint`. Both linters exist briefly and on purpose.
2. Run the measurement: Biome and `eslint-config-next` over the same files, and record
   the difference in this spec's `## Follow-up` (this spec is the agreed home for that
   result; editing that one checkbox is not a redesign).
3. Commit two: delete `eslint.config.mjs`, the `eslint` and `eslint-config-next`
   dependencies, and the `lint:eslint` script. ESLint is gone inside this feature, so the
   scope's "ESLint is removed" still holds. Next.js 16 removed `next lint`, so nothing in
   the build depends on ESLint being present.
4. Commit three, on its own: the formatting pass, covering `app/`, `lib/`, `components/`
   and the root `*.ts` and `*.mjs` files only, not `docs/`, not `.agents/`. Add its hash
   to a `.git-blame-ignore-revs` file so `git blame` skips it.

`lineWidth: 80` is a deliberate choice, not a description of the current files. The first
format run will reflow some lines, including generated shadcn components, and that is
expected and contained in commit three.

**Exceptions**:
Excluded from Biome by the config above: `.agents/` and `.claude/` (third party skill
content, committed, so the git ignore file does not cover them), `docs/`, and
`supabase/`. The git ignore integration additionally covers `.next/`, `node_modules/`
and `next-env.d.ts`. CSS is formatted but not linted. The pgTAP files under
`supabase/tests/` are SQL, which Biome does not lint at all, so their only check is that
they run. Everything else, application code, configuration and TypeScript tests alike,
goes through the same checks.

## Consequences

**Positive**:
- Spec 0002's last open question is answered, so the TMDB module can be built and tested.
- The cross user isolation gate in `AGENTS.md` section 13 becomes something a machine proves rather than something a person remembers.
- The rating, progress and Up Next rules get a place for tests to live before the code that needs them exists.
- One formatter ends the question of house style, and `lint` never rewrites files an agent is midway through editing.

**Negative / tradeoffs**:
- Eight new development dependencies to keep current, listed in the standard above. Several exist only to make the others work (the jsdom environment, the alias resolver, the Testing Library peer), which is the usual cost of a JavaScript test setup.
- The database CI job is the slow one and will fail sometimes for stack reasons unrelated to the change, which erodes trust in CI if it is not kept healthy. It is gated on `supabase/**` so it stays quiet until it has something real to protect.
- Adding `pnpm build` to CI makes every pull request wait on a full production build, which is the slowest of the fast checks and the one most likely to be blamed for slow feedback.
- Two test kinds, SQL and TypeScript, means contributors need both.
- Between commit one and commit three, the project carries both linters and two lint scripts. That is deliberate and short lived, but a build that stops halfway leaves the repository in that state.
- No coverage threshold means coverage can quietly drift down, and nothing will say so.

**Neutral**:
- Vitest 5 and Biome 2.5 are current at the time of writing. `AGENTS.md` section 6 says to pick compatible supported versions at implementation time, so pin what is current then and commit the lockfile.
- `AGENTS.md` and its `## Commands and repo facts` list will need the new scripts and the removal of the ESLint line. That is `/sync`'s job, not this spec's.
- pgTAP test files live under `supabase/`, which does not exist yet and arrives with feature 3.

## Follow-up

- [x] **Measured on 2026-09-20, during `/develop tooling`. Biome 2.5.14 does have a `next` linter domain**, and `domains: { "next": "recommended" }` activates it: `noImgElement` fires on a raw `<img>` with the domain on and is silent with it off, which is the proof the domain is live rather than merely present in the schema. Running both linters over the current files produced no rule findings from either (the repository is small and clean), so the comparison below is rule by rule against the 22 `@next/next` rules that `eslint-config-next/core-web-vitals` plus `/typescript` actually enable here, read from `eslint --print-config`.

  **Covered by Biome (11 of 22)**: `google-font-display` (`useGoogleFontDisplay`), `google-font-preconnect` (`useGoogleFontPreconnect`), `inline-script-id` (`useInlineScriptId`), `no-async-client-component` (`noNextAsyncClientComponent`), `no-before-interactive-script-outside-document` (`noBeforeInteractiveScriptOutsideDocument`), `no-document-import-in-page` (`noDocumentImportInPage`), `no-head-element` (`noHeadElement`), `no-head-import-in-document` (`noHeadImportInDocument`), `no-img-element` (`noImgElement`), `no-sync-scripts` (`noSyncScripts`), `no-unwanted-polyfillio` (`noUnwantedPolyfillio`). Biome also adds `useImageSize` and `useRequiredScripts`, which ESLint did not have.

  **No Biome equivalent (11 of 22), of which 8 cannot fire in this project.** Dead here because they are Pages Router or `pages/_document` rules and this app is App Router only with no `pages/` directory: `no-duplicate-head`, `no-script-component-in-head`, `no-styled-jsx-in-document`, `no-title-in-document-head`, `no-html-link-for-pages`, `no-typos` (it checks `getServerSideProps` and friends), plus the rare `no-assign-module-variable` and `next-script-for-ga` (no analytics script exists, and nothing plans one).

  **The real loss is two link rules**: `no-css-tags` (a raw `<link rel="stylesheet">` instead of importing the stylesheet) and `no-page-custom-font` (a custom font `<link>` in a page rather than the root layout, which costs a render blocking request per page). Both are exactly the "link rules" the premise note guessed at, both are performance rules, and neither has a Biome equivalent in 2.5.14. `no-location-assign-relative-destination` is a third, minor, and about a relative `location.assign`.

  **Decision, made consciously rather than by default**: delete ESLint. The image and script rules the premise note worried most about are all covered. What goes is two font and stylesheet placement rules that would only fire if someone hand wrote a `<link>` tag, which this project has no reason to do (Tailwind v4 owns the stylesheet through `app/globals.css`, and `next/font` is the documented way to load fonts). If a hand written `<link>` ever appears, the cost is a slower page, not a broken or insecure one. Worth rechecking at feature 5 (Design system and UI foundation), when fonts are actually chosen, and again on any Biome upgrade that adds `next` domain rules.
- [ ] Verify the pgTAP user impersonation form against the `supabase` skill and the installed CLI before feature 3 writes real policy tests. The JSON claims blob shown in the standard is the form to confirm; an older single claim form also exists in circulation and picking the wrong one produces a test that passes while proving nothing.
- [ ] Pin the `$schema` URL in `biome.json` to the installed Biome version, and re-pin it on every Biome upgrade. They drift silently, and a mismatched schema means the editor validates against rules the CLI is not running.
- [ ] Biome has no usable Agent Skill. The `biomejs/biome` repository's skills (`parser-development`, `lint-rule-development`, `formatter-development`) are for contributing to Biome itself, not for using it, so nothing was installed. Revisit if an official usage skill appears.
- [ ] The `vitest` skill is installed but not yet listed in `AGENTS.md` section 4. It is project wide, so it belongs in root `AGENTS.md`, not a nested one.
- [ ] Revisit a React Testing Library skill at feature 5, when real components exist. The two candidates found today are unconfirmed and lightly installed.
- [ ] Decide a coverage threshold once the domain rule tests exist, if drift becomes a real problem. Deliberately deferred, not forgotten.
- [ ] `/test` stores its framework choice in a preferences file. Record Vitest there on the first run so it does not ask again.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md` section 6, which names Biome replacing ESLint, pnpm and TypeScript strict.
- `AGENTS.md` section 13, the check and acceptance list, item 4 in particular (two users cannot reach each other's data).
- `AGENTS.md` sections 9 and 11, the rating and progress rules, and the rule that Row Level Security is the real security boundary.
- Spec 0002, AC-23 and its Follow-up, which asked this spec to name the runner.
- Spec 0001, whose policies the pgTAP tests exist to prove.
- The installed `supabase` and `supabase-postgres-best-practices` skills, and the newly installed `vitest` skill.

**Practices & standards**:
- Test the security boundary where it is enforced, not one layer above it.
- A read only check command and a separate writing command, so automated runs never rewrite work in progress.
- Format the existing code in one isolated commit, so a style change never hides a behavior change.

**Links** (web verified during this design conversation):
- Biome: https://biomejs.dev
- Biome linter and rule domains: https://biomejs.dev/linter/
- Vitest: https://vitest.dev
- Vitest coverage: https://vitest.dev/guide/coverage.html
- Next.js testing guide: https://nextjs.org/docs/app/guides/testing
- Testing Library React releases (React 19 support from v16.1): https://github.com/testing-library/react-testing-library/releases
- Supabase local testing overview (pgTAP, `supabase test db`): https://supabase.com/docs/guides/local-development/testing/overview
