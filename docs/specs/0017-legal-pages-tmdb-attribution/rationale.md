# 0017. Legal pages and TMDB attribution: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md`; this file says why.

## Context

> ⚠️ Premise note: the legal text this spec describes is drafted from the code by an engineer, not by a lawyer. It covers what GDPR and Polish law expect of a small free service, but it isn't legal advice. The pages are only correct if they stay true to what the app does, so the spec treats them as code: facts in one module, and an update rule for any change that touches personal data. A lawyer's review before launch is a Follow-up, not a precondition for building.

BeStats is a free, non commercial personal project run by Krzysztof Obarzanek in Poland. It stores personal data: an email address, a password hash, the Google profile Supabase Auth keeps for Google users (once feature 20 restores Google sign in), and a private history of watched titles, ratings and statuses. That puts it under GDPR as a data controller. GDPR requires telling people who controls their data, why, on which legal basis, who processes it, how long it's kept and how to use their rights. Polish law on electronic services also expects published terms covering the service's scope, its technical requirements and a complaint procedure. Today the app has none of this, and no footer to link it from.

The catalog runs on TMDB's free API. TMDB's API Terms of Use (updated 20 October 2023) require two things: the TMDB logo to identify the use, less prominent than the app's own marks, and a specific notice placed prominently. The app has a `TMDB_ATTRIBUTION` constant from spec 0002, but it holds an older sentence ("…uses the TMDB API but is not endorsed or certified by TMDB") and nothing renders it. Losing API access would take the whole catalog down, so this is load bearing.

Constraints from the code: `cacheComponents` is on, so the shell around every route (the root layout) must stay prerenderable. A footer that reads a session, or that computes the current year with `new Date()`, would cost `/shows` and `/movies` their static shells. `app/layout-purity.test.ts` guards this. Colours may live only in `app/globals.css`, and `public/` didn't exist before this feature. `design/` has no footer and no legal page, so you chose to extend the existing visual language rather than wait for references. Google OAuth verification (feature 20) needs public policy URLs.

## Options considered

### Option 1: Static TSX pages, one footer in the root layout, facts in a constants module

The two pages are Server Components whose text is written as TSX. The values that change (operator, contact, processors, dates) live in `lib/legal/operator.ts`. One `SiteFooter` in `app/layout.tsx` renders the TMDB logo from `public/`, the notice and the links.

**Pros**:
- No dependency. Fully static, with zero client JavaScript.
- The facts sit in one reviewable module beside the code they describe, and changes go through PR review.
- One footer on every route meets TMDB's placement rule everywhere at once.

**Cons**:
- Editing legal prose means editing TSX, which is clumsier than editing Markdown.
- Nothing automatically ties the text to what the code does, so drift is caught only at review.

### Option 2: Markdown or MDX content rendered by a library

The legal text lives in `.md` or `.mdx` files, rendered through `@next/mdx` or a Markdown renderer, plus a typography plugin for styling.

**Pros**:
- The prose is easy to edit and diff, and non engineers can read it.
- The typography plugin styles headings and lists for free.

**Cons**:
- Two new dependencies and a build integration, for two pages that change rarely.
- Injecting operator constants into Markdown needs templating or MDX components, which brings the "facts in one module" problem back in a more complex form.
- The plugin's default look doesn't match `design/`'s tokens without overrides.

### Option 3: A hosted policy service (Termly, iubenda and similar)

Generate the policies on a third party platform and embed or link them.

**Pros**:
- Lawyer maintained templates, updated when the law changes.
- Little writing on your side.

**Cons**:
- An embed loads third party script on the page, a new processor that itself needs disclosing, and often a cookie. That's the opposite of what this app does today.
- Generated policies usually include clauses that don't apply here (analytics, ads), and AC-11 forbids that.
- Free tiers carry branding and limits, and paid tiers cost money for a non commercial project.

### Option 4: Attribution only on an /about page, legal links in the footer

The footer holds only links. A new `/about` page carries the logo, the notice and a description of BeStats.

**Pros**:
- It's the literal minimum the TMDB logo page describes ("About or Credits").
- The footer stays very light.

**Cons**:
- The terms ask for the notice "prominently in or on" the application, and a page few people open is the weakest reading of that.
- One more page to build and keep current.

## Rationale

Option 1 fits the forces. The pages change rarely and must stay exactly true to the code, so the facts belong in a typed module next to it, reviewed in the same PR as any change that would make them false. That rules out a hosted service (Option 3), which would add the very third party processing and cookies the policy says the app doesn't have. Markdown (Option 2) improves editing ergonomics but adds two dependencies and a templating step for two pages, and buys nothing the explicit styles don't already give.

Putting the attribution in a footer on every route instead of an `/about` page (Option 4) is the stronger reading of "prominently in or on Your Application", and it costs nothing extra because the footer exists anyway for the legal links. The logo is the *Alt short* variant at 12 to 14px, below the 20px extrabold wordmark, which satisfies "less prominent than the logos or marks that primarily describe or identify Your Application". It's served unmodified from `public/`, and a hash test guards it, because TMDB asks that its marks not be altered and a well meaning restyle is the likely way they would be. `public/` is already outside the colour token rule, so the file keeps its own colours. The notice constant is corrected to the October 2023 wording, which you chose with the noun "website". The © line has no year, because a live year needs the current date in a prerendered shell and a fixed year goes stale.

The sign up acceptance is a passive notice, not a checkbox, because the legal basis for the account is the contract (GDPR Art. 6(1)(b)), not consent. A checkbox adds friction and, done properly, a stored record and a profile table that `AGENTS.md` asks you to avoid. The notice sits below the whole form, so it also covers the Google button feature 20 restores. There's no cookie banner, because the only cookies are the strictly necessary Supabase session cookies, which are exempt from consent. Adding a banner would wrongly suggest otherwise. Deletion and export by email request meet the GDPR rights with no new privileged code path. A self serve flow needs the service role or a security definer function, and belongs in its own spec.

### Recommended calls made at write time

- **Logo rendering**: `next/image` with `unoptimized` and explicit dimensions. Runner up: a plain `<img>`, which Biome's `next` rules (`noImgElement`) flag.
- **Notice placement on sign up**: a static line outside the form's Suspense boundary, below the form. Runner up: inside the client form, which would make it stream in and shift.
- **Complaint response time**: 14 days, the common Polish e-services practice. Runner up: 30 days.
- **Sitemap position**: right after the landings, so spec 0016's title order stays intact. Runner up: at the end, after 400 titles.

### Evidence: TMDB requirements checked on 2026-10-03

- Notice (API Terms of Use, section 3): "You must place the following notice prominently in or on Your Application: 'This [website, program, service, application, product] uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.'" The terms were last updated 20 October 2023.
- Logo (section 3): "You must use the TMDB logo to identify Your use of TMDB, the TMDB APIs, or TMDB Content." and "Any use of any TMDB logos in Your Application must be less prominent than the logos or marks that primarily describe or identify Your Application."
- Logo variants on TMDB's logos page: Primary full, Primary short, Primary long, Alt long, Alt short (all blue SVG). The Alt short file is `blue_short-8e7b…f95f6c.svg`.
- Caching (section 1.C): no caching "for longer than 6 months". The app's longest profile is `cacheLife("max")` on the genre lists. It revalidates monthly, so it's compliant (Follow-up notes the ceiling).
- Commercial use needs a separate agreement with TMDB (developer FAQ). BeStats is non commercial by your answer.
- JustWatch attribution applies only when showing watch provider data, which BeStats doesn't.

## References

**Project sources**:
- `AGENTS.md` sections 3, 11 and 12 (states, privacy, TMDB attribution before release), and the repo facts on `cacheComponents`, the proxy and `lib/env.ts`
- Spec 0002 (`TMDB_ATTRIBUTION`, AC-22), spec 0005 (auth pages, no profiles table), spec 0016 (`catalogMetadata()`, sitemap order AC-6, no site URL behaviour AC-3)
- `components/AGENTS.md` (tokens, touch sizes, focus, showcase), `app/layout-purity.test.ts`, `design-tokens-boundary.test.ts`

**Practices & standards**:
- GDPR Art. 6(1)(b) and (f) legal bases, Art. 12(3) one month response, Art. 13 information duties, Arts. 15 to 21 data subject rights, Art. 77 complaint to a supervisory authority
- The ePrivacy strictly necessary cookie exemption (no consent banner for session cookies)
- The Polish Act on Providing Services by Electronic Means (published terms: scope, technical requirements, complaint procedure)

**Links** (web verified 2026-10-03):
- TMDB API Terms of Use: https://www.themoviedb.org/api-terms-of-use
- TMDB Logos & Attribution: https://www.themoviedb.org/about/logos-attribution
- TMDB developer FAQ (commercial use): https://developer.themoviedb.org/docs/faq
- TMDB staff note on JustWatch attribution: https://www.themoviedb.org/talk/60355e30a284eb003da676f2
