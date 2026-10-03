# 0017. Legal pages and TMDB attribution: a site footer, a privacy policy, terms of service and TMDB's current notice and logo

**Date**: 2026-10-03
**Status**: Accepted

Scope feature: [18. Legal pages and TMDB attribution](../../scope/scope.md) · Beta tier

## Summary

BeStats gets a quiet footer on every page. It holds TMDB's logo, the notice TMDB's terms require today, and links to two new static pages: a Privacy Policy and Terms of Service. The pages are written in plain English from what the app really does (the data it stores, who processes it, which cookies it sets), under GDPR and Polish law, with Krzysztof Obarzanek named as operator. Sign up gains one line saying that creating an account means you agree to the Terms. Nothing is stored and there's no migration. The work is static pages, one footer component, one constant fix and two small edits (the sign up page and the sitemap).

## Requirements

**User stories**:
- As a visitor, I want to see where the catalog data comes from and who runs BeStats, so that I know what I'm using.
- As someone signing up, I want to read the terms and the privacy policy before I create an account, so that I know what happens to my data.
- As the operator, I want TMDB's attribution to meet its current terms, so that BeStats keeps its free API access.
- As someone with an account, I want to know how to get my data or have it deleted, so that I can use my GDPR rights.

**Acceptance criteria** (the contract):

*Footer*
- **AC-1**: A `SiteFooter` Server Component renders on every route (catalog, search, title pages, private pages, the auth screens and the 404). `app/layout.tsx` renders it once, below `<main>` and above `<Toaster />`. It reads no cookie, header, session or Supabase client. `components/layout/site-footer.tsx` is added to `LAYOUT_TREE` in `app/layout-purity.test.ts`, and that test passes. `/shows` and `/movies` stay partially prerendered in the build route table.
- **AC-2**: The footer shows TMDB's *Alt short (blue)* logo, served from `public/tmdb-logo.svg`. That file is an unmodified copy of the official file (URL under Configuration required). A Vitest test checks that the file exists and that its SHA-256 equals the hash recorded when it was downloaded, so the logo can't be edited by accident. The logo renders through `next/image` with `unoptimized` (`next.config.ts` has no `dangerouslyAllowSVG`). Its `width` and `height` attributes are the SVG's intrinsic `viewBox` size, and `className="h-3 md:h-3.5 w-auto"` makes it 12px tall on mobile and 14px from `md` up. Your BeStats wordmark is 20px extrabold, so the TMDB mark stays less prominent, as TMDB requires. The logo is a link to `https://www.themoviedb.org` with `alt="TMDB"`, `target="_blank"` and `rel="noopener noreferrer"`.
- **AC-3**: `TMDB_ATTRIBUTION` in `lib/tmdb/constants.ts` reads exactly `This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.` (TMDB API Terms of Use, section 3, as updated 20 October 2023). `lib/tmdb/surface.test.ts` asserts the new string. The footer renders that constant, imported from `@/lib/tmdb`, next to the logo. The sentence appears nowhere else as a literal, except in the assertion in `lib/tmdb/surface.test.ts`. `/terms` may also render the constant (Catalog data and TMDB section). Both import it from `@/lib/tmdb`, the only entry point `lib/tmdb/AGENTS.md` allows. Its `server-only` guard is fine in Server Components and doesn't stop a page from being static.
- **AC-4**: The footer links `Privacy Policy` to `/privacy` and `Terms of Service` to `/terms` (both with `next/link`). It shows `© BeStats · Krzysztof Obarzanek` with no year. The footer contains no `mailto:` link and no email address.
- **AC-5**: Layout. From `md` up the footer is one row inside the same `max-w-[1600px] px-4` frame as the navbar and `<main>`: logo and notice on the left, then links and the © line on the right. Below `md` it stacks in this order: logo and notice, links, © line. At 375px there's no horizontal page scroll. Links are plain `next/link` elements styled like the `link` variant in `buttonVariants` (`text-text-link`, underline on hover), made `inline-flex min-h-11 md:min-h-9 items-center` so they're 44px tall below `md` and 36px from `md`. Each shows the standard focus ring. A `border-t border-border` line separates it from `<main>`. Text is `text-xs` or `text-sm` in `text-muted-foreground`, and links are `text-foreground` with an underline on hover. No colour literal is added (`design-tokens-boundary.test.ts` passes), and there's no glass, no blur and no backdrop, because the footer sits on flat black. `<main>` keeps `flex-1`, so on short pages (sign in, the 404) the footer sits at the bottom of the viewport.

*Legal pages*
- **AC-6**: `/privacy` and `/terms` are Server Components, fully static (`○` in the build route table), with no client boundary. They're public. "Static" means the page body: like every public page, a signed in request may still get a session refresh `Set-Cookie` from the proxy, and that's accepted. `proxy.ts` neither redirects nor 404s them for a signed out or signed in visitor (a `proxy.test.ts` case each), and neither is in `PRIVATE_PATH_PREFIXES`.
- **AC-7**: Each page renders inside a shared `LegalDocument` component (`components/legal/legal-document.tsx`). It's a centred reading column at most `max-w-[72ch]` wide, with an `h1` (`Privacy Policy` / `Terms of Service`) and a `Last updated {date}` line in a `<time dateTime="YYYY-MM-DD">`. Each section is an `h2` whose `id` is its title in kebab-case (`who-runs-bestats`, `cookies`, `your-rights` and so on), so sections are linkable and a test can check them ( and the existing scroll padding keeps the heading clear of the sticky navbar). Body text uses existing tokens, and lists and links are styled explicitly, because there's no typography plugin. External links (TMDB, UODO) open in a new tab with `rel="noopener noreferrer"`. The date is formatted from the fixed constant: it's parsed as UTC (`new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`)`) and formatted with `Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })`, for example `3 October 2026`. The page never uses the current time.
- **AC-8**: `/privacy` contains these sections, in this order, stating the facts in the *Privacy Policy facts* table under Feature design and nothing those facts contradict: Who runs BeStats · What we collect · Why we use it (purposes and legal bases) · Cookies · Who processes your data · Transfers outside the EEA · How long we keep it · Your rights · Complaints · Children · Security · Changes to this policy · Contact.
- **AC-9**: `/terms` contains these sections, in this order, stating the facts in the *Terms of Service facts* table: About BeStats · Your account · Technical requirements · Acceptable use · Catalog data and TMDB · Availability and changes to the service · Ending your account · Liability · Complaints · Governing law · Changes to these terms · Contact. It links to `/privacy` in Your account.
- **AC-10**: Every operator fact both pages show (operator name, contact email, country, supervisory authority name and address, minimum age, the last updated date, the deletion and complaint response times, the processors list) comes from one pure module, `lib/legal/operator.ts`, with no `server-only` import. Neither page hardcodes these values. The contact email appears only on `/privacy` and `/terms`, as a `mailto:` link.
- **AC-11**: Neither page claims something the app doesn't do. There's no mention of analytics, advertising, data sales, newsletters, payment data, profiling, or a self serve delete or export button. The only exception is an explicit denial (for example "We don't use analytics"). Every processor named is one the app uses today. `/check verify` checks this by reading both pages against the facts tables below.

*Metadata and sitemap*
- **AC-12**: Both pages build their metadata through `catalogMetadata()` with `ogType: "website"` and `image: null` (site card). Titles: `Privacy Policy` and `Terms of Service` (the root template adds ` · BeStats`). Descriptions: `How BeStats collects, uses and protects your data, and the rights you have over it.` and `The rules for using BeStats, a free movie and TV tracking website.` Both are indexable (no `robots` override). With `NEXT_PUBLIC_SITE_URL` unset, both still render with a 200 and carry no canonical (spec 0016, AC-3).
- **AC-13**: `sitemapEntries()` lists `/privacy` then `/terms` directly after the two landings and before the first movie. The order of everything else is unchanged from spec 0016, AC-6, and `app/sitemap.test.ts` is updated to match. The legal URLs follow the existing rule: no sitemap entries off production or without a site URL.

*Sign up*
- **AC-14**: `/sign-up` shows, under the form and above the panel's `Already have an account?` footer, the line `By creating an account, you agree to the Terms of Service and acknowledge the Privacy Policy.` with `Terms of Service` linked to `/terms` and `Privacy Policy` linked to `/privacy`. `AuthPanel`'s children become a fragment: the existing Suspense boundary, then this `<p className="text-xs text-muted-foreground">` as its sibling. Both links use `next/link`. Because it renders outside the form's Suspense boundary, it's in the static shell and doesn't shift when the form streams in. There's no checkbox, the sign up Server Action is unchanged, and nothing is stored. The line sits below the whole form area, so it also covers the Google button that feature 20 restores above the fields.

*Proof*
- **AC-15**: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass. A browser pass at 1440px and 375px, signed out and signed in, confirms the footer on `/shows`, `/movies/550`, `/watchlist`, `/sign-up` and the 404, opens both legal pages from the footer and from sign up, and checks keyboard focus through the footer links.

## Decision

**Chosen option**: Option 1: Static legal pages and one footer, built in the app with no new dependency.

Two static Server Component pages hold the legal text as TSX. The facts that change live in one pure constants module. One footer in the root layout carries the TMDB logo, the corrected notice and the links, and sign up shows a passive acceptance line.

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) for keeping the footer inside the prerendered shell and the two pages fully static · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for the browser pass over the footer, the pages and sign up

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. Nothing is stored, and there's no migration. Acceptance at sign up is a notice, not a record (decided with you, Stage a). There's no `profiles` table, and `lib/auth/AGENTS.md` keeps it that way.

**New and changed files**:
- `lib/legal/operator.ts` (new, pure): the constants in *Value sourcing*.
- `lib/legal/operator.test.ts` (new): the values are non empty, the email is valid, and `LEGAL_LAST_UPDATED` is a valid `YYYY-MM-DD` date (no clock comparison).
- `components/layout/site-footer.tsx` (new, Server Component) and `site-footer.test.tsx`: the notice text, the link targets, the logo attributes, no `mailto:`.
- `components/legal/legal-document.tsx` (new, Server Component): the reading column, `h1`, `Last updated`, and the section helper (`LegalSection` with `id` and `title`).
- `app/privacy/page.tsx`, `app/terms/page.tsx` (new), plus one test each: the headings in order, the operator values present, the `mailto:` present.
- `public/tmdb-logo.svg` (new, the first file in `public/`) and `public/tmdb-logo.test.ts`, or a test beside the footer: existence and SHA-256.
- `app/layout.tsx`: render `<SiteFooter />` after `<main>`.
- `app/layout-purity.test.ts`: add the footer to `LAYOUT_TREE`.
- `lib/tmdb/constants.ts`, `lib/tmdb/surface.test.ts`: the new notice.
- `lib/seo/sitemap.ts`, `app/sitemap.test.ts`: the two legal entries.
- `app/(auth)/sign-up/page.tsx`: the acceptance line.
- `proxy.test.ts`: the `/privacy` and `/terms` cases.

**API surface** (public, unauthenticated, all GET, all static):
| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/privacy` | GET | none | Static HTML, canonical, site card | public | none (static) |
| `/terms` | GET | none | Static HTML, canonical, site card | public | none (static) |
| `/tmdb-logo.svg` | GET | none | The SVG file | public | 404 only if the file is deleted (the hash test fails first) |
| `/sitemap.xml` | GET | none | Gains two entries | public | Unchanged from spec 0016 |

No Server Action and no Route Handler are added.

**Value sourcing**:
| Surface | Value displayed | Source |
|---|---|---|
| Footer | Notice sentence | `TMDB_ATTRIBUTION`, `lib/tmdb/constants.ts` (AC-3) |
| Footer | TMDB logo | `public/tmdb-logo.svg`, downloaded unmodified from TMDB's *Alt short (blue)* URL below |
| Footer | Logo width and height | The SVG's own `viewBox`, read once when it's added, scaled to 12px / 14px tall |
| Footer, pages | Operator name `Krzysztof Obarzanek` | `OPERATOR_NAME` in `lib/legal/operator.ts` (you gave it) |
| Pages | Contact email `kris1027.dev@gmail.com` | `CONTACT_EMAIL` (you gave it) |
| Pages | Country `Poland`, governing law | `OPERATOR_COUNTRY` (you gave it) |
| Privacy | Supervisory authority | `SUPERVISORY_AUTHORITY`: `President of the Personal Data Protection Office (UODO), ul. Stawki 2, 00-193 Warsaw, Poland`, URL `https://uodo.gov.pl` (follows from Poland) |
| Pages | Minimum age `16` | `MINIMUM_AGE` (you chose it) |
| Pages | Last updated date | `LEGAL_LAST_UPDATED`, a `YYYY-MM-DD` string. `/develop` sets it to the build day and updates it to the day the final text is written. Bump it by hand whenever the text changes materially. Both pages share it. |
| Privacy | Deletion handled within `30 days`, rights requests answered within `one month` | `DELETION_DAYS = 30`, `RIGHTS_RESPONSE = "one month"` (GDPR Art. 12(3)) |
| Terms | Complaints answered within `14 days` | `COMPLAINT_RESPONSE_DAYS = 14` (recommended, the usual Polish e-services practice) |
| Privacy | Processors list | `PROCESSORS: { name: string; purpose: string; url: string }[]`, holding only what's live today: Supabase (database, authentication, account emails), Vercel (hosting, image delivery, request logs). Google is not listed until feature 20 restores Google sign in. Feature 20 adds it, plus any email provider, in the same PR. |
| Both | Canonical, `og:url` | `catalogMetadata()` → `absoluteUrl(path)` (spec 0016) |
| Sitemap | Two URLs | `origin` from `siteUrl()`, as for the landings |

**Privacy Policy facts** (what `/develop` writes, in plain English; "we" means the operator):
| Section | Must state |
|---|---|
| Who runs BeStats | A free, non commercial personal project run by `OPERATOR_NAME` in `OPERATOR_COUNTRY`, who is the data controller. Contact: `CONTACT_EMAIL`. |
| What we collect | Account: email address, and a password stored only as a hash by Supabase Auth. (Feature 20 adds the Google sign in line when it ships: the email, name, profile picture link and Google account ID Google shares.) Tracking: watchlist entries, watched movies and episodes with their dates, your 1 to 10 ratings, TV show statuses. Technical: IP address, browser user agent and request logs kept by the hosting and auth providers. Auth events BeStats logs carry no email, password or token. Nothing else: no payment data, no contacts, no location beyond what an IP implies. |
| Why we use it | To provide your account and keep your tracking data (Art. 6(1)(b), performing the contract you accept by signing up). To send the confirmation and password recovery emails the account needs (same basis). To keep the service secure and stop abuse, such as rate limits and logs (Art. 6(1)(f), legitimate interests). No marketing emails, no ads, no analytics, no profiling, no automated decisions, and we never sell data. |
| Cookies | Only strictly necessary cookies: the Supabase session cookies, set when you sign in, `HttpOnly`, removed when you sign out. No analytics, advertising or third party tracking cookies, so there's no consent banner. Fonts are served from BeStats itself. |
| Who processes your data | Each entry in `PROCESSORS`, with what it does. TMDB gets no personal data: our server makes the catalog requests, and our host delivers the images. |
| Transfers outside the EEA | Supabase and Vercel are US based providers (no hosting region is named). Where your data leaves the EEA, it's protected by the safeguards those providers offer, such as the EU Standard Contractual Clauses. |
| How long we keep it | Account and tracking data stay until you ask us to delete your account. We then delete them within `DELETION_DAYS` days. Provider logs follow those providers' own retention periods. |
| Your rights | Access, rectification, erasure, restriction, data portability (a copy of your tracking data on request) and objection. Email `CONTACT_EMAIL` and we answer within `RIGHTS_RESPONSE`. Account deletion works by email request today. |
| Complaints | You can complain to `SUPERVISORY_AUTHORITY` (name, address and link), or to the authority where you live. |
| Children | BeStats is not for anyone under `MINIMUM_AGE`. We delete an account we learn belongs to someone younger. |
| Security | Row Level Security limits each account to its own data, session cookies are `HttpOnly`, and Supabase hashes passwords. No system is perfectly secure. |
| Changes | Material changes are posted on this page with a new `Last updated` date. |
| Contact | `OPERATOR_NAME`, `CONTACT_EMAIL`. |

**Terms of Service facts**:
| Section | Must state |
|---|---|
| About BeStats | A free website for tracking the movies and TV shows you watch, run by `OPERATOR_NAME` as a non commercial personal project. It's not a streaming service and hosts no video. By creating an account you accept these terms (the agreement starts at sign up). |
| Your account | You must be at least `MINIMUM_AGE`. Give an email you control, keep your password private, one person per account. How we handle your data is in the Privacy Policy (link `/privacy`). |
| Technical requirements | A current web browser with JavaScript and cookies enabled, an internet connection, and an email address for an account. |
| Acceptable use | No unlawful use, no attempts to reach other people's data, no attacking, overloading or probing the service, no automated scraping or bulk access. Your ratings and lists are private, and BeStats publishes nothing you enter. |
| Catalog data and TMDB | Titles, images and details come from TMDB. We can't guarantee they're accurate or complete. `TMDB_ATTRIBUTION` is repeated here. TMDB community ratings are TMDB's, and your ratings are yours. |
| Availability and changes | Provided free and as is. Features may change or stop, with notice on the site where reasonably possible. |
| Ending your account | You can stop any time and ask for deletion at `CONTACT_EMAIL` (handled within `DELETION_DAYS` days). We may suspend an account that breaks these terms. |
| Liability | Limited as far as the law allows. Nothing limits liability that can't be limited by law, including for intentional harm, or your rights as a consumer. |
| Complaints | Email `CONTACT_EMAIL` describing the issue. We answer within `COMPLAINT_RESPONSE_DAYS` days. |
| Governing law | Polish law. If you're a consumer, you keep the protection of the mandatory laws of the country where you live. Disputes go to the courts the law assigns. |
| Changes | Material changes are posted here with a new `Last updated` date. Continuing to use BeStats after that means you accept them. |
| Contact | `OPERATOR_NAME`, `CONTACT_EMAIL`. |

**Key invariants**:
- The TMDB notice exists in one place (`TMDB_ATTRIBUTION`) and the footer renders it on every route.
- The TMDB logo file is byte identical to TMDB's official file (the hash test), and it's never recoloured or restyled. CSS sets only its height.
- Operator facts exist only in `lib/legal/operator.ts`.
- The footer and both pages read no request state, so every route keeps its static shell.
- The pages describe only what the code does. A change that adds analytics, an email provider, a new processor or a delete button must update `PROCESSORS` and the policy text in the same PR (a Consequences rule, enforced at review).

**Security model**: everything here is public and static. No user data is read or written. The contact email is published only on the two legal pages, by your choice. The footer carries none, which keeps it off every page scrapers crawl. GDPR is the compliance scope (see Context in rationale.md). This feature adds no processing of personal data. It documents the processing earlier features already do.

**Configuration required**: no environment variable. One asset `/develop` downloads once. If the URL fails or returns something other than an SVG, stop and ask you. Never draw, recreate or substitute the logo.
- TMDB *Alt short (blue)* logo: `https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg` → save unmodified as `public/tmdb-logo.svg`, and record its SHA-256 in the test.

**Critical test scenarios**:
- Happy path: signed out on `/shows`, scroll to the footer, see the logo and the exact notice, open Privacy Policy, then Terms of Service, then go back. Also open `/sign-in` and `/privacy` directly. Both pages render with the right headings and the operator facts. Verifies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-9**.
- Sign up: `/sign-up` shows the acceptance line with both links working, already in the HTML before the form streams. Verifies **AC-14**.
- Failure case: a build with `NEXT_PUBLIC_SITE_URL` unset still builds, and both pages answer 200 with no canonical. Editing one byte of the logo fails the hash test. Verifies **AC-2**, **AC-12**.
- Prerender guard: the build route table keeps `/privacy` and `/terms` as `○`, and `/shows` and `/movies` stay partially prerendered with the footer in the layout. The purity test covers the footer. Verifies **AC-1**, **AC-6**.
- Auth/permission: a signed in visitor sees the same pages and footer (nothing user specific), and the proxy doesn't redirect `/privacy` or `/terms`. Verifies **AC-6**.
- Mobile: at 375px the footer stacks, nothing scrolls sideways, and the links are 44px tall. Verifies **AC-5**.

## Build plan

Tracer Bullet: first a thin thread from footer link to static page in the real layout, then thicken attribution, content, metadata and sign up one strand at a time.

1. **The thin thread.** `lib/legal/operator.ts` with all the constants. `LegalDocument` with a minimal `/privacy` (h1, Last updated, one section). `SiteFooter` with the notice and the two links, rendered from `app/layout.tsx`. Add the footer to `LAYOUT_TREE`. Run `pnpm build` and confirm the route table is unchanged apart from the new static route. Satisfies **AC-1**, **AC-4**, **AC-6**, **AC-10**.
2. **Attribution done right.** Replace `TMDB_ATTRIBUTION` and its test. Download the logo into `public/`, add the hash test, and render it through `next/image` `unoptimized` at the sizes above with the link. Satisfies **AC-2**, **AC-3**.
3. **The full Privacy Policy** from the facts table, with section ids and the external link rules. Satisfies **AC-7**, **AC-8**, **AC-10**, **AC-11**.
4. **Terms of Service** from its facts table. Satisfies **AC-7**, **AC-9**, **AC-10**, **AC-11**.
5. **Metadata and sitemap.** `catalogMetadata()` on both pages, the two sitemap entries and their tests, and the proxy test cases. Satisfies **AC-6**, **AC-12**, **AC-13**.
6. **Sign up line** outside the Suspense boundary, plus its test. Satisfies **AC-14**.
7. **Footer layout and proof.** The responsive row and stack, touch sizes, focus, the showcase entry, then the full checks and the browser pass at both widths. Satisfies **AC-5**, **AC-15**.

## Consequences

**Positive**:
- TMDB's current wording and logo are on every page, so the free API terms are met with margin. The old notice in `lib/tmdb/constants.ts` (spec 0002, AC-22) was out of date and is fixed.
- Google OAuth verification in feature 20 can point at live, public Privacy Policy and Terms URLs.
- No dependency, no storage, no client JavaScript added. Every page keeps its static shell.

**Negative / tradeoffs**:
- The legal text is drafted from the code, not by a lawyer. It's a solid baseline, not legal advice. You own a review before launch (Follow-up).
- The text can drift from reality. Adding a processor or a feature that touches personal data now means updating `PROCESSORS` and the policy text in the same PR, and no automated check catches a missed update.
- Deletion and data export are manual. Each request is an email you handle within 30 days, and there's no in app record of it, so keep your own note of each request and when you completed it (GDPR accountability).
- Your name and email become public on two pages.
- Passive acceptance at sign up records no proof of which terms version a person saw. That's acceptable for a free service relying on the contract basis, and weaker than a stored acceptance if a dispute ever needs one.

**Neutral**:
- `public/` exists for the first time. `design-tokens-boundary.test.ts` already skips it, so the logo's own colours are allowed there.
- Spec 0016, AC-6's sitemap order gains the two legal entries after the landings. `/sync` should note that amendment against spec 0016.
- The footer adds height below every page. Pages with a full height empty state (`StatePanel`) now sit above it.

## Follow-up

- [ ] Read both pages in full before launch and adjust anything that isn't true for you. Optionally have a lawyer review them. This blocks release (feature 20).
- [ ] Feature 20: add Google to `PROCESSORS` and the Google line to What we collect when Google sign in returns, update `PROCESSORS` when you choose an email provider, and state the Supabase project region once the cloud project exists, then bump `LEGAL_LAST_UPDATED`.
- [ ] Later feature: a self serve "Delete account" and "Download my data" on `/account`. That needs the Supabase admin API or a security definer function. Remove the email only wording when it ships.
- [ ] Keep a private log of deletion and access requests (date received, date completed).
- [ ] `lib/tmdb` caches genre lists with `cacheLife("max")`. TMDB's terms forbid caching longer than 6 months. `max` revalidates on a monthly schedule, so it's compliant as used. Note the 6 month ceiling in `lib/tmdb/AGENTS.md` so no future cache profile exceeds it.
