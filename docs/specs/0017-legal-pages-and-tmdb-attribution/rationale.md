# 0017. Legal pages and TMDB attribution: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

BeStats shows TMDB's catalog on every public page and keeps private data for signed in Viewers, yet it has no footer, no privacy policy, no terms and nowhere that credits TMDB. `TMDB_ATTRIBUTION` exists in `lib/tmdb/constants.ts` (spec 0002, AC-22) and is rendered nowhere; its comment says its display belongs to this feature. `AGENTS.md` section 12 requires the attribution and branding TMDB's current terms ask for, verified before release.

The owner is an individual in Poland and the audience is EU, so GDPR applies: a named controller, a lawful basis per purpose, the data subject's rights and the supervisory authority. Account deletion is deferred (spec 0005), which sits awkwardly with the right to erasure. Google sign in is not live until feature 20, and the Supabase and Vercel regions are not chosen yet. The shell is prerendered under `cacheComponents`, so nothing added to it may read request state.

Not deciding leaves the API access at risk (missing attribution is a terms breach), leaves the sign up form collecting email and passwords with no notice, and leaves an EU controller with no stated contact.

## TMDB requirements as read on {date}

_Empty on purpose. AC-1 is a human step: this environment could not reach themoviedb.org, so nothing below is verified. Fill in from the live pages before building the footer:_

- Required notice wording:
- Approved logo variants and where to download them:
- Rules on colour, aspect ratio and size:
- Placement rule (About or Credits section? every page?):
- Prominence rule relative to the app's own branding:
- Anything TMDB's terms require of the app's own privacy policy or terms (caching, storing, commercial use):

What the secondhand research cache says, to be confirmed or overturned: the notice is the sentence in `TMDB_ATTRIBUTION`, placed "prominently in an About or Credits section"; only approved logos, unmodified; the logo less prominent than the app's own branding; no implied endorsement.

## What BeStats actually processes

The policy is written from this list, and AC-9 forbids claims beyond it. Each row was read from the repository on 2026-10-03.

| Data | Where | Who sees it | Why |
|---|---|---|---|
| Email, password hash, auth metadata | Supabase Auth | Supabase (processor), the owner through the dashboard | Account and sign in |
| Session cookies (`sb-*-auth-token`, HttpOnly where the SSR client sets it) | Browser | Supabase client code, the app server | Keeping a Viewer signed in; strictly necessary |
| Movie state, ratings, watchlist time; TV status and its source; episode watched state and ratings | Supabase Postgres, RLS per user | The owning Viewer only; the owner through the dashboard | The tracking feature |
| Request logs (IP address, user agent, path) | Vercel | Vercel (processor) | Hosting, security |
| TMDB requests | Server only, with the app's token | TMDB | Catalog data; carries no Viewer identity |

Not collected: analytics (none in `package.json` or `app/`), advertising, third party scripts, a profile, a name, a date of birth, payment data. TMDB artwork is rendered through `next/image`, so the optimiser fetches it from the server and a browser does not contact `image.tmdb.org` directly. That claim is checked in the running app (verify.md) before the policy says TMDB receives no visitor IP.

Open facts only the owner has: the legal name, the Supabase and Vercel regions, the data transfer mechanism that follows from them.

## Options considered

### Option 1: Footer on every page, two static pages, copy kept in components

Footer in the root layout, `/privacy` and `/terms` as static pages with prose in JSX, one facts module for what must match the code.

- Good: every page carries the notice; no dependency; static, so it costs no route its shell; the copy is reviewed in one diff; the sign up line is a link, not a field.
- Bad: a footer on every page uses vertical space; prose in JSX is clumsier to edit than Markdown.

### Option 2: Attribution on an About page only

A single `/about` page with the notice and logo, linked from the footer.

- Good: smallest footer; matches the "About or Credits" wording in the research cache.
- Bad: needs a page nobody asked for, and a visitor on `/movies/550` sees TMDB data with no credit on the page. Rejected unless AC-1 shows TMDB explicitly accepts it.

### Option 3: MDX or Markdown content with a loader

Write the policies as `.mdx` and render them.

- Good: easy for a non developer to edit the text.
- Bad: new dependency and build configuration for two pages, a second place for the facts to drift. The owner edits the text in the repository anyway.

### Option 4: A generator or a hosted policy service

Use a policy generator or an embedded hosted policy.

- Good: fast, boilerplate coverage.
- Bad: generic text that names processors BeStats does not use and omits ones it does, and an embedded script is a third party in a page that has none today. Rejected: AC-9 needs the policy to be true.

## Rationale

Option 1. The attribution belongs on every page that shows TMDB data, and the one place that is true of is the root layout. Two static pages cost nothing at request time. Keeping the facts in a module that a test checks against the app's real cookie names is the cheapest guard against a policy that stops being true.

Linking at sign up without a checkbox is chosen because the terms are accepted by use and a checkbox would create consent data the schema does not store. If the owner later wants an auditable acceptance, that is a migration and its own spec.

Writing for GDPR even though the owner is one person: the audience is the EU, the policy then also serves everyone else, and the cost of being stricter than needed is a few paragraphs.

## Notes on the legal content

This is a drafting aid, not legal advice. Points that a lawyer should look at before launch: the liability limit and governing law wording in the terms, the lawful basis stated for each purpose, whether the owner needs a records-of-processing entry, and whether a data processing agreement with each processor is already in force through the providers' standard terms.
