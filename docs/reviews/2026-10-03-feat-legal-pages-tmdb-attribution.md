# Review, feat/legal-pages-tmdb-attribution, 2026-10-03

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 27 files, branch vs main (committed + uncommitted + untracked)
**Verdict**: Approve with nits

## Summary
Adds a static-shell `SiteFooter` with the official TMDB logo and the current API-terms notice, static `/privacy` and `/terms` pages built from one pure operator-facts module, sitemap entries, and a passive acceptance line on sign up. The change follows spec 0017 closely, keeps the footer and pages free of request state, and the touched test files (41 files, 678 tests) pass. No blockers or majors; the findings are small.

## Minor
### 🟡 Spec contradicts itself on footer link colour, `components/layout/site-footer.tsx:75`
**Problem**: AC-5 says links are styled like the `link` variant (`text-text-link`) and, later in the same bullet, "links are `text-foreground` with an underline on hover". The code uses `text-text-link` with `hover:text-foreground`, which satisfies the first reading only.
**Why it matters**: A verifier reading the second clause will flag a mismatch, and the spec is the contract.
**Suggested fix**: Keep the code (it matches the `link` variant and the legal-page links) and amend AC-5 in the spec to say so.

## Nits
- ⚪ `app/(auth)/sign-up/page.test.tsx:12`, the test reads the page's element tree by index (`[boundary, line]`), so adding any sibling to `AuthPanel`'s children breaks it for a non-behavioural reason; finding the `p` by type would be sturdier.
- ⚪ `components/layout/site-footer.tsx:57`, `© BeStats · {OPERATOR_NAME}` is fine per AC-4, but the `<nav aria-label="Legal">` wraps only two links; harmless, no action needed beyond awareness for feature 20 when Google is added to the processors list.

## Strengths
- Facts live in one pure module (`lib/legal/operator.ts`); the pages render them and tests check the pages against that module, so a stale hardcoded copy would fail.
- The legal text matches what the code does (HttpOnly cookies confirmed via `sessionCookieOptions`, no analytics, processors limited to Supabase and Vercel), with no invented claims.
- The logo is guarded by a SHA-256 test, the notice has a single source (`TMDB_ATTRIBUTION`), the footer is added to `LAYOUT_TREE` purity, and the proxy has real cases for both pages signed in and out plus a control showing the guard ran.

## Test coverage
Good. Covered: footer content and links, logo hash, both pages' section order, ids, operator facts, metadata, sitemap order, proxy behaviour for the legal paths, and the sign up line. Not covered by unit tests (belongs to `/check verify`): the 375px layout, 44px/36px touch sizes, and the build route table staying `○`/partially prerendered.
